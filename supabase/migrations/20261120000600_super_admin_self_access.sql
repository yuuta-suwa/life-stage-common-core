-- =====================================================================
-- 0016 Super Admin が自分自身のアプリ利用権限・アプリ固有ロールを設定できるようにする
--
--  * 背景：Super Admin が 1 名のとき、自分の APP03 利用権限や APP02 LEGACY 資格を付ける手段がなかった
--    （利用者一覧が自分を除外し、admin_set_app_role が自分を対象にできなかったため）。
--  * 変更：
--      - admin_list_users：Super Admin には自分自身も表示する（is_self で区別）。Admin は従来どおり自分を表示しない。
--      - admin_set_app_role：Super Admin に限り自分自身を対象にできる（Admin は従来どおり CANNOT_TARGET_SELF）。
--  * 変更しないもの（安全のため自分自身は対象外のまま）：
--      利用状態の変更（停止・剥奪）、管理ロール（super_admin／admin／mentor）の変更、削除手続き。
--  * 自分への操作も監査ログに記録される（actor_id = target_user_id）。
-- =====================================================================

create or replace function public.admin_list_users(
  p_search text default null, p_status text default null, p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid   uuid := private.require_admin();
  v_super boolean := private.is_super_admin(v_uid);
  v_q     text := nullif(lower(trim(coalesce(p_search, ''))), '');
  v_res   jsonb;
  v_total bigint;
begin
  with visible as (
    select p.* from public.profiles p
    where (p.id <> v_uid or v_super) and private.can_manage_user(p.id, v_uid)
      and (p_status is null or p.status = p_status)
      and (v_q is null or position(v_q in p.email) > 0 or position(v_q in lower(p.display_name)) > 0)
  )
  select (select count(*) from visible),
         coalesce(jsonb_agg(row_to_json(u) order by u.is_self desc, u.created_at desc), '[]'::jsonb)
    into v_total, v_res
  from (
    select v.id, v.email, v.display_name, v.status, v.status_reason, v.status_changed_at, v.created_at,
      (v.id = v_uid) as is_self,
      coalesce((select jsonb_agg(e.app_code order by e.app_code) from public.app_entitlements e
                 where e.user_id = v.id and e.status = 'active'), '[]'::jsonb) as apps,
      coalesce((select jsonb_agg(r.role order by r.role) from public.admin_roles r
                 where r.user_id = v.id and r.revoked_at is null), '[]'::jsonb) as roles
    from visible v
    order by (v.id = v_uid) desc, v.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) u;
  return jsonb_build_object('total', v_total, 'users', v_res);
end $$;

create or replace function public.admin_set_app_role(
  p_user_id uuid, p_app_code text, p_role_code text, p_grant boolean, p_scope_key text default '', p_reason text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := private.require_admin();
  v_def   public.app_role_definitions;
  v_scope text := trim(coalesce(p_scope_key, ''));
  v_has   boolean;
begin
  select * into v_def from public.app_role_definitions where app_code = p_app_code and role_code = p_role_code and is_active;
  if not found then perform private.fail('INVALID_ROLE'); end if;
  if v_def.grantable_by = 'super_admin' and not private.is_super_admin(v_uid) then perform private.fail('FORBIDDEN'); end if;
  -- 自分自身を対象にできるのは Super Admin のみ
  if p_user_id = v_uid and not private.is_super_admin(v_uid) then perform private.fail('CANNOT_TARGET_SELF'); end if;
  if not private.can_manage_user(p_user_id, v_uid) then perform private.fail('FORBIDDEN'); end if;
  if v_def.scoped and v_scope = '' then perform private.fail('SCOPE_REQUIRED'); end if;
  if not v_def.scoped then v_scope := ''; end if;
  v_has := exists (select 1 from public.user_app_roles where user_id = p_user_id and app_code = p_app_code
                   and role_code = p_role_code and scope_key = v_scope and revoked_at is null);
  if p_grant then
    -- アプリ自体の利用権限がない利用者にはアプリ固有ロールを付与しない
    if not private.has_app_access(p_app_code, p_user_id) then perform private.fail('APP_ACCESS_DENIED'); end if;
    if v_has then return jsonb_build_object('changed', false); end if;
    insert into public.user_app_roles(user_id, app_code, role_code, scope_key, granted_by, reason)
      values (p_user_id, p_app_code, p_role_code, v_scope, v_uid, p_reason);
  else
    if not v_has then return jsonb_build_object('changed', false); end if;
    update public.user_app_roles set revoked_at = now(), revoked_by = v_uid, reason = p_reason
     where user_id = p_user_id and app_code = p_app_code and role_code = p_role_code and scope_key = v_scope and revoked_at is null;
  end if;
  perform private.audit(case when p_grant then 'app_role.grant' else 'app_role.revoke' end,
    'user_app_role', p_role_code, p_user_id, p_app_code,
    jsonb_build_object('has_role', v_has), jsonb_build_object('has_role', p_grant, 'scope', v_scope, 'self', p_user_id = v_uid), p_reason);
  return jsonb_build_object('changed', true, 'granted', p_grant);
end $$;
