import { describe, it, expect } from "vitest";
import { TOKEN_PATTERN, toApp03BlueprintRecord, toApp03Record } from "@/lib/integration-app03";

const abilities = ["attraction", "recruitment", "education", "development", "operations", "management"];
const payload = {
  start_year: 2028, mode: "CONVICTION", commit_year: 2035, focus_by_year: { "1": ["attraction"] }, approved_at: "2026-11-20T00:00:00Z",
  provisional_assessment: { attraction: 2 },
  cells: abilities.flatMap((a) => Array.from({ length: 10 }, (_, i) => ({ ability: a, year_index: String(i + 1), calendar_year: 2028 + i, target: `${a}-${i + 1}`, target_level: 1, experiences: "e", criteria: "c" }))),
};

describe("APP03 records 形式への変換（APP03 docs/INTEGRATION_CONTRACT.md）", () => {
  it("安定した id（承認版ごと）・7能力のうちセールス力を除く6行×10年・重点・認定ではない旨を含む", () => {
    const r = toApp03Record({ snapshot_id: "11111111-1111-1111-1111-111111111111", version: 2, received_at: "2026-11-20T01:00:00Z", payload });
    expect(r.id).toBe("app02-growth-plan-11111111-1111-1111-1111-111111111111");
    expect(r.id.length).toBeLessThanOrEqual(200);
    expect(r.capabilities.map((c) => c.app03_capability)).toEqual(["集客力", "採用力", "教育力", "育成力", "運営力", "経営力"]);
    expect(r.capabilities.every((c) => c.years.length === 10)).toBe(true);
    expect(r.capabilities[0].years[0]).toMatchObject({ year_index: 1, calendar_year: 2028, target: "attraction-1", focus: true });
    expect(r.end_year).toBe(2037);
    expect(r.note).toContain("認定・実績ではありません");
    expect(JSON.stringify({ records: [r] }).length).toBeLessThan(1_000_000);
    expect(r).not.toHaveProperty("certifications");
  });
  it("トークン形式", () => {
    expect(TOKEN_PATTERN.test("lsc_app03_" + "a".repeat(43))).toBe(true);
    expect(TOKEN_PATTERN.test("Bearer x")).toBe(false);
    expect(TOKEN_PATTERN.test("lsc_app03_short")).toBe(false);
  });
});

describe("APP01 人生設計の APP03 用 record（必要最小限）", () => {
  it("目的・願望・目標・優先能力・最初の行動だけを渡し、家計・ギャップ分析・画像参照は渡さない", () => {
    const r = toApp03BlueprintRecord({ snapshot_id: "22222222-2222-2222-2222-222222222222", version: 1, received_at: "2026-11-20T01:00:00Z", payload: {
      life_purpose: "大切な人と豊かに生きる", priority_desires: ["家族旅行"], goals: [{ type: "long", description: "独立", deadline: "2031-12-31" }],
      priority_capabilities: ["education"], first_action: "毎朝30分学習", first_action_date: "2026-12-01",
      // @ts-expect-error 渡してはいけない項目が入力に含まれていても、出力に出ないこと
      budget_summary: { target_assets: 30000000 }, gap_analysis: { money: "差額あり" }, vision_board_asset_refs: ["uid/APP01/vision/a.png"],
    } });
    expect(r.id).toBe("app01-life-blueprint-22222222-2222-2222-2222-222222222222");
    expect(r.priority_capabilities).toEqual(["教育力"]);
    expect(r.goals[0]).toMatchObject({ type_label: "長期", description: "独立" });
    const json = JSON.stringify(r);
    expect(json).not.toContain("30000000");
    expect(json).not.toContain("差額あり");
    expect(json).not.toContain("vision/a.png");
  });
});
