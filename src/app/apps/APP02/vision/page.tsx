import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/components/ui";
import { GOAL_LABEL, type Json } from "@/features/app02/logic";
import { loadBlueprint, loadSteps, stepData, stepDone, stepInit } from "@/features/app02/data";
import { scenePrompt, visionContext } from "@/features/app02/prompts";
import { StepHeader, nextPath } from "@/features/app02/step-header";
import { VisionForm } from "@/features/app02/forms/vision-form";
import { requireStarted } from "@/features/app02/guard";

/** S02 人生ビジョン確認：APP01 の確定版を参照（元データは変更しない）。未連携なら暫定入力 */
export default async function VisionPage() {
  const access = await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02/vision");
  const supabase = await createClient();
  await requireStarted(supabase);
  const [steps, { bp, receivedAt }] = await Promise.all([loadSteps(supabase), loadBlueprint(supabase)]);
  const data = stepData(steps, "vision") as Json;
  const row = steps.find((s) => s.step_code === "vision");
  const confirmedAt = row?.status === "done" ? row.updated_at ?? null : null;
  const changed = Boolean(bp && receivedAt && confirmedAt && receivedAt > confirmedAt);
  const ctx = visionContext(bp, String(data.provisional_vision ?? ""));
  return (
    <>
      <StepHeader code="vision" intro="人生の願望、理由、優先順位、期限を確認します。これが APP02 のすべての判断の軸になります。" />
      {changed ? <div className="notice warn">APP01 の人生設計が更新されました（{formatDateTime(receivedAt)}）。内容を確認し、もう一度完了してください。</div> : null}
      {bp ? (
        <div className="card">
          <h2 className="section-title">FROM APP01<span>｜あなたが確定した人生設計（{formatDateTime(receivedAt)} 受信）</span></h2>
          <dl className="kv">
            <dt>人生の目的</dt><dd>{bp.life_purpose}</dd>
            <dt>優先したい願望</dt><dd>{bp.priority_desires.join("／") || "未設定"}</dd>
            <dt>目標と期限</dt><dd>{bp.goals.length ? bp.goals.map((g) => `${GOAL_LABEL[g.type]}：${g.description}${g.deadline ? `（${g.deadline}）` : ""}`).join("／") : "未設定"}</dd>
            <dt>最初の行動</dt><dd>{bp.first_action || "未設定"}{bp.first_action_date ? `（${bp.first_action_date}）` : ""}</dd>
          </dl>
          <p className="small muted">APP01 の内容を変えたい場合は APP01 で編集し、人生設計を再完成して引き継いでください。APP02 から APP01 のデータは変更しません。</p>
        </div>
      ) : (
        <div className="notice info">APP01 の人生設計がまだ届いていません。APP01 を完成させて「APP02 へ進む」で引き継ぐか、下に暫定の人生ビジョンを入力して進めてください。</div>
      )}
      <VisionForm initial={stepInit(steps, "vision", access.user_id!)} done={stepDone(steps, "vision")} hasBlueprint={Boolean(bp)} desires={bp?.priority_desires ?? []} next={nextPath("vision")}
        prompts={{ vision: scenePrompt("vision", { vision: ctx }), priority: scenePrompt("priority", { vision: ctx }) }} />
    </>
  );
}
