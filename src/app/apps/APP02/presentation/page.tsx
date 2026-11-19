import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { presentationDraft, type Json } from "@/features/app02/logic";
import { loadBlueprint, loadPlan, loadSteps, stepData, stepDone } from "@/features/app02/data";
import { scenePrompt, visionContext } from "@/features/app02/prompts";
import { StepHeader } from "@/features/app02/step-header";
import { PresentationForm } from "@/features/app02/forms/presentation-form";
import { requireStarted } from "@/features/app02/guard";

/** S13 自己実現プレゼン（仕様 §15）：承認済み入力から下書きを作り、本人が編集・確認 */
export default async function PresentationPage() {
  await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02/presentation");
  const supabase = await createClient();
  const ws = await requireStarted(supabase);
  const [steps, { plan, cells }, { bp }] = await Promise.all([loadSteps(supabase), loadPlan(supabase), loadBlueprint(supabase)]);
  const byCode = Object.fromEntries(steps.map((s) => [s.step_code, s.data])) as Record<string, Json>;
  const drafts = presentationDraft({ bp, steps: byCode, cells, plan, mode: ws.mode });
  const ctx = visionContext(bp, String(stepData(steps, "vision").provisional_vision ?? ""));
  return (
    <>
      <StepHeader code="presentation" intro="これまでの入力から、10のセクションの下書きを作りました。自分の言葉に書き直し、内容を確認してください。" />
      <PresentationForm initial={stepData(steps, "presentation")} done={stepDone(steps, "presentation")} drafts={drafts}
        prompt={scenePrompt("presentation", { vision: ctx, detail: drafts.map((d, i) => `${i + 1}. ${d}`).join("\n") })} />
    </>
  );
}
