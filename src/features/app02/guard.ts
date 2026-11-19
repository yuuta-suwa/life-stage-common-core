import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasApp02Consent, loadWorkspace } from "./data";

/** 初回案内（同意・モード選択）を終えていなければ HOME へ */
export async function requireStarted(supabase: SupabaseClient) {
  const [ws, consent] = await Promise.all([loadWorkspace(supabase), hasApp02Consent(supabase)]);
  if (!ws || !consent) redirect("/apps/APP02");
  return ws;
}
