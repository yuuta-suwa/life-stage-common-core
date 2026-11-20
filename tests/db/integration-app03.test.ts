/**
 * APP03 連携（機械間）：連携トークンの発行・失効と、同意済みの承認済み計画だけの受け渡し
 */
import { describe, it, expect, beforeAll } from "vitest";
import { expectFail, invitedUser, rpc, selectAs, sql, superAdmin, validGrowthPlan } from "./helpers";

type U = { id: string; email: string };
let root: U;
beforeAll(async () => { root = await superAdmin(); });

const fetchAs = (token: string, ext: string) => rpc<{ records: { snapshot_id: string; payload: { cells: unknown[] } }[] }>(null, "integration_app03_growth_plan", [token, ext], "aal1");

async function consentedUser() {
  const u = await invitedUser(root.id, ["APP02", "APP03"]);
  const snap = await rpc<{ snapshot_id: string }>(u.id, "confirm_snapshot", ["APP02", "growth_plan", "1.0", JSON.stringify(validGrowthPlan())], "aal1");
  const tr = await rpc<{ status: string }>(u.id, "request_transfer", [snap.snapshot_id, "APP03", "1.0", "2026-11"], "aal1");
  expect(tr.status).toBe("succeeded");
  return u;
}

describe("連携トークンの発行・失効（Super Admin・MFA のみ）", () => {
  it("Super Admin（aal2）だけが発行でき、平文は戻り値のみ。DB にはハッシュだけが残る", async () => {
    const admin = await invitedUser(root.id, [], { role: "admin" });
    await expectFail(rpc(admin.id, "admin_issue_integration_token", ["APP03", "x"]), /FORBIDDEN|SUPER_ADMIN/);
    await expectFail(rpc(root.id, "admin_issue_integration_token", ["APP03", "x"], "aal1"), "MFA_REQUIRED");
    await expectFail(rpc(root.id, "admin_issue_integration_token", ["APP04", "x"]), "INVALID_REQUEST");
    const t = await rpc<{ token: string; hint: string; id: string }>(root.id, "admin_issue_integration_token", ["APP03", "test"]);
    expect(t.token).toMatch(/^lsc_app03_[A-Za-z0-9_-]{40,}$/);
    const [n] = await sql<{ n: number }>("select count(*)::int n from public.integration_clients where token_hint = $1 and position($2 in encode(token_hash, 'escape')) = 0", [t.hint, t.token]);
    expect(Number(n.n)).toBe(1);
    // 利用者・anon はテーブルを直接読めない
    await expectFail(selectAs(admin.id, "select * from public.integration_clients"), /permission denied/);
    await expectFail(selectAs(null, "select * from public.integration_clients", [], "aal1"), /permission denied/);
    const list = await rpc<{ hint: string }[]>(root.id, "admin_list_integration_tokens", []);
    expect(list.some((x) => x.hint === t.hint)).toBe(true);
    expect(JSON.stringify(list)).not.toContain(t.token);
  });
});

describe("APP03 からの取得", () => {
  it("同意して APP03 へ引き継いだ本人の承認済み計画だけを返す（60セル）", async () => {
    const { token } = await rpc<{ token: string }>(root.id, "admin_issue_integration_token", ["APP03", "fetch"]);
    const u = await consentedUser();
    const r = await fetchAs(token, u.id);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].payload.cells).toHaveLength(60);
    const [a] = await sql<{ action: string; target_user_id: string }>("select action, target_user_id from public.audit_logs where action = 'integration.fetch' order by id desc limit 1");
    expect(a.target_user_id).toBe(u.id);
  });

  it("同意（APP03 への引き継ぎ）がない・停止中・ID 形式違い・存在しない利用者は、区別せず空で返す", async () => {
    const { token } = await rpc<{ token: string }>(root.id, "admin_issue_integration_token", ["APP03", "empty"]);
    const noConsent = await invitedUser(root.id, ["APP02", "APP03"]);
    await rpc(noConsent.id, "confirm_snapshot", ["APP02", "growth_plan", "1.0", JSON.stringify(validGrowthPlan())], "aal1");
    expect((await fetchAs(token, noConsent.id)).records).toHaveLength(0);
    const suspended = await consentedUser();
    await rpc(root.id, "admin_set_user_status", [suspended.id, "suspend", "test"]);
    expect((await fetchAs(token, suspended.id)).records).toHaveLength(0);
    expect((await fetchAs(token, "not-a-uuid")).records).toHaveLength(0);
    expect((await fetchAs(token, "00000000-0000-0000-0000-000000000000")).records).toHaveLength(0);
  });

  it("不正なトークン・失効したトークンは拒否。回数制限（1分60回）を超えると拒否", async () => {
    const u = await consentedUser();
    await expectFail(fetchAs("lsc_app03_" + "x".repeat(43), u.id), "INVALID_TOKEN");
    const t = await rpc<{ token: string; id: string }>(root.id, "admin_issue_integration_token", ["APP03", "revoke"]);
    expect((await fetchAs(t.token, u.id)).records).toHaveLength(1);
    await rpc(root.id, "admin_revoke_integration_token", [t.id]);
    await expectFail(fetchAs(t.token, u.id), "INVALID_TOKEN");
    const r = await rpc<{ token: string }>(root.id, "admin_issue_integration_token", ["APP03", "rate"]);
    for (let i = 0; i < 60; i++) await fetchAs(r.token, u.id);
    await expectFail(fetchAs(r.token, u.id), "RATE_LIMITED");
  });
});
