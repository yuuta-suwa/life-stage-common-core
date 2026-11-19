import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash, formatDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { COPY } from "@/features/app01/copy";
import { sendFeedback } from "../actions";

type Scope = { stage?: number; title?: string; version?: number; state?: string; items?: { label: string; value: string }[]; comment?: string; next_action?: string };

/** 共有受信者（メンター／トレーナー／リーダー）の画面（仕様 §7-5）：閲覧とコメントのみ */
export default async function ReceivedPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const access = await requirePage({ kind: "active" }, "/apps/APP01/received");
  const sp = await searchParams;
  const supabase = await createClient();
  // RLS：有効な担当関係があり、撤回・期限切れでない共有だけが返る
  const { data: shares } = await supabase
    .from("data_shares")
    .select("id, owner_id, scope, permission, created_at")
    .eq("grantee_id", access.user_id!)
    .eq("app_code", "APP01")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  const ids = (shares ?? []).map((s) => s.id);
  const ownerIds = [...new Set((shares ?? []).map((s) => s.owner_id))];
  const [{ data: feedback }, { data: owners }] = await Promise.all([
    ids.length ? supabase.from("app01_feedback").select("id, share_id, comment, created_at").in("share_id", ids).order("created_at") : Promise.resolve({ data: [] }),
    ownerIds.length ? supabase.from("profiles").select("id, display_name").in("id", ownerIds) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = (id: string) => (owners ?? []).find((p) => p.id === id)?.display_name || "利用者";

  return (
    <>
      <div className="page-head">
        <div className="en">RECEIVED</div>
        <h1>受け取った共有</h1>
        <p>{COPY.receivedDetail}</p>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      {!(shares ?? []).length ? <p className="muted">現在閲覧できる共有はありません。撤回された共有や担当外の共有は表示されません。</p> : null}
      {(shares ?? []).map((s) => {
        const scope = (s.scope ?? {}) as Scope;
        return (
          <div key={s.id} className="card">
            <p><b>{COPY.receivedList(nameOf(s.owner_id))}</b></p>
            <div className="small muted">LEVEL {String(scope.stage ?? "").padStart(2, "0")}｜{scope.title}／状態：{scope.state === "confirmed" ? "確定" : COPY.draftLabel}／共有日時：{formatDateTime(s.created_at)}</div>
            <dl className="answers">{(scope.items ?? []).map((i, k) => (<div key={k}><dt>{i.label}</dt><dd>{i.value}</dd></div>))}</dl>
            {scope.next_action ? <p className="small">次に取り組むこと：{scope.next_action}</p> : null}
            {scope.comment ? <p className="small">本人からのコメント：{scope.comment}</p> : null}
            {(feedback ?? []).filter((f) => f.share_id === s.id).map((f) => (
              <div key={f.id} className="feedback"><div className="small muted">あなたの返信・{formatDateTime(f.created_at)}</div>{f.comment}</div>
            ))}
            {s.permission === "comment" ? (
              <form action={sendFeedback} style={{ marginTop: 8 }}>
                <input type="hidden" name="share_id" value={s.id} />
                <textarea name="comment" rows={3} maxLength={2000} placeholder={COPY.feedbackPlaceholder} required />
                <div style={{ marginTop: 8 }}><SubmitButton>{COPY.feedbackCta}</SubmitButton></div>
              </form>
            ) : null}
            <p className="small muted">閲覧とコメントのみ可能です。本人の回答を編集することはできません。</p>
          </div>
        );
      })}
    </>
  );
}
