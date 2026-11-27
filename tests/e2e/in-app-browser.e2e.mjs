/**
 * アプリ内ブラウザ（LINE 等）対策 E2E（D-58）。
 * LINE で開くと openExternalBrowser=1 付きの URL に切り替わり（LINE が Safari／Chrome で開き直す）、案内が出る。
 * Instagram などは案内のみ。通常のブラウザでは何も変わらない。
 */
import { chromium, env, expect, step, summary } from "./lib.mjs";

const LINE = "Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/26.17.0";
const INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0";

async function main() {
  const browser = await chromium.launch();
  const open = async (ua, path) => {
    const ctx = await browser.newContext({ baseURL: env.base, userAgent: ua, locale: "ja-JP" });
    const p = await ctx.newPage();
    await p.goto(path);
    return { ctx, p };
  };

  await step("LINE：保護されたページ → ログイン画面（openExternalBrowser=1 付き）に切り替わり、案内とボタンが出る", async () => {
    const { ctx, p } = await open(LINE, "/apps/APP01");
    const u = new URL(p.url());
    expect(u.pathname === "/login" && u.searchParams.get("openExternalBrowser") === "1", `URL が不正：${p.url()}`);
    expect(u.searchParams.get("next") === "/apps/APP01", "戻り先が失われました");
    const notice = p.locator(".in-app-notice");
    expect((await notice.innerText()).includes("LINE の中のブラウザでは、Google ログインができません"), "案内が出ません");
    expect(await notice.getByRole("link", { name: /Safari／Chrome で開く/ }).count() === 1, "開き直すボタンがありません");
    await ctx.close();
  });

  await step("LINE：招待リンクもトークンを保ったまま切り替わる", async () => {
    const { ctx, p } = await open(LINE, "/invite?token=abc123");
    const u = new URL(p.url());
    expect(u.pathname === "/invite" && u.searchParams.get("token") === "abc123" && u.searchParams.get("openExternalBrowser") === "1", `URL が不正：${p.url()}`);
    expect(await p.locator(".in-app-notice").count() === 1, "案内が出ません");
    await ctx.close();
  });

  await step("Instagram：URL はそのままで、開き直す手順とリンクのコピーが出る", async () => {
    const { ctx, p } = await open(INSTAGRAM, "/login");
    expect(!p.url().includes("openExternalBrowser"), "Instagram で URL が変わりました");
    const t = await p.locator(".in-app-notice").innerText();
    expect(t.includes("Instagram の中のブラウザ") && t.includes("ブラウザで開く"), "手順が出ません");
    await ctx.close();
  });

  await step("通常のブラウザ：案内は出ず、URL も変わらない", async () => {
    const { ctx, p } = await open(undefined, "/login");
    expect(await p.locator(".in-app-notice").count() === 0 && !p.url().includes("openExternalBrowser"), "通常のブラウザに影響しています");
    await ctx.close();
  });

  await browser.close();
  const { failed } = summary();
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
