-- =====================================================================
-- 0017 外部サイトのアプリへのリンク（APP03・LIFE ACCOUNTING）
--
--  * apps.base_url（0009 で追加済み）を使い、共通基盤のアカウント画面「開く」から、
--    利用権限を確認したうえで各アプリのサイトへ移動する（/apps/<code> の入口で権限確認 → base_url へ）。
--  * 発注者の指示（2026-11-20）：
--      APP03            https://app03-make-it-real-work.suwayuuta.chatgpt.site
--      LIFE_ACCOUNTING  https://life-accounting-yuta.suwayuuta.chatgpt.site（人生経理＋未来家計簿）を公開中にする
--  * Super Admin が管理画面からリンク・表示名を変更できる RPC（MFA 必須・理由必須・監査記録）を追加。
--  * 外部サイト側のログイン・権限は各サイトの仕組みに従う（共通基盤はリンク元で権限を確認するのみ）。
-- =====================================================================

update public.apps set base_url = 'https://app03-make-it-real-work.suwayuuta.chatgpt.site'
 where code = 'APP03';

update public.apps
   set base_url = 'https://life-accounting-yuta.suwayuuta.chatgpt.site',
       name_ja = '人生経理＋未来家計簿',
       description = 'LIFE ACCOUNTING｜人生経理＋未来家計簿（外部サイト）',
       lifecycle = 'active',
       launched_at = coalesce(launched_at, now()),
       retired_at = null
 where code = 'LIFE_ACCOUNTING';

insert into public.audit_logs(action, target_type, target_id, app_code, after_state, reason, success)
select 'app.link', 'app', code, code, jsonb_build_object('base_url', base_url, 'lifecycle', lifecycle), '発注者指示 2026-11-20（migration 0017）', true
  from public.apps where code in ('APP03', 'LIFE_ACCOUNTING');

create or replace function public.admin_set_app_link(p_app_code text, p_name_ja text, p_base_url text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := private.require_admin(true);
  v_app  public.apps;
  v_url  text := nullif(trim(coalesce(p_base_url, '')), '');
  v_name text := trim(coalesce(p_name_ja, ''));
begin
  if not private.is_super_admin(v_uid) then perform private.fail('FORBIDDEN'); end if;
  if coalesce(trim(p_reason), '') = '' then perform private.fail('REASON_REQUIRED'); end if;
  if v_url is not null and (v_url !~ '^https://[^\s<>"]+$' or length(v_url) > 2048) then perform private.fail('INVALID_URL'); end if;
  if length(v_name) not between 1 and 120 then perform private.fail('INVALID_REQUEST'); end if;
  select * into v_app from public.apps where code = p_app_code for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  update public.apps set base_url = v_url, name_ja = v_name where code = p_app_code;
  perform private.audit('app.link', 'app', p_app_code, null, p_app_code,
    jsonb_build_object('base_url', v_app.base_url, 'name_ja', v_app.name_ja),
    jsonb_build_object('base_url', v_url, 'name_ja', v_name), p_reason);
  return jsonb_build_object('app_code', p_app_code, 'base_url', v_url, 'name_ja', v_name);
end $$;

revoke execute on function public.admin_set_app_link(text, text, text, text) from public, anon;
grant execute on function public.admin_set_app_link(text, text, text, text) to authenticated;
