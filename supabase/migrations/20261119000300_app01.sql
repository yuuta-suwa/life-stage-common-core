-- =====================================================================
-- APP01 THE FINAL DISCOVERY  |  0010 回答・確定履歴・共有フィードバック
--
-- 原則（APP01 仕様書 v7 §3・§7・§12）
--  * 回答は本人のみ閲覧・編集（APP01 権限＋active 必須）。管理者用の閲覧ポリシーは作らない。
--  * 状態：locked（前 LEVEL 未確定）／draft／confirmed。confirmed 後も編集可能で、
--    編集すると当該 LEVEL は draft に戻り、確定済みの後続 LEVEL は「要再確認」になる。
--  * 確定のたびに確定スナップショット（履歴）を追記。過去の確定版は保持する。
--  * 共有は本人が選んだ内容を data_shares.scope に固定して渡す（受信者は回答テーブルを読めない）。
--  * 受信者のコメントは本人回答を上書きせず、別テーブルに保存する。
-- =====================================================================

create table public.app01_stage_answers (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  stage_no            smallint not null check (stage_no between 1 and 10),
  answers             jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 65536),
  status              text not null default 'draft' check (status in ('draft','confirmed')),
  version             integer not null default 0 check (version >= 0),
  needs_recheck       boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  confirmed_at        timestamptz,
  first_confirmed_at  timestamptz,
  unique (user_id, stage_no),
  check (status <> 'confirmed' or confirmed_at is not null)
);

create table public.app01_stage_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  stage_no      smallint not null check (stage_no between 1 and 10),
  version       integer not null check (version >= 1),
  answers       jsonb not null,
  confirmed_at  timestamptz not null default now(),
  unique (user_id, stage_no, version)
);
create index app01_stage_history_user_idx on public.app01_stage_history (user_id, stage_no, version desc);

create table public.app01_feedback (
  id          uuid primary key default gen_random_uuid(),
  share_id    uuid not null references public.data_shares(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  comment     text not null check (length(trim(comment)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index app01_feedback_share_idx on public.app01_feedback (share_id, created_at);

create trigger app01_stage_answers_touch before update on public.app01_stage_answers
  for each row execute function private.touch_updated_at();

-- 確定履歴は追記専用
create or replace function private.app01_history_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'HISTORY_IMMUTABLE' using errcode = 'P0001';
end $$;
create trigger app01_stage_history_no_update before update on public.app01_stage_history
  for each row execute function private.app01_history_immutable();

-- ---------------------------------------------------------------------
-- 権限・RLS
-- ---------------------------------------------------------------------
alter table public.app01_stage_answers enable row level security;
alter table public.app01_stage_history enable row level security;
alter table public.app01_feedback enable row level security;
revoke all on public.app01_stage_answers, public.app01_stage_history, public.app01_feedback from anon, authenticated;
grant select on public.app01_stage_answers, public.app01_stage_history, public.app01_feedback to authenticated;

create policy app01_answers_select on public.app01_stage_answers for select to authenticated
  using (user_id = auth.uid() and private.has_app_access('APP01'));
create policy app01_history_select on public.app01_stage_history for select to authenticated
  using (user_id = auth.uid() and private.has_app_access('APP01'));
-- フィードバック：書いた本人（共有先）と、共有元の本人のみ
create policy app01_feedback_select on public.app01_feedback for select to authenticated
  using (
    private.is_active_user() and exists (
      select 1 from public.data_shares s
      where s.id = app01_feedback.share_id and s.app_code = 'APP01'
        and (
          (s.owner_id = auth.uid() and private.has_app_access('APP01'))
          or (app01_feedback.author_id = auth.uid() and s.grantee_id = auth.uid()
              and s.status = 'active' and private.is_assigned_mentor(auth.uid(), s.owner_id))
        )
    )
  );

-- ---------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------
create or replace function private.app01_require() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if not private.has_app_access('APP01', v_uid) then perform private.fail('APP_ACCESS_DENIED'); end if;
  return v_uid;
end $$;

-- LEVEL n は LEVEL n-1 を一度確定していれば利用可能（LEVEL10 は確定時に全LEVELの最新確定を要求）
create or replace function private.app01_stage_available(p_uid uuid, p_stage integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_stage = 1 or exists (
    select 1 from public.app01_stage_answers a
    where a.user_id = p_uid and a.stage_no = p_stage - 1 and a.first_confirmed_at is not null
  )
$$;

-- 自動保存
create or replace function public.app01_save_draft(p_stage integer, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app01_require();
  v_row public.app01_stage_answers;
begin
  if p_stage is null or p_stage not between 1 and 10 then perform private.fail('INVALID_STAGE'); end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then perform private.fail('INVALID_REQUEST'); end if;
  if pg_column_size(p_answers) > 65536 then perform private.fail('PAYLOAD_TOO_LARGE'); end if;
  if not private.app01_stage_available(v_uid, p_stage) then perform private.fail('STAGE_LOCKED'); end if;

  select * into v_row from public.app01_stage_answers where user_id = v_uid and stage_no = p_stage for update;
  if found and v_row.answers = p_answers then
    return jsonb_build_object('changed', false, 'status', v_row.status, 'updated_at', v_row.updated_at);
  end if;

  if not found then
    insert into public.app01_stage_answers(user_id, stage_no, answers) values (v_uid, p_stage, p_answers)
      returning * into v_row;
  else
    update public.app01_stage_answers set answers = p_answers, status = 'draft'
     where id = v_row.id returning * into v_row;
    -- 確定済みの後続 LEVEL を「要再確認」にする
    update public.app01_stage_answers set needs_recheck = true
     where user_id = v_uid and stage_no > p_stage and first_confirmed_at is not null and not needs_recheck;
  end if;
  return jsonb_build_object('changed', true, 'status', v_row.status, 'updated_at', v_row.updated_at);
end $$;

-- 確定（確定スナップショットを履歴に追記）
create or replace function public.app01_confirm_stage(p_stage integer) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := private.app01_require();
  v_row   public.app01_stage_answers;
  v_first boolean;
  v_bad   integer;
  v_q     text;
begin
  if p_stage is null or p_stage not between 1 and 10 then perform private.fail('INVALID_STAGE'); end if;
  if not private.app01_stage_available(v_uid, p_stage) then perform private.fail('STAGE_LOCKED'); end if;
  select * into v_row from public.app01_stage_answers where user_id = v_uid and stage_no = p_stage for update;
  if not found then perform private.fail('NOT_FOUND'); end if;

  if p_stage = 10 then
    -- LEVEL10：全9LEVELの最新版が確定済み（要再確認なし）であること
    select count(*) into v_bad from generate_series(1, 9) n
     where not exists (select 1 from public.app01_stage_answers a
                       where a.user_id = v_uid and a.stage_no = n and a.status = 'confirmed' and not a.needs_recheck);
    if v_bad > 0 then perform private.fail('PREREQUISITE_NOT_CONFIRMED'); end if;
    -- 確認チェックリスト（6項目）を本人が手動で完了していること（仕様 §6：AI 未実行時）
    select q into v_q from unnest(array['q1','q2','q3','q4','q5','q6']) q
     where coalesce(v_row.answers->>q, '') <> 'yes' limit 1;
    if v_q is not null then perform private.fail('CHECKLIST_INCOMPLETE'); end if;
  end if;

  if v_row.status = 'confirmed' and not v_row.needs_recheck then
    return jsonb_build_object('version', v_row.version, 'first_time', false, 'changed', false);
  end if;

  v_first := v_row.first_confirmed_at is null;
  update public.app01_stage_answers
     set status = 'confirmed', version = version + 1, confirmed_at = now(),
         first_confirmed_at = coalesce(first_confirmed_at, now()), needs_recheck = false
   where id = v_row.id returning * into v_row;
  insert into public.app01_stage_history(user_id, stage_no, version, answers, confirmed_at)
    values (v_uid, p_stage, v_row.version, v_row.answers, v_row.confirmed_at);
  perform private.audit('app01.stage.confirm', 'app01_stage', p_stage::text, v_uid, 'APP01', null,
    jsonb_build_object('stage', p_stage, 'version', v_row.version, 'first_time', v_first));
  return jsonb_build_object('version', v_row.version, 'first_time', v_first, 'changed', true);
end $$;

-- 共有先からのフィードバック（本人回答は変更しない）
create or replace function public.app01_add_feedback(p_share_id uuid, p_comment text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_s   public.data_shares;
  v_id  uuid;
begin
  select * into v_s from public.data_shares where id = p_share_id;
  if not found or v_s.app_code <> 'APP01' or v_s.grantee_id <> v_uid or v_s.status <> 'active'
     or (v_s.expires_at is not null and v_s.expires_at <= now())
     or not private.is_assigned_mentor(v_uid, v_s.owner_id) then
    perform private.fail('NOT_FOUND');
  end if;
  if v_s.permission <> 'comment' then perform private.fail('FORBIDDEN'); end if;
  if length(trim(coalesce(p_comment, ''))) not between 1 and 2000 then perform private.fail('INVALID_REQUEST'); end if;
  insert into public.app01_feedback(share_id, author_id, comment) values (v_s.id, v_uid, trim(p_comment))
    returning id into v_id;
  perform private.audit('app01.feedback', 'data_share', v_s.id::text, v_s.owner_id, 'APP01', null,
    jsonb_build_object('feedback_id', v_id));
  return jsonb_build_object('feedback_id', v_id);
end $$;

-- 本人データ出力に APP01 の回答・履歴を含める
create or replace function public.app01_export() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app01_require();
begin
  perform private.audit('data.export', 'app01', v_uid::text, v_uid, 'APP01');
  return jsonb_build_object(
    'exported_at', now(), 'app', 'APP01', 'format_version', '1.0',
    'answers', coalesce((select jsonb_agg(to_jsonb(a) order by a.stage_no) from public.app01_stage_answers a where a.user_id = v_uid), '[]'),
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.stage_no, h.version) from public.app01_stage_history h where h.user_id = v_uid), '[]')
  );
end $$;

revoke execute on function public.app01_save_draft(integer, jsonb), public.app01_confirm_stage(integer),
  public.app01_add_feedback(uuid, text), public.app01_export() from public, anon;
grant execute on function public.app01_save_draft(integer, jsonb), public.app01_confirm_stage(integer),
  public.app01_add_feedback(uuid, text), public.app01_export() to authenticated;
revoke execute on function private.app01_require(), private.app01_stage_available(uuid, integer),
  private.app01_history_immutable() from public;
