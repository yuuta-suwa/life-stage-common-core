"use client";
import { ENV_CANDIDATES, ENV_CRITERIA } from "../content";
import { AiPanel, StepSaveBar, TextArea, useStepData, type AiNote } from "../ui";
import type { Json } from "../logic";

const RATINGS = [["", "未確認"], ["4", "◎ 十分"], ["3", "○ 概ね"], ["2", "△ 一部"], ["1", "× 不足"]] as const;
type Cell = { rating?: string; note?: string };

export function EnvironmentForm({ initial, done, prompts, next }: { initial: Json; done: boolean; prompts: { environment: string; compare: string }; next: string }) {
  const { data, set, state, flushNow } = useStepData("environment", initial);
  const ai = (data.ai ?? {}) as Record<string, AiNote>;
  const grid = (data.grid ?? {}) as Record<string, Record<string, Cell>>;
  const names = (data.names ?? {}) as Record<string, string>;
  const setCell = (cand: string, crit: string, p: Cell) => set("grid", { ...grid, [cand]: { ...grid[cand], [crit]: { ...grid[cand]?.[crit], ...p } } });
  const rated = ENV_CANDIDATES.filter((c) => Object.values(grid[c.key] ?? {}).some((x) => x.rating || x.note)).length;
  const missing = [
    ...(rated < 2 ? ["2つ以上の候補の比較"] : []),
    ...(!String(data.decision_note ?? "").trim() ? ["比較して分かったこと（あなたの評価）"] : []),
  ];
  return (
    <>
      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="other-name">「その他の選択肢」の名前（任意）</label>
        <input id="other-name" type="text" maxLength={80} value={names.other ?? ""} placeholder="例：独学、別のスクール、転職 など" onChange={(e) => set("names", { ...names, other: e.target.value })} />
      </div>
      <div className="table-wrap env-table">
        <table>
          <thead><tr><th scope="col">比較軸</th>{ENV_CANDIDATES.map((c) => <th key={c.key} scope="col">{c.key === "other" && names.other ? names.other : c.label}</th>)}</tr></thead>
          <tbody>
            {ENV_CRITERIA.map((crit) => (
              <tr key={crit}>
                <th scope="row">{crit}</th>
                {ENV_CANDIDATES.map((c) => {
                  const v = grid[c.key]?.[crit] ?? {};
                  return (
                    <td key={c.key}>
                      <select aria-label={`${c.label}・${crit}`} value={v.rating ?? ""} onChange={(e) => setCell(c.key, crit, { rating: e.target.value })}>
                        {RATINGS.map(([val, t]) => <option key={val} value={val}>{t}</option>)}
                      </select>
                      <input type="text" aria-label={`${c.label}・${crit} のメモ`} maxLength={200} placeholder="メモ・根拠" value={v.note ?? ""} onChange={(e) => setCell(c.key, crit, { note: e.target.value })} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">LEI STYLE の実績・支援制度は、運営が登録した検証可能な情報だけを事実として扱います。現在、登録された情報はないため、確認できない項目は「未確認」のままにしてください。情報が足りないことを不利と決めつける必要はありません。</p>
      <AiPanel scene="environment" prompt={prompts.environment} note={ai.environment} onChange={(n) => set("ai", { ...ai, environment: n })} />
      <AiPanel scene="compare" prompt={prompts.compare} note={ai.compare} onChange={(n) => set("ai", { ...ai, compare: n })} />
      <TextArea id="decision_note" label="比較して分かったこと（あなたの評価）" sub="どの環境を選ぶかを今ここで決める必要はありません。判断材料を整理しましょう" value={data.decision_note} onChange={(v) => set("decision_note", v)} rows={4} />
      <StepSaveBar step="environment" state={state} missing={missing} done={done} flushNow={flushNow} next={next} />
    </>
  );
}
