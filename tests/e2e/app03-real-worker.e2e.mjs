/**
 * APP03 実コードとの結合 E2E。
 * APP03 のソース（APP03_SRC）の本物の Worker（worker/api.js + workflow.js）とテスト用 DB を使い、
 * 「APP01：理想を参照」「APP02：計画参照」を実際に押した場合と同じ処理で、共通基盤（ローカル）のエンドポイントから取り込む。
 * その後、APP03 のビルド済み画面を配信し、ホーム・マップ・マス詳細の表示をブラウザで確認する。
 * APP03 の同期処理は HTTPS 必須のため、https://core.test を共通基盤（http://localhost:3100）へ置き換える。
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, createUser, db, env, expect, sql, step, summary } from "./lib.mjs";

const APP03 = process.env.APP03_SRC;
if (!APP03 || !fs.existsSync(path.join(APP03, "worker/api.js"))) throw new Error("APP03_SRC（APP03 のソースのフォルダ）を指定してください");
const RUN = Date.now().toString(36);
const ADMIN = `rw-admin-${RUN}@e2e.test`, USER = `rw-user-${RUN}@e2e.test`;
const SHOTS = process.env.E2E_SHOTS ?? "/tmp/e2e-shots";
const ABILITIES = ["attraction", "recruitment", "education", "development", "operations", "management"];
const TEXT = {
  attraction: ["自分で集客", "成果を継続", "他者に集客を教える", "組織で集客を継続", "集客の仕組みを改善", "集客リーダー育成", "複数チームで成果", "集客体制を仕組み化", "後継者に継承", "継続的な集客体制"],
  recruitment: ["採用方法を理解", "採用活動を実践", "採用成果を継続", "他者に採用を教える", "組織で採用を継続", "採用リーダー育成", "採用の仕組み化", "複数組織に展開", "後継者を育成", "採用体制を継承"],
};

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

async function main() {
  await db.connect();
  const ids = {};
  let s, server;
  console.log(`APP03 real-worker E2E run ${RUN}`);

  await step("共通基盤：本人が APP01 の人生設計と APP02 の計画を承認し、どちらも APP03 に渡すことに同意。連携トークンを発行", async () => {
    for (const e of [ADMIN, USER]) ids[e] = await createUser(e);
    const has = await sql("select 1 from public.admin_roles where role='super_admin' and revoked_at is null");
    if (!has.length) {
      const [{ r }] = await sql("select private.bootstrap_super_admin($1) as r", [ADMIN]);
      await rpcAs(ids[ADMIN], "accept_invitation", [r.token], "aal1");
    } else {
      await sql("insert into public.profiles(id,email,display_name,status) values($1,$2,'admin','active') on conflict do nothing", [ids[ADMIN], ADMIN]);
      await sql("insert into public.admin_roles(user_id, role) values($1,'super_admin')", [ids[ADMIN]]);
    }
    const inv = await rpcAs(ids[ADMIN], "admin_create_invitation", [USER, ["APP01", "APP02", "APP03"], null, "e2e", 72]);
    await rpcAs(ids[USER], "accept_invitation", [inv.token], "aal1");
    const bp = { blueprint_id: crypto.randomUUID(), life_purpose: "家族との時間を大切にしながら、仲間と挑戦を楽しむ人生", priority_desires: ["海の見える家で暮らす", "仲間と事業をつくる", "年に2回の家族旅行"],
      budget_summary: { target_assets: 30000000 }, vision_board_asset_refs: [], gap_analysis: { money: "差額あり" },
      goals: [{ type: "long", description: "自分の事業を持つ", deadline: "2036-04-01" }, { type: "mid", description: "チームを5人にする", deadline: "2030-03-31" }],
      priority_capabilities: ["attraction", "recruitment"], first_action: "週3回の発信を始める", first_action_date: "2026-12-01", consent_version: "2026-11" };
    const s1 = await rpcAs(ids[USER], "confirm_snapshot", ["APP01", "life_blueprint", "1.0", JSON.stringify(bp)], "aal1");
    await rpcAs(ids[USER], "request_transfer", [s1.snapshot_id, "APP03", "1.0", "2026-11"], "aal1");
    const cells = ABILITIES.flatMap((a) => Array.from({ length: 10 }, (_, i) => ({ ability: a, year_index: String(i + 1), calendar_year: 2028 + i,
      target: TEXT[a]?.[i] ?? `${a} ${i + 1}年目の目標`, target_level: Math.min(5, Math.floor(i / 2) + 1), experiences: "週3回の発信と月10人の面談", criteria: "3か月続けて月10人と出会っている" })));
    const plan = { plan_id: crypto.randomUUID(), vision_version: 1, start_year: 2028, mode: "CONVICTION", focus_abilities: ["attraction", "recruitment"],
      focus_by_year: { "1": ["attraction"], "2": ["attraction", "recruitment"] }, commit_year: 2035, cells, provisional_assessment: { attraction: 2 }, approved_at: new Date().toISOString() };
    const s2 = await rpcAs(ids[USER], "confirm_snapshot", ["APP02", "growth_plan", "1.0", JSON.stringify(plan)], "aal1");
    await rpcAs(ids[USER], "request_transfer", [s2.snapshot_id, "APP03", "1.0", "2026-11"], "aal1");
    const t = await rpcAs(ids[ADMIN], "admin_issue_integration_token", ["APP03", "real-worker"]);
    process.env.__TOKEN = t.token;
  });

  await step("APP03（本物の Worker）：本人照合を登録し、APP01・APP02 の同期を実行 → 取り込み2件・認定0件", async () => {
    const helpers = await import(pathToFileURL(path.join(APP03, "tests/helpers.mjs")).href);
    s = helpers.setup();
    await s.seed();
    for (const source of ["APP01", "APP02"]) {
      const r = await s.call("/api/admin/identity-links", "admin", "POST", { ownerId: "alice", source, externalId: ids[USER] });
      expect(r.status === 200, `本人照合の登録に失敗：${r.status}`);
    }
    s.env.APP03_APP01_ENDPOINT = "https://core.test/api/integrations/app03/app01";
    s.env.APP03_APP02_ENDPOINT = "https://core.test/api/integrations/app03/app02";
    s.env.APP03_INTEGRATION_TOKEN = process.env.__TOKEN;
    const real = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const u = typeof input === "string" ? input : input.url ?? String(input);
      return real(u.startsWith("https://core.test/") ? u.replace("https://core.test", env.base) : input, init);
    };
    for (const source of ["APP01", "APP02"]) {
      const r = await s.call("/api/integrations/sync", "alice", "POST", { source });
      expect(r.status === 200 && r.data.count === 1, `${source} の同期に失敗：${r.status} ${JSON.stringify(r.data)}`);
    }
    const rows = s.db.prepare("SELECT source, external_id FROM external_imports WHERE owner_id='alice'").all();
    expect(rows.length === 2, `取り込み件数：${rows.length}`);
    expect(s.db.prepare("SELECT count(*) n FROM certifications").get().n === 0, "取り込みで認定が発生しました");
    const jobs = s.db.prepare("SELECT status FROM integration_jobs WHERE owner_id='alice'").all();
    expect(jobs.every((j) => j.status === "succeeded"), `同期ジョブ：${JSON.stringify(jobs)}`);
    const payload = JSON.parse(s.db.prepare("SELECT payload FROM external_imports WHERE source='APP01'").get().payload);
    expect(!JSON.stringify(payload).includes("30000000") && !JSON.stringify(payload).includes("差額あり"), "家計・ギャップ分析が APP03 に渡っています");
    // 再同期しても重複しない（APP03 の重複防止）
    await s.call("/api/integrations/sync", "alice", "POST", { source: "APP02" });
    expect(s.db.prepare("SELECT count(*) n FROM external_imports WHERE owner_id='alice'").get().n === 2, "再同期で重複しました");
  });

  await step("APP03 の画面（ビルド済み）：ホームに理想（APP01）、マップの各マスに APP02 の目標、マス詳細に経験・判断基準。セールス力は APP03 で設定", async () => {
    const dist = path.join(APP03, "dist");
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png" };
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        const chunks = []; for await (const c of req) chunks.push(c);
        const headers = new Headers(req.headers); headers.set("oai-authenticated-user-id", "alice");
        const r = await s.api(new Request("http://" + req.headers.host + req.url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }), s.env);
        res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
      }
      const file = path.join(dist, url.pathname === "/" ? "index.html" : url.pathname);
      if (!file.startsWith(dist) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" }); res.end(fs.readFileSync(file));
    }).listen(3200);
    const browser = await chromium.launch();
    for (const [w, h, name] of [[1180, 820, "ipad"], [390, 844, "phone"]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "ja-JP" });
      const p = await ctx.newPage();
      const errors = []; p.on("pageerror", (e) => errors.push(e.message));
      await p.goto("http://localhost:3200/#home");
      await p.locator(".linked-panel").waitFor({ timeout: 15000 });
      const home = await p.locator(".linked-panel").innerText();
      expect(home.includes("家族との時間を大切にしながら") && home.includes("海の見える家で暮らす") && home.includes("週3回の発信を始める"), "ホームに APP01 の理想が表示されません");
      await p.screenshot({ path: path.join(SHOTS, `app03-${name}-home.png`), fullPage: true });
      await p.goto("http://localhost:3200/#map");
      await p.locator(".plan-goal").first().waitFor({ timeout: 15000 });
      const notice = await p.locator(".plan-notice").innerText();
      expect(notice.includes("2028〜2037年") && notice.includes("認定・解放条件ではありません"), "マップの説明が不足");
      const goals = await p.locator(".plan-goal").allInnerTexts();
      expect(goals.some((g) => g.includes("自分で集客")) && goals.some((g) => g.includes("APP03で設定")), "マスに APP02 の目標／セールス力の表示がありません");
      expect(goals.some((g) => g.startsWith("★")), "重点の★がありません");
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over <= 1, `${name} でページが ${over}px はみ出し`);
      await p.screenshot({ path: path.join(SHOTS, `app03-${name}-map.png`), fullPage: true });
      await p.locator('button.cell[data-id]').nth(10).click();
      await p.locator(".plan-detail").waitFor();
      const detail = await p.locator(".plan-detail").innerText();
      expect(detail.includes("必要な経験・学習") && detail.includes("到達判断基準") && detail.includes("認定条件・解放条件ではありません"), "マス詳細に APP02 の目標がありません");
      await p.screenshot({ path: path.join(SHOTS, `app03-${name}-detail.png`) });
      await p.keyboard.press("Escape");
      await p.goto("http://localhost:3200/#map");
      await p.getByRole("button", { name: "APP02の目標を隠す" }).click();
      expect(!(await p.locator(".plan-goal").count()), "隠すボタンで目標が消えません");
      expect(!errors.length, `画面のエラー：${errors.join(" / ")}`);
      await ctx.close();
    }
    await browser.close();
  });

  server?.close();
  await db.end();
  const { failed } = summary();
  process.exit(failed.length ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await db.end().catch(() => {}); process.exit(2); });
