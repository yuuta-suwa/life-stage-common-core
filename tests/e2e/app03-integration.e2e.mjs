/**
 * APP03 連携 E2E：管理画面でトークン発行 → APP03 の同期処理（worker/workflow.js の /api/integrations/sync）と同じ
 * 呼び出し方・検証で共通基盤のエンドポイントを呼ぶ → 失効で拒否。
 * APP03 側の処理を忠実に再現（redirect:'error'、15秒、Bearer、1MB 上限のストリーム読み取り、records 最大100件、id は200文字以内の文字列）。
 * 違いは HTTPS 必須チェックのみ（ローカルは http）。
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, createUser, db, env, expect, loginContext, sql, step, summary } from "./lib.mjs";

const RUN = Date.now().toString(36);
const ADMIN = `i3admin-${RUN}@e2e.test`, USER = `i3user-${RUN}@e2e.test`, OTHER = `i3other-${RUN}@e2e.test`;
const SHOTS = process.env.E2E_SHOTS ?? "/tmp/e2e-shots";
fs.mkdirSync(SHOTS, { recursive: true });
const ENDPOINT = `${env.base}/api/integrations/app03/app02`;
const ABILITIES = ["attraction", "recruitment", "education", "development", "operations", "management"];

async function rpcAs(uid, fn, args = [], aal = "aal2") {
  await db.query("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated", aal })]);
    await db.query("set local role authenticated");
    const r = await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args);
    await db.query("commit");
    return r.rows[0].r;
  } catch (e) { await db.query("rollback"); throw e; }
}

/** APP03 worker/workflow.js の同期処理の再現（HTTPS チェックを除く） */
async function app03Sync(token, externalUserId, endpoint = ENDPOINT) {
  const response = await fetch(endpoint, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify({ externalUserId, certifications: [{ id: "c1", target_key: "level:L2-1" }] }),
  });
  if (!response.ok) return { failed: true, status: response.status };
  const reader = response.body.getReader();
  let raw = "", size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 1000000) { await reader.cancel(); throw new Error("応答が上限を超えています。"); }
    raw += decoder.decode(part.value, { stream: true });
  }
  raw += decoder.decode();
  const data = JSON.parse(raw);
  if (!Array.isArray(data.records) || data.records.length > 100) throw new Error("連携形式が不正です。");
  for (const record of data.records) if (typeof record.id !== "string" || !record.id || record.id.length > 200) throw new Error("実績IDが不正です。");
  return { failed: false, records: data.records, size };
}

async function main() {
  await db.connect();
  const browser = await chromium.launch();
  const ids = {};
  let token = "";
  console.log(`APP03 integration E2E run ${RUN}`);

  await step("準備：Super Admin、APP02・APP03 権限の本人（計画を承認し APP03 への引き継ぎに同意）、同意していない利用者", async () => {
    for (const e of [ADMIN, USER, OTHER]) ids[e] = await createUser(e);
    const has = await sql("select 1 from public.admin_roles where role='super_admin' and revoked_at is null");
    if (!has.length) {
      const [{ r }] = await sql("select private.bootstrap_super_admin($1) as r", [ADMIN]);
      await rpcAs(ids[ADMIN], "accept_invitation", [r.token], "aal1");
    } else {
      await sql("insert into public.profiles(id,email,display_name,status) values($1,$2,'admin','active') on conflict do nothing", [ids[ADMIN], ADMIN]);
      await sql("insert into public.admin_roles(user_id, role) values($1,'super_admin')", [ids[ADMIN]]);
    }
    for (const e of [USER, OTHER]) {
      const inv = await rpcAs(ids[ADMIN], "admin_create_invitation", [e, ["APP01", "APP02", "APP03"], null, "e2e", 72]);
      await rpcAs(ids[e], "accept_invitation", [inv.token], "aal1");
    }
    const plan = { plan_id: crypto.randomUUID(), vision_version: 1, start_year: 2028, mode: "CONVICTION", focus_abilities: ["attraction"], focus_by_year: { "1": ["attraction"] }, commit_year: 2035,
      cells: ABILITIES.flatMap((a) => Array.from({ length: 10 }, (_, i) => ({ ability: a, year_index: String(i + 1), calendar_year: 2028 + i, target: `${a} ${i + 1}年目`, target_level: Math.min(5, i), experiences: "e", criteria: "c" }))),
      provisional_assessment: { attraction: 2 }, approved_at: new Date().toISOString() };
    const s = await rpcAs(ids[USER], "confirm_snapshot", ["APP02", "growth_plan", "1.0", JSON.stringify(plan)], "aal1");
    const t = await rpcAs(ids[USER], "request_transfer", [s.snapshot_id, "APP03", "1.0", "2026-11"], "aal1");
    expect(t.status === "succeeded", "APP03 への引き継ぎに失敗");
    await rpcAs(ids[OTHER], "confirm_snapshot", ["APP02", "growth_plan", "1.0", JSON.stringify({ ...plan, plan_id: crypto.randomUUID() })], "aal1");
  });

  await step("本人のアカウント画面に「連携用ID」が表示される（APP03 の本人照合に使う）", async () => {
    const ctx = await loginContext(browser, USER);
    const p = await ctx.newPage();
    await p.goto("/account");
    expect((await p.locator("main").innerText()).includes(ids[USER]), "連携用ID が表示されません");
    await ctx.close();
  });

  await step("管理画面で Super Admin（MFA）が連携トークンを発行。設定値（エンドポイント・トークン）は1回だけ表示", async () => {
    const admin = await loginContext(browser, ADMIN, { mfa: true });
    const p = await admin.newPage();
    await p.goto("/admin/settings");
    await p.fill("#token-label", "E2E");
    await p.getByRole("button", { name: "APP03 連携トークンを発行" }).click();
    await p.locator(".token-value").waitFor();
    token = (await p.locator(".token-value").innerText()).trim();
    const text = await p.locator("main").innerText();
    expect(text.includes("APP03_APP02_ENDPOINT") && text.includes("/api/integrations/app03/app02") && text.includes("APP03_INTEGRATION_TOKEN"), "設定値の案内が不足");
    await p.screenshot({ path: path.join(SHOTS, "app03-01-token.png"), fullPage: true });
    await p.goto("/admin/settings");
    expect(!(await p.locator("main").innerText()).includes(token), "再表示でトークンの平文が見えています");
    await admin.close();
  });

  await step("APP03 の同期処理（再現）：同意済みの本人 → 計画1件（60マス相当・セールス力以外の6能力×10年）を取得し、APP03 の検証をすべて通過", async () => {
    const r = await app03Sync(token, ids[USER]);
    expect(!r.failed, `失敗：${r.status}`);
    expect(r.records.length === 1, `件数：${r.records.length}`);
    const rec = r.records[0];
    expect(rec.kind === "APP02_GROWTH_PLAN" && rec.capabilities.length === 6 && rec.capabilities.every((c) => c.years.length === 10), "形式が不正");
    expect(rec.capabilities[0].app03_capability === "集客力" && rec.capabilities[0].years[0].focus === true, "能力名・重点の対応が不正");
    expect(!rec.capabilities.some((c) => c.app03_capability === "セールス力"), "セールス力の行は APP03 側で設定する約束");
    const again = await app03Sync(token, ids[USER]);
    expect(again.records[0].id === rec.id, "同じ承認版の id が安定していません（APP03 の重複防止）");
    const [a] = await sql("select count(*)::int n from public.audit_logs where action='integration.fetch' and target_user_id=$1", [ids[USER]]);
    expect(a.n >= 2, "監査ログがありません");
  });

  await step("同意していない利用者・存在しない ID は空（APP03 は「0件反映」）。トークンなし・誤りは 401（APP03 は「未反映・再試行」）", async () => {
    expect((await app03Sync(token, ids[OTHER])).records.length === 0, "同意していない利用者の計画が渡りました");
    expect((await app03Sync(token, "unknown-user")).records.length === 0, "存在しない ID で記録が返りました");
    expect((await app03Sync("", ids[USER])).status === 401, "トークンなしが拒否されません");
    expect((await app03Sync("lsc_app03_" + "z".repeat(43), ids[USER])).status === 401, "誤ったトークンが拒否されません");
    const res = await fetch(ENDPOINT, { method: "GET" });
    expect(res.status === 405, `GET が拒否されません：${res.status}`);
  });

  await step("APP01 → APP03：同意して渡した人生設計を APP03 の「APP01：理想を参照」（再現）で取得。家計・ギャップ・画像は含まれない", async () => {
    const bp = { blueprint_id: crypto.randomUUID(), life_purpose: "家族と挑戦を楽しむ", priority_desires: ["海の見える家"], budget_summary: { target_assets: 30000000 },
      vision_board_asset_refs: [`${ids[USER]}/APP01/vision/x.png`], gap_analysis: { money: "差額500万円" }, goals: [{ type: "long", description: "事業を持つ", deadline: "2036-04-01" }],
      priority_capabilities: ["attraction"], first_action: "週3回の発信", first_action_date: "2026-12-01", consent_version: "2026-11" };
    const s = await rpcAs(ids[USER], "confirm_snapshot", ["APP01", "life_blueprint", "1.0", JSON.stringify(bp)], "aal1");
    const before = await app03Sync(token, ids[USER], `${env.base}/api/integrations/app03/app01`);
    expect(before.records.length === 0, "同意前に人生設計が渡りました");
    const t = await rpcAs(ids[USER], "request_transfer", [s.snapshot_id, "APP03", "1.0", "2026-11"], "aal1");
    expect(t.status === "succeeded", "APP01 → APP03 の引き継ぎに失敗");
    const r = await app03Sync(token, ids[USER], `${env.base}/api/integrations/app03/app01`);
    expect(r.records.length === 1 && r.records[0].kind === "APP01_LIFE_BLUEPRINT" && r.records[0].life_purpose === "家族と挑戦を楽しむ", "人生設計の record が不正");
    expect(r.records[0].priority_capabilities[0] === "集客力", "優先能力が APP03 の能力名になっていません");
    const json = JSON.stringify(r.records);
    expect(!json.includes("30000000") && !json.includes("差額500万円") && !json.includes("vision/x.png"), "渡さない項目が含まれています");
  });

  await step("管理画面で失効 → APP03 の同期は拒否される。一覧に最終利用日時が残る", async () => {
    const admin = await loginContext(browser, ADMIN, { mfa: true });
    const p = await admin.newPage();
    await p.goto("/admin/settings");
    const row = p.locator("tr", { hasText: "E2E" });
    expect(!(await row.innerText()).includes("未使用"), "最終利用日時が記録されていません");
    p.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "失効" }).click();
    await p.waitForURL(/ok=token_revoked/);
    expect((await app03Sync(token, ids[USER])).status === 401, "失効後も取得できました");
    expect((await app03Sync(token, ids[USER], `${env.base}/api/integrations/app03/app01`)).status === 401, "失効後も APP01 を取得できました");
    await admin.close();
  });

  await browser.close();
  await db.end();
  const { failed } = summary();
  process.exit(failed.length ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await db.end().catch(() => {}); process.exit(2); });
