import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STAGES } from "./stages";
import type { Answers, StageRow } from "./logic";

/** 本人の全 LEVEL の現在の回答（RLS：本人＋APP01 権限のみ） */
export async function loadStageRows(supabase: SupabaseClient): Promise<StageRow[]> {
  const { data } = await supabase
    .from("app01_stage_answers")
    .select("stage_no, answers, status, version, needs_recheck, first_confirmed_at, updated_at, confirmed_at")
    .order("stage_no");
  return (data ?? []) as StageRow[];
}

/** LEVEL ごとの最新の確定版（確定履歴の最新）。総復習・ブループリント・共有は確定版を使う */
export async function loadLatestConfirmed(supabase: SupabaseClient): Promise<Record<number, { answers: Answers; version: number; id: string; confirmed_at: string }>> {
  const { data } = await supabase
    .from("app01_stage_history")
    .select("id, stage_no, version, answers, confirmed_at")
    .order("stage_no")
    .order("version", { ascending: false });
  const out: Record<number, { answers: Answers; version: number; id: string; confirmed_at: string }> = {};
  for (const h of data ?? []) {
    if (!out[h.stage_no]) out[h.stage_no] = { answers: h.answers as Answers, version: h.version, id: h.id, confirmed_at: h.confirmed_at };
  }
  return out;
}

export function answersByStage(confirmed: Awaited<ReturnType<typeof loadLatestConfirmed>>): Record<number, Answers> {
  const out: Record<number, Answers> = {};
  for (const s of STAGES) if (confirmed[s.no]) out[s.no] = confirmed[s.no].answers;
  return out;
}

export async function hasApp01Consent(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.from("consent_records").select("id").eq("consent_type", "app01_terms").is("withdrawn_at", null).limit(1);
  return Boolean(data?.length);
}

/** APP01 の現在の確定ブループリント（app_snapshots）と APP02 への引き継ぎ状況 */
export async function loadBlueprintState(supabase: SupabaseClient) {
  const { data: snap } = await supabase
    .from("app_snapshots")
    .select("id, version, payload, confirmed_at")
    .eq("app_code", "APP01")
    .eq("snapshot_type", "life_blueprint")
    .is("superseded_at", null)
    .maybeSingle();
  if (!snap) return { snapshot: null, transfer: null };
  const { data: transfer } = await supabase
    .from("data_transfers")
    .select("id, status, attempt_count, last_error, completed_at, source_superseded_at")
    .eq("source_snapshot_id", snap.id)
    .eq("target_app", "APP02")
    .maybeSingle();
  return { snapshot: snap, transfer };
}

/** ビジョンボード画像の短時間署名付きURL（Storage の RLS：本人＋APP01 権限のみ） */
export async function signedVisionUrls(supabase: SupabaseClient, keys: string[]): Promise<Record<string, string>> {
  if (!keys.length) return {};
  const { data } = await supabase.storage.from("user-files").createSignedUrls(keys, 60 * 10);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

/** 指定した人生設計の、APP03 への引き継ぎ状況 */
export async function loadApp03Transfer(supabase: SupabaseClient, snapshotId: string) {
  const { data } = await supabase
    .from("data_transfers")
    .select("id, status, attempt_count, last_error, completed_at")
    .eq("source_snapshot_id", snapshotId)
    .eq("target_app", "APP03")
    .maybeSingle();
  return data;
}
