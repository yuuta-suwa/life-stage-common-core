import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Mode } from "./content";
import type { Blueprint, CellRow, Json, PlanRow, StepRow } from "./logic";

export const APP02_CONSENT_VERSION = "2026-11";

export async function loadWorkspace(supabase: SupabaseClient): Promise<{ mode: Mode } | null> {
  const { data } = await supabase.from("app02_workspace").select("mode").maybeSingle();
  return (data as { mode: Mode } | null) ?? null;
}

export async function loadSteps(supabase: SupabaseClient): Promise<StepRow[]> {
  const { data } = await supabase.from("app02_steps").select("step_code, status, data, updated_at");
  return (data ?? []) as StepRow[];
}
export const stepData = (steps: StepRow[], code: string): Json => steps.find((s) => s.step_code === code)?.data ?? {};
/** フォームの初期値：入力データ＋最後に読み込んだ時刻（競合検出用。__v は保存時に取り除く） */
export const stepInit = (steps: StepRow[], code: string, userId: string): Json => {
  const row = steps.find((s) => s.step_code === code);
  return { ...(row?.data ?? {}), __v: row?.updated_at ?? null, __u: userId };
};
export const stepDone = (steps: StepRow[], code: string) => steps.some((s) => s.step_code === code && s.status === "done");

export async function loadPlan(supabase: SupabaseClient): Promise<{ plan: PlanRow | null; cells: CellRow[] }> {
  const [{ data: plan }, { data: cells }] = await Promise.all([
    supabase.from("app02_plans").select("plan_id, start_year, version, focus, commit_year, commit_needs_recheck").maybeSingle(),
    supabase.from("app02_plan_cells").select("ability, year_index, recommended_text, recommended_level, rec_experiences, rec_criteria, edited_text, target_level, experiences, criteria, updated_at"),
  ]);
  return { plan: (plan as PlanRow | null) ?? null, cells: (cells ?? []) as CellRow[] };
}

/** APP01 から引き継いだ最新の人生設計（transfer_inbox）。RLS：本人＋APP02 権限のみ */
export async function loadBlueprint(supabase: SupabaseClient): Promise<{ bp: Blueprint | null; receivedAt: string | null; version: string | null }> {
  const { data } = await supabase
    .from("transfer_inbox")
    .select("payload, received_at, transfer_id")
    .eq("target_app", "APP02")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { bp: null, receivedAt: null, version: null };
  return { bp: data.payload as Blueprint, receivedAt: data.received_at, version: data.transfer_id };
}

export async function hasApp02Consent(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.from("consent_records").select("id").eq("consent_type", "app02_terms").is("withdrawn_at", null).limit(1);
  return Boolean(data?.length);
}

/** APP02 の完成版（growth_plan スナップショット）と APP03 への引き継ぎ状況 */
export async function loadGrowthPlanState(supabase: SupabaseClient) {
  const { data: snap } = await supabase
    .from("app_snapshots")
    .select("id, version, confirmed_at, payload")
    .eq("app_code", "APP02").eq("snapshot_type", "growth_plan")
    .is("superseded_at", null).maybeSingle();
  if (!snap) return { snapshot: null, transfer: null };
  const { data: transfer } = await supabase
    .from("data_transfers")
    .select("id, status, last_error, created_at")
    .eq("source_snapshot_id", snap.id).eq("target_app", "APP03").maybeSingle();
  return { snapshot: snap, transfer };
}
