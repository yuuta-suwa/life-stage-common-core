"use client";
import { LADDER, LADDER_STATUS, LEGACY_PREREQUISITES } from "../content";
import { StepSaveBar, TextArea, useStepData } from "../ui";
import type { Json } from "../logic";

type Rung = { status?: string; evidence?: string };

/** S11 経営者志望ラダー（LEGACY 専用）。段階ごとの能力・経験・成果を本人が整理する（認定ではない） */
export function LadderForm({ initial, done }: { initial: Json; done: boolean }) {
  const sync = useStepData("ladder", initial);
  const { data, set } = sync;
  const rungs = (data.rungs ?? {}) as Record<string, Rung>;
  const pre = (data.prerequisites ?? {}) as Record<string, string>;
  const setRung = (no: number, p: Rung) => set("rungs", { ...rungs, [no]: { ...rungs[no], ...p } });
  const missing = [
    ...(LADDER.filter((l) => rungs[l.no]?.status).length < LADDER.length ? ["各段階の状況"] : []),
    ...(LEGACY_PREREQUISITES.filter((p) => (pre[p] ?? "").trim()).length < LEGACY_PREREQUISITES.length ? ["前提条件の確認（5項目）"] : []),
  ];
  return (
    <>
      <ol className="ladder">
        {LADDER.map((l) => {
          const r = rungs[l.no] ?? {};
          return (
            <li key={l.no} className={`card ladder-rung ${r.status ?? ""}`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 className="section-title">STEP {l.no}<span>｜{l.title}</span></h2>
                <select aria-label={`段階${l.no}の状況`} value={r.status ?? ""} onChange={(e) => setRung(l.no, { status: e.target.value })}>
                  {LADDER_STATUS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
              <p className="small"><b>必要な能力・経験・成果：</b>{l.needs}</p>
              <div className="field"><label htmlFor={`ev-${l.no}`}>あなたの経験・根拠<small>例：{l.evidence}</small></label>
                <textarea id={`ev-${l.no}`} rows={2} maxLength={1000} value={r.evidence ?? ""} onChange={(e) => setRung(l.no, { evidence: e.target.value })} /></div>
            </li>
          );
        })}
      </ol>
      <section className="card">
        <h2 className="section-title">PREREQUISITES<span>｜前提条件の確認</span></h2>
        <div className="grid two">
          {LEGACY_PREREQUISITES.map((p) => (
            <div key={p} className="field"><label htmlFor={`pre-${p}`}>{p}</label>
              <input id={`pre-${p}`} type="text" maxLength={300} placeholder="現状・必要なこと・未確認 など" value={pre[p] ?? ""} onChange={(e) => set("prerequisites", { ...pre, [p]: e.target.value })} /></div>
          ))}
        </div>
      </section>
      <TextArea id="note" label="経営者を目指す理由と、これから伸ばしたいこと" value={data.note} onChange={(v) => set("note", v)} rows={3} />
      <StepSaveBar step="ladder" sync={sync} missing={missing} done={done} next="/apps/APP02/commitment" />
    </>
  );
}
