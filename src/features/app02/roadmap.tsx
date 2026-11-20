"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/errors";
import { resetCell, updateCell } from "@/app/apps/APP02/actions";
import { ABILITY_CODES, CATEGORY_LABEL, LEVELS, abilityName, type AbilityCode, type Mode } from "./content";
import { AiPanel } from "./ui";
import { scenePrompt } from "./prompts";
import { ReportButton } from "./report-button";
import {
  calendarYear, cellCategory, cellCriteria, cellExperiences, cellLevel, cellText, type CellRow, type Finding, type PlanRow,
} from "./logic";

type Sel = { ability: AbilityCode; year: number } | null;

export function RoadmapGrid({ plan, cells, mode, findings, visionCtx }: {
  plan: PlanRow; cells: CellRow[]; mode: Mode; findings: Finding[]; visionCtx: string;
}) {
  const router = useRouter();
  const [sel, setSelRaw] = useState<Sel>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const setSel = (s: Sel) => { setSaved(null); setSelRaw(s); };
  const by = useMemo(() => new Map(cells.map((c) => [`${c.ability}:${c.year_index}`, c])), [cells]);
  const years = Array.from({ length: 10 }, (_, i) => i + 1);
  const commitIdx = plan.commit_year ? plan.commit_year - plan.start_year + 1 : null;
  const focusOf = (y: number) => plan.focus[String(y)] ?? [];
  const selected = sel ? by.get(`${sel.ability}:${sel.year}`) : undefined;

  return (
    <>
      {commitIdx ? (
        <p className="small"><span className="g-flag-mark">⚑ {mode === "LEGACY" ? "コミット" : "目標年度"}：{plan.commit_year}年（{commitIdx}年目）</span>{plan.commit_needs_recheck ? "　開始年を変更したため再確認が必要です（STEP 7）" : ""}{commitIdx > 6 ? "　※表を右へスクロールすると、その年の列が緑で表示されます" : ""}</p>
      ) : null}
      <p className="small muted scroll-hint">表は横にスクロールできます（左の能力名は固定）。セルを選ぶと、下で到達目標を編集できます。</p>
      <div className="gantt-wrap" role="region" aria-label="10ヵ年ガントチャート" tabIndex={0}>
        <table className="gantt">
          <thead>
            <tr className="g-year">
              <th scope="col" className="g-sticky">能力 ＼ 西暦</th>
              {years.map((y) => <th key={y} scope="col" className={y === commitIdx ? "g-commit" : undefined}>{calendarYear(plan.start_year, y)}</th>)}
            </tr>
            <tr className="g-flag">
              <th scope="row" className="g-sticky small">{mode === "LEGACY" ? "コミット" : "目標年度"}</th>
              {years.map((y) => (
                <td key={y} className={y === commitIdx ? "g-commit" : undefined}>
                  {y === commitIdx ? <span className="g-flag-mark" title={`目標年度 ${plan.commit_year}年`}>⚑ {mode === "LEGACY" ? "コミット" : "目標"}{plan.commit_needs_recheck ? "（要再確認）" : ""}</span> : null}
                </td>
              ))}
            </tr>
            <tr className="g-index">
              <th scope="row" className="g-sticky small">年次</th>
              {years.map((y) => <td key={y} className={`small ${y === commitIdx ? "g-commit" : ""}`}>{y}年目</td>)}
            </tr>
          </thead>
          <tbody>
            {ABILITY_CODES.map((a) => (
              <tr key={a}>
                <th scope="row" className="g-sticky g-ability">{abilityName(a, mode)}</th>
                {years.map((y) => {
                  const c = by.get(`${a}:${y}`)!;
                  const cat = cellCategory(c);
                  const isSel = sel?.ability === a && sel.year === y;
                  const focus = focusOf(y).includes(a);
                  return (
                    <td key={y} className={`g-cell cat-${cat} ${y === commitIdx ? "g-commit" : ""} ${isSel ? "selected" : ""}`}>
                      <button type="button" id={`cell-${a}-${y}`} onClick={() => setSel({ ability: a, year: y })} aria-pressed={isSel}
                        aria-label={`${abilityName(a, mode)} ${calendarYear(plan.start_year, y)}年：${cellText(c)}（目標LV${cellLevel(c)}）`}>
                        <span className="g-text">{cellText(c)}</span>
                        <span className="g-meta">LV{cellLevel(c)}{focus ? "・★重点" : ""}{c.edited_text || c.target_level !== null ? "・編集済" : ""}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="g-legend small" aria-label="凡例">
        {(["prep", "learn", "practice", "sustain", "teach", "build", "legacy"] as const).map((k) => <li key={k}><span className={`swatch cat-${k}`} aria-hidden="true" /> {CATEGORY_LABEL[k]}</li>)}
        <li>★重点＝その年の重点能力</li><li>⚑＝目標年度</li>
      </ul>

      {selected && sel ? (
        <CellEditor key={`${sel.ability}:${sel.year}:${cellText(selected)}:${cellLevel(selected)}`} cell={selected} mode={mode} year={calendarYear(plan.start_year, sel.year)}
          prompt={scenePrompt("cell", { vision: visionCtx, ability: sel.ability, detail: `${calendarYear(plan.start_year, sel.year)}年の到達目標：${cellText(selected)}\n必要な経験：${cellExperiences(selected)}\n到達判断基準：${cellCriteria(selected)}` })} onDone={(m) => { setSaved(m); router.refresh(); }} onClose={() => setSel(null)} />
      ) : null}
      {saved ? <div className="notice ok cell-saved" role="status">{saved}</div> : null}

      {findings.length ? (
        <div className="card" id="consistency">
          <h2 className="section-title">CONSISTENCY<span>｜整合性の確認（{findings.length}件）</span></h2>
          <ul className="findings">
            {findings.map((f, i) => (
              <li key={i}>
                <b>{f.message}</b><br /><span className="small">改善案：{f.suggestion}</span>
                {f.ability && f.year_index ? <> <button type="button" className="btn small ghost" onClick={() => { setSel({ ability: f.ability!, year: f.year_index! }); document.getElementById(`cell-${f.ability}-${f.year_index}`)?.scrollIntoView({ block: "nearest", inline: "center" }); }}>このセルを開く</button></> : null}
              </li>
            ))}
          </ul>
          <p className="small muted">「実現できない」という判定ではありません。理由を確認し、必要なら計画を直してください（そのままでも進められます）。</p>
          <ReportButton source="roadmap:consistency" original={{ findings: findings.map((f) => f.message) }} label="指摘内容に違和感を報告／軸に戻す" />
        </div>
      ) : <div className="notice ok">整合性の確認で指摘はありません。</div>}
    </>
  );
}

/** S09 年度別目標編集：推奨と本人編集を区別し、推奨に戻す・理由の記録ができる */
function CellEditor({ cell, mode, year, prompt, onDone, onClose }: { cell: CellRow; mode: Mode; year: number; prompt: string; onDone: (message: string) => void; onClose: () => void }) {
  const [text, setText] = useState(cellText(cell));
  const [level, setLevel] = useState<number>(cellLevel(cell));
  const [exp, setExp] = useState(cellExperiences(cell));
  const [cri, setCri] = useState(cellCriteria(cell));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [conflict, setConflict] = useState<{ text: string; level: number; updated_at?: string } | null>(null);
  const dirty = text !== cellText(cell) || level !== cellLevel(cell) || exp !== cellExperiences(cell) || cri !== cellCriteria(cell);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save(expected: string | null = cell.updated_at ?? null) {
    setBusy(true); setMsg(null); setConflict(null);
    // 推奨と同じ値は「推奨のまま」（null）として保存し、推奨と本人編集を区別する
    const r = await updateCell({
      ability: cell.ability, year_index: cell.year_index,
      edited_text: text.trim() === cell.recommended_text ? "" : text,
      target_level: level === cell.recommended_level ? null : level,
      experiences: exp.trim() === cell.rec_experiences ? "" : exp,
      criteria: cri.trim() === cell.rec_criteria ? "" : cri,
      reason,
      expected,
    }).catch(() => ({ ok: false as const, code: "NETWORK" }));
    setBusy(false);
    if (!r.ok && r.code === "CONFLICT" && "server" in r && r.server) {
      const sv = r.server as Record<string, unknown>;
      setConflict({ text: String(sv.edited_text ?? sv.recommended_text ?? ""), level: Number(sv.target_level ?? sv.recommended_level ?? 0), updated_at: sv.updated_at as string | undefined });
      return;
    }
    if (r.ok) onDone(`${abilityName(cell.ability, mode)}・${year}年を保存しました。`); else setMsg({ ok: false, text: `${messageFor(r.code).ja}（未保存）` });
  }
  async function reset() {
    if (!window.confirm("このセルだけを推奨の内容に戻します（「ひとつ戻す」で取り消せます）。よろしいですか？")) return;
    setBusy(true);
    const r = await resetCell(cell.ability, cell.year_index).catch(() => ({ ok: false as const, code: "NETWORK" }));
    setBusy(false);
    if (r.ok) onDone(`${abilityName(cell.ability, mode)}・${year}年を推奨に戻しました（「ひとつ戻す」で取り消せます）。`); else setMsg({ ok: false, text: messageFor(r.code).ja });
  }

  return (
    <section className="card cell-editor" aria-label="セルの編集">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 className="section-title">EDIT<span>｜{abilityName(cell.ability, mode)}・{year}年（{cell.year_index}年目）</span></h2>
        <button type="button" className="btn small ghost" onClick={onClose}>閉じる</button>
      </div>
      <p className="small muted">推奨：{cell.recommended_text}（LV{cell.recommended_level}）。目標レベルは<b>目標</b>であり、実績の認定ではありません。</p>
      <div className="field"><label htmlFor="ce-text">具体的な到達状態</label><input id="ce-text" type="text" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} /></div>
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="ce-level">目標レベル</label>
        <select id="ce-level" value={level} onChange={(e) => setLevel(Number(e.target.value))}>{LEVELS.map((l) => <option key={l.lv} value={l.lv}>{l.label}：{l.desc}</option>)}</select>
      </div>
      <div className="field"><label htmlFor="ce-exp">必要な経験・学習</label><textarea id="ce-exp" rows={2} maxLength={1000} value={exp} onChange={(e) => setExp(e.target.value)} /></div>
      <div className="field"><label htmlFor="ce-cri">到達判断基準<small>第三者が見て判断できる、観察可能な状態</small></label><textarea id="ce-cri" rows={2} maxLength={1000} value={cri} onChange={(e) => setCri(e.target.value)} /></div>
      <div className="field"><label htmlFor="ce-reason">変更の理由<small>重要な変更のときは記録しておきましょう（任意）</small></label><input id="ce-reason" type="text" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <div className="row">
        <button type="button" className="btn gold" disabled={busy || !dirty || !text.trim()} onClick={() => void save()}>{busy ? "保存中…" : "このセルを保存"}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={reset}>推奨に戻す</button>
        {dirty ? <span className="small warn-text" role="status">未保存の変更があります</span> : null}
      </div>
      {msg ? <div className={`notice ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</div> : null}
      {conflict ? (
        <div className="notice warn" role="alert">
          別の端末・タブで、このセルが先に更新されています（保存されている内容：「{conflict.text}」LV{conflict.level}）。上書きはしていません。
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn small" onClick={() => void save(conflict.updated_at ?? null)}>この画面の内容で保存する</button>
            <button type="button" className="btn small ghost" onClick={() => { setConflict(null); onDone("保存されている内容を表示しています。"); }}>保存されている内容を使う</button>
          </div>
        </div>
      ) : null}
      <ReportButton source={`roadmap:${cell.ability}:${cell.year_index}`} original={{ recommended: cell.recommended_text, recommended_level: cell.recommended_level }} label="この推奨に違和感を報告／軸に戻す" />
      <AiPanel scene="cell" prompt={prompt} />
    </section>
  );
}
