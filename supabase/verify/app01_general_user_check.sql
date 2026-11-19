-- =====================================================================
-- APP01 一般利用者の実環境検証（必ず全件ロールバック）
--
-- 招待 → Google 認証済み利用者の受諾 → APP01 権限 → 保存・確定・再編集 → データ分離 → 停止
-- を実 Supabase 上で確認する。最後に意図的に例外を送出するため、テストユーザー・招待・回答・監査ログは残らない。
-- 結果はエラーメッセージ「ROLLBACK_RESULT ...」に一覧で表示される（docs/APP01_TEST_CHECKLIST.md 参照）。
-- 既存利用者のデータには触れない（読み取りも、テスト用に作った ID の範囲に限定）。
-- =====================================================================
do $$
declare
  r      text[] := '{}';
  adm    uuid := gen_random_uuid();
  u1     uuid := gen_random_uuid();
  u2     uuid := gen_random_uuid();
  noapp  uuid := gen_random_uuid();
  inv    jsonb;
  res    jsonb;
  n      int;
  ok     boolean;
  procedure_as text;
begin
  insert into auth.users(id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.email, now(), '{}',
         case when x.email like 'u1%' then '{"role":"super_admin","app01":true}'::jsonb else '{}'::jsonb end, now(), now()
    from (values (adm, 'adm-app01chk@example.com'), (u1, 'u1-app01chk@example.com'), (u2, 'u2-app01chk@example.com'), (noapp, 'noapp-app01chk@example.com')) x(id, email);
  insert into auth.identities(id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  select gen_random_uuid(), u, 'google', 'chk-' || u::text, jsonb_build_object('sub', 'chk-' || u::text), now(), now()
    from unnest(array[adm, u1, u2, noapp]) u;
  -- テスト用管理者（既存 Super Admin は使わない）
  insert into public.profiles(id, email, display_name, status) values (adm, 'adm-app01chk@example.com', 'chk admin', 'active');
  insert into public.admin_roles(user_id, role) values (adm, 'admin');

  -- 1) 管理者（aal2）が招待を発行 → 本人が受諾
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  inv := public.admin_create_invitation('u1-app01chk@example.com', array['APP01'], null, 'chk', 72);
  reset role;
  r := r || ('01 invite created: ' || (inv ? 'token')::text);
  select count(*) into n from public.invitations where token_hash = convert_to(inv->>'token', 'UTF8');
  r := r || ('02 token stored in plain (expect 0): ' || n);

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  res := public.accept_invitation(inv->>'token');
  reset role;
  r := r || ('03 other email accepts (expect EMAIL_MISMATCH): ' || (res->>'code'));

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  res := public.accept_invitation(inv->>'token');
  r := r || ('04 invitee accepts: ' || coalesce(res->>'code', res->>'ok'));
  res := public.accept_invitation(inv->>'token');
  r := r || ('05 reuse (expect INVITATION_USED): ' || (res->>'code'));
  reset role;
  select count(*) into n from public.app_entitlements where user_id = u1 and app_code = 'APP01' and status = 'active';
  r := r || ('06 APP01 entitlement active: ' || n);
  select count(*) into n from public.admin_roles where user_id = u1;
  r := r || ('07 metadata role ignored, admin roles (expect 0): ' || n);

  -- 2) APP01：保存・確定・再編集・要再確認
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin perform public.app01_save_draft(2, '{"q1":"x"}'); r := r || '08 LEVEL02 before LEVEL01 (expect STAGE_LOCKED): saved!';
  exception when others then r := r || ('08 LEVEL02 before LEVEL01 (expect STAGE_LOCKED): ' || sqlerrm); end;
  perform public.app01_save_draft(1, '{"q1":"chk secret answer"}');
  perform public.app01_confirm_stage(1);
  perform public.app01_save_draft(2, '{"q1":"100000"}');
  perform public.app01_confirm_stage(2);
  perform public.app01_save_draft(1, '{"q1":"chk secret answer v2"}');
  reset role;
  select string_agg(stage_no || ':' || status || ':' || needs_recheck, ',' order by stage_no) into procedure_as
    from public.app01_stage_answers where user_id = u1;
  r := r || ('09 after re-edit L1 (expect 1:draft:false,2:confirmed:true): ' || procedure_as);
  select count(*) into n from public.app01_stage_history where user_id = u1;
  r := r || ('10 confirm history rows (expect 2): ' || n);
  begin update public.app01_stage_history set answers = '{}' where user_id = u1; r := r || '11 history update: allowed!';
  exception when others then r := r || ('11 history immutable: ' || sqlerrm); end;

  -- 3) データ分離：別の APP01 利用者・権限なし利用者・管理者
  insert into public.profiles(id, email, display_name, status) values (u2, 'u2-app01chk@example.com', '', 'active'), (noapp, 'noapp-app01chk@example.com', '', 'active');
  insert into public.app_entitlements(user_id, app_code, status, granted_by, reason) values (u2, 'APP01', 'active', adm, 'chk');
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.app01_stage_answers where user_id = u1;
  r := r || ('12 other APP01 user reads answers (expect 0): ' || n);
  select count(*) into n from public.app01_stage_history where user_id = u1;
  r := r || ('13 other APP01 user reads history (expect 0): ' || n);
  select count(*) into n from storage.objects where name like u1::text || '/%';
  r := r || ('14 other user lists storage of u1 (expect 0): ' || n);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', noapp, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin perform public.app01_save_draft(1, '{"q1":"x"}'); r := r || '15 no-entitlement save: saved!';
  exception when others then r := r || ('15 no-entitlement save denied: ' || sqlerrm); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from public.app01_stage_answers where user_id = u1;
  r := r || ('16 admin reads answers (expect 0): ' || n);
  select count(*) into n from public.audit_logs where target_id = u1::text and after_state::text like '%chk secret%';
  r := r || ('17 answer text in audit (expect 0): ' || n);

  -- 4) 停止 → 遮断、再開 → 元データで再開
  res := public.admin_set_user_status(u1, 'suspend', 'chk');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.app01_stage_answers where user_id = u1;
  r := r || ('18 suspended user reads own answers (expect 0): ' || n);
  begin perform public.app01_save_draft(1, '{"q1":"x"}'); r := r || '19 suspended save: saved!';
  exception when others then r := r || ('19 suspended save denied: ' || sqlerrm); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  res := public.admin_set_user_status(u1, 'resume', 'chk');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.app01_stage_answers where user_id = u1;
  r := r || ('20 resumed user reads own answers (expect 2): ' || n);
  reset role;

  raise exception 'ROLLBACK_RESULT %', array_to_string(r, ' | ');
end $$;
