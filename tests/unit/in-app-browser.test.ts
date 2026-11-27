import { describe, expect, it } from "vitest";
import { detectInAppBrowser, lineExternalUrl } from "@/lib/in-app-browser";

const LINE_IPAD = "Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/26.17.0";
const LINE_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 Line/14.0.1/IAB";
const INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0";
const FACEBOOK = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]";
const SAFARI = "Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1";
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

describe("アプリ内ブラウザの判定（D-58）", () => {
  it("LINE・Instagram・Facebook を判定し、Safari・Chrome は対象外", () => {
    expect(detectInAppBrowser(LINE_IPAD)).toBe("line");
    expect(detectInAppBrowser(LINE_ANDROID)).toBe("line");
    expect(detectInAppBrowser(INSTAGRAM)).toBe("instagram");
    expect(detectInAppBrowser(FACEBOOK)).toBe("facebook");
    expect(detectInAppBrowser(SAFARI)).toBeNull();
    expect(detectInAppBrowser(CHROME)).toBeNull();
    expect(detectInAppBrowser(undefined)).toBeNull();
  });

  it("LINE の画面表示は openExternalBrowser=1 を付けた URL へ（クエリは保持・1回だけ）", () => {
    const u = lineExternalUrl("GET", new URL("https://x.test/login?next=%2Fapps%2FAPP01"), LINE_IPAD);
    expect(u?.toString()).toBe("https://x.test/login?next=%2Fapps%2FAPP01&openExternalBrowser=1");
    expect(lineExternalUrl("GET", new URL("https://x.test/login?openExternalBrowser=1"), LINE_IPAD)).toBeNull();
    const inv = lineExternalUrl("GET", new URL("https://x.test/invite?token=abc"), LINE_IPAD);
    expect(inv?.searchParams.get("token")).toBe("abc");
  });

  it("LINE 以外・POST・ログインのコールバック・招待の受諾処理・API は切り替えない", () => {
    expect(lineExternalUrl("GET", new URL("https://x.test/login"), SAFARI)).toBeNull();
    expect(lineExternalUrl("GET", new URL("https://x.test/login"), INSTAGRAM)).toBeNull();
    expect(lineExternalUrl("POST", new URL("https://x.test/login"), LINE_IPAD)).toBeNull();
    expect(lineExternalUrl("GET", new URL("https://x.test/auth/callback?code=x"), LINE_IPAD)).toBeNull();
    expect(lineExternalUrl("GET", new URL("https://x.test/invite/accept"), LINE_IPAD)).toBeNull();
    expect(lineExternalUrl("GET", new URL("https://x.test/api/health"), LINE_IPAD)).toBeNull();
  });
});
