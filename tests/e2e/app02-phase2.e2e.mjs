/**
 * APP02 Phase 2 E2E（ローカル Supabase 実スタック＋本番ビルド）。
 * T07（レビュー）・T08（RETURN TO PURPOSE）・T13（履歴・復元）・T16（オフライン・競合）・T17（共有）・S11（ラダー）
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, createUser, db, env, expect, loginContext, sql, step, summary } from "./lib.mjs";

const RUN = Date.now().toString(36);
const ADMIN = `p2admin-${RUN}@e2e.test`, OWNER = `p2owner-${RUN}@e2e.test`, TRAINER = `p2trainer-${RUN}@e2e.test`, MENTOR = `p2mentor-${RUN}@e2e.test`;
const SHOTS = process.env.E2E_SHOTS ?? "/tmp/e2e-shots";
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, `app02p2-${n}.png`), fullPage: true });
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
const tokenOf = async (ctx) => {
  const raw = (await ctx.cookies()).filter((c) => c.name.startsWith("sb-")).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
  return JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString()).access_token;
};

async function main() {
  await db.connect();
  const browser = await chromium.launch();
  const ids = {};
  let owner, trainer;
  console.log(`APP02 phase2 E2E run ${RUN}`);

  await step("準備：本人（APP02）・トレーナー・メンター（担当として設定）・運営管理者。本人は APP02 を開始し計画を作成済み", async () => {
    for (const e of [ADMIN, OWNER, TRAINER, MENTOR]) ids[e] = await createUser(e);
    const has = await sql("select 1 from public.admin_roles where role='super_admin' and revoked_at is null");
    if (!has.length) {
      const [{ r }] = await sql("select private.bootstrap_super_admin($1) as r", [ADMIN]);
      await rpcAs(ids[ADMIN], "accept_invitation", [r.token], "aal1");
    } else {
      await sql("insert into public.profiles(id,email,display_name,status) values($1,$2,'運営','active') on conflict do nothing", [ids[ADMIN], ADMIN]);
      await sql("insert into public.admin_roles(user_id, role) values($1,'super_admin')", [ids[ADMIN]]);
    }
    for (const [e, apps, role] of [[OWNER, ["APP02"], null], [TRAINER, [], "mentor"], [MENTOR, [], "mentor"]]) {
      const inv = await rpcAs(ids[ADMIN], "admin_create_invitation", [e, apps, role, "e2e", 72]);
      await rpcAs(ids[e], "accept_invitation", [inv.token], "aal1");
    }
    await sql("update public.profiles set display_name = $2 where id = $1", [ids[TRAINER], "鈴木トレーナー"]);
    await sql("update public.profiles set display_name = $2 where id = $1", [ids[MENTOR], "佐藤メンター"]);
    await rpcAs(ids[ADMIN], "admin_set_mentor_assignment", [ids[TRAINER], ids[OWNER], "trainer", true]);
    await rpcAs(ids[ADMIN], "admin_set_mentor_assignment", [ids[MENTOR], ids[OWNER], "mentor", true]);
    await rpcAs(ids[OWNER], "record_consent", ["app02_terms", "2026-11", "APP02"], "aal1");
    await rpcAs(ids[OWNER], "app02_set_mode", ["CONVICTION"], "aal1");
    await rpcAs(ids[OWNER], "app02_save_step", ["vision", JSON.stringify({ provisional_vision: "家族と仲間を大切にする", why: "最初の理由", constraints: "親の介護" })], "aal1");
    const cells = ABILITIES.flatMap((a) => Array.from({ length: 10 }, (_, i) => ({ ability: a, year_index: String(i + 1), text: `${a} ${i + 1}年目の推奨`, level: String(Math.min(5, Math.floor(i / 2))), experiences: "学ぶ", criteria: "説明できる" })));
    await rpcAs(ids[OWNER], "app02_init_plan", [2028, JSON.stringify(cells), false], "aal1");
  });

  await step("T17：共有設定 — 宛先は担当者のみ、役割に応じた初期選択、センシティブ項目は初期 OFF・確認付き、同意して共有", async () => {
    owner = await loginContext(browser, OWNER);
    const p = await owner.newPage();
    await p.goto("/apps/APP02/share");
    const targets = await p.locator('input[name="recipients"]').count();
    expect(targets === 2, `宛先は担当者2名のはず：${targets}`);
    await p.locator("label.check", { hasText: "鈴木トレーナー" }).locator("input").check();
    const checked = await p.locator('input[name="items"]:checked').evaluateAll((els) => els.map((e) => e.value));
    expect(JSON.stringify(checked.sort()) === JSON.stringify(["focus", "position", "roadmap"]), `トレーナー向けの初期選択が不正：${checked}`);
    expect(!(await p.locator('input[name="items"][value="vision_constraints"]').isChecked()), "センシティブ項目が初期 ON");
    p.once("dialog", (d) => d.dismiss());
    await p.locator('input[name="items"][value="vision_constraints"]').check({ force: true }).catch(() => {});
    expect(!(await p.locator('input[name="items"][value="vision_constraints"]').isChecked()), "確認を拒否してもセンシティブ項目が ON になった");
    await p.fill("#share-message", "2〜3年目について意見をください");
    await p.locator('input[name="consent"]').check();
    await p.getByRole("button", { name: "共有する" }).click();
    await p.waitForURL(/ok=shared/);
    const [s] = await sql("select scope from public.data_shares where owner_id=$1 and app_code='APP02'", [ids[OWNER]]);
    expect(s.scope.items.map((i) => i.key).sort().join() === "focus,position,roadmap", "共有された項目が不正");
    expect(!JSON.stringify(s.scope).includes("親の介護"), "選んでいないセンシティブ項目が共有されました");
    await shot(p, "01-share");
  });

  await step("T07：トレーナーは共有された範囲だけを見て、修正案を送れる。本人の計画本体は取得できない", async () => {
    trainer = await loginContext(browser, TRAINER);
    const p = await trainer.newPage();
    await p.goto("/apps/APP02/received");
    const text = await p.locator("main").innerText();
    expect(text.includes("APP02 の共有が届きました") && text.includes("10ヵ年計画") && !text.includes("親の介護"), "共有内容の表示が不正");
    expect(text.includes("能力・教育内容の妥当性"), "役割に応じた確認観点が表示されません");
    await p.locator('select[name="kind"]').selectOption("proposal");
    await p.locator('select[name="target"]').selectOption("roadmap");
    await p.locator('textarea[name="body"]').fill("3年目の教育力は LV3 を目安にすると無理がありません");
    await p.getByRole("button", { name: "送信する" }).click();
    await p.waitForURL(/ok=review/);
    const res = await fetch(`${env.sbUrl}/rest/v1/app02_plan_cells?select=*&user_id=eq.${ids[OWNER]}`, { headers: { apikey: env.sbPub, Authorization: `Bearer ${await tokenOf(trainer)}` } });
    expect((res.ok ? await res.json() : []).length === 0, "トレーナーが本人の計画本体を取得できました");
    await shot(p, "02-received");
  });

  await step("本人は修正案を採用・保留・却下できる（計画は自動では変わらない）", async () => {
    const p = await owner.newPage();
    await p.goto("/apps/APP02/share");
    expect((await p.locator("main").innerText()).includes("3年目の教育力は LV3"), "修正案が本人に届いていません");
    const before = await sql("select count(*)::int n from public.app02_plan_history where user_id=$1", [ids[OWNER]]);
    await p.getByRole("button", { name: "採用", exact: true }).first().click();
    await p.waitForURL(/ok=review/);
    const [r] = await sql("select r.status from public.app02_reviews r join public.data_shares s on s.id=r.share_id where s.owner_id=$1", [ids[OWNER]]);
    expect(r.status === "adopted", "採用が記録されていません");
    const after = await sql("select count(*)::int n from public.app02_plan_history where user_id=$1", [ids[OWNER]]);
    expect(before[0].n === after[0].n, "採用で計画が自動変更されました");
  });

  await step("T08：推奨に違和感を報告 → 理由（能力・計画）でトレーナーに自動割当 → 修正方針 → 再分析 → 本人が決定。経過を記録", async () => {
    const p = await owner.newPage();
    await p.goto("/apps/APP02/roadmap");
    await p.locator("#cell-education-3").click();
    await p.locator(".cell-editor .report-button button").first().click();
    await p.locator(".cell-editor .report-form select").selectOption("plan");
    await p.locator(".cell-editor .report-form textarea").fill("3年目にしては高すぎると感じる");
    await p.locator(".cell-editor .report-form").getByRole("button", { name: "報告する" }).click();
    await p.locator(".cell-editor .notice.ok", { hasText: "報告しました" }).waitFor();
    const [rep] = await sql("select id, assigned_role, assignee_id, original from public.app02_purpose_reports where owner_id=$1 order by created_at desc limit 1", [ids[OWNER]]);
    expect(rep.assigned_role === "trainer" && rep.assignee_id === ids[TRAINER], `自動割当が不正：${JSON.stringify(rep)}`);
    expect(rep.original.recommended?.includes("education 3年目"), "元の推奨が記録されていません");

    const t = await trainer.newPage();
    await t.goto("/apps/APP02/received");
    await t.getByRole("link", { name: /能力・成長計画の不一致/ }).click();
    await t.waitForURL(/purpose\//);
    await t.locator("#status").selectOption("proposed");
    await t.fill("#correction", "3年目は LV2（自分で教える）を目標にし、LV3 は4年目に");
    await t.fill("#reason", "成長順序の一般的な目安");
    await t.getByRole("button", { name: "記録する" }).click();
    await t.waitForURL(/ok=responded/);
    // 担当者は本人の代わりに決定できない（決定フォームが出ない）
    expect(!(await t.getByRole("button", { name: "決定する" }).count()), "担当者に決定フォームが表示されています");

    await p.goto(`/apps/APP02/purpose/${rep.id}`);
    const prompt = await p.locator(".share-preview").last().innerText();
    expect(prompt.includes("3年目は LV2（自分で教える）") && prompt.includes("最大3つ"), "再分析の相談文に修正方針・ルールが入っていません");
    await p.locator('textarea[name="text"]').fill("再分析：3年目 LV2、4年目 LV3 の順で無理なく伸ばす");
    await p.getByRole("button", { name: "再分析案を記録する" }).click();
    await p.waitForURL(/ok=reanalysis/);
    expect((await p.locator("main").innerText()).includes("本人確認待ち"), "本人確認待ちになりません");
    await p.locator('input[name="decision"][value="modify"]').check();
    await p.fill("#note", "4年目を LV3 に直す");
    await p.getByRole("button", { name: "決定する" }).click();
    await p.waitForURL(/ok=decided/);
    const ev = await sql("select action from public.app02_purpose_events where report_id=$1 order by id", [rep.id]);
    expect(ev.map((e) => e.action).join() === "report,correction,reanalysis,decision", `経過が不正：${ev.map((e) => e.action)}`);
    await shot(p, "03-purpose-done");
  });

  await step("エスカレーション：トレーナーが事実誤認を報告し、運営管理者へ。管理者は MFA 済みでのみ案件を扱える（本人の計画本体は見えない）", async () => {
    const t = await trainer.newPage();
    await t.goto("/apps/APP02/received");
    await t.locator("details.report-details summary").click();
    await t.locator("details.report-details select[name='reason']").selectOption("fact");
    await t.locator("details.report-details textarea[name='comment']").fill("前提の数字が事実と違う");
    await t.locator("details.report-details").getByRole("button", { name: "報告する" }).click();
    await t.waitForURL(/purpose\/.*ok=reported/);
    await t.locator("details", { hasText: "エスカレーションする" }).locator("summary").click();
    await t.locator('input[name="target"][value="admin"]').check();
    await t.fill("#esc", "本人の意思に関わる重要な事実誤認");
    await t.getByRole("button", { name: "エスカレーションする" }).click();
    await t.waitForURL(/ok=escalated/);
    const adminAal1 = await loginContext(browser, ADMIN);
    const a1 = await adminAal1.newPage();
    await a1.goto("/apps/APP02/purpose");
    expect(!(await a1.locator("main").innerText()).includes("事実・前提の誤り"), "MFA 未完了の管理者に案件が見えています");
    await adminAal1.close();
    const admin = await loginContext(browser, ADMIN, { mfa: true });
    const a = await admin.newPage();
    await a.goto("/apps/APP02/purpose");
    await a.getByRole("link", { name: "事実・前提の誤り" }).first().click();
    await a.locator("#status").selectOption("proposed");
    await a.fill("#correction", "資料で確認した正しい数字に訂正する");
    await a.getByRole("button", { name: "記録する" }).click();
    await a.waitForURL(/ok=responded/);
    const res = await fetch(`${env.sbUrl}/rest/v1/app02_steps?select=*&user_id=eq.${ids[OWNER]}`, { headers: { apikey: env.sbPub, Authorization: `Bearer ${await tokenOf(admin)}` } });
    expect((res.ok ? await res.json() : []).length === 0, "管理者が本人のステップを取得できました");
    await admin.close();
  });

  await step("S17・T13：セル編集 → 履歴に変更前後 → 「変更前に戻す」、名前付きの版を保存 → 開始年変更（自動で版）→ 版の復元", async () => {
    const p = await owner.newPage();
    await p.goto("/apps/APP02/roadmap");
    await p.locator("#cell-attraction-1").click();
    await p.fill("#ce-text", "月10人と出会う");
    await p.getByRole("button", { name: "このセルを保存" }).click();
    await p.locator(".cell-saved").waitFor();
    await p.goto("/apps/APP02/history");
    const row = p.locator(".history-table tbody tr").first();
    expect((await row.innerText()).includes("月10人と出会う"), "履歴に変更後の値がありません");
    await row.getByRole("button", { name: "変更前に戻す" }).click();
    await p.waitForURL(/ok=cell_restored/);
    const [c] = await sql("select edited_text from public.app02_plan_cells where user_id=$1 and ability='attraction' and year_index=1", [ids[OWNER]]);
    expect(c.edited_text === null, "変更前に戻っていません");
    await p.fill("#label", "メンター面談前");
    await p.getByRole("button", { name: "版を保存" }).click();
    await p.waitForURL(/ok=version/);
    await rpcAs(ids[OWNER], "app02_set_start_year", [2030], "aal1");
    await p.goto("/apps/APP02/history");
    const versions = await p.locator("table").first().innerText();
    expect(versions.includes("メンター面談前") && versions.includes("開始年変更前（自動）"), "版の一覧が不正");
    p.once("dialog", (d) => d.accept());
    await p.locator("tr", { hasText: "メンター面談前" }).getByRole("button", { name: "この版に戻す" }).click();
    await p.waitForURL(/ok=restored/);
    const [pl] = await sql("select start_year from public.app02_plans where user_id=$1", [ids[OWNER]]);
    expect(pl.start_year === 2028, "版の復元で開始年が戻っていません");
    await shot(p, "04-history");
  });

  await step("全体初期化は設定画面で二段階確認（確認語が違えば実行しない）。実行前の計画は版として残る", async () => {
    await rpcAs(ids[OWNER], "app02_update_cell", ["recruitment", 2, "後輩を1人採用", 2, null, null, null], "aal1");
    const p = await owner.newPage();
    await p.goto("/apps/APP02/history");
    await p.locator("#settings summary").click();
    await p.locator('input[name="understand"]').check();
    await p.fill("#confirm_text", "しょきか");
    p.once("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "全体初期化する" }).click();
    await p.waitForURL(/error=CONFIRM_MISMATCH/);
    await p.locator("#settings summary").click();
    await p.locator('input[name="understand"]').check();
    await p.fill("#confirm_text", "全体初期化");
    p.once("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "全体初期化する" }).click();
    await p.waitForURL(/ok=reset/);
    const [n] = await sql("select count(*)::int n from public.app02_plan_cells where user_id=$1 and edited_text is not null", [ids[OWNER]]);
    expect(n.n === 0, "初期化されていません");
    const [v] = await sql("select reason from public.app02_plan_versions where user_id=$1 order by version_no desc limit 1", [ids[OWNER]]);
    expect(v.reason === "before_reset", "初期化前の版がありません");
  });

  await step("T16（競合）：同じステップを2つのタブで編集 → 後から保存したタブは上書きせず差分を表示 → 選んで解決", async () => {
    const a = await owner.newPage(), b = await owner.newPage();
    await a.goto("/apps/APP02/vision"); await b.goto("/apps/APP02/vision");
    await a.fill("#why", "タブAで書いた理由");
    await a.locator(".save-state.saved").waitFor();
    await b.fill("#why", "タブBで書いた理由");
    await b.locator(".conflict-panel").waitFor({ timeout: 10000 });
    const diff = await b.locator(".conflict-panel").innerText();
    expect(diff.includes("タブAで書いた理由") && diff.includes("タブBで書いた理由"), "差分が表示されていません");
    const [s1] = await sql("select data->>'why' w from public.app02_steps where user_id=$1 and step_code='vision'", [ids[OWNER]]);
    expect(s1.w === "タブAで書いた理由", "後のタブが上書きしました");
    await shot(b, "05-conflict");
    await b.getByRole("button", { name: "この画面の内容で保存する" }).click();
    await b.locator(".save-state.saved").waitFor();
    const [s2] = await sql("select data->>'why' w from public.app02_steps where user_id=$1 and step_code='vision'", [ids[OWNER]]);
    expect(s2.w === "タブBで書いた理由", "選んだ内容で保存されていません");
    await a.close(); await b.close();
  });

  await step("T16（オフライン）：通信断の間の入力は端末に保持して未同期を表示 → 再接続で自動保存。閉じてしまっても次回に復元できる", async () => {
    const p = await owner.newPage();
    await p.goto("/apps/APP02/vision");
    await owner.setOffline(true);
    await p.fill("#why", "オフラインで書いた理由");
    await p.locator(".save-state.offline, .save-state.error").waitFor({ timeout: 10000 });
    expect((await p.locator(".save-bar").innerText()).includes("未同期"), "未同期の表示がありません");
    await owner.setOffline(false);
    await p.evaluate(() => window.dispatchEvent(new Event("online")));
    await p.locator(".save-state.saved").waitFor({ timeout: 10000 });
    const [s] = await sql("select data->>'why' w from public.app02_steps where user_id=$1 and step_code='vision'", [ids[OWNER]]);
    expect(s.w === "オフラインで書いた理由", "再接続後に保存されていません");
    // 保存できないまま画面を閉じた場合：次回、端末の入力を復元できる
    await owner.setOffline(true);
    await p.fill("#why", "閉じる直前に書いた理由");
    await p.waitForTimeout(1500);
    await p.close({ runBeforeUnload: false });
    await owner.setOffline(false);
    const q = await owner.newPage();
    await q.goto("/apps/APP02/vision");
    await q.locator(".local-panel").waitFor({ timeout: 10000 });
    await q.getByRole("button", { name: "端末の入力を復元して保存する" }).click();
    await q.locator(".save-state.saved").waitFor({ timeout: 10000 });
    const [s2] = await sql("select data->>'why' w from public.app02_steps where user_id=$1 and step_code='vision'", [ids[OWNER]]);
    expect(s2.w === "閉じる直前に書いた理由", "端末の入力が復元・保存されていません");
    const left = await q.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("lsc:app02:")).length);
    expect(left === 0, "同期後も端末に入力が残っています");
  });

  await step("T16（セルの競合）：同じセルを2つのタブで編集すると、後のタブは上書きせず保存されている内容を示す", async () => {
    const a = await owner.newPage(), b = await owner.newPage();
    await a.goto("/apps/APP02/roadmap"); await b.goto("/apps/APP02/roadmap");
    await a.locator("#cell-operations-5").click(); await b.locator("#cell-operations-5").click();
    await a.fill("#ce-text", "タブAの到達目標");
    await a.getByRole("button", { name: "このセルを保存" }).click();
    await a.locator(".cell-saved").waitFor();
    await b.fill("#ce-text", "タブBの到達目標");
    await b.getByRole("button", { name: "このセルを保存" }).click();
    await b.locator(".cell-editor .notice.warn", { hasText: "先に更新されています" }).waitFor();
    expect((await b.locator(".cell-editor .notice.warn").innerText()).includes("タブAの到達目標"), "保存されている内容が示されません");
    const [c] = await sql("select edited_text from public.app02_plan_cells where user_id=$1 and ability='operations' and year_index=5", [ids[OWNER]]);
    expect(c.edited_text === "タブAの到達目標", "後のタブが上書きしました");
    await a.close(); await b.close();
  });

  await step("S11：経営者志望ラダーは LEGACY のみ。資格付与後に入力・完了でき、意思決定は「子会社社長コミット」表示", async () => {
    const p = await owner.newPage();
    await p.goto("/apps/APP02/ladder");
    expect((await p.locator("main").innerText()).includes("LEGACY モードで利用できます"), "非 LEGACY に案内が出ません");
    await rpcAs(ids[ADMIN], "admin_set_app_role", [ids[OWNER], "APP02", "legacy_eligible", true, "", "e2e"]);
    await rpcAs(ids[OWNER], "app02_set_mode", ["LEGACY"], "aal1");
    await p.goto("/apps/APP02/ladder");
    for (let i = 1; i <= 5; i++) await p.locator(`select[aria-label="段階${i}の状況"]`).selectOption(i <= 2 ? "done" : i === 3 ? "doing" : "");
    for (const k of ["売上", "利益", "人材育成", "組織運営", "経営判断"]) await p.fill(`#pre-${k}`, `${k}：確認中`);
    await p.getByRole("button", { name: "このステップを完了する" }).click();
    expect((await p.locator(".save-bar .notice.error").innerText()).includes("各段階の状況"), "未選択の段階があるのに完了できました");
    for (let i = 4; i <= 5; i++) await p.locator(`select[aria-label="段階${i}の状況"]`).selectOption("doing");
    await p.locator(".save-state.saved").waitFor();
    await p.getByRole("button", { name: "このステップを完了する" }).click();
    await p.waitForURL(/commitment/);
    expect((await p.locator("#commit-year option").first().innerText()) === "コミットしない", "LEGACY のコミット表示がありません");
    const [s] = await sql("select status from public.app02_steps where user_id=$1 and step_code='ladder'", [ids[OWNER]]);
    expect(s.status === "done", "ラダーが完了になっていません");
    await shot(p, "06-commitment-legacy");
  });

  await step("スマホ幅・iPad 縦：Phase 2 の画面に横はみ出しなし", async () => {
    for (const [w, h, who, name] of [[390, 844, OWNER, "phone"], [820, 1180, OWNER, "ipad"], [390, 844, TRAINER, "phone-trainer"]]) {
      const ctx = await loginContext(browser, who, { viewport: { width: w, height: h } });
      const p = await ctx.newPage();
      const urls = who === OWNER ? ["/apps/APP02/share", "/apps/APP02/purpose", "/apps/APP02/history", "/apps/APP02/ladder", "/apps/APP02/vision"] : ["/apps/APP02/received", "/apps/APP02/purpose"];
      for (const url of urls) {
        await p.goto(url);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over <= 1, `${name} ${url} で ${over}px はみ出し`);
      }
      await shot(p, `07-${name}`);
      await ctx.close();
    }
  });

  await browser.close();
  await db.end();
  const { failed } = summary();
  process.exit(failed.length ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await db.end().catch(() => {}); process.exit(2); });
