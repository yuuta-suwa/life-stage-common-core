"use client";
import { AiPanel, StepSaveBar, TextArea, useStepData, type AiNote } from "../ui";
import type { Json } from "../logic";

export function VisionForm({ initial, done, hasBlueprint, desires, prompts, next }: {
  initial: Json; done: boolean; hasBlueprint: boolean; desires: string[]; prompts: { vision: string; priority: string }; next: string;
}) {
  const { data, set, state, flushNow } = useStepData("vision", initial);
  const ai = (data.ai ?? {}) as Record<string, AiNote>;
  const setAi = (k: string, n: AiNote) => set("ai", { ...ai, [k]: n });
  const missing = [
    ...(!hasBlueprint && !String(data.provisional_vision ?? "").trim() ? ["暫定の人生ビジョン"] : []),
    ...(!String(data.why ?? "").trim() ? ["実現したい理由"] : []),
    ...(data.confirmed !== true ? ["内容の確認"] : []),
  ];
  return (
    <>
      {!hasBlueprint ? (
        <TextArea id="provisional_vision" label="暫定の人生ビジョン" sub="APP01 の人生設計がまだ届いていないため、今の考えを書いてください" value={data.provisional_vision} onChange={(v) => set("provisional_vision", v)} rows={4} />
      ) : null}
      <TextArea id="why" label="なぜ、その人生を実現したいのですか？" sub="プレゼンの「実現理由」に使います" value={data.why} onChange={(v) => set("why", v)} />
      <TextArea id="priorities" label="願望の優先順位と期限についてのメモ" sub={desires.length ? `APP01 の優先願望：${desires.join("／")}` : "任意"} value={data.priorities} onChange={(v) => set("priorities", v)} />
      <TextArea id="constraints" label="制約や気がかり（任意）" sub="時間・お金・家族・健康など、答えたくないことは書かなくて構いません" value={data.constraints} onChange={(v) => set("constraints", v)} />
      <AiPanel scene="vision" prompt={prompts.vision} note={ai.vision} onChange={(n) => setAi("vision", n)} />
      <AiPanel scene="priority" prompt={prompts.priority} note={ai.priority} onChange={(n) => setAi("priority", n)} />
      <label className="check card" style={{ display: "flex" }}>
        <input type="checkbox" checked={data.confirmed === true} onChange={(e) => set("confirmed", e.target.checked)} />
        この人生ビジョンを、APP02 の判断の軸にすることを確認しました（APP01 の元データは変更されません）
      </label>
      <StepSaveBar step="vision" state={state} missing={missing} done={done} flushNow={flushNow} next={next} />
    </>
  );
}
