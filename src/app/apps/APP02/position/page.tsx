import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { ABILITY_CODES, type AbilityCode } from "@/features/app02/content";
import { loadBlueprint, loadSteps, stepData, stepDone, stepInit } from "@/features/app02/data";
import { scenePrompt, visionContext } from "@/features/app02/prompts";
import { StepHeader, nextPath } from "@/features/app02/step-header";
import { PositionForm } from "@/features/app02/forms/position-form";
import { requireStarted } from "@/features/app02/guard";

/** S06 現在地診断（仕様 §10）。正式な認定ではなく暫定。実績の検証は APP03 */
export default async function PositionPage() {
  const access = await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02/position");
  const supabase = await createClient();
  const ws = await requireStarted(supabase);
  const [steps, { bp }] = await Promise.all([loadSteps(supabase), loadBlueprint(supabase)]);
  const ctx = visionContext(bp, String(stepData(steps, "vision").provisional_vision ?? ""));
  const prompts = Object.fromEntries(ABILITY_CODES.map((a) => [a, scenePrompt("position", { vision: ctx, ability: a })])) as Record<AbilityCode, string>;
  return (
    <>
      <StepHeader code="position" intro="能力ごとに、具体的な経験・頻度・結果・再現性を答えると、暫定のレベルとその理由が表示されます。判断できない部分は「分からない」で構いません。" />
      <div className="notice info small">ここでのレベルは<b>暫定</b>で、正式な認定ではありません。実績の検証は APP03 で行います。10ヵ年計画の推奨は、この結果から作られます。</div>
      <PositionForm initial={stepInit(steps, "position", access.user_id!)} done={stepDone(steps, "position")} mode={ws.mode} prompts={prompts} next={nextPath("position")} />
    </>
  );
}
