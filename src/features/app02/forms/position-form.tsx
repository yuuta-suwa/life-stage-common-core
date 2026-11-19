"use client";
import { ABILITY_CODES, DIAGNOSIS_LADDER, LEVELS, abilityName, type AbilityCode, type Mode } from "../content";
import { AiPanel, StepSaveBar, useStepData, type AiNote } from "../ui";
import { currentLevel, provisionalLevel, type Json, type PositionAnswer } from "../logic";

export function PositionForm({ initial, done, mode, prompts, next }: { initial: Json; done: boolean; mode: Mode; prompts: Record<AbilityCode, string>; next: string }) {
  const { data, set, state, flushNow } = useStepData("position", initial);
  const ai = (data.ai ?? {}) as Record<string, AiNote>;
  const get = (a: AbilityCode) => (data[a] ?? {}) as PositionAnswer;
  const upd = (a: AbilityCode, p: Partial<PositionAnswer>) => set(a, { ...get(a), ...p });
  const answered = (a: AbilityCode) => (get(a).yes ?? []).length > 0 || (get(a).unsure ?? []).some(Boolean);
  const missing = ABILITY_CODES.filter((a) => !answered(a)).map((a) => abilityName(a, mode));
  return (
    <>
      {ABILITY_CODES.map((a) => {
        const ans = get(a);
        const p = provisionalLevel(ans);
        const name = abilityName(a, mode);
        return (
          <section key={a} className="card position-card" aria-labelledby={`pos-${a}`}>
            <h2 id={`pos-${a}`} className="section-title">{name}<span>｜暫定 LV{currentLevel(ans)}{typeof ans.override === "number" ? "（本人が修正）" : ""}</span></h2>
            {DIAGNOSIS_LADDER.map((d, i) => {
              const yes = ans.yes?.[i], unsure = ans.unsure?.[i];
              const val = unsure ? "unsure" : yes === true ? "yes" : yes === false ? "no" : "";
              const choose = (v: string) => {
                const y = [...(ans.yes ?? [])], u = [...(ans.unsure ?? [])];
                y[i] = v === "yes"; u[i] = v === "unsure";
                upd(a, { yes: y, unsure: u });
              };
              return (
                <fieldset key={i} className="diag-q">
                  <legend className="small">{`LV${d.lv}：`}{d.q(name)}</legend>
                  <div className="checks">
                    {[["yes", "はい"], ["no", "いいえ"], ["unsure", "分からない"]].map(([v, t]) => (
                      <label key={v} className="check"><input type="radio" name={`${a}-${i}`} checked={val === v} onChange={() => choose(v)} /> {t}</label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
            <div className="field"><label htmlFor={`ev-${a}`}>具体的な経験（いつ・何を・どのくらい・結果）</label>
              <textarea id={`ev-${a}`} rows={2} maxLength={1000} value={ans.evidence ?? ""} onChange={(e) => upd(a, { evidence: e.target.value })} /></div>
            <p className="small"><b>暫定レベルの理由：</b>{p.reason}</p>
            <div className="row">
              <div className="field" style={{ flex: "0 1 240px" }}>
                <label htmlFor={`ov-${a}`}>本人による修正（任意）</label>
                <select id={`ov-${a}`} value={typeof ans.override === "number" ? String(ans.override) : ""} onChange={(e) => upd(a, { override: e.target.value === "" ? null : Number(e.target.value) })}>
                  <option value="">修正しない（LV{p.level}）</option>
                  {LEVELS.map((l) => <option key={l.lv} value={l.lv}>{l.label}：{l.desc}</option>)}
                </select>
              </div>
              {typeof ans.override === "number" ? (
                <div className="field"><label htmlFor={`ovr-${a}`}>修正の理由</label><input id={`ovr-${a}`} type="text" maxLength={300} value={ans.override_reason ?? ""} onChange={(e) => upd(a, { override_reason: e.target.value })} /></div>
              ) : null}
            </div>
            <AiPanel scene="position" prompt={prompts[a]} note={ai[a]} onChange={(n) => set("ai", { ...ai, [a]: n })} />
          </section>
        );
      })}
      <StepSaveBar step="position" state={state} missing={missing.length ? [`未回答の能力：${missing.join("・")}`] : []} done={done} flushNow={flushNow} next={next} />
    </>
  );
}
