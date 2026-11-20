import Link from "next/link";
import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash, formatDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PURPOSE_REASONS, PURPOSE_STATUS, RELATION_LABEL, RELATION_ROLE } from "@/features/app02/content";
import { addReview, reportPurposeForm } from "../actions-p2";

type Scope = { items?: { key: string; label: string; value: string }[]; message?: string };
const REVIEW_STATUS: Record<string, string> = { open: "本人の判断待ち", adopted: "採用", hold: "保留", rejected: "却下" };

/**
 * 伴走者（リーダー・トレーナー・メンター）の画面（仕様 §09・§18・T07）。
 * 本人が共有した範囲だけを閲覧し、コメント・修正案の提示・違和感の報告ができる。本人の意思決定は代行しない。
 */
export default async function ReceivedPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const access = await requirePage({ kind: "active" }, "/apps/APP02/received");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: shares }, { data: assigned }] = await Promise.all([
    supabase.from("data_shares").select("id, owner_id, scope, permission, created_at").eq("grantee_id", access.user_id!).eq("app_code", "APP02").eq("status", "active").order("created_at", { ascending: false }),
    supabase.from("app02_purpose_reports").select("id, owner_id, source, reason, status, assigned_role, created_at").eq("assignee_id", access.user_id!).neq("status", "done").order("created_at", { ascending: false }),
  ]);
  const ids = (shares ?? []).map((s) => s.id);
  const owners = [...new Set([...(shares ?? []).map((s) => s.owner_id), ...(assigned ?? []).map((a) => a.owner_id)])];
  const [{ data: reviews }, { data: profiles }, { data: myRel }] = await Promise.all([
    ids.length ? supabase.from("app02_reviews").select("id, share_id, kind, target, body, status, created_at").in("share_id", ids).order("created_at") : Promise.resolve({ data: [] }),
    owners.length ? supabase.from("profiles").select("id, display_name").in("id", owners) : Promise.resolve({ data: [] }),
    supabase.from("mentor_assignments").select("user_id, relation").eq("mentor_id", access.user_id!),
  ]);
  const nameOf = (id: string) => (profiles ?? []).find((p) => p.id === id)?.display_name || "利用者";
  const relTo = (owner: string) => (myRel ?? []).find((m) => m.user_id === owner)?.relation;

  return (
    <>
      <div className="page-head">
        <div className="en">RECEIVED｜受け取った共有（APP02）</div>
        <h1>伴走者としての確認</h1>
        <p>本人が共有を選んだ内容です。確認したこと・良かった点・次に確認したいことを伝え、必要なら修正案や違和感の報告を行えます。決めるのは本人です。</p>
      </div>
      <Flash error={sp.error} ok={sp.ok === "review" ? "送信しました。" : undefined} />

      <h2 className="section-title">ASSIGNED<span>｜あなたに割り当てられた「軸に戻す」報告</span></h2>
      {(assigned ?? []).length ? (
        <ul className="plain-list">
          {(assigned ?? []).map((a) => (
            <li key={a.id} className="card"><Link href={`/apps/APP02/purpose/${a.id}`}><b>{nameOf(a.owner_id)}さん</b>：{PURPOSE_REASONS.find((r) => r.value === a.reason)?.label}（{a.source}）</Link>
              <span className="badge gold" style={{ marginLeft: 8 }}>{PURPOSE_STATUS[a.status]}</span><div className="small muted">{formatDateTime(a.created_at)}</div></li>
          ))}
        </ul>
      ) : <p className="small muted">割り当てられた報告はありません。</p>}

      <h2 className="section-title">SHARED<span>｜共有された内容</span></h2>
      {!(shares ?? []).length ? <p className="muted">現在閲覧できる共有はありません。撤回された共有や担当外の共有は表示されません。</p> : null}
      {(shares ?? []).map((s) => {
        const scope = (s.scope ?? {}) as Scope;
        const rel = relTo(s.owner_id);
        return (
          <section key={s.id} className="card received-share">
            <p><b>{nameOf(s.owner_id)}さんから APP02 の共有が届きました。</b><span className="small muted">　{formatDateTime(s.created_at)}{rel ? `／あなたの役割：${RELATION_LABEL[rel]}` : ""}</span></p>
            {rel ? <p className="small muted">確認の観点：{RELATION_ROLE[rel]}</p> : null}
            {scope.message ? <p className="small">本人からのメッセージ：{scope.message}</p> : null}
            <dl className="answers">{(scope.items ?? []).map((i) => (<div key={i.key}><dt>{i.label}</dt><dd style={{ whiteSpace: "pre-wrap" }}>{i.value}</dd></div>))}</dl>
            {(reviews ?? []).filter((r) => r.share_id === s.id).map((r) => (
              <div key={r.id} className="feedback"><div className="small muted">あなたの{r.kind === "proposal" ? "修正案" : "コメント"}・{formatDateTime(r.created_at)}・{REVIEW_STATUS[r.status]}</div>{r.body}</div>
            ))}
            {s.permission === "comment" ? (
              <form action={addReview} className="review-form">
                <input type="hidden" name="share_id" value={s.id} />
                <div className="row">
                  <div className="field" style={{ flex: "0 1 180px" }}><label htmlFor={`k-${s.id}`}>種類</label>
                    <select id={`k-${s.id}`} name="kind" defaultValue="comment"><option value="comment">コメント</option><option value="proposal">修正案</option></select></div>
                  <div className="field" style={{ flex: "0 1 280px" }}><label htmlFor={`t-${s.id}`}>対象の項目</label>
                    <select id={`t-${s.id}`} name="target" defaultValue=""><option value="">全体</option>{(scope.items ?? []).map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}</select></div>
                </div>
                <textarea name="body" rows={3} maxLength={3000} required placeholder="確認したこと・良かった点・次に確認したいことを入力" aria-label="コメント・修正案" />
                <div style={{ marginTop: 8 }}><SubmitButton>送信する</SubmitButton></div>
              </form>
            ) : null}
            <details className="report-details">
              <summary className="small">⚑ 違和感を報告／軸に戻す</summary>
              <form action={reportPurposeForm}>
                <input type="hidden" name="owner_id" value={s.owner_id} />
                <input type="hidden" name="back" value="/apps/APP02/received" />
                <div className="row">
                  <div className="field" style={{ flex: "0 1 260px" }}><label htmlFor={`r-${s.id}`}>理由</label>
                    <select id={`r-${s.id}`} name="reason" defaultValue="vision">{PURPOSE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
                  <div className="field" style={{ flex: "0 1 280px" }}><label htmlFor={`rs-${s.id}`}>対象</label>
                    <select id={`rs-${s.id}`} name="source" defaultValue={`share:${scope.items?.[0]?.key ?? "all"}`}>{(scope.items ?? []).map((i) => <option key={i.key} value={`share:${i.key}`}>{i.label}</option>)}</select></div>
                </div>
                <textarea name="comment" rows={2} maxLength={2000} placeholder="どこが、なぜ本人の軸とずれていると感じたか" aria-label="コメント" />
                <div style={{ marginTop: 8 }}><SubmitButton className="btn small">報告する</SubmitButton></div>
              </form>
            </details>
            <p className="small muted">閲覧・コメント・修正案のみ可能です。本人の回答や計画を編集すること、本人の代わりに決めることはできません。</p>
          </section>
        );
      })}
    </>
  );
}
