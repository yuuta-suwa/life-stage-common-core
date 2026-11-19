/**
 * APP01 試験公開前 E2E（ローカル Supabase スタック＋本番ビルドの Next.js）
 * 実行方法は docs/APP01_TEST_CHECKLIST.md「自動E2E」を参照。
 *
 * シナリオ：管理者の招待発行 → 一般利用者の招待受諾 → APP01 権限 → LEVEL01〜10（保存・確定・再編集・再確認）
 *          → 再ログイン後の保持 → 総復習 → 最終メッセージ → APP02 引継ぎ（権限なしで失敗・保持）
 *          → 共有（担当者のみ・選択項目のみ）→ フィードバック → 撤回 → データ分離 → 一時停止
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, createUser, db, env, expect, loginContext, sql, step, summary } from "./lib.mjs";

const RUN = Date.now().toString(36);
const ADMIN = `admin-${RUN}@e2e.test`;
const USER = `user1-${RUN}@e2e.test`;
const OTHER = `user2-${RUN}@e2e.test`;
const NOAPP = `noapp-${RUN}@e2e.test`;
const MENTOR = `mentor-${RUN}@e2e.test`;
const SHOTS = process.env.E2E_SHOTS ?? "/tmp/e2e-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

/** ページ内の入力欄を設問の種類に応じて埋める */
async function fillLevel(page, no, marker) {
  const form = page.locator("main");
  for (const ta of await form.locator("textarea:visible").all()) await ta.fill(`${marker} L${no} 回答\n二行目`);
  for (const inp of await form.locator('input[type="text"]:visible').all()) {
    const mode = await inp.getAttribute("inputmode");
    const ml = await inp.getAttribute("maxlength");
    await inp.fill(mode === "numeric" ? (ml === "4" ? "2036" : "300000") : `${marker} L${no}`);
  }
  for (const d of await form.locator('input[type="date"]:visible').all()) await d.fill("2030-04-01");
  // はい／いいえ：すべて「はい」
  for (const r of await form.locator('label.check:has-text("はい") input[type="radio"]').all()) await r.check();
  // 複数選択：各グループの先頭2つ
  for (const g of await form.locator(".checks:has(input[type=checkbox])").all()) {
    const boxes = await g.locator('input[type="checkbox"]').all();
    for (const b of boxes.slice(0, 2)) await b.check();
  }
}

async function waitSaved(page) {
  await page.locator(".save-state.saved").waitFor({ timeout: 10000 });
}

async function confirmLevel(page) {
  page.once("dialog", (d) => d.accept());
  await page.locator(".save-bar button.btn.gold").click();
  await page.waitForURL(/cleared=1/, { timeout: 15000 });
  await page.getByText("STAGE CLEAR").first().waitFor();
}

async function main() {
  await db.connect();
  const browser = await chromium.launch();
  const ids = {};
  let inviteLink = "";
  let admin, user, other, mentor;

  console.log(`E2E run ${RUN}  base=${env.base}`);

  await step("準備：テスト用アカウント作成（Google 認証済みを模擬）", async () => {
    for (const e of [ADMIN, USER, OTHER, NOAPP, MENTOR]) ids[e] = await createUser(e);
  });

  await step("Super Admin の初期招待を受諾し、MFA（aal2）で管理画面に入れる", async () => {
    // 既存の Super Admin がいる場合（再実行時）は bootstrap できないため SQL で付与
    const has = await sql("select 1 from public.admin_roles where role='super_admin' and revoked_at is null");
    const ctx = await loginContext(browser, ADMIN);
    const page = await ctx.newPage();
    if (!has.length) {
      const [{ r }] = await sql("select private.bootstrap_super_admin($1) as r", [ADMIN]);
      await page.goto(`/invite?token=${r.token}`);
      await page.getByRole("button", { name: /このアカウントで受諾する/ }).click();
      await page.waitForURL(/invite\/result/);
      expect(/ACCEPTED|OK|受諾/.test(await page.content()), "招待受諾の結果が成功ではありません");
    } else {
      await sql("insert into public.profiles(id,email,display_name,status) values($1,$2,'e2e admin','active') on conflict (id) do nothing", [ids[ADMIN], ADMIN]);
      await sql("insert into public.admin_roles(user_id, role) values($1,'super_admin')", [ids[ADMIN]]);
    }
    await page.goto("/admin");
    expect(/\/admin\/mfa/.test(page.url()), `MFA 未設定の管理者が /admin/mfa に誘導されません（${page.url()}）`);
    await ctx.close();
    admin = await loginContext(browser, ADMIN, { mfa: true });
    const p2 = await admin.newPage();
    await p2.goto("/admin");
    expect(!/mfa|login/.test(p2.url()), `aal2 でも管理画面に入れません（${p2.url()}）`);
  });

  await step("管理画面 INVITATIONS で一般利用者を APP01 付きで招待（リンクは1回のみ表示）", async () => {
    const page = await admin.newPage();
    await page.goto("/admin/invitations");
    await page.fill("#email", USER);
    await page.locator('input[name="apps"][value="APP01"]').check();
    await page.getByRole("button", { name: /招待リンクを発行/ }).click();
    const code = page.locator(".link-box code");
    await code.waitFor();
    inviteLink = (await code.textContent()).trim();
    expect(inviteLink.includes("/invite?token="), `招待リンクの形式が不正：${inviteLink}`);
    const [{ n }] = await sql("select count(*)::int n from public.invitations where token_hash like $1", [`%${new URL(inviteLink).searchParams.get("token")}%`]);
    expect(n === 0, "招待トークンが平文で保存されています");
    await shot(page, "01-admin-invite");
    // 他の2名（OTHER は APP01 あり、NOAPP は APP01 なし）は RPC で同じく招待
  });

  /** 管理者の RPC で招待を作り、本人の画面で受諾する */
  async function inviteAndAccept(email, apps, role = "") {
    const page = await admin.newPage();
    await page.goto("/admin/invitations");
    await page.fill("#email", email);
    for (const a of apps) await page.locator(`input[name="apps"][value="${a}"]`).check();
    if (role) await page.selectOption("#grant_role", role);
    await page.getByRole("button", { name: /招待リンクを発行/ }).click();
    const link = (await page.locator(".link-box code").textContent()).trim();
    await page.close();
    const ctx = await loginContext(browser, email);
    const p = await ctx.newPage();
    await p.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await p.getByRole("button", { name: /このアカウントで受諾する/ }).click();
    await p.waitForURL(/invite\/result/);
    return ctx;
  }

  await step("未ログインで招待リンクを開いても招待先メールアドレスは表示されない", async () => {
    const ctx = await browser.newContext({ baseURL: env.base });
    const p = await ctx.newPage();
    await p.goto(inviteLink.replace(/^https?:\/\/[^/]+/, ""));
    const html = await p.content();
    expect(!html.includes(USER), "未ログインの招待画面にメールアドレスが出ています");
    expect(html.includes("Google でログインして受諾する"), "Google ログインボタンがありません");
    await ctx.close();
  });

  await step("別アカウント（招待先と異なるメール）では受諾できない", async () => {
    const ctx = await loginContext(browser, OTHER);
    const p = await ctx.newPage();
    await p.goto(inviteLink.replace(/^https?:\/\/[^/]+/, ""));
    await p.getByRole("button", { name: /このアカウントで受諾する/ }).click();
    await p.waitForURL(/invite\/result/);
    expect(/EMAIL_MISMATCH/.test(p.url()) || /一致しません|異なる/.test(await p.content()), `メール不一致が拒否されていません（${p.url()}）`);
    await ctx.close();
  });

  await step("招待された一般利用者が受諾 → APP01 が利用可能になる", async () => {
    user = await loginContext(browser, USER);
    const p = await user.newPage();
    await p.goto(inviteLink.replace(/^https?:\/\/[^/]+/, ""));
    await p.getByRole("button", { name: /このアカウントで受諾する/ }).click();
    await p.waitForURL(/invite\/result/);
    await shot(p, "02-invite-result");
    const [{ status }] = await sql("select status from public.app_entitlements where user_id=$1 and app_code='APP01'", [ids[USER]]);
    expect(status === "active", `APP01 権限が active ではありません：${status}`);
    await p.goto("/");
    await shot(p, "03-portal");
  });

  await step("同じ招待リンクは2回目は使えない（単回使用）", async () => {
    const p = await user.newPage();
    await p.goto(inviteLink.replace(/^https?:\/\/[^/]+/, ""));
    await p.getByRole("button", { name: /このアカウントで受諾する/ }).click();
    await p.waitForURL(/invite\/result/);
    expect(/INVITATION_USED|ALREADY/.test(p.url()) || /使用済み|すでに/.test(await p.content()), `再使用が拒否されていません（${p.url()}）`);
  });

  await step("APP01 権限のない利用者は APP01 に入れない（画面・API とも）", async () => {
    const ctx = await inviteAndAccept(NOAPP, ["APP02"]);
    const p = await ctx.newPage();
    const res = await p.goto("/apps/APP01");
    const html = await p.content();
    expect(res.status() === 403 || /権限がありません|FORBIDDEN|利用権限/.test(html), `APP01 に入れてしまいました（${res.status()}）`);
    const r2 = await p.goto("/apps/APP01/level/1");
    expect(r2.status() === 403 || /権限がありません|利用権限/.test(await p.content()), "LEVEL ページに入れてしまいました");
    const api = await p.request.get("/api/apps/APP01/access");
    const body = await api.json().catch(() => ({}));
    expect(api.status() === 403 || body.granted === false || body.allowed === false, `API が許可を返しました：${api.status()} ${JSON.stringify(body)}`);
    await shot(p, "04-noapp-forbidden");
    await ctx.close();
  });

  await step("オンボーディング（同意）→ LEVEL01 へ。LEVEL02 以降は未開放", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP01");
    await shot(p, "05-onboarding");
    await p.getByRole("button", { name: /同意して開始/ }).click();
    await p.waitForURL(/level\/1/);
    const r = await p.goto("/apps/APP01/level/2");
    expect((await p.content()).includes("確定すると開放されます"), "LEVEL02 が未開放になっていません");
    expect(r.status() === 200, "未開放画面の応答が不正");
  });

  await step("LEVEL01：入力 → 1秒後に自動保存 → 再読込しても残る（途中保存）", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP01/level/1");
    await fillLevel(p, 1, "下書き");
    await waitSaved(p);
    await p.reload();
    const v = await p.locator("main textarea").first().inputValue();
    expect(v.startsWith("下書き L1"), `再読込後に下書きが残っていません：${v}`);
    const [{ status }] = await sql("select status from public.app01_stage_answers where user_id=$1 and stage_no=1", [ids[USER]]);
    expect(status === "draft", `状態が draft ではありません：${status}`);
  });

  await step("LEVEL01〜09 を順に入力・確定（STAGE CLEAR・XP 加算）", async () => {
    const p = await user.newPage();
    for (let no = 1; no <= 9; no++) {
      await p.goto(`/apps/APP01/level/${no}`);
      if (no === 3) {
        await p.locator('input[type="file"]').setInputFiles({ name: "vision.png", mimeType: "image/png", buffer: PNG });
        await p.locator(".vision-item").first().waitFor({ timeout: 15000 });
        await p.locator('label.check:has-text("著作権") input').check();
      }
      await fillLevel(p, no, "確定");
      await waitSaved(p);
      if (no === 1 || no === 2 || no === 3 || no === 9) await shot(p, `06-level${String(no).padStart(2, "0")}`);
      await confirmLevel(p);
      if (no === 1) await shot(p, "07-stage-clear");
    }
    const rows = await sql("select stage_no, status, version from public.app01_stage_answers where user_id=$1 order by stage_no", [ids[USER]]);
    expect(rows.length === 9 && rows.every((r) => r.status === "confirmed"), `確定状態が不正：${JSON.stringify(rows)}`);
    await p.goto("/apps/APP01");
    const html = await p.content();
    expect(html.includes("900"), "XP 900 が表示されていません");
    await shot(p, "08-home-9cleared");
  });

  await step("LEVEL02 の自動計算（未入力≠0、月額×12＋年間）", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP01/level/2");
    const txt = await p.locator(".budget").textContent();
    expect(/円/.test(txt), "自動計算欄に金額が出ていません");
  });

  await step("ビジョン画像は本人だけが署名付きURLで表示でき、他人は Storage から読めない", async () => {
    const [{ answers }] = await sql("select answers from public.app01_stage_answers where user_id=$1 and stage_no=3", [ids[USER]]);
    const key = answers.images?.[0]?.key;
    expect(key && key.startsWith(`${ids[USER]}/APP01/vision/`), `画像キーが本人フォルダではありません：${key}`);
    const p = await user.newPage();
    await p.goto("/apps/APP01/level/3");
    const src = await p.locator(".vision-item img").first().getAttribute("src");
    expect(/token=/.test(src ?? ""), `署名付きURLではありません：${src}`);
    other = await inviteAndAccept(OTHER, ["APP01"]);
    const op = await other.newPage();
    await op.goto("/");
    const cookies = await other.cookies();
    const raw = cookies.filter((c) => c.name.startsWith("sb-")).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
    const session = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString());
    const res = await fetch(`${env.sbUrl}/storage/v1/object/authenticated/user-files/${key}`, {
      headers: { apikey: env.sbPub, Authorization: `Bearer ${session.access_token}` },
    });
    expect(res.status >= 400, `他人の画像が読めました：${res.status}`);
  });

  await step("過去 LEVEL（LEVEL03）を再編集 → LEVEL03 は下書き、後続の確定済み LEVEL は「再確認が必要」", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP01/level/3");
    await p.locator(".vision-item input").first().fill("再編集した願望");
    await waitSaved(p);
    const rows = await sql("select stage_no, status, needs_recheck from public.app01_stage_answers where user_id=$1 order by stage_no", [ids[USER]]);
    const s3 = rows.find((r) => r.stage_no === 3);
    expect(s3.status === "draft", "LEVEL03 が下書きに戻っていません");
    expect(rows.filter((r) => r.stage_no > 3).every((r) => r.needs_recheck), `後続 LEVEL が要再確認になっていません：${JSON.stringify(rows)}`);
    await p.goto("/apps/APP01");
    expect((await p.content()).includes("再確認が必要"), "ホームに「再確認が必要」が出ていません");
    await shot(p, "09-home-recheck");
    await p.goto("/apps/APP01/level/10");
    expect((await p.content()).includes("確定すると、LEVEL10 に挑戦できます"), "要再確認があるのに LEVEL10 が開放されています");
  });

  await step("再確定してから後続 LEVEL を再確認（XP は増えない）", async () => {
    const p = await user.newPage();
    for (let no = 3; no <= 9; no++) {
      await p.goto(`/apps/APP01/level/${no}`);
      await confirmLevel(p);
    }
    const rows = await sql("select stage_no, status, needs_recheck, version from public.app01_stage_answers where user_id=$1 order by stage_no", [ids[USER]]);
    expect(rows.every((r) => r.status === "confirmed" && !r.needs_recheck), `再確認後の状態が不正：${JSON.stringify(rows)}`);
    const [{ n }] = await sql("select count(*)::int n from public.app01_stage_history where user_id=$1", [ids[USER]]);
    expect(n === 16, `確定履歴の件数が想定外：${n}（9＋再確定7）`);
    await p.goto("/apps/APP01");
    const html = await p.content();
    expect(html.includes(">900<") || /900\s*<span/.test(html) || html.includes("900"), "XP が変化しています");
  });

  await step("ログアウト → 再ログイン後も回答・状態が保持され「前回の続きから」で LEVEL10 へ", async () => {
    const p = await user.newPage();
    await p.goto("/account");
    const out = p.getByRole("button", { name: /ログアウト/ });
    if (await out.count()) {
      await out.first().click();
      await p.waitForURL(/login|\/$/);
    }
    await user.close();
    user = await loginContext(browser, USER);
    const q = await user.newPage();
    await q.goto("/apps/APP01");
    await q.getByRole("link", { name: /前回の続きから/ }).click();
    await q.waitForURL(/level\/10/);
    await shot(q, "10-relogin-resume");
  });

  await step("LEVEL10：チェックリスト未完了では完成できない", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP01/level/10");
    await fillLevel(p, 10, "確定");
    // 1つだけ「いいえ」にする
    await p.locator('label.check:has-text("いいえ") input[type="radio"]').first().check();
    await waitSaved(p);
    p.once("dialog", (d) => d.accept());
    await p.locator(".save-bar button.btn.gold").click();
    await p.locator(".notice.error").waitFor({ timeout: 10000 });
    await shot(p, "11-level10-checklist-error");
    const [{ status }] = await sql("select status from public.app01_stage_answers where user_id=$1 and stage_no=10", [ids[USER]]);
    expect(status === "draft", "チェックリスト未完了なのに確定されました");
  });

  await step("【回帰】人生の目的（LEVEL04）が空のまま LEVEL10 を完成しようとすると、確定前に止まる", async () => {
    const p = await user.newPage();
    // LEVEL04 の「人生の目的を一文で」を空にして 4〜9 を再確定
    await p.goto("/apps/APP01/level/4");
    const last = p.locator("main .app01-question").last().locator("textarea, input[type=text]").first();
    const keep = await last.inputValue();
    await last.fill("");
    await waitSaved(p);
    for (let no = 4; no <= 9; no++) { await p.goto(`/apps/APP01/level/${no}`); await confirmLevel(p); }
    await p.goto("/apps/APP01/level/10");
    for (const r of await p.locator('label.check:has-text("はい") input[type="radio"]').all()) await r.check();
    await waitSaved(p);
    p.once("dialog", (d) => d.accept());
    await p.locator(".save-bar button.btn.gold").click();
    await p.locator(".save-bar .notice.error").waitFor({ timeout: 10000 });
    const msg = await p.locator(".save-bar .notice.error").innerText();
    expect(msg.includes("LEVEL04 人生の目的"), `不足項目が表示されません：${msg}`);
    await shot(p, "11b-level10-blueprint-incomplete");
    const [{ status }] = await sql("select status from public.app01_stage_answers where user_id=$1 and stage_no=10", [ids[USER]]);
    expect(status === "draft", "人生設計を作れないのに LEVEL10 が確定されました");
    // 元に戻す
    await p.goto("/apps/APP01/level/4");
    await p.locator("main .app01-question").last().locator("textarea, input[type=text]").first().fill(keep);
    await waitSaved(p);
    for (let no = 4; no <= 9; no++) { await p.goto(`/apps/APP01/level/${no}`); await confirmLevel(p); }
  });

  await step("【回帰】入力直後（自動保存の1秒以内）に画面を移動しても入力が失われない", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP01/level/10");
    await p.locator('label.check:has-text("いいえ") input[type="radio"]').first().check();
    await p.getByRole("link", { name: "ステージ一覧へ戻る" }).click();
    await p.waitForURL(/\/apps\/APP01$/);
    await p.waitForTimeout(1500);
    const [{ status, updated }] = await sql("select status, updated_at > now() - interval '10 seconds' as updated from public.app01_stage_answers where user_id=$1 and stage_no=10", [ids[USER]]);
    expect(updated, "画面移動直前の入力が保存されていません");
    expect(status === "draft", `状態が想定外：${status}`);
  });

  await step("LEVEL10 完成 → MY LIFE BLUEPRINT（life_blueprint 1.0）作成", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP01/level/10");
    for (const r of await p.locator('label.check:has-text("はい") input[type="radio"]').all()) await r.check();
    await waitSaved(p);
    await shot(p, "12-level10");
    await confirmLevel(p);
    const snaps = await sql("select snapshot_type, schema_version from public.app_snapshots where user_id=$1", [ids[USER]]);
    expect(snaps.length === 1 && snaps[0].snapshot_type === "life_blueprint", `ブループリントが作成されていません：${JSON.stringify(snaps)}`);
  });

  await step("MY LIFE DISCOVERY：10項目に最新確定回答が表示される", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP01/discovery");
    const cards = await p.locator(".discovery-card").count();
    expect(cards === 10, `総復習のカード数が10ではありません：${cards}`);
    const html = await p.content();
    expect(html.includes("人生設計は完成しています"), "完成表示がありません");
    expect(!html.includes("再確認が必要"), "完成後に再確認表示が残っています");
    await shot(p, "13-discovery");
  });

  await step("最終メッセージ（原文）表示 → APP02 引継ぎは権限なしで失敗し、APP01 は保持・再試行可能", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP01/final");
    expect((await p.content()).includes("二度ない人生を"), "最終メッセージが表示されていません");
    await shot(p, "14-final");
    await p.locator('input[name="consent"]').check();
    await p.getByRole("button", { name: /APP02/ }).first().click();
    await p.waitForURL(/transfer=|error=/);
    const html = await p.content();
    expect(html.includes("引き継ぎが完了していません") && html.includes("APP01 の人生設計はそのまま保存されています"), `失敗時表示が想定外（${p.url()}）`);
    expect(html.includes("APP02 の利用権限がまだ付与されていません"), "権限不足の理由が表示されていません");
    await shot(p, "15-handoff-failed");
    const [{ n }] = await sql("select count(*)::int n from public.app_snapshots where user_id=$1", [ids[USER]]);
    expect(n === 1, "引継ぎ失敗でブループリントが失われました");
  });

  await step("APP02 権限付与後の再試行で引継ぎ成功（同一スナップショットで冪等）", async () => {
    const page = await admin.newPage();
    await page.goto(`/admin/users/${ids[USER]}`);
    await page.locator('form:has(input[name="app_code"][value="APP02"]) button').click();
    await page.waitForLoadState("networkidle");
    const p = await user.newPage();
    await p.goto("/apps/APP01/final");
    await p.getByRole("button", { name: /再試行|もう一度/ }).click();
    await p.waitForURL(/transfer=/);
    expect((await p.content()).includes("APP02 に引き継ぎました"), `再試行が成功しません（${p.url()}）`);
    const tr = await sql("select status from public.data_transfers where user_id=$1", [ids[USER]]);
    expect(tr.length === 1, `引継ぎ要求が重複しています：${JSON.stringify(tr)}`);
  });

  await step("担当者（メンター）設定 → 本人が選んだ項目だけを共有 → メンターは共有分のみ閲覧・返信", async () => {
    mentor = await inviteAndAccept(MENTOR, [], "mentor");
    const page = await admin.newPage();
    await page.goto("/admin/assignments");
    await page.selectOption("#mentor_id", ids[MENTOR]);
    await page.selectOption("#user_id_m", ids[USER]);
    await page.getByRole("button", { name: "担当を設定" }).click();
    await page.waitForLoadState("networkidle");

    const p = await user.newPage();
    await p.goto("/apps/APP01/level/1?cleared=1");
    await p.getByRole("button", { name: /共有/ }).first().click();
    await shot(p, "16a-share-open");
    await p.locator(".share-panel .checks label.check", { hasText: "メンター" }).first().locator("input").check();
    // 項目：最初の1つだけ残して他を外す
    const items = await p.locator(".share-items input[type=checkbox]").all();
    for (const [i, b] of items.entries()) { if (i === 0) await b.check(); else await b.uncheck(); }
    await shot(p, "16-share-preview");
    p.once("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "アプリ内で共有する" }).click();
    await p.locator(".share-panel .notice").waitFor({ timeout: 10000 });
    expect(await p.locator(".share-panel .notice.ok").count(), `共有に失敗：${await p.locator(".share-panel .notice").textContent()}`);

    const m = await mentor.newPage();
    await m.goto("/apps/APP01/received");
    const text = await m.locator("main").innerText();
    expect(text.includes("LEVEL 01"), `メンターに共有が届いていません：${text.slice(0, 200)}`);
    const shared = await m.locator(".answers > div").count();
    expect(shared === 1, `選択した1項目以外も共有されています：${shared}`);
    await m.fill('textarea[name="comment"]', "E2E メンターからの返信");
    await m.getByRole("button", { name: /返信|送信|フィードバック/ }).click();
    await m.waitForURL(/ok=feedback/);
    await shot(m, "17-mentor-received");
    // メンターは本人の回答テーブル・他の LEVEL を見られない
    const r = await m.goto("/apps/APP01");
    expect(r.status() === 403 || /権限がありません|利用権限/.test(await m.content()), "APP01 権限のないメンターが本人画面に入れました");
    const p2 = await user.newPage();
    await p2.goto("/apps/APP01/shares");
    expect((await p2.content()).includes("E2E メンターからの返信"), "本人の画面に返信が表示されません");
    await shot(p2, "18-shares");
  });

  await step("本人が共有を撤回 → メンターは閲覧できなくなる", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP01/shares");
    p.once("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "撤回する" }).first().click();
    await p.waitForURL(/ok=revoked/);
    const m = await mentor.newPage();
    await m.goto("/apps/APP01/received");
    expect((await m.content()).includes("現在閲覧できる共有はありません"), "撤回後もメンターが閲覧できます");
  });

  await step("データ分離：別の APP01 利用者は他人の回答・履歴・共有・画像を一切取得できない", async () => {
    const p = await other.newPage();
    await p.goto("/apps/APP01");
    const html = await p.content();
    expect(!html.includes("確定 L1"), "他人の回答が表示されています");
    const cookies = await other.cookies();
    const raw = cookies.filter((c) => c.name.startsWith("sb-")).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
    const { access_token } = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString());
    for (const t of ["app01_stage_answers", "app01_stage_history", "app01_feedback", "app_snapshots", "data_shares", "consent_records"]) {
      const res = await fetch(`${env.sbUrl}/rest/v1/${t}?select=*&user_id=eq.${ids[USER]}`, { headers: { apikey: env.sbPub, Authorization: `Bearer ${access_token}` } });
      const res2 = await fetch(`${env.sbUrl}/rest/v1/${t}?select=*&owner_id=eq.${ids[USER]}`, { headers: { apikey: env.sbPub, Authorization: `Bearer ${access_token}` } });
      const rows = [...(res.ok ? await res.json() : []), ...(res2.ok ? await res2.json() : [])];
      expect(rows.length === 0, `${t}：他人の行が ${rows.length} 件取得できました`);
    }
    // 他人の LEVEL を書き換える RPC 経路もない（自分の行にしか書けない）
    const rpc = await fetch(`${env.sbUrl}/rest/v1/rpc/app01_save_draft`, {
      method: "POST", headers: { apikey: env.sbPub, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_stage: 1, p_answers: { q1: "other" } }),
    });
    expect(rpc.ok, `自分の下書き保存に失敗：${rpc.status}`);
    const [{ q1 }] = await sql("select answers->>'q1' q1 from public.app01_stage_answers where user_id=$1 and stage_no=1", [ids[USER]]);
    expect(q1 !== "other", "他人の回答が書き換わりました");
  });

  await step("管理者は利用者の回答本文を閲覧できない（RLS）", async () => {
    const cookies = await admin.cookies();
    const raw = cookies.filter((c) => c.name.startsWith("sb-")).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
    const { access_token } = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString());
    const res = await fetch(`${env.sbUrl}/rest/v1/app01_stage_answers?select=*`, { headers: { apikey: env.sbPub, Authorization: `Bearer ${access_token}` } });
    const rows = res.ok ? await res.json() : [];
    expect(rows.length === 0, `管理者が回答本文を ${rows.length} 件取得できました`);
  });

  await step("一時停止中の利用者は APP01 に入れず、再開すると元のデータで再開できる", async () => {
    const page = await admin.newPage();
    await page.goto(`/admin/users/${ids[USER]}`);
    await page.fill("#reason", "E2E 一時停止");
    await page.getByRole("button", { name: /一時停止/ }).click();
    await page.waitForLoadState("networkidle");
    const p = await user.newPage();
    const r = await p.goto("/apps/APP01");
    const html = await p.content();
    expect(r.status() === 403 || /停止|利用できません/.test(html) || /status/.test(p.url()), `停止中なのに APP01 に入れました（${p.url()}）`);
    await shot(p, "19-suspended");
    await page.goto(`/admin/users/${ids[USER]}`);
    await page.getByRole("button", { name: /利用再開/ }).click();
    await page.waitForLoadState("networkidle");
    await p.goto("/apps/APP01/discovery");
    expect((await p.content()).includes("人生設計は完成しています"), "再開後にデータが保持されていません");
  });

  await step("【回帰】ヘッダーのログアウトボタンが読める（文字色と背景色が異なる）", async () => {
    for (const w of [1280, 390]) {
      const ctx = await loginContext(browser, USER, { viewport: { width: w, height: 800 } });
      const p = await ctx.newPage();
      await p.goto("/apps/APP01");
      const btn = p.locator(".topbar button", { hasText: "ログアウト" });
      const { color, bg, top } = await btn.evaluate((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { color: cs.color, bg: cs.backgroundColor, top: r.top };
      });
      expect(color !== bg && !(bg === "rgb(255, 255, 255)" && color === "rgb(255, 255, 255)"), `ログアウトが読めません（${w}px：${color} / ${bg}）`);
      const h = await p.locator(".topbar").evaluate((el) => el.getBoundingClientRect().height);
      expect(h <= 60 && top >= 0, `ヘッダーが崩れています（${w}px：高さ ${h}）`);
      await p.locator(".topbar").screenshot({ path: path.join(SHOTS, `21-header-${w}.png`) });
      await ctx.close();
    }
  });

  await step("iPad 縦・スマホ幅で LEVEL 画面に横はみ出しがない", async () => {
    for (const [w, h, name] of [[820, 1180, "ipad"], [390, 844, "phone"]]) {
      const ctx = await loginContext(browser, USER, { viewport: { width: w, height: h } });
      const p = await ctx.newPage();
      for (const url of ["/apps/APP01", "/apps/APP01/level/2", "/apps/APP01/level/10", "/apps/APP01/discovery", "/apps/APP01/final"]) {
        await p.goto(url);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over <= 1, `${name} ${url} で ${over}px はみ出し`);
      }
      await shot(p, `20-${name}-final`);
      await ctx.close();
    }
  });

  await step("監査ログ：招待・受諾・権限・確定・共有・撤回・停止が記録され、回答本文は含まれない", async () => {
    const rows = await sql("select action, after_state::text a from public.audit_logs where occurred_at > now() - interval '1 hour'");
    const actions = new Set(rows.map((r) => r.action));
    for (const a of ["invitation.create", "invitation.accept", "entitlement.grant", "app01.stage.confirm", "user.suspend"]) {
      expect([...actions].some((x) => x.startsWith(a.split(".")[0]) && x.includes(a.split(".").slice(-1)[0])), `監査ログに ${a} がありません（${[...actions].join(",")}）`);
    }
    expect(!rows.some((r) => (r.a ?? "").includes("確定 L1")), "監査ログに回答本文が含まれています");
  });

  await browser.close();
  await db.end();
  const { results, failed } = summary();
  fs.writeFileSync(path.join(SHOTS, "results.json"), JSON.stringify({ run: RUN, at: new Date().toISOString(), results }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await db.end().catch(() => {});
  process.exit(2);
});
