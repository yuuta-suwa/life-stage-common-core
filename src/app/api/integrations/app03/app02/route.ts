import type { NextRequest } from "next/server";
import { toApp03Record } from "@/lib/integration-app03";
import { handleApp03Fetch } from "@/lib/integration-app03-handler";

/**
 * APP03 の「APP02：計画参照」から呼ばれる（APP03_APP02_ENDPOINT）。
 * 本人が APP02 で「APP03 に引き継ぐ」に同意した、最新の承認済み計画だけを返す。certifications は保存しない。
 */
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  return handleApp03Fetch(request, "integration_app03_growth_plan", (row) => toApp03Record(row), "app02");
}
