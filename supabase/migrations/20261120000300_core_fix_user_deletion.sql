-- =====================================================================
-- 0013 共通基盤の修正：招待を受諾した利用者を削除できない不具合
--
-- invitations.accepted_by は auth.users を on delete set null で参照しているが、
-- check (status <> 'accepted' or (accepted_at is not null and accepted_by is not null)) により、
-- 利用者の削除（アカウント削除手続きの最終段階：auth.users の削除）で null 化が拒否され、削除全体が失敗していた。
-- 受諾の記録（accepted_at）は残し、削除後の accepted_by の null だけを許す。
-- =====================================================================
alter table public.invitations drop constraint invitations_check;
alter table public.invitations add constraint invitations_check
  check (status <> 'accepted' or accepted_at is not null);
