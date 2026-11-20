import type { NextRequest } from "next/server";
import { toApp03BlueprintRecord } from "@/lib/integration-app03";
import { handleApp03Fetch } from "@/lib/integration-app03-handler";

/**
 * APP03 の「APP01：理想を参照」から呼ばれる（APP03_APP01_ENDPOINT）。
 * 本人が APP01 で「APP03 に渡す」に同意した、最新の人生設計を、必要最小限の項目だけで返す。
 */
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  return handleApp03Fetch(request, "integration_app03_life_blueprint", (row) => toApp03BlueprintRecord(row), "app01");
}
