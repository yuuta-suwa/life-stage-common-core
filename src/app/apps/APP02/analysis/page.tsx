import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { loadBlueprint, loadSteps, stepData, stepDone } from "@/features/app02/data";
import { scenePrompt, visionContext } from "@/features/app02/prompts";
import { StepHeader, nextPath } from "@/features/app02/step-header";
import { AnalysisForm } from "@/features/app02/forms/analysis-form";
import { requireStarted } from "@/features/app02/guard";

/** S05 自己実現・因果関係分析（仕様 §07）。AI を組み込まず、本人が根拠マップを作る（ChatGPT 相談は任意） */
export default async function AnalysisPage() {
  await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02/analysis");
  const supabase = await createClient();
  const ws = await requireStarted(supabase);
  const [steps, { bp }] = await Promise.all([loadSteps(supabase), loadBlueprint(supabase)]);
  const vision = stepData(steps, "vision");
  const ctx = visionContext(bp, String(vision.provisional_vision ?? ""));
  return (
    <>
      <StepHeader code="analysis" intro="願望ごとに、実現に必要な条件・能力・行動・成果のつながりを整理します。能力以外の条件やリスク、別のルートも隠さずに考えます。" />
      <div className="notice info small">この分析は STEP 1〜7 を横断して使います。現在地診断や環境比較を進めたら、ここに戻って更新してください。「必ず叶う」と断定するものではありません。</div>
      <AnalysisForm initial={stepData(steps, "analysis")} done={stepDone(steps, "analysis")} mode={ws.mode} next={nextPath("analysis")}
        desires={bp?.priority_desires ?? []}
        prompts={{ analysis: scenePrompt("analysis", { vision: ctx, detail: String(vision.why ?? "") }), hidden: scenePrompt("hidden", { vision: ctx, detail: String(vision.constraints ?? "") }) }} />
    </>
  );
}
