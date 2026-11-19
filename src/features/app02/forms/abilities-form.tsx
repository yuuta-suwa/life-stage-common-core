"use client";
import { ABILITY_CODES, ABILITY_QUIZ, abilityName, type Mode } from "../content";
import { AiPanel, Quiz, StepSaveBar, TextArea, quizPassed, useStepData, type AiNote } from "../ui";
import type { Json } from "../logic";

export function AbilitiesForm({ initial, done, mode, prompt, next }: { initial: Json; done: boolean; mode: Mode; prompt: string; next: string }) {
  const { data, set, state, flushNow } = useStepData("abilities", initial);
  const ai = (data.ai ?? {}) as Record<string, AiNote>;
  const rel = (data.relations ?? {}) as Record<string, string>;
  const filled = ABILITY_CODES.filter((a) => (rel[a] ?? "").trim()).length;
  const missing = [
    ...(filled < 3 ? [`能力と願望のつながり（3つ以上。現在 ${filled}）`] : []),
    ...(!quizPassed(ABILITY_QUIZ, data.quiz) ? ["理解確認（全問正解）"] : []),
    ...(!String(data.relation_summary ?? "").trim() ? ["6つの力の関係のまとめ"] : []),
  ];
  return (
    <>
      <h2 className="section-title">MY CONNECTION<span>｜あなたの願望とのつながり</span></h2>
      <div className="grid two">
        {ABILITY_CODES.map((a) => (
          <TextArea key={a} id={`rel-${a}`} label={abilityName(a, mode)} sub="あなたの願望のどこで役立つ？（関係が弱ければ、そう書いて構いません）"
            value={rel[a]} onChange={(v) => set("relations", { ...rel, [a]: v })} rows={2} max={600} />
        ))}
      </div>
      <AiPanel scene="abilities" prompt={prompt} note={ai.abilities} onChange={(n) => set("ai", { ...ai, abilities: n })} />
      <h2 className="section-title">CHECK<span>｜理解確認</span></h2>
      <Quiz items={ABILITY_QUIZ} value={data.quiz as number[] | undefined} onChange={(v) => set("quiz", v)} />
      <TextArea id="relation_summary" label="6つの力が、あなたの願望の実現にどうつながるかを、自分の言葉でまとめてください" sub="プレゼンの「6大能力の相互関係」に使います" value={data.relation_summary} onChange={(v) => set("relation_summary", v)} rows={4} />
      <StepSaveBar step="abilities" state={state} missing={missing} done={done} flushNow={flushNow} next={next} />
    </>
  );
}
