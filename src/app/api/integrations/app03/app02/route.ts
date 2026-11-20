import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { errorCode } from "@/lib/errors";
import { TOKEN_PATTERN, toApp03Record } from "@/lib/integration-app03";

/**
 * APP03 → 共通基盤：本人が APP03 で「APP02：計画参照」を押したときに、APP03 のサーバーから呼ばれる（機械間）。
 * 認証：Authorization: Bearer <連携トークン>（Super Admin が発行。DB はハッシュのみ保持）。
 * 返すのは、本人が APP02 で「APP03 に引き継ぐ」に同意し成功した、最新の承認済み計画だけ（判定は DB の RPC）。
 * 本人セッション（Cookie）は使わない。送られてくる certifications（APP03 の認定）は保存しない。
 */
export const dynamic = "force-dynamic";
const MAX_BODY = 256 * 1024;
const noStore = { "Cache-Control": "no-store" };
const err = (status: number, message: string) => NextResponse.json({ error: message }, { status, headers: noStore });

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!TOKEN_PATTERN.test(token)) {
    console.warn("[integration.app03] rejected: missing or malformed token");
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
  const { data, error } = await supabase.rpc("integration_app03_growth_plan", { p_token: token, p_external_user_id: externalUserId });
  if (error) {
    const code = errorCode(error);
    console.warn(`[integration.app03] rejected: ${code}`);
    if (code === "INVALID_TOKEN") return err(401, "連携トークンが正しくありません。");
    if (code === "RATE_LIMITED") return err(429, "短時間に多くの要求がありました。しばらくしてから再試行してください。");
    return err(500, "処理できませんでした。");
  }
  const rows = ((data as { records?: unknown[] })?.records ?? []) as Parameters<typeof toApp03Record>[0][];
  return NextResponse.json({ records: rows.map(toApp03Record) }, { headers: noStore });
}
