import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { ENV_CRITERIA } from "@/features/app02/content";
import { loadBlueprint, loadSteps, stepData, stepDone } from "@/features/app02/data";
import { scenePrompt, visionContext } from "@/features/app02/prompts";
import { StepHeader, nextPath } from "@/features/app02/step-header";
import { EnvironmentForm } from "@/features/app02/forms/environment-form";
import { requireStarted } from "@/features/app02/guard";

/** S07 成長環境比較（仕様 §11）。比較材料を提供し、選択は本人が行う */
export default async function EnvironmentPage() {
  await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02/environment");
  const supabase = await createClient();
  await requireStarted(supabase);
  const [steps, { bp }] = await Promise.all([loadSteps(supabase), loadBlueprint(supabase)]);
  const ctx = visionContext(bp, String(stepData(steps, "vision").provisional_vision ?? ""));
  const env = stepData(steps, "environment");
  return (
    <>
      <StepHeader code="environment" intro={`教育体系・実践機会・費用・時間負担など ${ENV_CRITERIA.length} の比較軸で、現在の環境・LEI STYLE・その他の選択肢を同じ基準で比べます。`} />
      <EnvironmentForm initial={env} done={stepDone(steps, "environment")} next={nextPath("environment")}
        prompts={{ environment: scenePrompt("environment", { vision: ctx }), compare: scenePrompt("compare", { vision: ctx, detail: JSON.stringify(env.grid ?? {}).slice(0, 2500) }) }} />
    </>
  );
}
