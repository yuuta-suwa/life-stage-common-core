"use client";
import { ABILITY_CODES, EVIDENCE_TYPES, NON_ABILITY_CONDITIONS, RELEVANCE, abilityName, type Mode } from "../content";
import { AiPanel, StepSaveBar, TextArea, useStepData, type AiNote } from "../ui";
import type { Json } from "../logic";

type DesireRow = { desire?: string; conditions?: string; resources?: string; actions?: string; outcome?: string; contribution?: string; evidence?: string };
type Rel = { level?: string; reason?: string; evidence?: string };

const CHAIN: [keyof DesireRow, string][] = [
  ["conditions", "実現条件"], ["resources", "必要な能力・資源"], ["actions", "行動・経験"], ["outcome", "期待される成果"], ["contribution", "願望への貢献"],
];

export function AnalysisForm({ initial, done, mode, desires, prompts, next }: {
  initial: Json; done: boolean; mode: Mode; desires: string[]; prompts: { analysis: string; hidden: string }; next: string;
}) {
  const start = { ...initial };
  if (!Array.isArray(start.desires) || !start.desires.length) start.desires = (desires.length ? desires : [""]).slice(0, 5).map((d) => ({ desire: d }));
  const { data, set, state, flushNow } = useStepData("analysis", start);
  const ai = (data.ai ?? {}) as Record<string, AiNote>;
  const rows = (data.desires ?? []) as DesireRow[];
  const rel = (data.relevance ?? {}) as Record<string, Rel>;
  const cond = (data.conditions ?? {}) as Record<string, string>;
  const setRow = (i: number, k: keyof DesireRow, v: string) => set("desires", rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const setRel = (k: string, p: Partial<Rel>) => set("relevance", { ...rel, [k]: { ...rel[k], ...p } });
  const relKeys = ["sales", ...ABILITY_CODES];
  const missing = [
    ...(!rows.some((r) => (r.desire ?? "").trim() && (r.conditions ?? "").trim()) ? ["願望と実現条件（1つ以上）"] : []),
    ...(relKeys.filter((k) => rel[k]?.level).length < relKeys.length ? ["セールス力・6大能力の関連度（全7項目）"] : []),
    ...(!String(data.story ?? "").trim() ? ["私の自己実現ストーリー"] : []),
  ];
  return (
    <>
      <h2 className="section-title">EVIDENCE MAP<span>｜願望 → 実現条件 → 必要な能力・資源 → 行動・経験 → 成果 → 願望への貢献</span></h2>
      {rows.map((r, i) => (
        <div key={i} className="card analysis-row">
          <div className="field"><label htmlFor={`d-${i}`}>願望 {i + 1}</label><input id={`d-${i}`} type="text" maxLength={200} value={r.desire ?? ""} onChange={(e) => setRow(i, "desire", e.target.value)} /></div>
          <div className="chain">
            {CHAIN.map(([k, label]) => (
              <div key={k} className="field"><label htmlFor={`${k}-${i}`}>{label}</label><textarea id={`${k}-${i}`} rows={2} maxLength={800} value={r[k] ?? ""} onChange={(e) => setRow(i, k, e.target.value)} /></div>
            ))}
          </div>
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor={`ev-${i}`}>主な根拠の種類</label>
            <select id={`ev-${i}`} value={r.evidence ?? ""} onChange={(e) => setRow(i, "evidence", e.target.value)}>
              <option value="">選択してください</option>{EVIDENCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
      ))}
      {rows.length < 5 ? <button type="button" className="btn small ghost" onClick={() => set("desires", [...rows, {}])}>＋ 願望を追加</button> : null}

      <h2 className="section-title">RELEVANCE<span>｜セールス力と6大能力の関連度</span></h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>能力</th><th>関連度</th><th>理由</th><th>根拠</th></tr></thead>
          <tbody>
            {relKeys.map((k) => (
              <tr key={k}>
                <th scope="row">{k === "sales" ? "セールス力" : abilityName(k as (typeof ABILITY_CODES)[number], mode)}</th>
                <td><select aria-label="関連度" value={rel[k]?.level ?? ""} onChange={(e) => setRel(k, { level: e.target.value })}><option value="">選択</option>{RELEVANCE.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></td>
                <td><input type="text" aria-label="理由" maxLength={300} value={rel[k]?.reason ?? ""} onChange={(e) => setRel(k, { reason: e.target.value })} /></td>
                <td><select aria-label="根拠" value={rel[k]?.evidence ?? ""} onChange={(e) => setRel(k, { evidence: e.target.value })}><option value="">選択</option>{EVIDENCE_TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">関連が弱い能力を「必須」と考える必要はありません。根拠がない数値や成功率は書かず、分からないことは「未確認」としてください。</p>

      <h2 className="section-title">OTHER CONDITIONS<span>｜能力以外の必要条件</span></h2>
      <div className="grid two">
        {NON_ABILITY_CONDITIONS.map((c) => (
          <div key={c} className="field"><label htmlFor={`c-${c}`}>{c}</label><input id={`c-${c}`} type="text" maxLength={300} placeholder="必要なこと・不足・未確認 など" value={cond[c] ?? ""} onChange={(e) => set("conditions", { ...cond, [c]: e.target.value })} /></div>
        ))}
      </div>
      <TextArea id="risks" label="障害とリスク" value={data.risks} onChange={(v) => set("risks", v)} />
      <TextArea id="alternatives" label="代替ルート" sub="複数のルートがあれば、期間・費用・負担・必要条件・リスクを比べて書いてください" value={data.alternatives} onChange={(v) => set("alternatives", v)} />
      <AiPanel scene="analysis" prompt={prompts.analysis} note={ai.analysis} onChange={(n) => set("ai", { ...ai, analysis: n })} hint="上の根拠マップの下書きを ChatGPT と一緒に考えられます。" />
      <AiPanel scene="hidden" prompt={prompts.hidden} note={ai.hidden} onChange={(n) => set("ai", { ...ai, hidden: n })} />
      <TextArea id="story" label="私の自己実現ストーリー" sub="読み返したときに、なぜこの計画なのかが分かる一貫した文章（AI の提案を使う場合も、自分の言葉で）" value={data.story} onChange={(v) => set("story", v)} rows={6} max={4000} />
      <StepSaveBar step="analysis" state={state} missing={missing} done={done} flushNow={flushNow} next={next} />
    </>
  );
}
