/**
 * アプリ内ブラウザ（LINE・Instagram・Facebook など）の判定。
 * Google はアプリ内ブラウザ（WebView）での OAuth ログインを拒否する（403 disallowed_useragent）ため、
 * ログイン・招待の画面では Safari／Chrome などの通常のブラウザで開き直してもらう（D-58）。
 */
export type InAppBrowser = "line" | "instagram" | "facebook" | "other";

export function detectInAppBrowser(ua: string | null | undefined): InAppBrowser | null {
  if (!ua) return null;
  if (/\bLine\/\d/i.test(ua)) return "line";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return "facebook";
  if (/; wv\)|WebView|MicroMessenger|KAKAOTALK|Twitter|TikTok|BytedanceWebview|YahooJSearch/i.test(ua)) return "other";
  return null;
}

export const IN_APP_LABEL: Record<InAppBrowser, string> = {
  line: "LINE",
  instagram: "Instagram",
  facebook: "Facebook",
  other: "アプリ",
};

/**
 * LINE のアプリ内ブラウザで開かれたページを、端末の通常のブラウザ（Safari／Chrome）で開き直すための URL。
 * LINE は URL に openExternalBrowser=1 が付いていると外部ブラウザで開く（LINE 公式仕様）。
 * 対象は画面（GET）のみ。OAuth のコールバックや招待の受諾処理、API は対象外（途中で切り替えるとログインが途切れるため）。
 * 付与済みなら null（無限リダイレクトしない）。
 */
const SKIP_PREFIXES = ["/api/", "/auth/", "/invite/accept", "/_next/"];
export function lineExternalUrl(method: string, url: URL, ua: string | null | undefined): URL | null {
  if (method !== "GET") return null;
  if (detectInAppBrowser(ua) !== "line") return null;
  if (url.searchParams.has("openExternalBrowser")) return null;
  if (SKIP_PREFIXES.some((p) => url.pathname.startsWith(p))) return null;
  const next = new URL(url.toString());
  next.searchParams.set("openExternalBrowser", "1");
  return next;
}
