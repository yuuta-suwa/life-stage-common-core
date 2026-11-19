import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash, formatDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { COPY } from "@/features/app01/copy";
import { revokeShare } from "../actions";

type Scope = { stage?: number; title?: string; version?: number; items?: { label: string; value: string }[]; comment?: string };

/** 共有履歴・撤回・受信者からの返信（仕様 §7-1） */
export default async function SharesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const access = await requirePage({ kind: "app", code: "APP01" }, "/apps/APP01/shares");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: shares } = await supabase
    .from("data_shares")
    .select("id, grantee_id, scope, permission, status, created_at, revoked_at")
    .eq("owner_id", access.user_id!)
    .eq("app_code", "APP01")
    .order("created_at", { ascending: false });
  const ids = (shares ?? []).map((s) => s.id);
  const granteeIds = [...new Set((shares ?? []).map((s) => s.grantee_id))];
  const [{ data: feedback }, { data: people }] = await Promise.all([
    ids.length ? supabase.from("app01_feedback").select("id, share_id, comment, created_at").in("share_id", ids).order("created_at") : Promise.resolve({ data: [] }),
    granteeIds.length ? supabase.from("profiles").select("id, display_name").in("id", granteeIds) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = (id: string) => (people ?? []).find((p) => p.id === id)?.display_name || "担当者";

  return (
    <>
      <div className="page-head">
        <div className="en">SHARING</div>
        <h1>共有と返信</h1>
        <p>{COPY.irrevocable}</p>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      {!(shares ?? []).length ? <p className="muted">まだ共有していません。各 LEVEL の確定後に共有できます（任意）。</p> : null}
      {(shares ?? []).map((s) => {
        const scope = (s.scope ?? {}) as Scope;
        const fb = (feedback ?? []).filter((f) => f.share_id === s.id);
        return (
          <div key={s.id} className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <b>LEVEL {String(scope.stage ?? "").padStart(2, "0")}｜{scope.title}</b>（第{scope.version}版・確定）
                <div className="small muted">宛先：{nameOf(s.grantee_id)}／共有日時：{formatDateTime(s.created_at)}</div>
              </div>
              <div>
                {s.status === "active" ? <span className="badge ok">共有中</span> : <span className="badge plain">撤回済（{formatDateTime(s.revoked_at)}）</span>}
              </div>
            </div>
            <details style={{ marginTop: 8 }}>
              <summary>共有した内容</summary>
              <dl className="answers">{(scope.items ?? []).map((i, k) => (<div key={k}><dt>{i.label}</dt><dd>{i.value}</dd></div>))}</dl>
              {scope.comment ? <p className="small">本人からのコメント：{scope.comment}</p> : null}
            </details>
            <h3 className="section-title" style={{ marginTop: 12 }}>FEEDBACK<span>｜返信</span></h3>
            {fb.length ? fb.map((f) => (
              <div key={f.id} className="feedback"><div className="small muted">{nameOf(s.grantee_id)}・{formatDateTime(f.created_at)}</div>{f.comment}</div>
            )) : <p className="small muted">返信はまだありません。</p>}
            {s.status === "active" ? (
              <form action={revokeShare} style={{ marginTop: 8 }}>
                <input type="hidden" name="share_id" value={s.id} />
                <SubmitButton className="btn small danger" confirm="この共有を撤回します。相手はアプリ内で閲覧できなくなります。よろしいですか？">撤回する</SubmitButton>
              </form>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
