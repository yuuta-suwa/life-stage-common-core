"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePage } from "@/lib/access";
import { errorCode } from "@/lib/errors";
import { SHARE_ITEMS, type Mode } from "@/features/app02/content";
import { buildShareItems } from "@/features/app02/share";
import { loadBlueprint, loadPlan, loadSteps, loadWorkspace } from "@/features/app02/data";
import type { Json } from "@/features/app02/logic";

const BASE = "/apps/APP02";
const uuid = z.uuid();
const go = (path: string, error: unknown, ok: string) => redirect(`${path}${path.includes("?") ? "&" : "?"}${error ? `error=${errorCode(error)}` : `ok=${ok}`}`);

async function owner() {
  const access = await requirePage({ kind: "app", code: "APP02" }, BASE);
  return { access, supabase: await createClient() };
}
async function active(path: string) {
  const access = await requirePage({ kind: "active" }, path);
  return { access, supabase: await createClient() };
}

/* ---------- S14 共有設定（SHARED VISION）：宛先・項目・権限・同意 ---------- */
export async function shareApp02(formData: FormData) {
  const { supabase } = await owner();
  if (formData.get("consent") !== "on") redirect(`${BASE}/share?error=CONSENT_REQUIRED`);
  const recipients = formData.getAll("recipients").map(String).filter((x) => uuid.safeParse(x).success);
  const keys = formData.getAll("items").map(String).filter((k) => SHARE_ITEMS.some((i) => i.key === k));
  if (!recipients.length || !keys.length) redirect(`${BASE}/share?error=INVALID_REQUEST`);
  const [ws, steps, { plan, cells }, { bp }] = await Promise.all([loadWorkspace(supabase), loadSteps(supabase), loadPlan(supabase), loadBlueprint(supabase)]);
  const byCode = Object.fromEntries(steps.map((s) => [s.step_code, s.data])) as Record<string, Json>;
  const items = buildShareItems(keys, { bp, steps: byCode, plan, cells, mode: (ws?.mode ?? "CONVICTION") as Mode });
  const scope = { app: "APP02", items, message: String(formData.get("message") ?? "").slice(0, 1000), shared_version: plan?.version ?? null };
  for (const r of recipients) {
    const { error } = await supabase.rpc("create_share", {
      p_grantee_id: r, p_app_code: "APP02", p_resource_type: "app02_share", p_resource_id: null,
      p_scope: scope, p_permission: "comment", p_expires_at: null,
    });
    if (error) redirect(`${BASE}/share?error=${errorCode(error)}`);
  }
  revalidatePath(`${BASE}/share`);
  redirect(`${BASE}/share?ok=shared`);
}

export async function revokeShareApp02(formData: FormData) {
  const { supabase } = await owner();
  const id = uuid.safeParse(formData.get("share_id"));
  if (!id.success) redirect(`${BASE}/share?error=NOT_FOUND`);
  const { error } = await supabase.rpc("revoke_share", { p_share_id: id.data });
  go(`${BASE}/share`, error, "revoked");
}

export async function decideReview(formData: FormData) {
  const { supabase } = await owner();
  const id = uuid.safeParse(formData.get("review_id"));
  const status = z.enum(["adopted", "hold", "rejected", "open"]).safeParse(formData.get("status"));
  if (!id.success || !status.success) redirect(`${BASE}/share?error=INVALID_REQUEST`);
  const { error } = await supabase.rpc("app02_decide_review", { p_review_id: id.data, p_status: status.data });
  go(`${BASE}/share`, error, "review");
}

/* ---------- 受信者（リーダー・トレーナー・メンター）：コメント・修正案 ---------- */
export async function addReview(formData: FormData) {
  const { supabase } = await active(`${BASE}/received`);
  const id = uuid.safeParse(formData.get("share_id"));
  const kind = z.enum(["comment", "proposal"]).safeParse(formData.get("kind"));
  const body = String(formData.get("body") ?? "").trim();
  if (!id.success || !kind.success || !body) redirect(`${BASE}/received?error=INVALID_REQUEST`);
  const { error } = await supabase.rpc("app02_add_review", { p_share_id: id.data, p_kind: kind.data, p_target: String(formData.get("target") ?? "").slice(0, 80), p_body: body.slice(0, 3000) });
  go(`${BASE}/received`, error, "review");
}

/* ---------- S16 RETURN TO PURPOSE ---------- */
const REASON = z.enum(["vision", "plan", "fact", "other"]);

/** 画面の各所（AI 相談・推奨・整合性の指摘）から本人が報告する */
export async function reportPurpose(input: { source: string; reason: string; comment: string; original?: Json }): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
  const { access, supabase } = await owner();
  const reason = REASON.safeParse(input.reason);
  if (!reason.success || !input.source) return { ok: false, code: "INVALID_REQUEST" };
  const { data, error } = await supabase.rpc("app02_report_purpose", {
    p_owner: access.user_id, p_source: input.source.slice(0, 120), p_reason: reason.data,
    p_comment: input.comment.slice(0, 2000), p_original: input.original ?? {},
  });
  if (error) return { ok: false, code: errorCode(error) };
  return { ok: true, id: String((data as { report_id: string }).report_id) };
}

/** フォームからの報告（本人：新規作成画面／伴走者：受け取った共有の画面） */
export async function reportPurposeForm(formData: FormData) {
  const back = String(formData.get("back") ?? `${BASE}/purpose`);
  const safeBack = back.startsWith(`${BASE}/`) ? back : `${BASE}/purpose`;
  const { access, supabase } = await active(safeBack);
  const ownerId = uuid.safeParse(formData.get("owner_id") || access.user_id);
  const reason = REASON.safeParse(formData.get("reason"));
  const source = String(formData.get("source") ?? "").trim();
  if (!ownerId.success || !reason.success || !source) redirect(`${safeBack}?error=INVALID_REQUEST`);
  const original = String(formData.get("original") ?? "").trim();
  const { data, error } = await supabase.rpc("app02_report_purpose", {
    p_owner: ownerId.data, p_source: source.slice(0, 120), p_reason: reason.data,
    p_comment: String(formData.get("comment") ?? "").slice(0, 2000), p_original: original ? { text: original.slice(0, 6000) } : {},
  });
  if (error) redirect(`${safeBack}?error=${errorCode(error)}`);
  redirect(`${BASE}/purpose/${(data as { report_id: string }).report_id}?ok=reported`);
}

async function purposeAction(formData: FormData, fn: string, args: (id: string) => Record<string, unknown> | null, ok: string) {
  const id = uuid.safeParse(formData.get("report_id"));
  const path = id.success ? `${BASE}/purpose/${id.data}` : `${BASE}/purpose`;
  const { supabase } = await active(path);
  const a = id.success ? args(id.data) : null;
  if (!a) redirect(`${path}?error=INVALID_REQUEST`);
  const { error } = await supabase.rpc(fn, a);
  go(path, error, ok);
}

export async function assignPurpose(formData: FormData) {
  await purposeAction(formData, "app02_assign_purpose", (id) => {
    const who = uuid.safeParse(formData.get("assignee_id"));
    return who.success ? { p_report_id: id, p_assignee: who.data } : null;
  }, "assigned");
}
export async function respondPurpose(formData: FormData) {
  await purposeAction(formData, "app02_respond_purpose", (id) => {
    const st = z.enum(["reviewing", "proposed", "on_hold"]).safeParse(formData.get("status"));
    return st.success ? { p_report_id: id, p_status: st.data, p_correction: String(formData.get("correction") ?? "").slice(0, 4000), p_reason: String(formData.get("reason") ?? "").slice(0, 1000) } : null;
  }, "responded");
}
export async function reanalysisPurpose(formData: FormData) {
  await purposeAction(formData, "app02_purpose_reanalysis", (id) => {
    const t = String(formData.get("text") ?? "").trim();
    return t ? { p_report_id: id, p_text: t.slice(0, 6000) } : null;
  }, "reanalysis");
}
export async function decidePurpose(formData: FormData) {
  await purposeAction(formData, "app02_decide_purpose", (id) => {
    const d = z.enum(["adopt", "modify", "reject"]).safeParse(formData.get("decision"));
    return d.success ? { p_report_id: id, p_decision: d.data, p_note: String(formData.get("note") ?? "").slice(0, 1000) } : null;
  }, "decided");
}
export async function escalatePurpose(formData: FormData) {
  await purposeAction(formData, "app02_escalate_purpose", (id) => {
    const t = z.enum(["mentor", "admin"]).safeParse(formData.get("target"));
    const r = String(formData.get("reason") ?? "").trim();
    return t.success && r ? { p_report_id: id, p_target: t.data, p_reason: r.slice(0, 1000) } : null;
  }, "escalated");
}

/* ---------- S17 履歴・復元・全体初期化 ---------- */
export async function saveVersion(formData: FormData) {
  const { supabase } = await owner();
  const label = String(formData.get("label") ?? "").trim() || `手動保存 ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`;
  const { error } = await supabase.rpc("app02_save_version", { p_label: label.slice(0, 80), p_reason: "manual" });
  go(`${BASE}/history`, error, "version");
}
export async function restoreVersion(formData: FormData) {
  const { supabase } = await owner();
  const id = uuid.safeParse(formData.get("version_id"));
  if (!id.success) redirect(`${BASE}/history?error=NOT_FOUND`);
  const { error } = await supabase.rpc("app02_restore_version", { p_version_id: id.data });
  go(`${BASE}/history`, error, "restored");
}
export async function restoreFromHistory(formData: FormData) {
  const { supabase } = await owner();
  const id = z.coerce.number().int().positive().safeParse(formData.get("history_id"));
  const side = z.enum(["before", "after"]).safeParse(formData.get("side"));
  if (!id.success || !side.success) redirect(`${BASE}/history?error=INVALID_REQUEST`);
  const { error } = await supabase.rpc("app02_restore_from_history", { p_history_id: id.data, p_side: side.data });
  go(`${BASE}/history`, error, "cell_restored");
}
export async function resetAllPlan(formData: FormData) {
  const { supabase } = await owner();
  if (formData.get("understand") !== "on") redirect(`${BASE}/history?error=CONFIRM_MISMATCH#settings`);
  const { error } = await supabase.rpc("app02_reset_all", { p_confirm: String(formData.get("confirm_text") ?? "") });
  go(`${BASE}/history`, error, "reset");
}
