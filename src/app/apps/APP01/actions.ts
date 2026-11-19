"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePage } from "@/lib/access";
import { errorCode } from "@/lib/errors";
import { getStage } from "@/features/app01/stages";
import { APP01_CONSENT_VERSION } from "@/features/app01/copy";
import { BlueprintIncompleteError, buildBlueprint, isBlueprintStale, isOwnVisionKey, stageItems, stageStates, visionImages, type Answers } from "@/features/app01/logic";
import { answersByStage, loadLatestConfirmed, loadBlueprintState, loadStageRows } from "@/features/app01/data";

const BASE = "/apps/APP01";
const stageNo = z.coerce.number().int().min(1).max(10);

async function guard() {
  const access = await requirePage({ kind: "app", code: "APP01" }, BASE);
  return { access, supabase: await createClient() };
}

/** 利用目的・データ利用・共有は任意 への同意（オンボーディング） */
export async function startQuest() {
  const { supabase } = await guard();
  const { error } = await supabase.rpc("record_consent", { p_consent_type: "app01_terms", p_consent_version: APP01_CONSENT_VERSION, p_app_code: "APP01" });
  if (error) redirect(`${BASE}?error=${errorCode(error)}`);
  redirect(`${BASE}/level/1`);
}

export type SaveResult = { ok: true; updatedAt?: string } | { ok: false; code: string };

/** 自動保存（入力のたびに呼ばれる） */
export async function saveDraft(stage: number, answers: Answers): Promise<SaveResult> {
  const { access, supabase } = await guard();
  const n = stageNo.safeParse(stage);
  if (!n.success || typeof answers !== "object" || answers === null || Array.isArray(answers)) return { ok: false, code: "INVALID_REQUEST" };
  if (n.data === 3) {
    // 画像は本人の APP01 フォルダ内のファイルだけを参照できる
    const bad = visionImages(answers).some((i) => !isOwnVisionKey(i.key, access.user_id!));
    if (bad) return { ok: false, code: "INVALID_REQUEST" };
  }
  const { data, error } = await supabase.rpc("app01_save_draft", { p_stage: n.data, p_answers: answers });
  if (error) return { ok: false, code: errorCode(error) };
  return { ok: true, updatedAt: (data as { updated_at?: string })?.updated_at };
}

/** LEVEL の確定。LEVEL10 の確定時は完成版スナップショット（MY LIFE BLUEPRINT）を作成する */
export async function confirmStage(stage: number): Promise<{ ok: true; redirectTo: string } | { ok: false; code: string; missing?: string[] }> {
  const { supabase } = await guard();
  const n = stageNo.safeParse(stage);
  if (!n.success) return { ok: false, code: "INVALID_STAGE" };
  if (n.data === 10) {
    // 人生設計に必須の項目（LEVEL04 人生の目的・LEVEL09 目標）が欠けていれば、LEVEL10 を確定する前に止める
    // （確定だけ済んで MY LIFE BLUEPRINT が作られない中途半端な状態を防ぐ）
    try {
      buildBlueprint(answersByStage(await loadLatestConfirmed(supabase)), randomUUID());
    } catch (e) {
      if (e instanceof BlueprintIncompleteError) return { ok: false, code: "BLUEPRINT_INCOMPLETE", missing: e.missing };
      throw e;
    }
  }
  const { error } = await supabase.rpc("app01_confirm_stage", { p_stage: n.data });
  if (error) return { ok: false, code: errorCode(error) };
  revalidatePath(BASE, "layout");
  if (n.data < 10) return { ok: true, redirectTo: `${BASE}/level/${n.data}?cleared=1` };
  const made = await createBlueprintSnapshot(supabase);
  if (!made.ok) return made;
  return { ok: true, redirectTo: `${BASE}/level/10?cleared=1` };
}

async function createBlueprintSnapshot(supabase: Awaited<ReturnType<typeof createClient>>) {
  const confirmed = answersByStage(await loadLatestConfirmed(supabase));
  try {
    const payload = buildBlueprint(confirmed, randomUUID());
    const { error } = await supabase.rpc("confirm_snapshot", {
      p_app_code: "APP01", p_snapshot_type: "life_blueprint", p_schema_version: "1.0", p_payload: payload,
    });
    if (error) return { ok: false as const, code: errorCode(error) };
    return { ok: true as const };
  } catch (e) {
    if (e instanceof BlueprintIncompleteError) return { ok: false as const, code: "BLUEPRINT_INCOMPLETE", missing: e.missing };
    throw e;
  }
}

/** 本人の確認後に APP02 へ引き継ぐ（同一スナップショットの再送は冪等） */
export async function handoffToApp02(formData: FormData) {
  const { supabase } = await guard();
  if (formData.get("consent") !== "on") redirect(`${BASE}/final?error=CONSENT_REQUIRED`);
  const { snapshot } = await loadBlueprintState(supabase);
  if (!snapshot) redirect(`${BASE}/final?error=NOT_FOUND`);
  // 完成後に回答が更新され、ブループリントが最新でない間は引き継がない（古い人生設計を APP02 に渡さない）
  if (isBlueprintStale(stageStates(await loadStageRows(supabase)), true)) redirect(`${BASE}/final?error=BLUEPRINT_STALE`);
  const { data, error } = await supabase.rpc("request_transfer", {
    p_source_snapshot_id: snapshot.id, p_target_app: "APP02", p_schema_version: "1.0", p_consent_version: APP01_CONSENT_VERSION,
  });
  if (error) redirect(`${BASE}/final?error=${errorCode(error)}`);
  const r = data as { status: string; error?: string };
  redirect(`${BASE}/final?transfer=${r.status}`);
}

export async function retryHandoff(formData: FormData) {
  const { supabase } = await guard();
  const id = z.uuid().safeParse(formData.get("transfer_id"));
  if (!id.success) redirect(`${BASE}/final?error=NOT_FOUND`);
  if (isBlueprintStale(stageStates(await loadStageRows(supabase)), true)) redirect(`${BASE}/final?error=BLUEPRINT_STALE`);
  const { data, error } = await supabase.rpc("retry_transfer", { p_transfer_id: id.data });
  if (error) redirect(`${BASE}/final?error=${errorCode(error)}`);
  redirect(`${BASE}/final?transfer=${(data as { status: string }).status}`);
}

/**
 * アプリ内共有。共有内容はサーバー側で本人の最新確定版から組み立て、
 * 本人が選んだ項目だけを data_shares.scope に固定して保存する（受信者は回答テーブルを読めない）。
 */
export async function shareStage(formData: FormData): Promise<{ ok: boolean; code?: string; count?: number }> {
  const { supabase } = await guard();
  const n = stageNo.safeParse(formData.get("stage"));
  const recipients = formData.getAll("recipients").map(String).filter((x) => z.uuid().safeParse(x).success);
  const keys = new Set(formData.getAll("items").map(String));
  if (!n.success || !recipients.length) return { ok: false, code: "SHARE_TARGET_NOT_ALLOWED" };
  const stage = getStage(n.data)!;
  const latest = (await loadLatestConfirmed(supabase))[n.data];
  if (!latest) return { ok: false, code: "NOT_FOUND" };
  const items = stageItems(stage, latest.answers).filter((i) => keys.has(i.key)).map(({ key, label, value }) => ({ key, label, value }));
  if (!items.length) return { ok: false, code: "INVALID_REQUEST" };
  const scope = {
    stage: n.data, title: stage.title, version: latest.version, state: "confirmed", items,
    comment: String(formData.get("comment") ?? "").slice(0, 1000),
    next_action: String(formData.get("next_action") ?? "").slice(0, 500),
    include_ai: false,
  };
  for (const r of recipients) {
    const { error } = await supabase.rpc("create_share", {
      p_grantee_id: r, p_app_code: "APP01", p_resource_type: "app01_stage", p_resource_id: latest.id,
      p_scope: scope, p_permission: "comment", p_expires_at: null,
    });
    if (error) return { ok: false, code: errorCode(error) };
  }
  revalidatePath(`${BASE}/shares`);
  return { ok: true, count: recipients.length };
}

export async function revokeShare(formData: FormData) {
  const { supabase } = await guard();
  const id = z.uuid().safeParse(formData.get("share_id"));
  if (!id.success) redirect(`${BASE}/shares?error=NOT_FOUND`);
  const { error } = await supabase.rpc("revoke_share", { p_share_id: id.data });
  redirect(`${BASE}/shares?${error ? `error=${errorCode(error)}` : "ok=revoked"}`);
}

/** 共有先（メンター等）からのフィードバック */
export async function sendFeedback(formData: FormData) {
  await requirePage({ kind: "active" }, `${BASE}/received`);
  const supabase = await createClient();
  const id = z.uuid().safeParse(formData.get("share_id"));
  const comment = String(formData.get("comment") ?? "").trim();
  if (!id.success || !comment) redirect(`${BASE}/received?error=INVALID_REQUEST`);
  const { error } = await supabase.rpc("app01_add_feedback", { p_share_id: id.data, p_comment: comment.slice(0, 2000) });
  redirect(`${BASE}/received?${error ? `error=${errorCode(error)}` : "ok=feedback"}`);
}
