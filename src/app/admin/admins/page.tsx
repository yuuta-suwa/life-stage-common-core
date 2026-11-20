import Link from "next/link";
import { requirePage } from "@/lib/access";
import { isSuperAdmin } from "@/lib/access-policy";
import { createClient } from "@/lib/supabase/server";
import { Flash, PageHeader, SectionTitle, formatDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { setRole } from "../actions";

type UserRow = { id: string; email: string; display_name: string; status: string; roles: string[]; is_self?: boolean };
type RoleRow = { user_id: string; role: string; granted_at: string; reason: string | null };

const ROLES = [
  { code: "super_admin", en: "SUPER ADMIN", ja: "最高管理者", desc: "すべての利用者・管理者・設定を管理。任命・解任、連携トークン、公開段階の変更ができます。" },
  { code: "admin", en: "ADMIN", ja: "管理者", desc: "担当範囲（ASSIGNMENTS）に入れた利用者だけを管理します。管理者の任命はできません。" },
  { code: "mentor", en: "MENTOR", ja: "メンター等", desc: "本人が共有した内容だけを閲覧・返信できます。管理画面には入れません。" },
] as const;

/** 管理者の任命・解任（Super Admin のみ）。実際の権限変更は admin_set_role（MFA 必須・自分自身は不可・監査記録）で行う */
export default async function AdminsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const access = await requirePage({ kind: "admin" }, "/admin/admins");
  const sp = await searchParams;
  if (!isSuperAdmin(access)) {
    return (
      <>
        <PageHeader en="ADMINS" ja="管理者管理" desc="管理者の任命・解任は Super Admin だけが行えます。" />
        <div className="notice warn">この画面は Super Admin のみ利用できます。<span className="en">Super Admin only.</span></div>
      </>
    );
  }
  const supabase = await createClient();
  const [{ data: list }, { data: roles }, { data: scopes }] = await Promise.all([
    supabase.rpc("admin_list_users", { p_search: null, p_status: "active", p_limit: 200, p_offset: 0 }),
    supabase.from("admin_roles").select("user_id, role, granted_at, reason").is("revoked_at", null).order("granted_at"),
    supabase.from("admin_user_scopes").select("admin_id").is("revoked_at", null),
  ]);
  const users = ((list ?? {}) as { users?: UserRow[] }).users ?? [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const scopeCount = new Map<string, number>();
  for (const s of scopes ?? []) scopeCount.set(s.admin_id, (scopeCount.get(s.admin_id) ?? 0) + 1);
  const rows = (roles ?? []) as RoleRow[];
  const holders = (code: string) => rows.filter((r) => r.role === code);
  const superCount = holders("super_admin").length;

  return (
    <>
      <PageHeader en="ADMINS" ja="管理者管理" desc="Super Admin・Admin・Mentor の任命と解任をまとめて行います。すべて操作履歴に記録されます。">
        <Link href="/admin/invitations" className="btn ghost small">未登録の方は招待から →</Link>
      </PageHeader>
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid kpi">
        {ROLES.map((r) => (
          <div key={r.code} className={`card kpi-card${r.code === "super_admin" ? " gold" : ""}`}>
            <div className="label"><b>{r.en}</b>{r.ja}</div>
            <div className="value">{holders(r.code).length}</div>
          </div>
        ))}
      </div>

      <SectionTitle en="APPOINT" ja="任命する" />
      <form action={setRole} className="card row">
        <input type="hidden" name="grant" value="true" />
        <input type="hidden" name="back" value="/admin/admins" />
        <div className="field"><label htmlFor="appoint_user">対象の方<small>登録済み・利用中の方</small></label>
          <select id="appoint_user" name="user_id" required defaultValue="">
            <option value="" disabled>選択してください</option>
            {users.filter((u) => !u.is_self).map((u) => (
              <option key={u.id} value={u.id}>{u.display_name ? `${u.display_name}（${u.email}）` : u.email}{u.roles.length ? ` ［${u.roles.join("・")}］` : ""}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: "0 1 220px" }}><label htmlFor="appoint_role">役割</label>
          <select id="appoint_role" name="role" required defaultValue="admin">
            {ROLES.map((r) => <option key={r.code} value={r.code}>{r.en}｜{r.ja}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="appoint_reason">理由<small>操作履歴に記録</small></label><input id="appoint_reason" name="reason" type="text" maxLength={500} /></div>
        <div className="field" style={{ flex: "0 0 auto" }}><SubmitButton className="btn gold" confirm="選んだ方を任命します。よろしいですか？">任命する</SubmitButton></div>
      </form>
      <p className="small muted">
        Super Admin・Admin に任命された方は、次に管理画面を開いたときに二段階認証の登録を求められます。
        Admin が管理できる利用者は「担当者管理（ASSIGNMENTS）」で決めます。まだ登録していない方は、招待管理で管理ロールを選んで招待できます。
      </p>

      {ROLES.map((r) => {
        const list = holders(r.code);
        return (
          <div key={r.code} className="card">
            <SectionTitle en={r.en} ja={`${r.ja}（${list.length}名）`} />
            <p className="small muted">{r.desc}</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>氏名・メール</th><th>任命日</th>{r.code === "admin" ? <th>担当人数</th> : null}<th>解任</th></tr></thead>
                <tbody>
                  {list.map((h) => {
                    const u = byId.get(h.user_id);
                    const self = h.user_id === access.user_id;
                    const last = r.code === "super_admin" && superCount <= 1;
                    return (
                      <tr key={`${r.code}-${h.user_id}`}>
                        <td>
                          <Link href={`/admin/users/${h.user_id}`}><b>{u?.display_name || "（未設定）"}</b></Link>
                          {self ? <span className="badge gold" style={{ marginLeft: 8 }}>あなた</span> : null}
                          <div className="small muted">{u?.email ?? h.user_id}</div>
                        </td>
                        <td className="small">{formatDateTime(h.granted_at)}</td>
                        {r.code === "admin" ? <td>{scopeCount.get(h.user_id) ?? 0} 名</td> : null}
                        <td className="actions">
                          {self ? (
                            <span className="small muted">{last ? "最後の Super Admin のため解任できません" : "ご自身は解任できません（別の Super Admin が操作）"}</span>
                          ) : (
                            <form action={setRole} className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                              <input type="hidden" name="user_id" value={h.user_id} />
                              <input type="hidden" name="role" value={r.code} />
                              <input type="hidden" name="grant" value="false" />
                              <input type="hidden" name="back" value="/admin/admins" />
                              <input name="reason" type="text" placeholder="理由" maxLength={500} aria-label="解任の理由" style={{ maxWidth: 180 }} />
                              <SubmitButton
                                className="btn small danger"
                                confirm={
                                  r.code === "admin" ? "Admin を解任します。担当範囲もすべて外れます。よろしいですか？"
                                  : r.code === "mentor" ? "Mentor を解任します。担当と、この方への共有はすべて撤回されます。よろしいですか？"
                                  : "Super Admin を解任します。よろしいですか？"
                                }
                              >解任</SubmitButton>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!list.length ? <tr><td colSpan={r.code === "admin" ? 4 : 3} className="muted">任命されている方はいません。</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}
