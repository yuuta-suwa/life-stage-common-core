-- =====================================================================
-- APP02 SELF-REALIZATION ENGINE  |  0011 ワークスペース・ステップ・10ヵ年計画（60セル）
--
-- 原則（APP02 仕様書 v1.0）
--  * 本人のみ閲覧・編集（APP02 権限＋active 必須）。管理者用の閲覧ポリシーは作らない（§18）。
--  * 書き込みは SECURITY DEFINER RPC のみ。
--  * 推奨値と本人編集値を別フィールドで保持（§12-3）。セル編集は履歴に追記（変更前後・日時・理由。§12-2）。
--  * 「ひとつ戻す」「推奨に戻す」（§12-4）、開始年変更時は年次（year_index）を保持し暦年コミットを再確認（§12-5）。
--  * LEGACY モードは管理者が付与する legacy_eligible ロールが必要（§03）。
--  * 正式認定・実績・日次 KPI は持たない（APP03 の責務。T20）。
-- =====================================================================

create table public.app02_workspace (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  mode         text not null default 'CONVICTION' check (mode in ('DISCOVERY','CONVICTION','LEGACY')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.app02_steps (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  step_code     text not null check (step_code in ('vision','sales','abilities','analysis','position','environment','commitment','presentation')),
  data          jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 131072),
  status        text not null default 'draft' check (status in ('draft','done')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, step_code),
  check (status <> 'done' or completed_at is not null)
);

create table public.app02_plans (
  user_id               uuid primary key references public.profiles(id) on delete cascade,
  plan_id               uuid not null default gen_random_uuid(),
  start_year            integer not null check (start_year between 2000 and 2091),
  version               integer not null default 1 check (version >= 1),
  -- {"1":["attraction"],"2":["attraction","recruitment"],...}（年次ごとの重点能力）
  focus                 jsonb not null default '{}'::jsonb check (jsonb_typeof(focus) = 'object'),
  commit_year           integer check (commit_year between 2000 and 2100),
  commit_needs_recheck  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.app02_plan_cells (
  user_id             uuid not null references public.profiles(id) on delete cascade,
  ability             text not null check (ability in ('attraction','recruitment','education','development','operations','management')),
  year_index          smallint not null check (year_index between 1 and 10),
  recommended_text    text not null check (length(recommended_text) between 1 and 300),
  recommended_level   smallint not null check (recommended_level between 0 and 5),
  rec_experiences     text not null default '' check (length(rec_experiences) <= 1000),
  rec_criteria        text not null default '' check (length(rec_criteria) <= 1000),
  edited_text         text check (length(edited_text) between 1 and 300),
  target_level        smallint check (target_level between 0 and 5),
  experiences         text check (length(experiences) <= 1000),
  criteria            text check (length(criteria) <= 1000),
  updated_at          timestamptz not null default now(),
  primary key (user_id, ability, year_index)
);

create table public.app02_plan_history (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('cell_edit','cell_reset','undo','start_year','focus','commitment','regenerate')),
  ability     text,
  year_index  smallint,
  before      jsonb,
  after       jsonb,
  reason      text check (length(reason) <= 500),
  undone      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index app02_plan_history_user_idx on public.app02_plan_history (user_id, id desc);

create trigger app02_workspace_touch before update on public.app02_workspace for each row execute function private.touch_updated_at();
create trigger app02_steps_touch before update on public.app02_steps for each row execute function private.touch_updated_at();
create trigger app02_plans_touch before update on public.app02_plans for each row execute function private.touch_updated_at();

-- 履歴は追記専用（「ひとつ戻す」の取り消し済みフラグのみ RPC 内で更新できる）
create or replace function private.app02_history_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'HISTORY_IMMUTABLE' using errcode = 'P0001'; end if;
  if (to_jsonb(new) - 'undone') <> (to_jsonb(old) - 'undone') or (old.undone and not new.undone) then
    raise exception 'HISTORY_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger app02_plan_history_guard before update or delete on public.app02_plan_history
  for each row execute function private.app02_history_guard();

-- ---------------------------------------------------------------------
-- 権限・RLS
-- ---------------------------------------------------------------------
alter table public.app02_workspace enable row level security;
alter table public.app02_steps enable row level security;
alter table public.app02_plans enable row level security;
alter table public.app02_plan_cells enable row level security;
alter table public.app02_plan_history enable row level security;
revoke all on public.app02_workspace, public.app02_steps, public.app02_plans, public.app02_plan_cells, public.app02_plan_history from anon, authenticated;
grant select on public.app02_workspace, public.app02_steps, public.app02_plans, public.app02_plan_cells, public.app02_plan_history to authenticated;

create policy app02_workspace_select on public.app02_workspace for select to authenticated
  using (user_id = auth.uid() and private.has_app_access('APP02'));
create policy app02_steps_select on public.app02_steps for select to authenticated
  using (user_id = auth.uid() and private.has_app_access('APP02'));
create policy app02_plans_select on public.app02_plans for select to authenticated
  using (user_id = auth.uid() and private.has_app_access('APP02'));
create policy app02_plan_cells_select on public.app02_plan_cells for select to authenticated
  using (user_id = auth.uid() and private.has_app_access('APP02'));
create policy app02_plan_history_select on public.app02_plan_history for select to authenticated
  using (user_id = auth.uid() and private.has_app_access('APP02'));

-- ---------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------
create or replace function private.app02_require() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if not private.has_app_access('APP02', v_uid) then perform private.fail('APP_ACCESS_DENIED'); end if;
  return v_uid;
end $$;

-- 初回利用（ワークスペース作成）。LEGACY は資格が必要
create or replace function public.app02_set_mode(p_mode text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_old text;
begin
  if p_mode not in ('DISCOVERY','CONVICTION','LEGACY') then perform private.fail('INVALID_REQUEST'); end if;
  if p_mode = 'LEGACY' and not private.has_app_role('APP02', 'legacy_eligible', '', v_uid) then
    perform private.fail('LEGACY_NOT_ELIGIBLE');
  end if;
  select mode into v_old from public.app02_workspace where user_id = v_uid;
  insert into public.app02_workspace(user_id, mode) values (v_uid, p_mode)
    on conflict (user_id) do update set mode = excluded.mode;
  if v_old is distinct from p_mode then
    perform private.audit('app02.mode', 'app02_workspace', v_uid::text, v_uid, 'APP02',
      jsonb_build_object('mode', v_old), jsonb_build_object('mode', p_mode));
  end if;
  return jsonb_build_object('mode', p_mode);
end $$;

-- ステップの自動保存
create or replace function public.app02_save_step(p_step text, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_row public.app02_steps;
begin
  if p_step not in ('vision','sales','abilities','analysis','position','environment','commitment','presentation') then
    perform private.fail('INVALID_REQUEST');
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then perform private.fail('INVALID_REQUEST'); end if;
  if pg_column_size(p_data) > 131072 then perform private.fail('PAYLOAD_TOO_LARGE'); end if;
  if not exists (select 1 from public.app02_workspace where user_id = v_uid) then perform private.fail('APP02_NOT_STARTED'); end if;
  insert into public.app02_steps(user_id, step_code, data) values (v_uid, p_step, p_data)
    on conflict (user_id, step_code) do update set data = excluded.data
    returning * into v_row;
  return jsonb_build_object('status', v_row.status, 'updated_at', v_row.updated_at);
end $$;

-- ステップ完了（必須項目の判定はアプリ側。ここでは保存済みであることのみ確認）
create or replace function public.app02_complete_step(p_step text, p_done boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_row public.app02_steps;
begin
  select * into v_row from public.app02_steps where user_id = v_uid and step_code = p_step for update;
  if not found then perform private.fail('ANSWER_REQUIRED'); end if;
  update public.app02_steps
     set status = case when p_done then 'done' else 'draft' end,
         completed_at = case when p_done then now() else null end
   where id = v_row.id returning * into v_row;
  if p_done then
    perform private.audit('app02.step.complete', 'app02_step', p_step, v_uid, 'APP02', null, jsonb_build_object('step', p_step));
  end if;
  return jsonb_build_object('status', v_row.status);
end $$;

-- 10ヵ年計画の作成・推奨の再生成（本人の編集値は保持し、推奨値だけを入れ替える）
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

create or replace function private.app02_cell_json(c public.app02_plan_cells) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('edited_text', c.edited_text, 'target_level', c.target_level, 'experiences', c.experiences, 'criteria', c.criteria)
$$;

-- セルの編集（本人の編集値。null は「推奨のまま」）
create or replace function public.app02_update_cell(
  p_ability text, p_year_index integer, p_edited_text text, p_target_level integer,
  p_experiences text, p_criteria text, p_reason text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_old public.app02_plan_cells;
  v_new public.app02_plan_cells;
begin
  select * into v_old from public.app02_plan_cells where user_id = v_uid and ability = p_ability and year_index = p_year_index for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  if p_target_level is not null and p_target_level not between 0 and 5 then perform private.fail('INVALID_REQUEST'); end if;
  if length(coalesce(p_edited_text, '')) > 300 or length(coalesce(p_experiences, '')) > 1000 or length(coalesce(p_criteria, '')) > 1000
     or length(coalesce(p_reason, '')) > 500 then
    perform private.fail('PAYLOAD_TOO_LARGE');
  end if;
  update public.app02_plan_cells
     set edited_text = nullif(trim(coalesce(p_edited_text, '')), ''),
         target_level = p_target_level,
         experiences = nullif(trim(coalesce(p_experiences, '')), ''),
         criteria = nullif(trim(coalesce(p_criteria, '')), ''),
         updated_at = now()
   where user_id = v_uid and ability = p_ability and year_index = p_year_index
   returning * into v_new;
  if private.app02_cell_json(v_old) = private.app02_cell_json(v_new) then
    return jsonb_build_object('changed', false);
  end if;
  insert into public.app02_plan_history(user_id, kind, ability, year_index, before, after, reason)
    values (v_uid, 'cell_edit', p_ability, p_year_index, private.app02_cell_json(v_old), private.app02_cell_json(v_new), nullif(trim(coalesce(p_reason, '')), ''));
  update public.app02_plans set version = version + 1 where user_id = v_uid;
  return jsonb_build_object('changed', true);
end $$;

-- 推奨に戻す（選択セルの本人編集値だけを消す）
create or replace function public.app02_reset_cell(p_ability text, p_year_index integer) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_old public.app02_plan_cells;
begin
  select * into v_old from public.app02_plan_cells where user_id = v_uid and ability = p_ability and year_index = p_year_index for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  update public.app02_plan_cells set edited_text = null, target_level = null, experiences = null, criteria = null, updated_at = now()
   where user_id = v_uid and ability = p_ability and year_index = p_year_index;
  insert into public.app02_plan_history(user_id, kind, ability, year_index, before, after)
    values (v_uid, 'cell_reset', p_ability, p_year_index, private.app02_cell_json(v_old),
            jsonb_build_object('edited_text', null, 'target_level', null, 'experiences', null, 'criteria', null));
  update public.app02_plans set version = version + 1 where user_id = v_uid;
  return jsonb_build_object('ok', true);
end $$;

-- ひとつ戻す（直近の、まだ取り消していないセル編集・推奨に戻す・重点能力の変更を取り消す）
create or replace function public.app02_undo() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_h   public.app02_plan_history;
begin
  select * into v_h from public.app02_plan_history
   where user_id = v_uid and not undone and kind in ('cell_edit','cell_reset','focus')
   order by id desc limit 1 for update;
  if not found then perform private.fail('NOTHING_TO_UNDO'); end if;
  if v_h.kind = 'focus' then
    update public.app02_plans set focus = coalesce(v_h.before->'focus', '{}'::jsonb) where user_id = v_uid;
  else
    update public.app02_plan_cells
       set edited_text = v_h.before->>'edited_text',
           target_level = (v_h.before->>'target_level')::smallint,
           experiences = v_h.before->>'experiences',
           criteria = v_h.before->>'criteria',
           updated_at = now()
     where user_id = v_uid and ability = v_h.ability and year_index = v_h.year_index;
  end if;
  update public.app02_plan_history set undone = true where id = v_h.id;
  insert into public.app02_plan_history(user_id, kind, ability, year_index, before, after, reason)
    values (v_uid, 'undo', v_h.ability, v_h.year_index, v_h.after, v_h.before, 'ひとつ戻す（履歴 #' || v_h.id || '）');
  update public.app02_plans set version = version + 1 where user_id = v_uid;
  return jsonb_build_object('undone_id', v_h.id, 'kind', v_h.kind, 'ability', v_h.ability, 'year_index', v_h.year_index);
end $$;

-- 開始年の変更（年次の入力値は保持し、暦年ラベルのみ再計算。暦年コミットは再確認）
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

-- 年次ごとの重点能力
create or replace function public.app02_set_focus(p_year_index integer, p_abilities text[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_p   public.app02_plans;
  v_new jsonb;
begin
  if p_year_index is null or p_year_index not between 1 and 10 then perform private.fail('INVALID_REQUEST'); end if;
  if coalesce(cardinality(p_abilities), 0) > 6 or exists (
       select 1 from unnest(coalesce(p_abilities, '{}')) a
        where a not in ('attraction','recruitment','education','development','operations','management')) then
    perform private.fail('INVALID_REQUEST');
  end if;
  select * into v_p from public.app02_plans where user_id = v_uid for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  v_new := v_p.focus || jsonb_build_object(p_year_index::text, to_jsonb(coalesce((select array_agg(distinct a) from unnest(p_abilities) a), '{}')));
  if v_new = v_p.focus then return jsonb_build_object('changed', false); end if;
  update public.app02_plans set focus = v_new, version = version + 1 where user_id = v_uid;
  insert into public.app02_plan_history(user_id, kind, year_index, before, after)
    values (v_uid, 'focus', p_year_index, jsonb_build_object('focus', v_p.focus), jsonb_build_object('focus', v_new));
  return jsonb_build_object('changed', true);
end $$;

-- 目標年度（暦年）のコミット。null で解除。変更・解除は理由を記録
create or replace function public.app02_set_commit_year(p_year integer, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
  v_p   public.app02_plans;
begin
  select * into v_p from public.app02_plans where user_id = v_uid for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  if p_year is not null and p_year not between v_p.start_year and v_p.start_year + 9 then perform private.fail('COMMIT_YEAR_OUT_OF_RANGE'); end if;
  if v_p.commit_year is not null and p_year is distinct from v_p.commit_year and length(trim(coalesce(p_reason, ''))) = 0 then
    perform private.fail('REASON_REQUIRED');
  end if;
  update public.app02_plans set commit_year = p_year, commit_needs_recheck = false, version = version + 1 where user_id = v_uid;
  insert into public.app02_plan_history(user_id, kind, before, after, reason)
    values (v_uid, 'commitment', jsonb_build_object('commit_year', v_p.commit_year), jsonb_build_object('commit_year', p_year), nullif(trim(coalesce(p_reason, '')), ''));
  perform private.audit('app02.commit_year', 'app02_plan', v_uid::text, v_uid, 'APP02',
    jsonb_build_object('commit_year', v_p.commit_year), jsonb_build_object('commit_year', p_year));
  return jsonb_build_object('commit_year', p_year);
end $$;

create or replace function public.app02_export() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.app02_require();
begin
  perform private.audit('data.export', 'app02', v_uid::text, v_uid, 'APP02');
  return jsonb_build_object(
    'exported_at', now(), 'app', 'APP02', 'format_version', '1.0',
    'workspace', (select to_jsonb(w) from public.app02_workspace w where w.user_id = v_uid),
    'steps', coalesce((select jsonb_agg(to_jsonb(s) order by s.step_code) from public.app02_steps s where s.user_id = v_uid), '[]'),
    'plan', (select to_jsonb(p) from public.app02_plans p where p.user_id = v_uid),
    'cells', coalesce((select jsonb_agg(to_jsonb(c) order by c.ability, c.year_index) from public.app02_plan_cells c where c.user_id = v_uid), '[]'),
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.id) from public.app02_plan_history h where h.user_id = v_uid), '[]')
  );
end $$;

revoke execute on function
  public.app02_set_mode(text), public.app02_save_step(text, jsonb), public.app02_complete_step(text, boolean),
  public.app02_init_plan(integer, jsonb, boolean), public.app02_update_cell(text, integer, text, integer, text, text, text),
  public.app02_reset_cell(text, integer), public.app02_undo(), public.app02_set_start_year(integer),
  public.app02_set_focus(integer, text[]), public.app02_set_commit_year(integer, text), public.app02_export()
  from public, anon;
grant execute on function
  public.app02_set_mode(text), public.app02_save_step(text, jsonb), public.app02_complete_step(text, boolean),
  public.app02_init_plan(integer, jsonb, boolean), public.app02_update_cell(text, integer, text, integer, text, text, text),
  public.app02_reset_cell(text, integer), public.app02_undo(), public.app02_set_start_year(integer),
  public.app02_set_focus(integer, text[]), public.app02_set_commit_year(integer, text), public.app02_export()
  to authenticated;
revoke execute on function private.app02_require(), private.app02_history_guard(), private.app02_cell_json(public.app02_plan_cells) from public;
