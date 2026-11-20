-- =====================================================================
-- APP02 Phase 2  |  0012 共有レビュー・RETURN TO PURPOSE・版と復元・競合検出・経営者志望ラダー
--
--  * SHARED VISION／伴走者レビュー（仕様 §15・§18・T07・T17）：共有は共通基盤の data_shares（本人が選んだ項目を
--    scope に固定）。受信者は閲覧・コメント・修正案のみ。本人回答・計画は変更できない。
--  * RETURN TO PURPOSE（§09-1・§09-2・T08）：報告→割当→人の修正→再分析→本人の決定→履歴。状態は
--    受付／確認中／修正案提示／本人確認待ち／完了／保留。重大な不一致等はメンター・運営管理者へエスカレーション。
--  * 版と復元（§12-4・§12-5・S17）：計画全体の版を保存・復元。開始年変更・推奨再生成・全体初期化の前に自動保存。
--  * 競合検出（§17・T16）：最後に読み込んだ時刻と異なる場合は上書きせず CONFLICT を返す（差分選択は画面側）。
--  * 経営者志望ラダー（§14・S11）：LEGACY 専用のステップ。
--  * Phase 1 の修正：履歴の DELETE を禁止していたため、アカウント削除（利用者削除の連鎖削除）が失敗する不具合。
--    APP01 の確定履歴と同じく「更新禁止」に改める。
-- =====================================================================

-- ---------------------------------------------------------------------
-- Phase 1 の修正：履歴は更新禁止（削除は利用者削除の連鎖のみ。authenticated には DELETE 権限なし）
-- ---------------------------------------------------------------------
drop trigger app02_plan_history_guard on public.app02_plan_history;
create trigger app02_plan_history_guard before update on public.app02_plan_history
  for each row execute function private.app02_history_guard();

alter table public.app02_plan_history drop constraint app02_plan_history_kind_check;
alter table public.app02_plan_history add constraint app02_plan_history_kind_check
  check (kind in ('cell_edit','cell_reset','undo','start_year','focus','commitment','regenerate','restore','reset_all','version'));

alter table public.app02_steps drop constraint app02_steps_step_code_check;
alter table public.app02_steps add constraint app02_steps_step_code_check
  check (step_code in ('vision','sales','abilities','analysis','position','environment','commitment','presentation','ladder'));

-- ---------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------
create table public.app02_plan_versions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  version_no   integer not null,
  label        text not null check (length(label) between 1 and 80),
  reason       text not null check (reason in ('manual','before_start_year','before_regenerate','before_restore','before_reset','approved')),
  start_year   integer not null,
  commit_year  integer,
  focus        jsonb not null,
  cells        jsonb not null check (jsonb_typeof(cells) = 'array' and jsonb_array_length(cells) = 60),
  created_at   timestamptz not null default now(),
  unique (user_id, version_no)
);
create index app02_plan_versions_user_idx on public.app02_plan_versions (user_id, version_no desc);

create table public.app02_reviews (
  id          uuid primary key default gen_random_uuid(),
  share_id    uuid not null references public.data_shares(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('comment','proposal')),
  target      text not null default '' check (length(target) <= 80),
  body        text not null check (length(trim(body)) between 1 and 3000),
  status      text not null default 'open' check (status in ('open','adopted','hold','rejected')),
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index app02_reviews_share_idx on public.app02_reviews (share_id, created_at);

create table public.app02_purpose_reports (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.profiles(id) on delete cascade,
  reporter_id        uuid references public.profiles(id) on delete set null,
  source             text not null check (length(source) between 1 and 120),
  reason             text not null check (reason in ('vision','plan','fact','other')),
  comment            text not null default '' check (length(comment) <= 2000),
  original           jsonb not null default '{}'::jsonb check (jsonb_typeof(original) = 'object' and pg_column_size(original) <= 65536),
  assigned_role      text check (assigned_role in ('leader','trainer','mentor','admin')),
  assignee_id        uuid references public.profiles(id) on delete set null,
  status             text not null default 'received' check (status in ('received','reviewing','proposed','awaiting_user','done','on_hold')),
  escalated          boolean not null default false,
  escalation_reason  text check (length(escalation_reason) <= 1000),
  correction         text check (length(correction) <= 4000),
  correction_reason  text check (length(correction_reason) <= 1000),
  corrected_by       uuid references public.profiles(id) on delete set null,
  reanalysis         text check (length(reanalysis) <= 6000),
  user_decision      text check (user_decision in ('adopt','modify','reject')),
  user_note          text check (length(user_note) <= 1000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index app02_purpose_owner_idx on public.app02_purpose_reports (owner_id, created_at desc);
create index app02_purpose_assignee_idx on public.app02_purpose_reports (assignee_id, status);

create table public.app02_purpose_events (
  id          bigint generated always as identity primary key,
  report_id   uuid not null references public.app02_purpose_reports(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null check (action in ('report','assign','status','correction','reanalysis','decision','escalate')),
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index app02_purpose_events_idx on public.app02_purpose_events (report_id, id);

create trigger app02_purpose_touch before update on public.app02_purpose_reports for each row execute function private.touch_updated_at();

create or replace function private.app02_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'HISTORY_IMMUTABLE' using errcode = 'P0001';
end $$;
create trigger app02_plan_versions_no_update before update on public.app02_plan_versions for each row execute function private.app02_append_only();
-- 経過記録は更新禁止。ただし記録した人のアカウント削除による actor_id の null 化（連鎖）だけは許す
create or replace function private.app02_events_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.actor_id is null and old.actor_id is not null and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
    return new;
  end if;
  raise exception 'HISTORY_IMMUTABLE' using errcode = 'P0001';
end $$;
create trigger app02_purpose_events_no_update before update on public.app02_purpose_events for each row execute function private.app02_events_guard();

-- ---------------------------------------------------------------------
-- 補助関数
-- ---------------------------------------------------------------------
-- 担当関係（関係種別を指定。null は種別不問）
create or replace function private.assigned_as(p_helper uuid, p_user uuid, p_relation text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.mentor_assignments m
    where m.mentor_id = p_helper and m.user_id = p_user
      and (p_relation is null or m.relation = p_relation)
      and m.active_from <= now() and (m.active_to is null or m.active_to > now())
  )
$$;

-- 指定した関係の担当者（最も古い有効な割当）
create or replace function private.assignee_for(p_user uuid, p_relation text) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.mentor_id from public.mentor_assignments m join public.profiles p on p.id = m.mentor_id and p.status = 'active'
   where m.user_id = p_user and m.relation = p_relation
     and m.active_from <= now() and (m.active_to is null or m.active_to > now())
   order by m.active_from limit 1
$$;

-- 運営管理者としてエスカレーション案件を扱えるか（MFA 済み・担当範囲内）
create or replace function private.app02_admin_can(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() and private.can_manage_user(p_owner) and private.current_aal() = 'aal2'
$$;

-- 現在の計画を版として保存
create or replace function private.app02_snapshot_version(p_uid uuid, p_label text, p_reason text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_p  public.app02_plans;
  v_id uuid;
  v_no integer;
begin
  select * into v_p from public.app02_plans where user_id = p_uid;
  if not found then return null; end if;
  select coalesce(max(version_no), 0) + 1 into v_no from public.app02_plan_versions where user_id = p_uid;
  insert into public.app02_plan_versions(user_id, version_no, label, reason, start_year, commit_year, focus, cells)
  select p_uid, v_no, left(p_label, 80), p_reason, v_p.start_year, v_p.commit_year, v_p.focus,
         jsonb_agg(jsonb_build_object(
           'ability', c.ability, 'year_index', c.year_index,
           'recommended_text', c.recommended_text, 'recommended_level', c.recommended_level,
           'rec_experiences', c.rec_experiences, 'rec_criteria', c.rec_criteria,
           'edited_text', c.edited_text, 'target_level', c.target_level, 'experiences', c.experiences, 'criteria', c.criteria
         ) order by c.ability, c.year_index)
    from public.app02_plan_cells c where c.user_id = p_uid
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.app02_plan_versions enable row level security;
alter table public.app02_reviews enable row level security;
alter table public.app02_purpose_reports enable row level security;
alter table public.app02_purpose_events enable row level security;
revoke all on public.app02_plan_versions, public.app02_reviews, public.app02_purpose_reports, public.app02_purpose_events from anon, authenticated;
grant select on public.app02_plan_versions, public.app02_reviews, public.app02_purpose_reports, public.app02_purpose_events to authenticated;

create policy app02_plan_versions_select on public.app02_plan_versions for select to authenticated
  using (user_id = auth.uid() and private.has_app_access('APP02'));

-- レビュー：共有元の本人（APP02 権限あり）と、書いた受信者（有効な担当・有効な共有）のみ
create policy app02_reviews_select on public.app02_reviews for select to authenticated
  using (
    private.is_active_user() and exists (
      select 1 from public.data_shares s
      where s.id = app02_reviews.share_id and s.app_code = 'APP02'
        and (
          (s.owner_id = auth.uid() and private.has_app_access('APP02'))
          or (app02_reviews.author_id = auth.uid() and s.grantee_id = auth.uid()
              and s.status = 'active' and private.is_assigned_mentor(auth.uid(), s.owner_id))
        )
    )
  );

-- 報告：本人・報告者・有効な担当関係にある割当先・エスカレーションされた案件の運営管理者（MFA 済み・担当範囲内）
create policy app02_purpose_select on public.app02_purpose_reports for select to authenticated
  using (
    private.is_active_user() and (
      owner_id = auth.uid()
      or (reporter_id = auth.uid() and (reporter_id = owner_id or private.assigned_as(auth.uid(), owner_id)))
      or (assignee_id = auth.uid() and private.assigned_as(auth.uid(), owner_id))
      or (escalated and private.app02_admin_can(owner_id))
    )
  );
create policy app02_purpose_events_select on public.app02_purpose_events for select to authenticated
  using (exists (select 1 from public.app02_purpose_reports r where r.id = app02_purpose_events.report_id));

-- ---------------------------------------------------------------------
-- ステップ保存（ラダー追加・競合検出）
-- ---------------------------------------------------------------------
create or replace function public.app02_save_step(p_step text, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_row public.app02_steps;
begin
  if p_step not in ('vision','sales','abilities','analysis','position','environment','commitment','presentation','ladder') then
    perform private.fail('INVALID_REQUEST');
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then perform private.fail('INVALID_REQUEST'); end if;
  if pg_column_size(p_data) > 131072 then perform private.fail('PAYLOAD_TOO_LARGE'); end if;
  if not exists (select 1 from public.app02_workspace where user_id = v_uid) then perform private.fail('APP02_NOT_STARTED'); end if;
  if p_step = 'ladder' and not exists (select 1 from public.app02_workspace where user_id = v_uid and mode = 'LEGACY') then
    perform private.fail('LEGACY_ONLY');
  end if;
  insert into public.app02_steps(user_id, step_code, data) values (v_uid, p_step, p_data)
    on conflict (user_id, step_code) do update set data = excluded.data
    returning * into v_row;
  return jsonb_build_object('status', v_row.status, 'updated_at', v_row.updated_at);
end $$;

-- 競合検出付きの保存：p_expected は最後に読み込んだ（または保存した）時刻。異なれば上書きしない
create or replace function public.app02_save_step_checked(p_step text, p_data jsonb, p_expected timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_row public.app02_steps;
begin
  select * into v_row from public.app02_steps where user_id = v_uid and step_code = p_step for update;
  if found and v_row.data <> coalesce(p_data, '{}'::jsonb) and (p_expected is null or v_row.updated_at <> p_expected) then
    perform private.fail('CONFLICT');
  end if;
  return public.app02_save_step(p_step, p_data);
end $$;

create or replace function public.app02_update_cell_checked(
  p_ability text, p_year_index integer, p_edited_text text, p_target_level integer,
  p_experiences text, p_criteria text, p_reason text, p_expected timestamptz
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_at  timestamptz;
begin
  select updated_at into v_at from public.app02_plan_cells where user_id = v_uid and ability = p_ability and year_index = p_year_index for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  if p_expected is null or v_at <> p_expected then perform private.fail('CONFLICT'); end if;
  return public.app02_update_cell(p_ability, p_year_index, p_edited_text, p_target_level, p_experiences, p_criteria, p_reason);
end $$;

-- ---------------------------------------------------------------------
-- 版・復元・全体初期化
-- ---------------------------------------------------------------------
create or replace function public.app02_save_version(p_label text, p_reason text default 'manual') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_id  uuid;
begin
  if p_reason not in ('manual','approved') then perform private.fail('INVALID_REQUEST'); end if;
  if length(trim(coalesce(p_label, ''))) = 0 then perform private.fail('INVALID_REQUEST'); end if;
  v_id := private.app02_snapshot_version(v_uid, trim(p_label), p_reason);
  if v_id is null then perform private.fail('NOT_FOUND'); end if;
  insert into public.app02_plan_history(user_id, kind, after, reason) values (v_uid, 'version', jsonb_build_object('version_id', v_id), left(trim(p_label), 500));
  return jsonb_build_object('version_id', v_id);
end $$;

create or replace function public.app02_restore_version(p_version_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_v   public.app02_plan_versions;
  v_bk  uuid;
begin
  select * into v_v from public.app02_plan_versions where id = p_version_id and user_id = v_uid;
  if not found then perform private.fail('NOT_FOUND'); end if;
  v_bk := private.app02_snapshot_version(v_uid, '復元前の自動保存（第' || v_v.version_no || '版の復元）', 'before_restore');
  update public.app02_plan_cells pc
     set recommended_text = c->>'recommended_text', recommended_level = (c->>'recommended_level')::smallint,
         rec_experiences = c->>'rec_experiences', rec_criteria = c->>'rec_criteria',
         edited_text = c->>'edited_text', target_level = (c->>'target_level')::smallint,
         experiences = c->>'experiences', criteria = c->>'criteria', updated_at = now()
    from jsonb_array_elements(v_v.cells) c
   where pc.user_id = v_uid and pc.ability = c->>'ability' and pc.year_index = (c->>'year_index')::smallint;
  update public.app02_plans set start_year = v_v.start_year, commit_year = v_v.commit_year, focus = v_v.focus,
         commit_needs_recheck = false, version = version + 1 where user_id = v_uid;
  insert into public.app02_plan_history(user_id, kind, before, after, reason)
    values (v_uid, 'restore', jsonb_build_object('backup_version_id', v_bk), jsonb_build_object('version_id', v_v.id, 'version_no', v_v.version_no),
            '第' || v_v.version_no || '版を復元');
  perform private.audit('app02.plan.restore', 'app02_plan', v_uid::text, v_uid, 'APP02', null, jsonb_build_object('version_no', v_v.version_no));
  return jsonb_build_object('restored', v_v.version_no, 'backup_version_id', v_bk);
end $$;

-- 履歴の任意の時点の値にセルを戻す（p_side：before＝その操作の前／after＝その操作の後）
create or replace function public.app02_restore_from_history(p_history_id bigint, p_side text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_h   public.app02_plan_history;
  v_val jsonb;
  v_old public.app02_plan_cells;
begin
  if p_side not in ('before','after') then perform private.fail('INVALID_REQUEST'); end if;
  select * into v_h from public.app02_plan_history where id = p_history_id and user_id = v_uid;
  if not found or v_h.ability is null or v_h.kind not in ('cell_edit','cell_reset','undo') then perform private.fail('NOT_FOUND'); end if;
  v_val := case when p_side = 'before' then v_h.before else v_h.after end;
  select * into v_old from public.app02_plan_cells where user_id = v_uid and ability = v_h.ability and year_index = v_h.year_index for update;
  update public.app02_plan_cells
     set edited_text = v_val->>'edited_text', target_level = (v_val->>'target_level')::smallint,
         experiences = v_val->>'experiences', criteria = v_val->>'criteria', updated_at = now()
   where user_id = v_uid and ability = v_h.ability and year_index = v_h.year_index;
  insert into public.app02_plan_history(user_id, kind, ability, year_index, before, after, reason)
    values (v_uid, 'cell_edit', v_h.ability, v_h.year_index, private.app02_cell_json(v_old), v_val,
            '履歴 #' || v_h.id || ' の' || case when p_side = 'before' then '変更前' else '変更後' end || 'の値に復元');
  update public.app02_plans set version = version + 1 where user_id = v_uid;
  return jsonb_build_object('ok', true);
end $$;

-- 全体初期化（二段階確認：画面での確認＋確認語の一致。実行前の計画は版として自動保存）
create or replace function public.app02_reset_all(p_confirm text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_bk  uuid;
begin
  if coalesce(p_confirm, '') <> '全体初期化' then perform private.fail('CONFIRM_MISMATCH'); end if;
  v_bk := private.app02_snapshot_version(v_uid, '全体初期化前の自動保存', 'before_reset');
  if v_bk is null then perform private.fail('NOT_FOUND'); end if;
  update public.app02_plan_cells set edited_text = null, target_level = null, experiences = null, criteria = null, updated_at = now() where user_id = v_uid;
  update public.app02_plans set focus = '{}'::jsonb, commit_year = null, commit_needs_recheck = false, version = version + 1 where user_id = v_uid;
  insert into public.app02_plan_history(user_id, kind, before, reason) values (v_uid, 'reset_all', jsonb_build_object('backup_version_id', v_bk), '全体初期化');
  perform private.audit('app02.plan.reset_all', 'app02_plan', v_uid::text, v_uid, 'APP02', null, jsonb_build_object('backup_version_id', v_bk));
  return jsonb_build_object('backup_version_id', v_bk);
end $$;

-- 開始年の変更・推奨の再生成の前に版を自動保存（§12-5「変更前の計画スナップショットを保持」）
create or replace function public.app02_set_start_year(p_start_year integer) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_p   public.app02_plans;
begin
  if p_start_year is null or p_start_year not between 2000 and 2091 then perform private.fail('INVALID_START_YEAR'); end if;
  select * into v_p from public.app02_plans where user_id = v_uid for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  if v_p.start_year = p_start_year then return jsonb_build_object('changed', false); end if;
  perform private.app02_snapshot_version(v_uid, '開始年変更前（' || v_p.start_year || '年開始）', 'before_start_year');
  update public.app02_plans
     set start_year = p_start_year, version = version + 1,
         commit_needs_recheck = (commit_year is not null)
   where user_id = v_uid;
  insert into public.app02_plan_history(user_id, kind, before, after)
    values (v_uid, 'start_year', jsonb_build_object('start_year', v_p.start_year, 'commit_year', v_p.commit_year),
            jsonb_build_object('start_year', p_start_year, 'commit_year', v_p.commit_year));
  perform private.audit('app02.plan.start_year', 'app02_plan', v_uid::text, v_uid, 'APP02',
    jsonb_build_object('start_year', v_p.start_year), jsonb_build_object('start_year', p_start_year));
  return jsonb_build_object('changed', true, 'commit_needs_recheck', v_p.commit_year is not null);
end $$;

create or replace function public.app02_init_plan(p_start_year integer, p_cells jsonb, p_regenerate boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := private.app02_require();
  v_n    integer;
begin
  if p_start_year is null or p_start_year not between 2000 and 2091 then perform private.fail('INVALID_START_YEAR'); end if;
  if jsonb_typeof(p_cells) <> 'array' or jsonb_array_length(p_cells) <> 60 then perform private.fail('INVALID_CELLS'); end if;
  select count(distinct (c->>'ability', c->>'year_index')) into v_n from jsonb_array_elements(p_cells) c
   where c->>'ability' in ('attraction','recruitment','education','development','operations','management')
     and (c->>'year_index') ~ '^([1-9]|10)$'
     and length(coalesce(c->>'text', '')) between 1 and 300
     and (c->>'level') ~ '^[0-5]$';
  if v_n <> 60 then perform private.fail('INVALID_CELLS'); end if;

  if exists (select 1 from public.app02_plans where user_id = v_uid) then
    if not p_regenerate then perform private.fail('PLAN_EXISTS'); end if;
    perform private.app02_snapshot_version(v_uid, '推奨の再生成前', 'before_regenerate');
    update public.app02_plan_cells pc
       set recommended_text = c->>'text', recommended_level = (c->>'level')::smallint,
           rec_experiences = left(coalesce(c->>'experiences', ''), 1000), rec_criteria = left(coalesce(c->>'criteria', ''), 1000),
           updated_at = now()
      from jsonb_array_elements(p_cells) c
     where pc.user_id = v_uid and pc.ability = c->>'ability' and pc.year_index = (c->>'year_index')::smallint;
    insert into public.app02_plan_history(user_id, kind, reason) values (v_uid, 'regenerate', '推奨の再生成（本人の編集値は保持）');
    perform private.audit('app02.plan.regenerate', 'app02_plan', v_uid::text, v_uid, 'APP02');
  else
    if not exists (select 1 from public.app02_workspace where user_id = v_uid) then perform private.fail('APP02_NOT_STARTED'); end if;
    insert into public.app02_plans(user_id, start_year) values (v_uid, p_start_year);
    insert into public.app02_plan_cells(user_id, ability, year_index, recommended_text, recommended_level, rec_experiences, rec_criteria)
    select v_uid, c->>'ability', (c->>'year_index')::smallint, c->>'text', (c->>'level')::smallint,
           left(coalesce(c->>'experiences', ''), 1000), left(coalesce(c->>'criteria', ''), 1000)
      from jsonb_array_elements(p_cells) c;
    perform private.audit('app02.plan.create', 'app02_plan', v_uid::text, v_uid, 'APP02', null, jsonb_build_object('start_year', p_start_year));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 共有へのレビュー（受信者：コメント・修正案。本人：採用・保留・却下）
-- ---------------------------------------------------------------------
create or replace function public.app02_add_review(p_share_id uuid, p_kind text, p_target text, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_s   public.data_shares;
  v_id  uuid;
begin
  select * into v_s from public.data_shares where id = p_share_id;
  if not found or v_s.app_code <> 'APP02' or v_s.grantee_id <> v_uid or v_s.status <> 'active'
     or (v_s.expires_at is not null and v_s.expires_at <= now())
     or not private.is_assigned_mentor(v_uid, v_s.owner_id) then
    perform private.fail('NOT_FOUND');
  end if;
  if v_s.permission <> 'comment' then perform private.fail('FORBIDDEN'); end if;
  if p_kind not in ('comment','proposal') or length(trim(coalesce(p_body, ''))) not between 1 and 3000 or length(coalesce(p_target, '')) > 80 then
    perform private.fail('INVALID_REQUEST');
  end if;
  insert into public.app02_reviews(share_id, author_id, kind, target, body) values (v_s.id, v_uid, p_kind, coalesce(p_target, ''), trim(p_body))
    returning id into v_id;
  perform private.audit('app02.review', 'data_share', v_s.id::text, v_s.owner_id, 'APP02', null, jsonb_build_object('review_id', v_id, 'kind', p_kind));
  return jsonb_build_object('review_id', v_id);
end $$;

create or replace function public.app02_decide_review(p_review_id uuid, p_status text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_r   public.app02_reviews;
begin
  if p_status not in ('adopted','hold','rejected','open') then perform private.fail('INVALID_REQUEST'); end if;
  select r.* into v_r from public.app02_reviews r join public.data_shares s on s.id = r.share_id
   where r.id = p_review_id and s.owner_id = v_uid and s.app_code = 'APP02' for update of r;
  if not found then perform private.fail('NOT_FOUND'); end if;
  update public.app02_reviews set status = p_status, decided_at = case when p_status = 'open' then null else now() end where id = v_r.id;
  return jsonb_build_object('status', p_status);
end $$;

-- ---------------------------------------------------------------------
-- RETURN TO PURPOSE
-- ---------------------------------------------------------------------
create or replace function private.app02_purpose_event(p_report uuid, p_action text, p_before jsonb, p_after jsonb) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.app02_purpose_events(report_id, actor_id, action, before, after) values (p_report, auth.uid(), p_action, p_before, p_after);
$$;

-- 理由に応じた既定の割当先（§09：人生ビジョン＝メンター、能力・計画＝トレーナー、事実・その他＝リーダー）
create or replace function private.app02_default_role(p_reason text) returns text
language sql immutable set search_path = '' as $$
  select case p_reason when 'vision' then 'mentor' when 'plan' then 'trainer' else 'leader' end
$$;

create or replace function public.app02_report_purpose(p_owner uuid, p_source text, p_reason text, p_comment text, p_original jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := private.require_active_user();
  v_role text;
  v_who  uuid;
  v_id   uuid;
begin
  if p_owner is null then perform private.fail('INVALID_REQUEST'); end if;
  if p_owner = v_uid then
    if not private.has_app_access('APP02', v_uid) then perform private.fail('APP_ACCESS_DENIED'); end if;
  elsif not private.assigned_as(v_uid, p_owner) then
    perform private.fail('FORBIDDEN');
  end if;
  if p_reason not in ('vision','plan','fact','other') or length(coalesce(p_source, '')) not between 1 and 120
     or length(coalesce(p_comment, '')) > 2000 then
    perform private.fail('INVALID_REQUEST');
  end if;
  if p_original is not null and (jsonb_typeof(p_original) <> 'object' or pg_column_size(p_original) > 65536) then perform private.fail('PAYLOAD_TOO_LARGE'); end if;
  v_role := private.app02_default_role(p_reason);
  v_who := private.assignee_for(p_owner, v_role);
  insert into public.app02_purpose_reports(owner_id, reporter_id, source, reason, comment, original, assigned_role, assignee_id)
    values (p_owner, v_uid, p_source, p_reason, coalesce(p_comment, ''), coalesce(p_original, '{}'::jsonb), case when v_who is null then null else v_role end, v_who)
    returning id into v_id;
  perform private.app02_purpose_event(v_id, 'report', null, jsonb_build_object('reason', p_reason, 'source', p_source, 'assigned_role', case when v_who is null then null else v_role end));
  perform private.audit('app02.purpose.report', 'app02_purpose', v_id::text, p_owner, 'APP02', null, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('report_id', v_id, 'assigned_role', case when v_who is null then null else v_role end);
end $$;

-- 割当（本人、またはエスカレーション案件の運営管理者）。割当先は本人の担当者に限る
create or replace function public.app02_assign_purpose(p_report_id uuid, p_assignee uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_r   public.app02_purpose_reports;
  v_rel text;
begin
  select * into v_r from public.app02_purpose_reports where id = p_report_id for update;
  if not found or not (v_r.owner_id = v_uid or (v_r.escalated and private.app02_admin_can(v_r.owner_id))) then perform private.fail('NOT_FOUND'); end if;
  select m.relation into v_rel from public.mentor_assignments m
   where m.mentor_id = p_assignee and m.user_id = v_r.owner_id and m.active_from <= now() and (m.active_to is null or m.active_to > now())
   order by case m.relation when 'mentor' then 1 when 'trainer' then 2 else 3 end limit 1;
  if v_rel is null then perform private.fail('SHARE_TARGET_NOT_ALLOWED'); end if;
  update public.app02_purpose_reports set assignee_id = p_assignee, assigned_role = v_rel where id = v_r.id;
  perform private.app02_purpose_event(v_r.id, 'assign', jsonb_build_object('assignee_id', v_r.assignee_id, 'role', v_r.assigned_role), jsonb_build_object('assignee_id', p_assignee, 'role', v_rel));
  return jsonb_build_object('assigned_role', v_rel);
end $$;

-- 担当者（または運営管理者）による確認・修正方針の記録
create or replace function public.app02_respond_purpose(p_report_id uuid, p_status text, p_correction text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_r   public.app02_purpose_reports;
begin
  select * into v_r from public.app02_purpose_reports where id = p_report_id for update;
  if not found or not (
       (v_r.assignee_id = v_uid and private.assigned_as(v_uid, v_r.owner_id))
       or (v_r.escalated and private.app02_admin_can(v_r.owner_id))) then
    perform private.fail('NOT_FOUND');
  end if;
  if v_r.status = 'done' then perform private.fail('ALREADY_DONE'); end if;
  if p_status not in ('reviewing','proposed','on_hold') then perform private.fail('INVALID_REQUEST'); end if;
  if p_status = 'proposed' and length(trim(coalesce(p_correction, ''))) = 0 then perform private.fail('CORRECTION_REQUIRED'); end if;
  if length(coalesce(p_correction, '')) > 4000 or length(coalesce(p_reason, '')) > 1000 then perform private.fail('PAYLOAD_TOO_LARGE'); end if;
  update public.app02_purpose_reports
     set status = p_status,
         correction = case when p_status = 'proposed' then trim(p_correction) else correction end,
         correction_reason = case when p_status = 'proposed' then nullif(trim(coalesce(p_reason, '')), '') else correction_reason end,
         corrected_by = case when p_status = 'proposed' then v_uid else corrected_by end
   where id = v_r.id;
  perform private.app02_purpose_event(v_r.id, case when p_status = 'proposed' then 'correction' else 'status' end,
    jsonb_build_object('status', v_r.status, 'correction', v_r.correction),
    jsonb_build_object('status', p_status, 'correction', case when p_status = 'proposed' then trim(p_correction) else v_r.correction end, 'reason', nullif(trim(coalesce(p_reason, '')), '')));
  perform private.audit('app02.purpose.respond', 'app02_purpose', v_r.id::text, v_r.owner_id, 'APP02', null, jsonb_build_object('status', p_status));
  return jsonb_build_object('status', p_status);
end $$;

-- 再分析案（人の修正方針を踏まえた ChatGPT 等の再分析を、本人・報告者・担当者が記録）→ 本人確認待ち
create or replace function public.app02_purpose_reanalysis(p_report_id uuid, p_text text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_r   public.app02_purpose_reports;
begin
  select * into v_r from public.app02_purpose_reports where id = p_report_id for update;
  if not found or not (v_r.owner_id = v_uid or v_r.reporter_id = v_uid or (v_r.assignee_id = v_uid and private.assigned_as(v_uid, v_r.owner_id))) then
    perform private.fail('NOT_FOUND');
  end if;
  if v_r.status = 'done' then perform private.fail('ALREADY_DONE'); end if;
  if length(trim(coalesce(p_text, ''))) not between 1 and 6000 then perform private.fail('INVALID_REQUEST'); end if;
  update public.app02_purpose_reports set reanalysis = trim(p_text), status = 'awaiting_user' where id = v_r.id;
  perform private.app02_purpose_event(v_r.id, 'reanalysis', jsonb_build_object('status', v_r.status), jsonb_build_object('status', 'awaiting_user'));
  return jsonb_build_object('status', 'awaiting_user');
end $$;

-- 本人の決定（採用・修正して採用・却下）。計画への反映は本人が行い、履歴に残る
create or replace function public.app02_decide_purpose(p_report_id uuid, p_decision text, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_r   public.app02_purpose_reports;
begin
  select * into v_r from public.app02_purpose_reports where id = p_report_id and owner_id = v_uid for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  if p_decision not in ('adopt','modify','reject') or length(coalesce(p_note, '')) > 1000 then perform private.fail('INVALID_REQUEST'); end if;
  update public.app02_purpose_reports set user_decision = p_decision, user_note = nullif(trim(coalesce(p_note, '')), ''), status = 'done' where id = v_r.id;
  perform private.app02_purpose_event(v_r.id, 'decision', jsonb_build_object('status', v_r.status), jsonb_build_object('status', 'done', 'decision', p_decision));
  perform private.audit('app02.purpose.decide', 'app02_purpose', v_r.id::text, v_uid, 'APP02', null, jsonb_build_object('decision', p_decision));
  return jsonb_build_object('status', 'done', 'decision', p_decision);
end $$;

-- エスカレーション（本人の意思に関わる重大な不一致・強い誘導・重要な事実誤認・プライバシー懸念）
create or replace function public.app02_escalate_purpose(p_report_id uuid, p_target text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_r   public.app02_purpose_reports;
  v_who uuid;
begin
  select * into v_r from public.app02_purpose_reports where id = p_report_id for update;
  if not found or not (v_r.owner_id = v_uid or v_r.reporter_id = v_uid or (v_r.assignee_id = v_uid and private.assigned_as(v_uid, v_r.owner_id))) then
    perform private.fail('NOT_FOUND');
  end if;
  if p_target not in ('mentor','admin') or length(trim(coalesce(p_reason, ''))) not between 1 and 1000 then perform private.fail('INVALID_REQUEST'); end if;
  if p_target = 'mentor' then
    v_who := private.assignee_for(v_r.owner_id, 'mentor');
    if v_who is null then perform private.fail('SHARE_TARGET_NOT_ALLOWED'); end if;
  end if;
  update public.app02_purpose_reports
     set escalated = true, escalation_reason = trim(p_reason),
         assigned_role = p_target, assignee_id = case when p_target = 'mentor' then v_who else null end,
         status = case when status in ('done') then status else 'reviewing' end
   where id = v_r.id;
  perform private.app02_purpose_event(v_r.id, 'escalate', jsonb_build_object('assigned_role', v_r.assigned_role), jsonb_build_object('assigned_role', p_target));
  perform private.audit('app02.purpose.escalate', 'app02_purpose', v_r.id::text, v_r.owner_id, 'APP02', null, jsonb_build_object('target', p_target));
  return jsonb_build_object('assigned_role', p_target);
end $$;

-- ---------------------------------------------------------------------
-- 実行権限
-- ---------------------------------------------------------------------
revoke execute on function
  public.app02_save_step_checked(text, jsonb, timestamptz),
  public.app02_update_cell_checked(text, integer, text, integer, text, text, text, timestamptz),
  public.app02_save_version(text, text), public.app02_restore_version(uuid), public.app02_restore_from_history(bigint, text),
  public.app02_reset_all(text), public.app02_add_review(uuid, text, text, text), public.app02_decide_review(uuid, text),
  public.app02_report_purpose(uuid, text, text, text, jsonb), public.app02_assign_purpose(uuid, uuid),
  public.app02_respond_purpose(uuid, text, text, text), public.app02_purpose_reanalysis(uuid, text),
  public.app02_decide_purpose(uuid, text, text), public.app02_escalate_purpose(uuid, text, text)
  from public, anon;
grant execute on function
  public.app02_save_step_checked(text, jsonb, timestamptz),
  public.app02_update_cell_checked(text, integer, text, integer, text, text, text, timestamptz),
  public.app02_save_version(text, text), public.app02_restore_version(uuid), public.app02_restore_from_history(bigint, text),
  public.app02_reset_all(text), public.app02_add_review(uuid, text, text, text), public.app02_decide_review(uuid, text),
  public.app02_report_purpose(uuid, text, text, text, jsonb), public.app02_assign_purpose(uuid, uuid),
  public.app02_respond_purpose(uuid, text, text, text), public.app02_purpose_reanalysis(uuid, text),
  public.app02_decide_purpose(uuid, text, text), public.app02_escalate_purpose(uuid, text, text)
  to authenticated;
revoke execute on function
  private.assigned_as(uuid, uuid, text), private.assignee_for(uuid, text), private.app02_admin_can(uuid),
  private.app02_snapshot_version(uuid, text, text), private.app02_append_only(), private.app02_events_guard(), private.app02_purpose_event(uuid, text, jsonb, jsonb),
  private.app02_default_role(text)
  from public;
-- RLS ポリシー内で使う判定関数（private スキーマは API 非公開。真偽値を返すのみ）
grant execute on function private.assigned_as(uuid, uuid, text), private.app02_admin_can(uuid) to authenticated, service_role;
