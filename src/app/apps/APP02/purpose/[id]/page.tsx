import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash, formatDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CopyButton } from "@/components/copy-button";
import { PURPOSE_REASONS, PURPOSE_STATUS, RELATION_LABEL } from "@/features/app02/content";
import { assignPurpose, decidePurpose, escalatePurpose, reanalysisPurpose, respondPurpose } from "../../actions-p2";

const OK: Record<string, string> = {
  reported: "報告しました。担当者が確認します。", assigned: "担当者を割り当てました。", responded: "対応を記録しました。",
  reanalysis: "再分析案を記録しました。本人の確認待ちです。", decided: "決定を記録しました。", escalated: "エスカレーションしました。",
};
const ACTION: Record<string, string> = { report: "報告", assign: "割当", status: "状態の変更", correction: "修正方針の提示", reanalysis: "再分析案の記録", decision: "本人の決定", escalate: "エスカレーション" };
const DECISION: Record<string, string> = { adopt: "採用", modify: "修正して採用", reject: "却下" };

/** 報告の詳細（§09-1 手順①〜⑦）。役割ごとに操作を出し分け、権限は DB（RLS・RPC）で判定 */
export default async function PurposeDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const access = await requirePage({ kind: "active" }, `/apps/APP02/purpose/${id}`);
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: r } = await supabase.from("app02_purpose_reports").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();
  const [{ data: events }, { data: profiles }, { data: targets }] = await Promise.all([
    supabase.from("app02_purpose_events").select("id, actor_id, action, before, after, created_at").eq("report_id", id).order("id"),
    supabase.from("profiles").select("id, display_name").in("id", [r.owner_id, r.reporter_id, r.assignee_id, r.corrected_by].filter(Boolean)),
    r.owner_id === access.user_id ? supabase.rpc("my_share_targets") : Promise.resolve({ data: [] }),
  ]);
  const me = access.user_id!;
  const isOwner = r.owner_id === me, isAssignee = r.assignee_id === me, isReporter = r.reporter_id === me;
  const isAdminHandler = !isOwner && !isAssignee && !isReporter && r.escalated;
  const name = (uid: string | null) => (!uid ? "—" : uid === me ? "あなた" : (profiles ?? []).find((p) => p.id === uid)?.display_name || "（表示名未設定）");
  const original = r.original && Object.keys(r.original).length ? JSON.stringify(r.original, null, 2) : "";
  const reprompt = [
    "あなたは私の自己実現を支援するコーチです。以前の AI の提案について、伴走者が修正方針を示しました。",
    "修正方針を踏まえて、私の人生ビジョンを軸に再分析してください。断定せず、根拠の種類（私の事実／一般的な因果関係／仮説）を区別し、確認質問は最大3つにしてください。",
    "", `■ 違和感の理由：${PURPOSE_REASONS.find((x) => x.value === r.reason)?.label}`, `■ 本人・報告者のコメント：${r.comment || "なし"}`,
    `■ 元の提案・推奨：${original ? original.slice(0, 3000) : "（記録なし）"}`, `■ 伴走者の修正方針：${r.correction ?? "（まだありません）"}`, `■ 修正の理由：${r.correction_reason ?? "なし"}`,
  ].join("\n");
  const done = r.status === "done";

  return (
    <>
      <div className="page-head">
        <div className="en">RETURN TO PURPOSE｜報告の詳細</div>
        <h1>{PURPOSE_REASONS.find((x) => x.value === r.reason)?.label}</h1>
        <p>対象者：{name(r.owner_id)}／報告者：{name(r.reporter_id)}／担当：{r.assigned_role ? `${RELATION_LABEL[r.assigned_role]}（${r.assigned_role === "admin" ? "運営管理者" : name(r.assignee_id)}）` : "未割当"}／状態：<b>{PURPOSE_STATUS[r.status]}</b>{r.escalated ? "（エスカレーション）" : ""}</p>
      </div>
      <Flash error={sp.error} ok={sp.ok ? OK[sp.ok] : undefined} />
      <section className="card">
        <dl className="kv">
          <dt>対象</dt><dd>{r.source}</dd>
          <dt>コメント</dt><dd style={{ whiteSpace: "pre-wrap" }}>{r.comment || "—"}</dd>
          <dt>元の提案・推奨</dt><dd><pre className="share-preview" style={{ margin: 0 }}>{original || "（記録なし）"}</pre></dd>
          {r.escalation_reason ? (<><dt>エスカレーションの理由</dt><dd>{r.escalation_reason}</dd></>) : null}
          <dt>修正方針</dt><dd style={{ whiteSpace: "pre-wrap" }}>{r.correction ? `${r.correction}\n（理由：${r.correction_reason ?? "—"}／${name(r.corrected_by)}）` : "—"}</dd>
          <dt>再分析案</dt><dd style={{ whiteSpace: "pre-wrap" }}>{r.reanalysis ?? "—"}</dd>
          <dt>本人の決定</dt><dd>{r.user_decision ? `${DECISION[r.user_decision]}${r.user_note ? `：${r.user_note}` : ""}` : "—"}</dd>
        </dl>
      </section>

      {!done && isOwner && !r.assignee_id && !r.escalated ? (
        <form action={assignPurpose} className="card row" style={{ alignItems: "flex-end" }}>
          <input type="hidden" name="report_id" value={r.id} />
          <div className="field"><label htmlFor="assignee">担当者を割り当てる</label>
            <select id="assignee" name="assignee_id" required defaultValue="">
              <option value="" disabled>選択してください</option>
              {((targets ?? []) as { mentor_id: string; display_name: string; relation: string }[]).map((t) => <option key={t.mentor_id} value={t.mentor_id}>{RELATION_LABEL[t.relation]}　{t.display_name || "（表示名未設定）"}</option>)}
            </select></div>
          <div className="field" style={{ flex: "0 0 auto" }}><SubmitButton>割り当てる</SubmitButton></div>
        </form>
      ) : null}

      {!done && (isAssignee || isAdminHandler) ? (
        <form action={respondPurpose} className="card">
          <h2 className="section-title">RESPONSE<span>｜担当者の確認と修正方針（手順②〜④）</span></h2>
          <input type="hidden" name="report_id" value={r.id} />
          <div className="field" style={{ maxWidth: 280 }}><label htmlFor="status">状態</label>
            <select id="status" name="status" defaultValue={r.status === "received" ? "reviewing" : "proposed"}>
              <option value="reviewing">確認中</option><option value="proposed">修正案を提示する</option><option value="on_hold">保留</option>
            </select></div>
          <div className="field"><label htmlFor="correction">修正方針（修正案を提示する場合は必須）</label><textarea id="correction" name="correction" rows={3} maxLength={4000} defaultValue={r.correction ?? ""} /></div>
          <div className="field"><label htmlFor="reason">理由</label><input id="reason" name="reason" type="text" maxLength={1000} defaultValue={r.correction_reason ?? ""} /></div>
          <p className="small muted">担当者の判断も絶対ではありません。本人の意思と確認できる根拠を優先してください。</p>
          <SubmitButton>記録する</SubmitButton>
        </form>
      ) : null}

      {!done && (isOwner || isReporter || isAssignee) && r.correction ? (
        <section className="card">
          <h2 className="section-title">RE-ANALYSIS<span>｜修正方針を踏まえた再分析（手順⑤）</span></h2>
          <pre className="share-preview">{reprompt}</pre>
          <div className="row"><CopyButton className="btn" label="相談文をコピー" text={reprompt} /><a className="btn ghost" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT を開く ↗</a></div>
          <form action={reanalysisPurpose} style={{ marginTop: 10 }}>
            <input type="hidden" name="report_id" value={r.id} />
            <textarea name="text" rows={4} maxLength={6000} required defaultValue={r.reanalysis ?? ""} aria-label="再分析案" placeholder="ChatGPT の再分析、または担当者と話し合った再分析の内容" />
            <div style={{ marginTop: 8 }}><SubmitButton>再分析案を記録する</SubmitButton></div>
          </form>
        </section>
      ) : null}

      {!done && isOwner ? (
        <form action={decidePurpose} className="card">
          <h2 className="section-title">DECISION<span>｜本人の決定（手順⑥）</span></h2>
          <input type="hidden" name="report_id" value={r.id} />
          <div className="checks">{Object.entries(DECISION).map(([v, l]) => <label key={v} className="check"><input type="radio" name="decision" value={v} required /> {l}</label>)}</div>
          <div className="field"><label htmlFor="note">メモ（任意）</label><input id="note" name="note" type="text" maxLength={1000} /></div>
          <p className="small muted">採用しても計画は自動では変わりません。反映は該当する画面で行い、変更は履歴に残ります（手順⑦）。</p>
          <SubmitButton className="btn gold">決定する</SubmitButton>
        </form>
      ) : null}

      {!done && (isOwner || isReporter || isAssignee) ? (
        <details className="card">
          <summary>エスカレーションする（本人の意思に関わる重大な不一致・強い誘導・重要な事実誤認・プライバシーの懸念）</summary>
          <form action={escalatePurpose} style={{ marginTop: 8 }}>
            <input type="hidden" name="report_id" value={r.id} />
            <div className="checks"><label className="check"><input type="radio" name="target" value="mentor" required defaultChecked /> メンター</label><label className="check"><input type="radio" name="target" value="admin" /> 運営管理者</label></div>
            <div className="field"><label htmlFor="esc">理由</label><input id="esc" name="reason" type="text" maxLength={1000} required /></div>
            <SubmitButton className="btn small danger">エスカレーションする</SubmitButton>
          </form>
        </details>
      ) : null}

      <section className="card">
        <h2 className="section-title">TIMELINE<span>｜経過（修正前後・理由・担当・日時）</span></h2>
        <ol className="timeline">
          {(events ?? []).map((e) => (
            <li key={e.id}><b>{ACTION[e.action] ?? e.action}</b>　<span className="small muted">{formatDateTime(e.created_at)}・{name(e.actor_id)}</span>
              {e.after && (e.after as Record<string, unknown>).status ? <span className="small">　→ {PURPOSE_STATUS[String((e.after as Record<string, unknown>).status)]}</span> : null}</li>
          ))}
        </ol>
      </section>
      <p><Link className="btn ghost" href="/apps/APP02/purpose">一覧へ戻る</Link></p>
    </>
  );
}
