import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { SALES } from "@/features/app02/content";
import { loadBlueprint, loadSteps, stepData, stepDone, stepInit } from "@/features/app02/data";
import { scenePrompt, visionContext } from "@/features/app02/prompts";
import { StepHeader, nextPath } from "@/features/app02/step-header";
import { SalesForm } from "@/features/app02/forms/sales-form";
import { requireStarted } from "@/features/app02/guard";

/** S03 セールス力理解（仕様 §05）：定義 → 例 → 本人との関係 → 条件と限界 → 理解確認 → 自分の言葉 */
export default async function SalesPage() {
  const access = await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02/sales");
  const supabase = await createClient();
  await requireStarted(supabase);
  const [steps, { bp }] = await Promise.all([loadSteps(supabase), loadBlueprint(supabase)]);
  const ctx = visionContext(bp, String(stepData(steps, "vision").provisional_vision ?? ""));
  return (
    <>
      <StepHeader code="sales" intro="セールス力が、あなたの人生のどこで役立つのかを理解し、自分の言葉で説明できるようにします。" />
      <div className="card">
        <h2 className="section-title">DEFINITION<span>｜定義</span></h2>
        <p><b>{SALES.definition}</b></p>
        <p className="small">構成：{SALES.components.join("／")}</p>
      </div>
      <div className="card">
        <h2 className="section-title">EXAMPLES<span>｜日常・仕事での例</span></h2>
        <dl className="kv">{SALES.examples.map((e) => (<div key={e.area} style={{ display: "contents" }}><dt>{e.area}</dt><dd>{e.text}</dd></div>))}</dl>
        <p className="small muted">あなたの願望に合わない例は気にしなくて構いません。</p>
      </div>
      <div className="notice info"><b>条件と限界</b>：{SALES.limits}</div>
      <SalesForm initial={stepInit(steps, "sales", access.user_id!)} done={stepDone(steps, "sales")} next={nextPath("sales")}
        prompts={{ sales: scenePrompt("sales", { vision: ctx }), understanding: scenePrompt("understanding", { vision: ctx }) }} />
    </>
  );
}
