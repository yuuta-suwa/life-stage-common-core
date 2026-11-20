/**
 * 外部サイトのアプリ（APP03・LIFE ACCOUNTING）へのリンク E2E（0017）。
 * アカウント画面の「開く」→ 入口（/apps/<code>）で権限確認 → 登録した URL へ移動。権限がなければ移動しない。
 * 外部サイトには実際には接続せず、移動先の URL だけを確認する（ネットワークで横取り）。
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, createUser, db, expect, loginContext, sql, step, summary } from "./lib.mjs";

const RUN = Date.now().toString(36);
const SA = `lnk-sa-${RUN}@e2e.test`, U = `lnk-u-${RUN}@e2e.test`, N = `lnk-n-${RUN}@e2e.test`;
const SHOTS = process.env.E2E_SHOTS ?? "/tmp/e2e-shots";
fs.mkdirSync(SHOTS, { recursive: true });
const LA = "https://life-accounting-yuta.suwayuuta.chatgpt.site";
const A3 = "https://app03-make-it-real-work.suwayuuta.chatgpt.site";

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
async function stubExternal(ctx) {
  for (const host of [LA, A3]) await ctx.route(`${host}/**`, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>external</title>ok" }));
}

async function main() {
  await db.connect();
  const browser = await chromium.launch();
  const ids = {};
  console.log(`APP LINKS E2E run ${RUN}`);

  await step("準備：LIFE ACCOUNTING と APP03 の権限を持つ利用者、持たない利用者", async () => {
    for (const e of [SA, U, N]) ids[e] = await createUser(e);
    const has = await sql("select 1 from public.admin_roles where role='super_admin' and revoked_at is null");
    if (!has.length) {
      const [{ r }] = await sql("select private.bootstrap_super_admin($1) as r", [SA]);
      await rpcAs(ids[SA], "accept_invitation", [r.token], "aal1");
    } else {
      await sql("insert into public.profiles(id,email,display_name,status) values($1,$2,'sa','active') on conflict do nothing", [ids[SA], SA]);
      await sql("insert into public.admin_roles(user_id, role) values($1,'super_admin')", [ids[SA]]);
    }
    const i1 = await rpcAs(ids[SA], "admin_create_invitation", [U, ["LIFE_ACCOUNTING", "APP03"], null, "e2e", 72]);
    await rpcAs(ids[U], "accept_invitation", [i1.token], "aal1");
    const i2 = await rpcAs(ids[SA], "admin_create_invitation", [N, ["APP01"], null, "e2e", 72]);
    await rpcAs(ids[N], "accept_invitation", [i2.token], "aal1");
  });

  await step("アカウント画面に LIFE ACCOUNTING（人生経理＋未来家計簿）が表示され、「開く」で外部サイトへ移動", async () => {
    const ctx = await loginContext(browser, U);
    await stubExternal(ctx);
    const p = await ctx.newPage();
    await p.goto("/account");
    const tile = p.locator(".app-tile", { hasText: "LIFE ACCOUNTING" });
    expect((await tile.innerText()).includes("人生経理＋未来家計簿") && (await tile.innerText()).includes("外部サイトに移動します"), "表示が不正");
    await p.screenshot({ path: path.join(SHOTS, "links-01-account.png"), fullPage: true });
    await tile.getByRole("link", { name: /開く/ }).click();
    await p.waitForURL(`${LA}/**`);
    await p.goto("/apps/APP03");
    await p.waitForURL(`${A3}/**`);
    await ctx.close();
  });

  await step("権限のない利用者は、URL を直接開いても外部サイトへ移動しない（403）", async () => {
    const ctx = await loginContext(browser, N);
    await stubExternal(ctx);
    const p = await ctx.newPage();
    const res = await p.goto("/apps/LIFE_ACCOUNTING");
    expect(!p.url().startsWith(LA), "権限なしで外部サイトへ移動しました");
    expect(res.status() === 403, `403 ではありません：${res.status()}`);
    await ctx.close();
  });

  await step("設定画面（Super Admin）でアプリの表示名・リンクを確認・変更できる", async () => {
    const ctx = await loginContext(browser, SA, { mfa: true });
    const p = await ctx.newPage();
    await p.goto("/admin/settings");
    const row = p.locator("tr", { has: p.locator('input[name="app_code"][value="LIFE_ACCOUNTING"]') }).filter({ has: p.locator('input[name="base_url"]') });
    expect(await row.locator('input[name="base_url"]').inputValue() === LA, "URL が表示されていません");
    await row.locator('input[name="name_ja"]').fill("人生経理＋未来家計簿（E2E）");
    await row.locator('input[name="reason"]').fill("E2E");
    p.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "保存" }).click();
    await p.waitForURL(/ok=app_link/);
    const [a] = await sql("select name_ja from public.apps where code='LIFE_ACCOUNTING'");
    expect(a.name_ja === "人生経理＋未来家計簿（E2E）", "表示名が変わっていません");
    await rpcAs(ids[SA], "admin_set_app_link", ["LIFE_ACCOUNTING", "人生経理＋未来家計簿", LA, "E2E 元に戻す"]);
    await p.screenshot({ path: path.join(SHOTS, "links-02-settings.png"), fullPage: true });
    await ctx.close();
  });

  await browser.close();
  await db.end();
  const { failed } = summary();
  process.exit(failed.length ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await db.end().catch(() => {}); process.exit(2); });
