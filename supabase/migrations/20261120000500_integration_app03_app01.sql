-- =====================================================================
-- 0015 APP01 → APP03 の引き継ぎ（人生設計）と APP03 からの取得
--
--  * 経路：APP01 life_blueprint 1.0 → APP03（本人が APP01 の最終画面で同意したときだけ）。
--  * APP03 の接続契約（APP03_APP01_ENDPOINT）に合わせ、承認済みの人生設計を records で返す。
--    渡す項目は最小限（人生の目的・優先したい願望・目標と期限・優先能力・最初の行動）とし、
--    家計（budget_summary）・ギャップ分析（gap_analysis）・ビジョンボード画像の参照は渡さない（API 側で除外）。
--  * 連携トークンに app01_life_blueprint の権限を追加。今後発行するトークンは APP01・APP02 の両方を読める。
-- =====================================================================

insert into public.transfer_routes (source_app, snapshot_type, schema_version, target_app, description) values
  ('APP01', 'life_blueprint', '1.0', 'APP03', '人生設計 → 実行・実績・認定（APP03 は理想として参照。認定にはならない）');

alter table public.integration_clients drop constraint integration_clients_scopes_check;
alter table public.integration_clients add constraint integration_clients_scopes_check
  check (scopes <@ array['app02_growth_plan','app01_life_blueprint']::text[] and cardinality(scopes) > 0);

-- トークンの確認と回数制限（共通処理）。不正・失効・権限外は INVALID_TOKEN
create or replace function private.integration_app03_client(p_token text, p_scope text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id    uuid;
  v_calls integer;
begin
  select id into v_id from public.integration_clients
   where token_hash = private.hash_token(coalesce(p_token, '')) and revoked_at is null and p_scope = any(scopes);
  if v_id is null then perform private.fail('INVALID_TOKEN'); end if;
  select count(*) into v_calls from public.audit_logs
   where action = 'integration.fetch' and target_id = v_id::text and occurred_at > now() - interval '1 minute';
  if v_calls >= 60 then perform private.fail('RATE_LIMITED'); end if;
  update public.integration_clients set last_used_at = now() where id = v_id;
  return v_id;
end $$;

-- 発行：APP01・APP02 の両方の権限を付与
create or replace function public.admin_issue_integration_token(p_client text, p_label text default '') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin(true);
  v_token text := 'lsc_app03_' || private.new_token();
  v_id    uuid;
begin
  if p_client <> 'APP03' then perform private.fail('INVALID_REQUEST'); end if;
  insert into public.integration_clients(client_code, label, token_hash, token_hint, scopes, created_by)
    values (p_client, left(coalesce(p_label, ''), 80), private.hash_token(v_token), right(v_token, 4),
            array['app02_growth_plan','app01_life_blueprint'], v_admin)
    returning id into v_id;
  perform private.audit('integration.token.issue', 'integration_client', v_id::text, null, 'APP03', null,
    jsonb_build_object('client', p_client, 'hint', right(v_token, 4), 'scopes', array['app02_growth_plan','app01_life_blueprint']));
  return jsonb_build_object('id', v_id, 'token', v_token, 'hint', right(v_token, 4));
end $$;

-- APP03 からの取得：本人が APP03 への引き継ぎに同意し成功した、最新の人生設計（APP01）
create or replace function public.integration_app03_life_blueprint(p_token text, p_external_user_id text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_client uuid := private.integration_app03_client(p_token, 'app01_life_blueprint');
  v_uid    uuid;
  v_row    record;
begin
  begin v_uid := p_external_user_id::uuid; exception when others then v_uid := null; end;
  select t.payload, t.received_at, s.id as snapshot_id, s.version
    into v_row
    from public.transfer_inbox t
    join public.data_transfers d on d.id = t.transfer_id and d.status = 'succeeded'
    join public.app_snapshots s on s.id = d.source_snapshot_id
    join public.profiles p on p.id = t.user_id and p.status = 'active'
   where v_uid is not null and t.user_id = v_uid and t.target_app = 'APP03' and d.source_app = 'APP01'
   order by t.received_at desc limit 1;
  perform private.audit('integration.fetch', 'integration_client', v_client::text,
    case when v_row.snapshot_id is null then null else v_uid end, 'APP03', null,
    jsonb_build_object('source', 'APP01', 'records', case when v_row.snapshot_id is null then 0 else 1 end));
  if v_row.snapshot_id is null then return jsonb_build_object('records', '[]'::jsonb); end if;
  return jsonb_build_object('records', jsonb_build_array(jsonb_build_object(
    'snapshot_id', v_row.snapshot_id, 'version', v_row.version, 'received_at', v_row.received_at, 'payload', v_row.payload)));
end $$;

-- APP02 の取得も共通処理に寄せる（動作は 0014 と同じ）
create or replace function public.integration_app03_growth_plan(p_token text, p_external_user_id text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_client uuid := private.integration_app03_client(p_token, 'app02_growth_plan');
  v_uid    uuid;
  v_row    record;
begin
  begin v_uid := p_external_user_id::uuid; exception when others then v_uid := null; end;
  select t.payload, t.received_at, s.id as snapshot_id, s.version
    into v_row
    from public.transfer_inbox t
    join public.data_transfers d on d.id = t.transfer_id and d.status = 'succeeded'
    join public.app_snapshots s on s.id = d.source_snapshot_id
    join public.profiles p on p.id = t.user_id and p.status = 'active'
   where v_uid is not null and t.user_id = v_uid and t.target_app = 'APP03' and d.source_app = 'APP02'
   order by t.received_at desc limit 1;
  perform private.audit('integration.fetch', 'integration_client', v_client::text,
    case when v_row.snapshot_id is null then null else v_uid end, 'APP03', null,
    jsonb_build_object('source', 'APP02', 'records', case when v_row.snapshot_id is null then 0 else 1 end));
  if v_row.snapshot_id is null then return jsonb_build_object('records', '[]'::jsonb); end if;
  return jsonb_build_object('records', jsonb_build_array(jsonb_build_object(
    'snapshot_id', v_row.snapshot_id, 'version', v_row.version, 'received_at', v_row.received_at, 'payload', v_row.payload)));
end $$;

revoke execute on function private.integration_app03_client(text, text) from public;
revoke execute on function public.integration_app03_life_blueprint(text, text) from public;
grant execute on function public.integration_app03_life_blueprint(text, text) to anon, authenticated;
