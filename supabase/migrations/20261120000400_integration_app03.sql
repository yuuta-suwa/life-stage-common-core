-- =====================================================================
-- 0014 外部アプリ連携（APP03 MAKE IT REAL）：連携トークンと計画の受け渡し
--
-- APP03（別サイト・別DB）の接続契約（APP03 docs/INTEGRATION_CONTRACT.md）に合わせる：
--   APP03 のサーバーが、本人が同期ボタンを押したときに
--   POST {externalUserId, certifications?}（Authorization: Bearer <APP03_INTEGRATION_TOKEN>）を送り、
--   {records:[{id,...}]} を受け取る。受け取った記録は参照用で、APP03 の認定にはならない。
--
-- 原則
--  * 連携トークンは Super Admin（MFA）のみが発行・失効でき、平文は発行時に1回だけ表示。DB にはハッシュのみ。
--  * 計画を渡すのは、本人が APP02 で「APP03 に引き継ぐ」に同意し、引き継ぎが成功している場合だけ
--    （同意＋APP03 利用権限が前提。transfer_inbox の APP03 宛ての最新）。
--  * 受け渡しはすべて監査ログに記録。トークン単位で回数制限。
--  * 本人セッションを持たない機械間の呼び出しのため、取得 RPC は anon にも実行を許可する（トークンで認証）。
--    これは「書き込み RPC は require_active_user／require_admin」の例外であり、読み取り専用・同意済みデータに限る（D-52）。
-- =====================================================================

create table public.integration_clients (
  id            uuid primary key default gen_random_uuid(),
  client_code   text not null check (client_code in ('APP03')),
  label         text not null default '' check (length(label) <= 80),
  token_hash    bytea not null unique check (length(token_hash) = 32),
  token_hint    text not null check (length(token_hint) between 4 and 8),
  scopes        text[] not null check (scopes <@ array['app02_growth_plan']::text[] and cardinality(scopes) > 0),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  revoked_by    uuid references public.profiles(id) on delete set null,
  last_used_at  timestamptz
);
alter table public.integration_clients enable row level security;
revoke all on public.integration_clients from anon, authenticated;
-- 一覧は管理用 RPC 経由のみ（ハッシュは画面にも出さない）。テーブルへの直接の権限は付与しない

-- 連携トークンの発行（Super Admin・MFA 必須）。平文はこの戻り値でのみ1回返す
create or replace function public.admin_issue_integration_token(p_client text, p_label text default '') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin(true);
  v_token text := 'lsc_app03_' || private.new_token();
  v_id    uuid;
begin
  if p_client <> 'APP03' then perform private.fail('INVALID_REQUEST'); end if;
  insert into public.integration_clients(client_code, label, token_hash, token_hint, scopes, created_by)
    values (p_client, left(coalesce(p_label, ''), 80), private.hash_token(v_token), right(v_token, 4), array['app02_growth_plan'], v_admin)
    returning id into v_id;
  perform private.audit('integration.token.issue', 'integration_client', v_id::text, null, 'APP03', null,
    jsonb_build_object('client', p_client, 'hint', right(v_token, 4)));
  return jsonb_build_object('id', v_id, 'token', v_token, 'hint', right(v_token, 4));
end $$;

create or replace function public.admin_revoke_integration_token(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_admin(true);
  v_c     public.integration_clients;
begin
  update public.integration_clients set revoked_at = now(), revoked_by = v_admin
   where id = p_id and revoked_at is null returning * into v_c;
  if not found then perform private.fail('NOT_FOUND'); end if;
  perform private.audit('integration.token.revoke', 'integration_client', p_id::text, null, 'APP03', null, jsonb_build_object('hint', v_c.token_hint));
  return jsonb_build_object('revoked', true);
end $$;

create or replace function public.admin_list_integration_tokens() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin(true);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'client_code', c.client_code, 'label', c.label, 'hint', c.token_hint,
      'created_at', c.created_at, 'revoked_at', c.revoked_at, 'last_used_at', c.last_used_at) order by c.created_at desc)
    from public.integration_clients c), '[]'::jsonb);
end $$;

-- APP03 からの取得（機械間）。トークン・回数制限・本人の状態と同意を確認し、承認済みの成長計画だけを返す
create or replace function public.integration_app03_growth_plan(p_token text, p_external_user_id text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_c     public.integration_clients;
  v_uid   uuid;
  v_calls integer;
  v_row   record;
begin
  select * into v_c from public.integration_clients
   where token_hash = private.hash_token(coalesce(p_token, '')) and revoked_at is null and 'app02_growth_plan' = any(scopes);
  -- 不正なトークン：例外で処理全体が取り消されるため監査ログには残らない（API 側のログに記録）。トークンは 256bit の乱数
  if not found then perform private.fail('INVALID_TOKEN'); end if;
  -- 回数制限：1トークンあたり1分間に60回まで
  select count(*) into v_calls from public.audit_logs
   where action = 'integration.fetch' and target_id = v_c.id::text and occurred_at > now() - interval '1 minute';
  if v_calls >= 60 then perform private.fail('RATE_LIMITED'); end if;
  update public.integration_clients set last_used_at = now() where id = v_c.id;

  -- 外部ID は共通基盤の利用者ID（UUID）。形式違い・存在しない・停止中は、区別せず空で返す（利用者の存在を推測させない）
  begin v_uid := p_external_user_id::uuid; exception when others then v_uid := null; end;
  select t.payload, t.received_at, s.id as snapshot_id, s.version
    into v_row
    from public.transfer_inbox t
    join public.data_transfers d on d.id = t.transfer_id and d.status = 'succeeded'
    join public.app_snapshots s on s.id = d.source_snapshot_id
    join public.profiles p on p.id = t.user_id and p.status = 'active'
   where v_uid is not null and t.user_id = v_uid and t.target_app = 'APP03' and d.source_app = 'APP02'
   order by t.received_at desc limit 1;

  perform private.audit('integration.fetch', 'integration_client', v_c.id::text,
    case when v_row.snapshot_id is null then null else v_uid end, 'APP03', null,
    jsonb_build_object('records', case when v_row.snapshot_id is null then 0 else 1 end));
  if v_row.snapshot_id is null then return jsonb_build_object('records', '[]'::jsonb); end if;
  return jsonb_build_object('records', jsonb_build_array(jsonb_build_object(
    'snapshot_id', v_row.snapshot_id, 'version', v_row.version, 'received_at', v_row.received_at, 'payload', v_row.payload)));
end $$;

revoke execute on function public.admin_issue_integration_token(text, text), public.admin_revoke_integration_token(uuid),
  public.admin_list_integration_tokens(), public.integration_app03_growth_plan(text, text) from public;
grant execute on function public.admin_issue_integration_token(text, text), public.admin_revoke_integration_token(uuid),
  public.admin_list_integration_tokens() to authenticated;
grant execute on function public.integration_app03_growth_plan(text, text) to anon, authenticated;
