"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePage } from "@/lib/access";
import { errorCode } from "@/lib/errors";
import { ABILITY_CODES, recommendCells, type AbilityCode, type Mode } from "@/features/app02/content";
import { buildGrowthPlan, completionChecklist, currentLevel, validStartYear, type Json, type PositionAnswer } from "@/features/app02/logic";
import { APP02_CONSENT_VERSION, loadBlueprint, loadGrowthPlanState, loadPlan, loadSteps, loadWorkspace, stepData } from "@/features/app02/data";

const BASE = "/apps/APP02";
const STEP = z.enum(["vision", "sales", "abilities", "analysis", "position", "environment", "commitment", "presentation"]);
const ABILITY = z.enum(ABILITY_CODES);
const YEAR_INDEX = z.coerce.number().int().min(1).max(10);
type R = { ok: true } | { ok: false; code: string };

async function guard() {
  const access = await requirePage({ kind: "app", code: "APP02" }, BASE);
  return { access, supabase: await createClient() };
}
const fail = (error: { message?: string; code?: string } | null): R => ({ ok: false, code: errorCode(error) });

/** S00：目的・役割分担・データ利用に同意し、モードを選んで開始 */
export async function startApp02(formData: FormData) {
  const { supabase } = await guard();
  const mode = z.enum(["DISCOVERY", "CONVICTION", "LEGACY"]).safeParse(formData.get("mode"));
  if (!mode.success || formData.get("consent") !== "on") redirect(`${BASE}?error=CONSENT_REQUIRED`);
  const c = await supabase.rpc("record_consent", { p_consent_type: "app02_terms", p_consent_version: APP02_CONSENT_VERSION, p_app_code: "APP02" });
  if (c.error) redirect(`${BASE}?error=${errorCode(c.error)}`);
  const m = await supabase.rpc("app02_set_mode", { p_mode: mode.data });
  if (m.error) redirect(`${BASE}?error=${errorCode(m.error)}`);
  redirect(`${BASE}/vision`);
}

export async function changeMode(formData: FormData) {
  const { supabase } = await guard();
  const mode = z.enum(["DISCOVERY", "CONVICTION", "LEGACY"]).safeParse(formData.get("mode"));
  if (!mode.success) redirect(`${BASE}?error=INVALID_REQUEST`);
  const { error } = await supabase.rpc("app02_set_mode", { p_mode: mode.data });
  revalidatePath(BASE, "layout");
  redirect(`${BASE}?${error ? `error=${errorCode(error)}` : "ok=mode"}`);
}

/** ステップの自動保存 */
export async function saveStep(step: string, data: Json): Promise<R> {
  const { supabase } = await guard();
  const s = STEP.safeParse(step);
  if (!s.success || typeof data !== "object" || data === null || Array.isArray(data)) return { ok: false, code: "INVALID_REQUEST" };
  const { error } = await supabase.rpc("app02_save_step", { p_step: s.data, p_data: data });
  return error ? fail(error) : { ok: true };
}

/** ステップ完了（必須項目の確認は各画面で行い、ここでは保存済みデータを完了にする） */
export async function completeStep(step: string, done = true): Promise<R> {
  const { supabase } = await guard();
  const s = STEP.safeParse(step);
  if (!s.success) return { ok: false, code: "INVALID_REQUEST" };
  const { error } = await supabase.rpc("app02_complete_step", { p_step: s.data, p_done: done });
  revalidatePath(BASE, "layout");
  return error ? fail(error) : { ok: true };
}

/* ---------- 10ヵ年計画 ---------- */
async function recommended(supabase: Awaited<ReturnType<typeof createClient>>) {
  const pos = stepData(await loadSteps(supabase), "position") as Record<string, PositionAnswer>;
  const current = Object.fromEntries(ABILITY_CODES.map((a) => [a, currentLevel(pos[a])])) as Record<AbilityCode, number>;
  return recommendCells(current).map((c) => ({
    ability: c.ability, year_index: String(c.year_index), text: c.text, level: String(c.level), experiences: c.experiences, criteria: c.criteria,
  }));
}

export async function createPlan(formData: FormData) {
  const { supabase } = await guard();
  const year = validStartYear(String(formData.get("start_year") ?? ""));
  if (!year) redirect(`${BASE}/roadmap?error=INVALID_START_YEAR`);
  const { error } = await supabase.rpc("app02_init_plan", { p_start_year: year, p_cells: await recommended(supabase), p_regenerate: false });
  redirect(`${BASE}/roadmap?${error ? `error=${errorCode(error)}` : "ok=created"}`);
}

/** 推奨の再生成（現在地診断の変更を反映。本人の編集値は保持） */
export async function regeneratePlan() {
  const { supabase } = await guard();
  const { plan } = await loadPlan(supabase);
  if (!plan) redirect(`${BASE}/roadmap?error=NOT_FOUND`);
  const { error } = await supabase.rpc("app02_init_plan", { p_start_year: plan.start_year, p_cells: await recommended(supabase), p_regenerate: true });
  redirect(`${BASE}/roadmap?${error ? `error=${errorCode(error)}` : "ok=regenerated"}`);
}

export async function changeStartYear(formData: FormData) {
  const { supabase } = await guard();
  const year = validStartYear(String(formData.get("start_year") ?? ""));
  if (!year) redirect(`${BASE}/roadmap?error=INVALID_START_YEAR`);
  const { data, error } = await supabase.rpc("app02_set_start_year", { p_start_year: year });
  if (error) redirect(`${BASE}/roadmap?error=${errorCode(error)}`);
  redirect(`${BASE}/roadmap?ok=${(data as { commit_needs_recheck?: boolean })?.commit_needs_recheck ? "start_year_recheck" : "start_year"}`);
}

export async function updateCell(input: { ability: string; year_index: number; edited_text: string; target_level: number | null; experiences: string; criteria: string; reason: string }): Promise<R> {
  const { supabase } = await guard();
  const a = ABILITY.safeParse(input.ability), y = YEAR_INDEX.safeParse(input.year_index);
  const lv = input.target_level === null ? null : z.number().int().min(0).max(5).safeParse(input.target_level);
  if (!a.success || !y.success || (lv && !lv.success)) return { ok: false, code: "INVALID_REQUEST" };
  const { error } = await supabase.rpc("app02_update_cell", {
    p_ability: a.data, p_year_index: y.data, p_edited_text: input.edited_text.slice(0, 300), p_target_level: lv ? lv.data : null,
    p_experiences: input.experiences.slice(0, 1000), p_criteria: input.criteria.slice(0, 1000), p_reason: input.reason.slice(0, 500),
  });
  revalidatePath(`${BASE}/roadmap`);
  return error ? fail(error) : { ok: true };
}

export async function resetCell(ability: string, yearIndex: number): Promise<R> {
  const { supabase } = await guard();
  const a = ABILITY.safeParse(ability), y = YEAR_INDEX.safeParse(yearIndex);
  if (!a.success || !y.success) return { ok: false, code: "INVALID_REQUEST" };
  const { error } = await supabase.rpc("app02_reset_cell", { p_ability: a.data, p_year_index: y.data });
  revalidatePath(`${BASE}/roadmap`);
  return error ? fail(error) : { ok: true };
}

export async function undoLast() {
  const { supabase } = await guard();
  const { error } = await supabase.rpc("app02_undo");
  redirect(`${BASE}/roadmap?${error ? `error=${errorCode(error)}` : "ok=undone"}`);
}

export async function setFocus(formData: FormData) {
  const { supabase } = await guard();
  const y = YEAR_INDEX.safeParse(formData.get("year_index"));
  const abilities = formData.getAll("abilities").map(String).filter((x) => ABILITY.safeParse(x).success);
  if (!y.success) redirect(`${BASE}/roadmap?error=INVALID_REQUEST`);
  const { error } = await supabase.rpc("app02_set_focus", { p_year_index: y.data, p_abilities: abilities });
  redirect(`${BASE}/roadmap?${error ? `error=${errorCode(error)}` : "ok=focus"}#focus`);
}

/** 意思決定：目標年度（暦年。10年の範囲内）＋成長方針・コミットの確定 */
export async function saveCommitYear(year: number | null, reason: string): Promise<R> {
  const { supabase } = await guard();
  const y = year === null ? null : z.number().int().min(2000).max(2100).safeParse(year);
  if (y && !y.success) return { ok: false, code: "INVALID_REQUEST" };
  const { error } = await supabase.rpc("app02_set_commit_year", { p_year: y ? y.data : null, p_reason: reason.slice(0, 500) });
  revalidatePath(BASE, "layout");
  return error ? fail(error) : { ok: true };
}

/* ---------- S18：修了確認・APP03 引継ぎ ---------- */
export async function finishApp02(formData: FormData) {
  const { supabase } = await guard();
  if (formData.get("confirm") !== "on") redirect(`${BASE}/complete?error=CONSENT_REQUIRED`);
  const [ws, steps, { plan, cells }, { bp, version }] = await Promise.all([loadWorkspace(supabase), loadSteps(supabase), loadPlan(supabase), loadBlueprint(supabase)]);
  const check = completionChecklist({ steps, plan, hasVision: Boolean(bp) || Boolean((stepData(steps, "vision") as Json).provisional_vision) });
  if (!ws || !plan || !check.ready) redirect(`${BASE}/complete?error=COMPLETION_INCOMPLETE`);
  const payload = buildGrowthPlan({
    planId: plan.plan_id, bp, visionVersion: version ?? "provisional", plan, mode: ws.mode as Mode, cells,
    position: stepData(steps, "position") as Record<string, PositionAnswer>,
    learning: { sales: stepData(steps, "sales").own_words ?? null, abilities: stepData(steps, "abilities").relation_summary ?? null },
    approvedAt: new Date().toISOString(),
  });
  const snap = await supabase.rpc("confirm_snapshot", { p_app_code: "APP02", p_snapshot_type: "growth_plan", p_schema_version: "1.0", p_payload: payload });
  if (snap.error) redirect(`${BASE}/complete?error=${errorCode(snap.error)}`);
  revalidatePath(BASE, "layout");
  redirect(`${BASE}/complete?ok=approved`);
}

export async function handoffToApp03(formData: FormData) {
  const { supabase } = await guard();
  if (formData.get("consent") !== "on") redirect(`${BASE}/complete?error=CONSENT_REQUIRED`);
  const { snapshot } = await loadGrowthPlanState(supabase);
  if (!snapshot) redirect(`${BASE}/complete?error=NOT_FOUND`);
  const { data, error } = await supabase.rpc("request_transfer", {
    p_source_snapshot_id: snapshot.id, p_target_app: "APP03", p_schema_version: "1.0", p_consent_version: APP02_CONSENT_VERSION,
  });
  if (error) redirect(`${BASE}/complete?error=${errorCode(error)}`);
  redirect(`${BASE}/complete?transfer=${(data as { status: string }).status}`);
}

export async function retryHandoff(formData: FormData) {
  const { supabase } = await guard();
  const id = z.uuid().safeParse(formData.get("transfer_id"));
  if (!id.success) redirect(`${BASE}/complete?error=NOT_FOUND`);
  const { data, error } = await supabase.rpc("retry_transfer", { p_transfer_id: id.data });
  if (error) redirect(`${BASE}/complete?error=${errorCode(error)}`);
  redirect(`${BASE}/complete?transfer=${(data as { status: string }).status}`);
}
