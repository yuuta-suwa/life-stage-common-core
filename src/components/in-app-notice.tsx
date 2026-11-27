import { headers } from "next/headers";
import { CopyButton } from "@/components/copy-button";
import { detectInAppBrowser, IN_APP_LABEL } from "@/lib/in-app-browser";

/**
 * アプリ内ブラウザ（LINE など）で開かれているときの案内。Google はアプリ内ブラウザでのログインを拒否するため（D-58）。
 * path は現在の画面の相対パス（クエリ込み）。
 */
export async function InAppNotice({ path }: { path: string }) {
  const h = await headers();
  const kind = detectInAppBrowser(h.get("user-agent"));
  if (!kind) return null;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const sep = path.includes("?") ? "&" : "?";
  const absolute = host ? `${proto}://${host}${path}` : path;
  return (
    <div className="notice warn in-app-notice" role="alert">
      <b>{IN_APP_LABEL[kind]} の中のブラウザでは、Google ログインができません。</b>
      <br />
      Google の安全上の決まりで、アプリの中で開いたページからはログインできません。Safari や Chrome で開き直してください。
      {kind === "line" ? (
        <div className="row" style={{ marginTop: 10 }}>
          <a className="btn gold" href={`${path}${sep}openExternalBrowser=1`}>Safari／Chrome で開く</a>
        </div>
      ) : (
        <ol className="small" style={{ margin: "10px 0 0" }}>
          <li>画面の右上（または右下）の「…」や共有ボタンを押します。</li>
          <li>「ブラウザで開く」「Safari で開く」「Chrome で開く」を選びます。</li>
          <li>見つからないときは、下のボタンでリンクをコピーし、Safari／Chrome のアドレス欄に貼り付けます。</li>
        </ol>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <CopyButton className="btn small ghost" label="このページのリンクをコピー" text={absolute} />
      </div>
      <span className="en">In-app browsers cannot sign in with Google. Please open this page in Safari or Chrome.</span>
    </div>
  );
}
