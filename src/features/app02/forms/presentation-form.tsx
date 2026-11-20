"use client";
import { PrintButton } from "@/components/copy-button";
import { CopyButton } from "@/components/copy-button";
import { PRESENTATION_SECTIONS, type Json } from "../logic";
import { AiPanel, StepSaveBar, useStepData, type AiNote } from "../ui";

type Sec = { text?: string; source?: "draft" | "own" };

export function PresentationForm({ initial, done, drafts, prompt }: { initial: Json; done: boolean; drafts: string[]; prompt: string }) {
  const start = { ...initial };
  if (!Array.isArray(start.sections) || start.sections.length !== PRESENTATION_SECTIONS.length) {
    start.sections = drafts.map((t) => ({ text: t, source: "draft" }));
  }
  const sync = useStepData("presentation", start);
  const { data, set } = sync;
  const ai = (data.ai ?? {}) as Record<string, AiNote>;
  const secs = data.sections as Sec[];
  const setSec = (i: number, p: Sec) => set("sections", secs.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const fullText = PRESENTATION_SECTIONS.map((t, i) => `【${i + 1}. ${t}】\n${secs[i]?.text ?? ""}`).join("\n\n");
  const missing = [
    ...(secs.some((s) => !(s.text ?? "").trim() || /^（.*してください）$/.test((s.text ?? "").trim())) ? ["未記入のセクション"] : []),
    ...(data.approved !== true ? ["内容の確認"] : []),
  ];
  return (
    <>
      {PRESENTATION_SECTIONS.map((title, i) => {
        const s = secs[i] ?? {};
        return (
          <section key={title} className="card pres-section">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 className="section-title">{String(i + 1).padStart(2, "0")}<span>｜{title}</span></h2>
              <span className={`badge ${s.source === "own" ? "ok" : "plain"}`}>{s.source === "own" ? "本人が編集" : "自動下書き"}</span>
            </div>
            <textarea aria-label={title} rows={4} maxLength={3000} value={s.text ?? ""} onChange={(e) => setSec(i, { text: e.target.value, source: "own" })} />
            {s.source === "own" ? (
              <button type="button" className="btn small ghost" onClick={() => setSec(i, { text: drafts[i], source: "draft" })}>下書きに戻す</button>
            ) : null}
          </section>
        );
      })}
      <AiPanel scene="presentation" prompt={prompt} note={ai.presentation} onChange={(n) => set("ai", { ...ai, presentation: n })} hint="ChatGPT が補った部分は【AI補足】と明記するよう依頼しています。" />
      <div className="row no-print">
        <CopyButton className="btn ghost" label="全文をコピー" text={fullText} />
        <PrintButton className="btn ghost" label="印刷・PDF で保存" />
      </div>
      <label className="check card" style={{ display: "flex" }}>
        <input type="checkbox" checked={data.approved === true} onChange={(e) => set("approved", e.target.checked)} />
        この内容を自分の言葉として確認しました
      </label>
      <p className="small muted">スポンサー等との共有（SHARED VISION）は次のフェーズで提供予定です。現在は、全文コピーや印刷を使って、ご自身が選んだ相手に共有してください。</p>
      <StepSaveBar step="presentation" sync={sync} missing={missing} done={done} next="/apps/APP02/complete" />
    </>
  );
}
