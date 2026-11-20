import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { errorCode } from "@/lib/errors";
import { TOKEN_PATTERN } from "@/lib/integration-app03";

/**
 * APP03 → 共通基盤の機械間取得（APP03 docs/INTEGRATION_CONTRACT.md の POST {externalUserId} → {records}）。
 * 認証は連携トークン（Bearer）。本人セッション（Cookie）は使わない。判定・同意確認・監査は DB の RPC。
 */
const MAX_BODY = 256 * 1024;
const noStore = { "Cache-Control": "no-store" };
const err = (status: number, message: string) => NextResponse.json({ error: message }, { status, headers: noStore });

type Row = { snapshot_id: string; version: number; received_at: string; payload: never };

export async function handleApp03Fetch(request: NextRequest, rpc: string, toRecord: (row: Row) => unknown, tag: string) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!TOKEN_PATTERN.test(token)) {
    console.warn(`[integration.app03.${tag}] rejected: missing or malformed token`);
    return err(401, "連携トークンが正しくありません。");
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return err(415, "JSON で送信してください。");
  const raw = await request.text();
  if (raw.length > MAX_BODY) return err(413, "送信データが大きすぎます。");
  let body: { externalUserId?: unknown };
  try { body = JSON.parse(raw); } catch { return err(400, "JSON の形式が正しくありません。"); }
  const externalUserId = typeof body.externalUserId === "string" ? body.externalUserId.trim().slice(0, 64) : "";
  if (!externalUserId) return err(400, "externalUserId が必要です。");

  const { url, key } = publicEnv();
  const supabase = createSupabase(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc(rpc, { p_token: token, p_external_user_id: externalUserId });
  if (error) {
    const code = errorCode(error);
    console.warn(`[integration.app03.${tag}] rejected: ${code}`);
    if (code === "INVALID_TOKEN") return err(401, "連携トークンが正しくありません。");
    if (code === "RATE_LIMITED") return err(429, "短時間に多くの要求がありました。しばらくしてから再試行してください。");
    return err(500, "処理できませんでした。");
  }
  const rows = ((data as { records?: Row[] })?.records ?? []) as Row[];
  return NextResponse.json({ records: rows.map(toRecord) }, { headers: noStore });
}
