"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/errors";
import { saveCommitYear } from "@/app/apps/APP02/actions";
import type { Mode } from "../content";
import { StepSaveBar, TextArea, useStepData } from "../ui";
import type { Json, PlanRow } from "../logic";

export function CommitmentForm({ initial, done, mode, plan, next }: { initial: Json; done: boolean; mode: Mode; plan: PlanRow | null; next: string }) {
  const router = useRouter();
  const sync = useStepData("commitment", initial);
  const { data, set } = sync;
  const [year, setYear] = useState<string>(plan?.commit_year ? String(plan.commit_year) : "");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = (plan?.commit_year ? String(plan.commit_year) : "") !== year;
  const label = mode === "LEGACY" ? "子会社社長の目標年度（コミット）" : "目標年度";
  async function saveYear() {
    setMsg(null);
    const r = await saveCommitYear(year ? Number(year) : null, reason).catch(() => ({ ok: false as const, code: "NETWORK" }));
    if (r.ok) { setMsg({ ok: true, text: "目標年度を保存しました。" }); setReason(""); router.refresh(); } else setMsg({ ok: false, text: messageFor(r.code).ja });
  }
  const missing = [
    ...(!plan ? ["10ヵ年計画の作成（STEP 6）"] : []),
    ...(plan?.commit_needs_recheck ? ["目標年度の再確認（開始年を変更したため）"] : []),
    ...(changed ? ["目標年度の保存"] : []),
    ...(!String(data.policy ?? "").trim() ? ["成長方針"] : []),
    ...(!String(data.statement ?? "").trim() ? ["本人のコミット"] : []),
    ...(data.decided !== true ? ["自分の意思で決めたことの確認"] : []),
  ];
  return (
    <>
      {plan ? (
        <section className="card">
          <h2 className="section-title">TARGET YEAR<span>｜{label}</span></h2>
          {plan.commit_needs_recheck ? <div className="notice warn">開始年を変更したため、{label}（{plan.commit_year}年）の再確認が必要です。年を選び直して保存してください。</div> : null}
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "0 1 240px" }}>
              <label htmlFor="commit-year">{label}<small>10ヵ年計画の範囲内</small></label>
              <select id="commit-year" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">{mode === "LEGACY" ? "コミットしない" : "設定しない"}</option>
                {Array.from({ length: 10 }, (_, i) => plan.start_year + i).map((y) => <option key={y} value={y}>{y}年（{y - plan.start_year + 1}年目）</option>)}
              </select>
            </div>
            {plan.commit_year && changed ? (
              <div className="field"><label htmlFor="commit-reason">変更・解除の理由（必須）</label><input id="commit-reason" type="text" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            ) : null}
            <div className="field" style={{ flex: "0 0 auto" }}>
              <button type="button" className="btn" disabled={!changed && !plan.commit_needs_recheck} onClick={saveYear}>目標年度を保存</button>
            </div>
          </div>
          {msg ? <div className={`notice ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</div> : null}
          <p className="small muted">{mode === "LEGACY" ? "コミットの有無はあなたが決めます。役職への就任を保証・自動決定するものではなく、能力レベルだけで経営者としての適格性を判断するものでもありません。" : "目標年度は10ヵ年計画のガントチャートに ⚑ で表示されます。設定しなくても構いません。"}</p>
        </section>
      ) : <div className="notice info">先に 10ヵ年計画（STEP 6）を作成してください。</div>}
      <TextArea id="policy" label="成長方針" sub="10年間、どんな順序・考え方で力をつけていくか" value={data.policy} onChange={(v) => set("policy", v)} rows={4} />
      <TextArea id="statement" label="私のコミット" sub="これからの行動について、自分の意思で決めたこと" value={data.statement} onChange={(v) => set("statement", v)} rows={4} />
      <label className="check card" style={{ display: "flex" }}>
        <input type="checkbox" checked={data.decided === true} onChange={(e) => set("decided", e.target.checked)} />
        この方針とコミットは、誰かに決められたものではなく、自分の意思で決めました
      </label>
      <StepSaveBar step="commitment" sync={sync} missing={missing} done={done} next={next} />
    </>
  );
}
