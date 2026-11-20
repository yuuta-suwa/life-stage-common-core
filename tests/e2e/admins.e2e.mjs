/**
 * 管理者管理（/admin/admins）E2E：Super Admin による Super Admin・Admin・Mentor の任命と解任。
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, createUser, db, expect, loginContext, sql, step, summary } from "./lib.mjs";

const RUN = Date.now().toString(36);
const SA = `adm-sa-${RUN}@e2e.test`, A = `adm-a-${RUN}@e2e.test`, B = `adm-b-${RUN}@e2e.test`, C = `adm-c-${RUN}@e2e.test`;
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
const roles = async (uid) => (await sql("select role from public.admin_roles where user_id=$1 and revoked_at is null order by role", [uid])).map((r) => r.role);

async function appoint(page, email, role) {
  await page.goto("/admin/admins");
  const value = await page.locator("#appoint_user option", { hasText: email }).getAttribute("value");
  await page.selectOption("#appoint_user", value);
  await page.selectOption("#appoint_role", role);
  await page.fill("#appoint_reason", `E2E ${role}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "任命する" }).click();
  await page.waitForURL(/ok=role/);
}
async function dismiss(page, email, roleLabel) {
  await page.goto("/admin/admins");
  const card = page.locator(".card", { has: page.locator(".section-title", { hasText: roleLabel }) });
  const row = card.locator("tr", { hasText: email });
  await row.locator('input[name="reason"]').fill("E2E 解任");
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "解任" }).click();
  await page.waitForURL(/ok=role/);
}

async function main() {
  await db.connect();
  const browser = await chromium.launch();
  const ids = {};
  console.log(`ADMINS E2E run ${RUN}`);

  await step("準備：Super Admin 1名と利用者3名", async () => {
    for (const e of [SA, A, B, C]) ids[e] = await createUser(e);
    const has = await sql("select 1 from public.admin_roles where role='super_admin' and revoked_at is null");
    if (!has.length) {
      const [{ r }] = await sql("select private.bootstrap_super_admin($1) as r", [SA]);
      await rpcAs(ids[SA], "accept_invitation", [r.token], "aal1");
    } else {
      await sql("insert into public.profiles(id,email,display_name,status) values($1,$2,'sa','active') on conflict do nothing", [ids[SA], SA]);
      await sql("insert into public.admin_roles(user_id, role) values($1,'super_admin')", [ids[SA]]);
    }
    for (const e of [A, B, C]) {
      const inv = await rpcAs(ids[SA], "admin_create_invitation", [e, ["APP01"], null, "e2e", 72]);
      await rpcAs(ids[e], "accept_invitation", [inv.token], "aal1");
    }
  });

  let sa;
  await step("管理者管理を開ける。メニューに ADMINS、件数と「あなた」が表示される", async () => {
    sa = await loginContext(browser, SA, { mfa: true });
    const p = await sa.newPage();
    await p.goto("/admin/admins");
    const text = await p.locator("main").innerText();
    expect(text.includes("管理者管理") && text.includes("任命する"), "画面が表示されません");
    expect(await p.locator(".sidenav", { hasText: "ADMINS" }).count() === 1, "メニューに ADMINS がありません");
    expect(text.includes("あなた"), "自分の行がありません");
    await p.close();
  });

  await step("Admin・Mentor・Super Admin を任命できる（理由つき・監査記録）", async () => {
    const p = await sa.newPage();
    await appoint(p, B, "admin");
    await appoint(p, C, "mentor");
    await appoint(p, A, "super_admin");
    expect((await roles(ids[B])).join() === "admin", "Admin が任命されていません");
    expect((await roles(ids[C])).join() === "mentor", "Mentor が任命されていません");
    expect((await roles(ids[A])).join() === "super_admin", "Super Admin が任命されていません");
    const [log] = await sql("select reason from public.audit_logs where action='role.grant' and target_user_id=$1 order by id desc limit 1", [ids[B]]);
    expect(log?.reason === "E2E admin", "任命の理由が監査ログにありません");
    await p.goto("/admin/admins");
    const text = await p.locator("main").innerText();
    expect(text.includes(B) && text.includes(C) && text.includes(A), "一覧に表示されません");
    await p.screenshot({ path: path.join(SHOTS, "admins-01.png"), fullPage: true });
    await p.close();
  });

  await step("Admin は管理者管理を使えない（Super Admin のみの案内）。直接 RPC でも任命できない", async () => {
    const b = await loginContext(browser, B, { mfa: true });
    const p = await b.newPage();
    await p.goto("/admin/admins");
    expect((await p.locator("main").innerText()).includes("Super Admin のみ"), "Admin に任命フォームが見えています");
    expect(await p.locator("#appoint_user").count() === 0, "Admin に任命フォームがあります");
    let denied = false;
    try { await rpcAs(ids[B], "admin_set_role", [ids[C], "admin", true, null]); } catch { denied = true; }
    expect(denied, "Admin が任命できてしまいました");
    await b.close();
  });

  await step("解任：Admin・Mentor を外せる（Admin の担当範囲も外れる）", async () => {
    await rpcAs(ids[SA], "admin_set_scope", [ids[B], ids[C], true]).catch(() => {});
    const p = await sa.newPage();
    await dismiss(p, B, "管理者（");
    await dismiss(p, C, "メンター等");
    expect((await roles(ids[B])).length === 0 && (await roles(ids[C])).length === 0, "解任されていません");
    const [s] = await sql("select count(*)::int n from public.admin_user_scopes where admin_id=$1 and revoked_at is null", [ids[B]]);
    expect(s.n === 0, "担当範囲が残っています");
    await p.close();
  });

  await step("新しい Super Admin が元の Super Admin を解任できる。自分自身は解任できない", async () => {
    const a = await loginContext(browser, A, { mfa: true });
    const p = await a.newPage();
    await p.goto("/admin/admins");
    const selfRow = p.locator("tr", { hasText: A });
    expect(await selfRow.getByRole("button", { name: "解任" }).count() === 0, "自分の解任ボタンがあります");
    await dismiss(p, SA, "最高管理者");
    expect((await roles(ids[SA])).length === 0, "元の Super Admin が解任されていません");
    await p.goto("/admin/admins");
    expect((await p.locator("main").innerText()).includes("最後の Super Admin のため解任できません"), "最後の Super Admin の案内がありません");
    // スマホ幅で横はみ出しなし
    await p.setViewportSize({ width: 390, height: 844 });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const offenders = await p.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest(".table-wrap")).slice(0, 5).map((e) => `${e.tagName}.${e.className}`));
    expect(overflow <= 1, `スマホで横にはみ出しています（${overflow}px：${offenders.join(" / ")}）`);
    await p.screenshot({ path: path.join(SHOTS, "admins-02-phone.png"), fullPage: true });
    await a.close();
  });

  await sa.close();
  await browser.close();
  await db.end();
  const { failed } = summary();
  process.exit(failed.length ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await db.end().catch(() => {}); process.exit(2); });
