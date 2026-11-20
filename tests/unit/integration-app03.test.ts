import { describe, it, expect } from "vitest";
import { TOKEN_PATTERN, toApp03Record } from "@/lib/integration-app03";

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
