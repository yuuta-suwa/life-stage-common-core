"use client";
import { SALES_QUIZ } from "../content";
import { AiPanel, Quiz, StepSaveBar, TextArea, quizPassed, useStepData, type AiNote } from "../ui";
import type { Json } from "../logic";

export function SalesForm({ initial, done, prompts, next }: { initial: Json; done: boolean; prompts: { sales: string; understanding: string }; next: string }) {
  const { data, set, state, flushNow } = useStepData("sales", initial);
  const ai = (data.ai ?? {}) as Record<string, AiNote>;
  const missing = [
    ...(!String(data.relation ?? "").trim() ? ["あなたの願望との関係"] : []),
    ...(!quizPassed(SALES_QUIZ, data.quiz) ? ["理解確認（全問正解）"] : []),
    ...(String(data.own_words ?? "").trim().length < 20 ? ["自分の言葉による説明（20字以上）"] : []),
  ];
  return (
    <>
      <TextArea id="relation" label="セールス力は、あなたの願望にどう関係しますか？" sub="直接役立つ点・間接的に役立つ点の両方を考えてみましょう" value={data.relation} onChange={(v) => set("relation", v)} rows={4} />
      <AiPanel scene="sales" prompt={prompts.sales} note={ai.sales} onChange={(n) => set("ai", { ...ai, sales: n })} />
      <h2 className="section-title">CHECK<span>｜理解確認</span></h2>
      <Quiz items={SALES_QUIZ} value={data.quiz as number[] | undefined} onChange={(v) => set("quiz", v)} />
      <TextArea id="own_words" label="セールス力が人生に役立つ理由を、自分の言葉で説明してください" sub="プレゼンの「セールス力を学ぶ理由」に使います" value={data.own_words} onChange={(v) => set("own_words", v)} rows={4} />
      <AiPanel scene="understanding" prompt={prompts.understanding} note={ai.understanding} onChange={(n) => set("ai", { ...ai, understanding: n })} hint="自分の説明に自信がないときに、理解度を確認する質問をもらえます。" />
      <StepSaveBar step="sales" state={state} missing={missing} done={done} flushNow={flushNow} next={next} />
    </>
  );
}
