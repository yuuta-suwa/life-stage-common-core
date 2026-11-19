import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { loadPlan, loadSteps, stepData, stepDone } from "@/features/app02/data";
import { StepHeader, nextPath } from "@/features/app02/step-header";
import { CommitmentForm } from "@/features/app02/forms/commitment-form";
import { requireStarted } from "@/features/app02/guard";

/** STEP 7 MY COMMITMENT（仕様 §04・§12-5・§14）：目標年度・成長方針・本人のコミット */
export default async function CommitmentPage() {
  await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02/commitment");
  const supabase = await createClient();
  const ws = await requireStarted(supabase);
  const [steps, { plan }] = await Promise.all([loadSteps(supabase), loadPlan(supabase)]);
  return (
    <>
      <StepHeader code="commitment" intro="目標年度、成長方針、あなた自身のコミットを決めます。決めるのはあなたです。" />
      <CommitmentForm initial={stepData(steps, "commitment")} done={stepDone(steps, "commitment")} mode={ws.mode} plan={plan} next={nextPath("commitment")} />
    </>
  );
}
