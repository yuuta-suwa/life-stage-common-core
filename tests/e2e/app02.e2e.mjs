/**
 * APP02 E2E（ローカル Supabase 実スタック＋本番ビルドの Next.js）。実行方法は docs/APP01_TEST_CHECKLIST.md §5 と同じ。
 * 仕様書 §22 の受入テスト T01〜T20 のうち、Phase 1 の範囲を検証する。
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, createUser, db, env, expect, loginContext, sql, step, summary } from "./lib.mjs";

const RUN = Date.now().toString(36);
const ADMIN = `admin2-${RUN}@e2e.test`, USER = `p2user-${RUN}@e2e.test`, OTHER = `p2other-${RUN}@e2e.test`;
const SHOTS = process.env.E2E_SHOTS ?? "/tmp/e2e-shots";
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, `app02-${n}.png`), fullPage: true });

/** 実際の RPC を、その利用者として（JWT クレームを設定して）呼ぶ */
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
async function waitSaved(page) { await page.locator(".save-state.saved").last().waitFor({ timeout: 10000 }); }
let USER_ID = null;
/** 「このステップを完了する」→ 次のステップへ移動し、DB 上も完了になっていること */
async function complete(page, step) {
  const url = page.url();
  await page.getByRole("button", { name: "このステップを完了する" }).click();
  await page.waitForURL((u) => u.toString() !== url, { timeout: 15000 });
  const [row] = await sql("select status from public.app02_steps where user_id=$1 and step_code=$2", [USER_ID, step]);
  expect(row?.status === "done", `${step} が完了になっていません`);
}

async function main() {
  await db.connect();
  const browser = await chromium.launch();
  const ids = {};
  let user;
  console.log(`APP02 E2E run ${RUN}`);

  await step("準備：管理者（Super Admin）・利用者2名、APP02 権限（招待 RPC 経由）、APP01 の人生設計を APP02 へ引き継ぎ", async () => {
    for (const e of [ADMIN, USER, OTHER]) ids[e] = await createUser(e);
    USER_ID = ids[USER];
    const has = await sql("select 1 from public.admin_roles where role='super_admin' and revoked_at is null");
    if (!has.length) {
      const [{ r }] = await sql("select private.bootstrap_super_admin($1) as r", [ADMIN]);
      await rpcAs(ids[ADMIN], "accept_invitation", [r.token], "aal1");
    } else {
      await sql("insert into public.profiles(id,email,display_name,status) values($1,$2,'admin','active') on conflict do nothing", [ids[ADMIN], ADMIN]);
      await sql("insert into public.admin_roles(user_id, role) values($1,'super_admin')", [ids[ADMIN]]);
    }
    for (const [e, apps] of [[USER, ["APP01", "APP02"]], [OTHER, ["APP02"]]]) {
      const inv = await rpcAs(ids[ADMIN], "admin_create_invitation", [e, apps, null, "e2e", 72]);
      const acc = await rpcAs(ids[e], "accept_invitation", [inv.token], "aal1");
      expect(acc.ok || acc.code === "ACCEPTED", `受諾失敗 ${JSON.stringify(acc)}`);
    }
    // APP01 の完成（life_blueprint 1.0）→ APP02 へ引き継ぎ（本物の RPC。人生設計の入力は E2E 用）
    const bp = { blueprint_id: randomUUID(), life_purpose: "家族と挑戦を楽しみ、仲間の成長を支える", priority_desires: ["海の見える家", "仲間と事業をつくる", "年に2回の家族旅行"],
      budget_summary: {}, vision_board_asset_refs: [], gap_analysis: {}, goals: [{ type: "long", description: "事業を持つ", deadline: "2036-04-01" }],
      priority_capabilities: ["attraction"], first_action: "週3回の発信", first_action_date: "2026-12-01", consent_version: "2026-11" };
    const snap = await rpcAs(ids[USER], "confirm_snapshot", ["APP01", "life_blueprint", "1.0", JSON.stringify(bp)], "aal1");
    const tr = await rpcAs(ids[USER], "request_transfer", [snap.snapshot_id ?? snap.id, "APP02", "1.0", "2026-11"], "aal1");
    expect(tr.status === "succeeded", `APP01→APP02 引継ぎ失敗：${JSON.stringify(tr)}`);
  });

  await step("T01：初回案内（役割分担・AI・データ利用）。LEGACY は資格がないと選べない", async () => {
    user = await loginContext(browser, USER);
    const p = await user.newPage();
    await p.goto("/apps/APP02");
    const text = await p.locator("main").innerText();
    expect(text.includes("最後に決めるのはあなた") && text.includes("ChatGPT に相談する"), "初回案内の内容が不足");
    expect(!(await p.locator('input[name="mode"][value="LEGACY"]').count()), "資格のない利用者に LEGACY が表示されています");
    await shot(p, "00-onboarding");
    await p.locator('input[name="mode"][value="CONVICTION"]').check();
    await p.locator('input[name="consent"]').check();
    await p.getByRole("button", { name: "APP02 を始める" }).click();
    await p.waitForURL(/APP02\/vision/);
  });

  await step("T02：APP01 の人生ビジョンを参照（元データは変更しない）→ 理由を入力して完了", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP02/vision");
    const text = await p.locator("main").innerText();
    expect(text.includes("家族と挑戦を楽しみ") && text.includes("海の見える家"), "APP01 の人生設計が表示されません");
    const before = await sql("select payload::text from public.app_snapshots where user_id=$1 and app_code='APP01'", [ids[USER]]);
    await p.fill("#why", "家族との時間と、仲間と成長する実感の両方を大切にしたいから");
    await p.locator("main label.check", { hasText: "判断の軸にすること" }).locator("input").check();
    await waitSaved(p);
    await complete(p, "vision");
    const after = await sql("select payload::text from public.app_snapshots where user_id=$1 and app_code='APP01'", [ids[USER]]);
    expect(JSON.stringify(before) === JSON.stringify(after), "APP01 の元データが変わりました");
    await shot(p, "02-vision");
  });

  await step("必須項目が足りないとステップを完了できない（修了に必要な項目を明示）", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP02/sales");
    await p.getByRole("button", { name: "このステップを完了する" }).click();
    const msg = await p.locator(".save-bar .notice.error").innerText();
    expect(msg.includes("理解確認") && msg.includes("自分の言葉"), `不足項目の表示が不正：${msg}`);
  });

  await step("T03：セールス力（理解確認・自分の言葉）と 6大能力 を完了。ChatGPT 相談文に人生ビジョンと AI ルールが入る", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP02/sales");
    await p.fill("#relation", "仲間と事業をつくるには、相手の願望を理解して協力を得る力が必要");
    await p.locator('input[name="quiz-0"]').nth(1).check();
    await p.locator('input[name="quiz-1"]').nth(2).check();
    await p.fill("#own_words", "相手の願望を理解し信頼を築く力は、仲間づくりにも家族との関係にも役立つから学びたい。");
    await p.locator(".ai-panel summary").first().click();
    const prompt = await p.locator(".ai-panel .share-preview").first().innerText();
    expect(prompt.includes("家族と挑戦を楽しみ") && prompt.includes("必ず願望が叶う」とは言わない") && prompt.includes("最大3つ"), "相談文の内容が不足");
    await p.locator(".ai-panel textarea").first().fill("ChatGPT の提案（例）：仲間づくりでの活かし方");
    await p.locator(".ai-panel").first().getByRole("button", { name: "保留" }).click();
    await waitSaved(p);
    await complete(p, "sales");
    const [{ data }] = await sql("select data from public.app02_steps where user_id=$1 and step_code='sales'", [ids[USER]]);
    expect(data.ai?.sales?.status === "hold", "AI 提案の状態（保留）が保存されていません");
    await shot(p, "03-sales");

    await p.goto("/apps/APP02/abilities");
    for (const a of ["attraction", "recruitment", "education"]) await p.fill(`#rel-${a}`, `${a} は願望に関係する`);
    await p.locator('input[name="quiz-0"]').nth(0).check();
    await p.locator('input[name="quiz-1"]').nth(1).check();
    await p.fill("#relation_summary", "出会い→仲間→伝える→育てる の順で、事業づくりを支える。");
    await waitSaved(p);
    await complete(p, "abilities");
  });

  await step("T04：自己実現分析（根拠の種類・関連度・能力以外の条件・ストーリー）", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP02/analysis");
    expect(await p.locator("#d-0").inputValue() === "海の見える家", "APP01 の願望が初期値になっていません");
    await p.fill("#conditions-0", "頭金と安定収入、家族の合意");
    await p.selectOption("#ev-0", "fact");
    for (const sel of await p.locator('select[aria-label="関連度"]').all()) await sel.selectOption("indirect");
    await p.fill("#c-資金", "頭金 未確認");
    await p.fill("#story", "家族との時間を守りながら、仲間と事業をつくることで、望む暮らしを実現していく。");
    await waitSaved(p);
    await complete(p, "analysis");
    await shot(p, "05-analysis");
  });

  await step("現在地診断：具体的な経験の質問から暫定レベルと理由。本人による修正", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP02/position");
    for (const a of ["attraction", "recruitment", "education", "development", "operations", "management"]) {
      const yes = a === "attraction" ? 3 : a === "recruitment" ? 1 : 0;
      for (let i = 0; i < 5; i++) await p.locator(`input[name="${a}-${i}"]`).nth(i < yes ? 0 : 1).check();
    }
    expect((await p.locator("#pos-attraction").innerText()).includes("暫定 LV3"), "集客力の暫定レベルが LV3 ではありません");
    await p.selectOption("#ov-education", "1");
    await p.fill("#ovr-education", "社内研修で教えた経験がある");
    await waitSaved(p);
    await complete(p, "position");
  });

  await step("成長環境比較（未確認の扱い）", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP02/environment");
    await p.locator('select[aria-label="現在の環境・教育体系"]').selectOption("2");
    await p.locator('select[aria-label="LEI STYLE・教育体系"]').selectOption("3");
    await p.fill("#decision_note", "実践機会と仲間の条件を重視して、引き続き比べたい。");
    await waitSaved(p);
    await complete(p, "environment");
  });

  await step("T09・T10：開始年 2028 → 2028〜2037 の10列、60セルすべてに具体的な到達目標（現在地を反映）", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP02/roadmap");
    await p.fill("#start_year", "1999");
    await p.getByRole("button", { name: "10ヵ年計画を作成" }).click();
    await p.waitForURL(/error=INVALID_START_YEAR/);
    await p.fill("#start_year", "2028");
    await p.getByRole("button", { name: "10ヵ年計画を作成" }).click();
    await p.waitForURL(/ok=created/);
    const years = await p.locator(".gantt .g-year th").allInnerTexts();
    expect(JSON.stringify(years.slice(1)) === JSON.stringify(Array.from({ length: 10 }, (_, i) => String(2028 + i))), `年の列が不正：${years}`);
    const texts = await p.locator(".gantt .g-cell .g-text").allInnerTexts();
    expect(texts.length === 60 && texts.every((t) => t.trim() && !/^LV\d$/.test(t.trim())), "60セルに到達目標が表示されていません");
    const first = await p.locator("#cell-attraction-1 .g-text").innerText();
    expect(first === "他者に集客を教える", `現在地（集客 LV3）が推奨に反映されていません：${first}`);
    await shot(p, "08-roadmap");
  });

  await step("T11：横スクロールしても左端の能力名が固定される", async () => {
    const ctx = await loginContext(browser, USER, { viewport: { width: 1024, height: 768 } });
    const p = await ctx.newPage();
    await p.goto("/apps/APP02/roadmap");
    const head = p.locator(".gantt tbody tr").first().locator("th.g-sticky");
    const x0 = (await head.boundingBox()).x;
    await p.locator(".gantt-wrap").evaluate((el) => { el.scrollLeft = 600; });
    await p.waitForTimeout(200);
    const x1 = (await head.boundingBox()).x;
    const cellX = (await p.locator("#cell-attraction-1").boundingBox())?.x ?? 0;
    expect(Math.abs(x1 - x0) < 2, `能力名が動きました（${x0}→${x1}）`);
    expect(cellX < x0, "年度列がスクロールしていません");
    await ctx.close();
  });

  await step("T13：セルの編集・推奨に戻す・ひとつ戻す（推奨と本人編集を区別して保持）", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP02/roadmap");
    await p.locator("#cell-education-2").click();
    await p.fill("#ce-text", "後輩2人に営業の基本を教える");
    await p.selectOption("#ce-level", "2");
    await p.fill("#ce-reason", "具体化");
    await p.getByRole("button", { name: "このセルを保存" }).click();
    await p.locator(".cell-saved").waitFor();
    await p.locator("#cell-education-2 .g-text", { hasText: "後輩2人に営業の基本を教える" }).waitFor({ timeout: 10000 });
    expect((await p.locator("#cell-education-2 .g-text").innerText()) === "後輩2人に営業の基本を教える", "編集が反映されていません");
    const [c] = await sql("select recommended_text, edited_text from public.app02_plan_cells where user_id=$1 and ability='education' and year_index=2", [ids[USER]]);
    expect(c.edited_text === "後輩2人に営業の基本を教える" && c.recommended_text !== c.edited_text, "推奨と編集値が区別されていません");
    await p.locator("#cell-education-2").click();
    p.once("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "推奨に戻す" }).click();
    await p.locator(".cell-saved", { hasText: "推奨に戻しました" }).waitFor();
    await p.locator("#cell-education-2 .g-text", { hasNotText: "後輩2人に営業の基本を教える" }).waitFor({ timeout: 10000 });
    expect((await p.locator("#cell-education-2 .g-text").innerText()) !== "後輩2人に営業の基本を教える", "推奨に戻りません");
    await p.getByRole("button", { name: "↶ ひとつ戻す" }).click();
    await p.waitForURL(/ok=undone/);
    expect((await p.locator("#cell-education-2 .g-text").innerText()) === "後輩2人に営業の基本を教える", "ひとつ戻すで編集値が戻りません");
  });

  await step("T15：重点能力の選択と、理由付きの整合性確認", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP02/roadmap");
    const text0 = await p.locator("main").innerText();
    expect(text0.includes("重点能力がまだ選ばれていません") && text0.includes("改善案"), "重点能力なしの指摘がありません");
    const row = p.locator(".focus-table tbody tr").first();
    await row.locator('input[value="attraction"]').check();
    await row.locator('input[value="recruitment"]').check();
    await row.locator('input[value="education"]').check();
    await row.getByRole("button", { name: "保存" }).click();
    await p.waitForURL(/ok=focus/);
    const text = await p.locator("main").innerText();
    expect(text.includes("2028年の重点能力が3つあります"), "重点の過剰が指摘されません");
    expect(!/不可能/.test(text.replace("「実現できない」という判定ではありません", "")), "「不可能」と断定しています");
    const row2 = p.locator(".focus-table tbody tr").first();
    await row2.locator('input[value="education"]').uncheck();
    await row2.getByRole("button", { name: "保存" }).click();
    await p.waitForURL(/ok=focus/);
    await shot(p, "10-focus");
  });

  await step("T12：目標年度の西暦・フラグ・年次が別の行で重ならず、該当列が強調される", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP02/commitment");
    await p.selectOption("#commit-year", "2035");
    await p.getByRole("button", { name: "目標年度を保存" }).click();
    await p.locator(".notice.ok", { hasText: "目標年度を保存しました" }).waitFor();
    await p.goto("/apps/APP02/roadmap");
    const yearTh = p.locator(".gantt .g-year th", { hasText: "2035" });
    const flag = p.locator(".gantt .g-flag-mark");
    const idx = p.locator(".gantt .g-index td.g-commit");
    const [b1, b2, b3] = [await yearTh.boundingBox(), await flag.boundingBox(), await idx.boundingBox()];
    expect(b1 && b2 && b3, "目標年度の表示が見つかりません");
    expect(b1.y + b1.height <= b2.y + 1 && b2.y + b2.height <= b3.y + 1, `西暦・フラグ・年次が重なっています ${JSON.stringify([b1, b2, b3])}`);
    expect((await p.locator(".gantt td.g-commit, .gantt th.g-commit").count()) >= 8, "該当列が強調されていません");
    await p.locator(".gantt-wrap").screenshot({ path: path.join(SHOTS, "app02-12-commit-flag.png") });
  });

  await step("T14：開始年を変えても年次の入力は保持され、暦年コミットは再確認になる", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP02/roadmap");
    await p.locator("details.inline-details summary").click();
    await p.locator('input[name="start_year"]').fill("2030");
    p.once("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "変更", exact: true }).click();
    await p.waitForURL(/start_year_recheck/);
    expect((await p.locator(".gantt .g-year th").nth(1).innerText()) === "2030", "西暦が再計算されていません");
    expect((await p.locator("#cell-education-2 .g-text").innerText()) === "後輩2人に営業の基本を教える", "年次の入力が保持されていません");
    expect((await p.locator("main").innerText()).includes("再確認が必要"), "目標年度の再確認が表示されません");
    await p.goto("/apps/APP02/commitment");
    expect((await p.locator("main").innerText()).includes("再確認が必要"), "意思決定画面で再確認が表示されません");
    await p.selectOption("#commit-year", "2037");
    await p.fill("#commit-reason", "開始年の変更に合わせて再設定");
    await p.getByRole("button", { name: "目標年度を保存" }).click();
    await p.locator(".notice.ok", { hasText: "目標年度を保存しました" }).waitFor();
    await p.fill("#policy", "最初の3年は集客と採用を重点に、その後育成へ広げる");
    await p.fill("#statement", "毎週3回発信し、半年で10人と面談する");
    await p.locator("main label.check", { hasText: "自分の意思で決めました" }).locator("input").check();
    await waitSaved(p);
    await complete(p, "commitment");
  });

  await step("T18：プレゼンが入力から生成され、本人が編集・確認できる", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP02/presentation");
    const first = await p.locator(".pres-section textarea").first().inputValue();
    expect(first.includes("家族と挑戦を楽しみ"), "プレゼンの下書きに人生ビジョンが入っていません");
    expect((await p.locator(".pres-section").first().innerText()).includes("自動下書き"), "自動下書きの表示がありません");
    await p.locator(".pres-section textarea").nth(1).fill("家族との時間と仲間の成長、その両方が私の幸せだからです。");
    expect((await p.locator(".pres-section").nth(1).innerText()).includes("本人が編集"), "本人編集の区別がありません");
    await p.locator("main label.check", { hasText: "自分の言葉として確認" }).locator("input").check();
    await waitSaved(p);
    await complete(p, "presentation");
    await shot(p, "13-presentation");
  });

  await step("T19・T20：修了確認 → 計画を承認（growth_plan 1.0）→ APP03 権限なしで失敗・保持 → 付与後の再試行で引継ぎ（認定データなし）", async () => {
    const p = await user.newPage();
    await p.goto("/apps/APP02/complete");
    const list = await p.locator(".checklist").innerText();
    expect(!list.includes("□"), `未完了の項目があります：${list}`);
    await p.locator('input[name="confirm"]').check();
    await p.getByRole("button", { name: "計画を承認する" }).click();
    await p.waitForURL(/ok=approved/);
    const [s] = await sql("select payload from public.app_snapshots where user_id=$1 and app_code='APP02' and snapshot_type='growth_plan'", [ids[USER]]);
    expect(s.payload.cells.length === 60 && s.payload.start_year === 2030 && s.payload.commit_year === 2037, "承認された計画の内容が不正");
    expect(!("certifications" in s.payload) && !("certified_levels" in s.payload), "認定データが含まれています");
    await p.locator('input[name="consent"]').check();
    await p.getByRole("button", { name: "APP03 に引き継ぐ" }).click();
    await p.waitForURL(/transfer=/);
    expect((await p.locator("main").innerText()).includes("APP03 の利用権限がまだ付与されていません"), "APP03 権限なしの案内がありません");
    await rpcAs(ids[ADMIN], "admin_set_entitlement", [ids[USER], "APP03", true, "e2e"]);
    await p.getByRole("button", { name: "引き継ぎを再試行する" }).click();
    await p.waitForURL(/transfer=succeeded/);
    const inbox = await sql("select payload from public.transfer_inbox where user_id=$1 and target_app='APP03'", [ids[USER]]);
    expect(inbox.length === 1 && inbox[0].payload.cells.length === 60, "APP03 の受信箱に計画が届いていません");
    const tr = await sql("select count(*)::int n from public.data_transfers where user_id=$1 and target_app='APP03'", [ids[USER]]);
    expect(tr[0].n === 1, "引継ぎが二重登録されました");
    await shot(p, "18-complete");
  });

  await step("T17（分離）：別の APP02 利用者・管理者は、本人の APP02 データを取得できない", async () => {
    const other = await loginContext(browser, OTHER);
    const p = await other.newPage();
    await p.goto("/apps/APP02");
    const cookies = await other.cookies();
    const raw = cookies.filter((c) => c.name.startsWith("sb-")).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
    const { access_token } = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString());
    for (const t of ["app02_steps", "app02_plans", "app02_plan_cells", "app02_plan_history", "app02_workspace"]) {
      const res = await fetch(`${env.sbUrl}/rest/v1/${t}?select=*&user_id=eq.${ids[USER]}`, { headers: { apikey: env.sbPub, Authorization: `Bearer ${access_token}` } });
      const rows = res.ok ? await res.json() : [];
      expect(rows.length === 0, `${t}：他人の行が ${rows.length} 件`);
    }
    await other.close();
    const admin = await loginContext(browser, ADMIN, { mfa: true });
    const ac = await admin.cookies();
    const araw = ac.filter((c) => c.name.startsWith("sb-")).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
    const at = JSON.parse(Buffer.from(araw.replace(/^base64-/, ""), "base64url").toString()).access_token;
    const res = await fetch(`${env.sbUrl}/rest/v1/app02_plan_cells?select=*`, { headers: { apikey: env.sbPub, Authorization: `Bearer ${at}` } });
    expect((res.ok ? await res.json() : []).length === 0, "管理者が計画本文を取得できました");
    await admin.close();
  });

  await step("T01（LEGACY）：管理者が資格を付与すると LEGACY を選べ、フラグ行は「コミット」表示になる", async () => {
    await rpcAs(ids[ADMIN], "admin_set_app_role", [ids[USER], "APP02", "legacy_eligible", true, "", "e2e"]);
    const p = await user.newPage();
    await p.goto("/apps/APP02");
    await p.locator("details", { hasText: "利用モードを変更する" }).locator("summary").click();
    await p.selectOption('select[name="mode"]', "LEGACY");
    await p.getByRole("button", { name: "変更する" }).click();
    await p.waitForURL(/ok=mode/);
    await p.goto("/apps/APP02/roadmap");
    expect((await p.locator(".gantt .g-flag th").innerText()).includes("コミット"), "LEGACY のコミット表示がありません");
    const [{ n }] = await sql("select count(*)::int n from public.app02_plan_cells where user_id=$1", [ids[USER]]);
    expect(n === 60, "モード変更で計画データが失われました");
  });

  await step("iPad 横・iPad 縦・スマホ：ページの横はみ出しなし（ガントは枠内で横スクロール）", async () => {
    for (const [w, h, name] of [[1180, 820, "ipad-land"], [820, 1180, "ipad"], [390, 844, "phone"]]) {
      const ctx = await loginContext(browser, USER, { viewport: { width: w, height: h } });
      const p = await ctx.newPage();
      for (const url of ["/apps/APP02", "/apps/APP02/analysis", "/apps/APP02/position", "/apps/APP02/environment", "/apps/APP02/roadmap", "/apps/APP02/presentation", "/apps/APP02/complete"]) {
        await p.goto(url);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over <= 1, `${name} ${url} で ${over}px はみ出し`);
      }
      await p.goto("/apps/APP02/roadmap");
      await shot(p, `20-${name}-roadmap`);
      await ctx.close();
    }
  });

  await browser.close();
  await db.end();
  const { failed } = summary();
  process.exit(failed.length ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await db.end().catch(() => {}); process.exit(2); });
