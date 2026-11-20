"use client";
import { useActionState } from "react";
import { issueIntegrationToken, type TokenState } from "@/app/admin/actions";
import { messageFor } from "@/lib/errors";
import { CopyButton } from "@/components/copy-button";

/** APP03 連携トークンの発行。表示は1回だけ（再表示できないため、すぐ APP03 の設定に登録する） */
export function IntegrationTokenForm() {
  const [state, action, pending] = useActionState<TokenState, FormData>(issueIntegrationToken, null);
  return (
    <form action={action} className="card">
      {state && !state.ok ? <div className="notice error" role="alert">{messageFor(state.code).ja}</div> : null}
      {state?.ok ? (
        <div className="notice ok" role="status">
          <b>連携トークンを発行しました。この画面を閉じると二度と表示できません。</b>
          <p className="small">APP03 の Sites の実行時設定（Runtime settings / Secrets）に、次の3つを登録してください。チャット・メール・GitHub には貼らないでください。</p>
          <dl className="kv small">
            <dt>APP03_APP01_ENDPOINT</dt><dd><code>{state.endpoint?.replace(/app02$/, "app01")}</code> <CopyButton label="コピー" text={state.endpoint?.replace(/app02$/, "app01") ?? ""} /></dd>
            <dt>APP03_APP02_ENDPOINT</dt><dd><code>{state.endpoint}</code> <CopyButton label="コピー" text={state.endpoint ?? ""} /></dd>
            <dt>APP03_INTEGRATION_TOKEN</dt><dd><code className="token-value">{state.token}</code> <CopyButton label="コピー" text={state.token ?? ""} /></dd>
          </dl>
          <p className="small">登録後、APP03 の管理画面「外部アカウントの本人照合」で、利用者ごとに 接続元＝APP01 と APP02 の両方について、照合済み外部ユーザーID＝その人の「連携用ID」（アカウント画面に表示）を登録します。</p>
        </div>
      ) : null}
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field"><label htmlFor="token-label">メモ（任意）</label><input id="token-label" name="label" type="text" maxLength={80} placeholder="例：APP03 本番 2026-11" /></div>
        <div className="field" style={{ flex: "0 0 auto" }}><button className="btn gold" type="submit" disabled={pending}>{pending ? "発行中…" : "APP03 連携トークンを発行"}</button></div>
      </div>
      <p className="small muted">発行したトークンは、本人が APP01・APP02 で「APP03 に渡す／引き継ぐ」に同意した内容を読む権限だけを持ちます。漏えいの疑いがあるときは、すぐに下の一覧から失効させて再発行してください。</p>
    </form>
  );
}
