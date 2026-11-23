/**
 * 「ChatGPT で分析・評価・改善提案」ボタン E2E（APP01 各 LEVEL・APP02 各 STEP）。
 * 表示中の入力が相談文に入ること、機微な項目は既定で非表示、コピーしても保存データが変わらないことを確認する。
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, createUser, db, expect, loginContext, sql, step, summary } from "./lib.mjs";

const RUN = Date.now().toString(36);
const SA = `rv-sa-${RUN}@e2e.test`, U = `rv-u-${RUN}@e2e.test`;
const SHOTS = process.env.E2E_SHOTS ?? "/tmp/e2e-shots";
fs.mkdirSync(SHOTS, { recursive: true });

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
const preview = async (p) => {
  const panel = p.locator(".review-panel").first();
  if (!(await panel.evaluate((d) => d.open))) await panel.locator("summary").first().click();
  const inner = panel.locator("details");
  if (!(await inner.evaluate((d) => d.open))) await inner.locator("summary").click();
  return (await panel.locator(".review-preview").innerText());
};
const draft = async (uid, no) => (await sql("select answers from public.app01_stage_answers where user_id=$1 and stage_no=$2", [uid, no]))[0]?.answers ?? null;

async function main() {
  await db.connect();
  const browser = await chromium.launch();
  const ids = {};
  console.log(`REVIEW PROMPT E2E run ${RUN}`);

  await step("準備：APP01・APP02 の利用者", async () => {
    for (const e of [SA, U]) ids[e] = await createUser(e);
    const has = await sql("select 1 from public.admin_roles where role='super_admin' and revoked_at is null");
    if (!has.length) {
      const [{ r }] = await sql("select private.bootstrap_super_admin($1) as r", [SA]);
      await rpcAs(ids[SA], "accept_invitation", [r.token], "aal1");
    } else {
      await sql("insert into public.profiles(id,email,display_name,status) values($1,$2,'sa','active') on conflict do nothing", [ids[SA], SA]);
      await sql("insert into public.admin_roles(user_id, role) values($1,'super_admin')", [ids[SA]]);
    }
    const inv = await rpcAs(ids[SA], "admin_create_invitation", [U, ["APP01", "APP02"], null, "e2e", 72]);
    await rpcAs(ids[U], "accept_invitation", [inv.token], "aal1");
  });

  const ctx = await loginContext(browser, U);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3100" });
  const p = await ctx.newPage();

  await step("APP01 LEVEL 01：入力中の内容が相談文に入る。機微な設問（大切な人と…）は既定で非表示、チェックで表示", async () => {
    await p.goto("/apps/APP01");
    await p.getByRole("button", { name: /同意して開始/ }).click();
    await p.goto("/apps/APP01/level/1");
    const areas = p.locator("textarea");
    await areas.nth(0).fill("海の見える家と自由な時間");
    await areas.nth(4).fill("家族と旅の思い出を分かち合いたい");
    let t = await preview(p);
    expect(t.includes("LEVEL 01 心から望む願望を発見する") && t.includes("何を手に入れたい？\n海の見える家と自由な時間"), "入力が相談文に入っていません");
    expect(!t.includes("家族と旅の思い出") && t.includes("非表示"), "機微な設問が既定で含まれています");
    expect(t.includes("① 分析") && t.includes("② 評価") && t.includes("③ 改善提案"), "依頼文が不足");
    await p.locator(".review-panel").first().getByRole("checkbox").check();
    t = await preview(p);
    expect(t.includes("家族と旅の思い出"), "チェックしても機微な設問が入りません");
    await p.screenshot({ path: path.join(SHOTS, "review-01-app01.png"), fullPage: true });
  });

  await step("コピーしても保存データは変わらない（クリップボードの内容＝相談文）", async () => {
    await p.waitForTimeout(1800); // 自動保存（1秒）を待つ
    const before = JSON.stringify(await draft(ids[U], 1));
    expect(before.includes("海の見える家"), "自動保存されていません");
    await p.locator(".review-panel").first().getByRole("button", { name: "相談文をコピー" }).click();
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    expect(clip.includes("海の見える家と自由な時間") && clip.includes("【回答のルール】"), "クリップボードの内容が不正");
    await p.waitForTimeout(1500);
    expect(JSON.stringify(await draft(ids[U], 1)) === before, "コピー操作で保存データが変わりました");
  });

  await step("APP01 LEVEL 02 にもボタンがあり、家計の金額は既定で非表示", async () => {
    // LEVEL 01 を確定して LEVEL 02 を開く（すべての欄を入力）
    await p.goto("/apps/APP01/level/1");
    for (const ta of await p.locator("main textarea:visible").all()) await ta.fill("E2E の回答");
    await p.locator(".save-state.saved").waitFor({ timeout: 10000 });
    p.once("dialog", (d) => d.accept());
    await p.locator(".save-bar button.btn.gold").click();
    await p.waitForURL(/cleared=1/, { timeout: 15000 });
    await p.goto("/apps/APP01/level/2");
    await p.locator('input[inputmode="numeric"]').first().fill("150000");
    let t = await preview(p);
    expect(t.includes("幸福の未来家計簿") && !t.includes("150,000円"), "家計の金額が既定で含まれています");
    await p.screenshot({ path: path.join(SHOTS, "review-03-level2.png"), fullPage: true });
  });

  await step("APP02：各 STEP にボタンがあり、STEP 名と入力が相談文に入る（ChatGPT メモは含めない）", async () => {
    await p.goto("/apps/APP02");
    await p.locator('input[name="consent"]').check();
    await p.getByRole("button", { name: "APP02 を始める" }).click();
    await p.waitForURL(/vision/);
    await p.locator("textarea").first().fill("家族と仲間との時間を大切にしたい");
    const t = await preview(p);
    expect(t.includes("APP02 SELF-REALIZATION ENGINE｜STEP 1 人生ビジョン確認") && t.includes("家族と仲間との時間を大切にしたい"), "APP02 の相談文が不正");
    for (const s of ["sales", "abilities", "analysis", "position", "environment", "commitment", "presentation"]) {
      await p.goto(`/apps/APP02/${s}`);
      expect(await p.locator(".review-panel").count() >= 1, `${s} にボタンがありません`);
    }
    await p.goto("/apps/APP02/vision");
    await p.screenshot({ path: path.join(SHOTS, "review-02-app02.png"), fullPage: true });
  });

  await ctx.close();
  await browser.close();
  await db.end();
  const { failed } = summary();
  process.exit(failed.length ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await db.end().catch(() => {}); process.exit(2); });
