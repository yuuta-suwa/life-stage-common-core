import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { ABILITY_CODES, TEMPLATE, classify, recommendCells, abilityName } from "@/features/app02/content";
import {
  buildGrowthPlan, calendarYear, completionChecklist, consistencyCheck, currentLevel, presentationDraft, provisionalLevel, validStartYear,
  type CellRow, type PlanRow,
} from "@/features/app02/logic";
import { scenePrompt, visionContext } from "@/features/app02/prompts";
import { GrowthPlanV1 } from "@/lib/transfer-contract";

const toRows = (rec = recommendCells()): CellRow[] => rec.map((c) => ({
  ability: c.ability, year_index: c.year_index, recommended_text: c.text, recommended_level: c.level,
  rec_experiences: c.experiences, rec_criteria: c.criteria, edited_text: null, target_level: null, experiences: null, criteria: null,
}));
const plan = (p: Partial<PlanRow> = {}): PlanRow => ({ plan_id: randomUUID(), start_year: 2028, version: 1, focus: {}, commit_year: null, commit_needs_recheck: false, ...p });

describe("APP02 60セル推奨（仕様 §13）", () => {
  it("6能力×10年＝60セル、空欄なし。現在地 LV0 では仕様書のテンプレートと一致", () => {
    const cells = recommendCells();
    expect(cells).toHaveLength(60);
    expect(new Set(cells.map((c) => `${c.ability}:${c.year_index}`)).size).toBe(60);
    expect(cells.every((c) => c.text && c.experiences && c.criteria)).toBe(true);
    for (const a of ABILITY_CODES) expect(cells.filter((c) => c.ability === a).map((c) => c.text)).toEqual(TEMPLATE[a]);
    expect(cells.find((c) => c.ability === "attraction" && c.year_index === 1)?.text).toBe("自分で集客");
    expect(cells.find((c) => c.ability === "management" && c.year_index === 10)?.text).toBe("持続する事業を構築");
  });

  it("現在地が高い能力は到達済みの段階を前倒しする（集客 LV3 → 1年目は「他者に集客を教える」）", () => {
    const cells = recommendCells({ attraction: 3, education: 1 });
    const a = cells.filter((c) => c.ability === "attraction");
    expect(a[0].text).toBe("他者に集客を教える");
    expect(a).toHaveLength(10);
    expect(a[9].text).toBe("継続的な集客体制");
    expect(cells.find((c) => c.ability === "education" && c.year_index === 1)?.text).toBe("教えた人が実践"); // LV1＝理解済みなので「準備期間」「教育方法を理解」を飛ばす
  });

  it("段階の分類と目標レベル（目標であり認定ではない）", () => {
    expect(classify("準備期間", "education")).toEqual({ category: "prep", level: 0 });
    expect(classify("採用方法を理解", "recruitment").level).toBe(1);
    expect(classify("自分で集客", "attraction").level).toBe(2);
    expect(classify("成果を継続", "attraction").level).toBe(3);
    expect(classify("他者に集客を教える", "attraction").level).toBe(4);
    expect(classify("後継者に継承", "attraction").category).toBe("legacy");
    // 標準テンプレートは年ごとに目標レベルが下がらず、1年で2段階以上上がらない（整合性チェックに引っかからない）
    for (const a of ABILITY_CODES) {
      const lv = recommendCells().filter((c) => c.ability === a).map((c) => c.level);
      for (let i = 1; i < 10; i++) { expect(lv[i] - lv[i - 1]).toBeGreaterThanOrEqual(0); expect(lv[i] - lv[i - 1]).toBeLessThanOrEqual(1); }
    }
  });

  it("DISCOVERY では平易な名称を表示", () => {
    expect(abilityName("attraction", "DISCOVERY")).toBe("出会いをつくる力（集客力）");
    expect(abilityName("attraction", "CONVICTION")).toBe("集客力");
  });
});

describe("APP02 現在地診断（仕様 §10）", () => {
  it("はいが続いた最高段階を暫定レベルにし、途中の「いいえ」以降は数えない", () => {
    expect(provisionalLevel({ yes: [true, true, false, true] }).level).toBe(2);
    expect(provisionalLevel({}).level).toBe(0);
    expect(provisionalLevel({ yes: [true], unsure: [false, true] }).unsure).toBe(true);
  });
  it("本人の修正（override）を優先", () => {
    expect(currentLevel({ yes: [true], override: 3 })).toBe(3);
    expect(currentLevel({ yes: [true], override: null })).toBe(1);
  });
});

describe("APP02 開始年・整合性チェック（仕様 §12-5・§12-6）", () => {
  it("開始年は西暦4桁のみ。2028 → 2028〜2037", () => {
    expect(validStartYear("2028")).toBe(2028);
    expect(validStartYear("28")).toBeNull();
    expect(validStartYear("2092")).toBeNull();
    expect([1, 10].map((y) => calendarYear(2028, y))).toEqual([2028, 2037]);
  });
  it("急な飛躍・重点過剰・重点なし・条件未記載・目標年度の再確認を、理由と改善案付きで指摘する", () => {
    const rows = toRows();
    const c = rows.find((r) => r.ability === "education" && r.year_index === 3)!;
    c.target_level = 4; // 前年 LV1 → LV4
    const f = consistencyCheck({ cells: rows, plan: plan({ focus: { "1": ["attraction", "recruitment", "education"] }, commit_year: 2035, commit_needs_recheck: true }), mode: "CONVICTION", current: {}, conditionsWritten: false });
    const kinds = f.map((x) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(["jump", "focus_over", "conditions", "commit_recheck"]));
    expect(f.every((x) => x.message && x.suggestion)).toBe(true);
    expect(f.some((x) => /不可能/.test(x.message))).toBe(false);
    expect(consistencyCheck({ cells: toRows(), plan: plan(), mode: "CONVICTION", current: {}, conditionsWritten: true }).map((x) => x.kind)).toEqual(["focus_none"]);
  });
});

describe("APP02 修了・プレゼン・APP03 引継ぎ（仕様 §04・§15・§21）", () => {
  it("修了条件は全項目が揃ったときのみ ready。目標年度の再確認が残ると未達", () => {
    const steps = ["vision", "sales", "abilities", "analysis", "position", "environment", "commitment", "presentation"].map((c) => ({ step_code: c, status: "done" as const, data: {} }));
    expect(completionChecklist({ steps, plan: plan({ focus: { "1": ["attraction"] } }), hasVision: true }).ready).toBe(true);
    expect(completionChecklist({ steps, plan: plan({ focus: { "1": ["attraction"] }, commit_needs_recheck: true }), hasVision: true }).ready).toBe(false);
    expect(completionChecklist({ steps: steps.slice(1), plan: plan({ focus: { "1": ["attraction"] } }), hasVision: true }).ready).toBe(false);
  });

  it("プレゼンは10セクションの下書きを作る", () => {
    const d = presentationDraft({ bp: { blueprint_id: randomUUID(), life_purpose: "家族と挑戦を楽しむ", priority_desires: ["海の見える家"], goals: [], priority_capabilities: [], first_action: "", first_action_date: null }, steps: {}, cells: toRows(), plan: plan(), mode: "CONVICTION" });
    expect(d).toHaveLength(10);
    expect(d[0]).toContain("家族と挑戦を楽しむ");
    expect(d[7]).toContain("2028年から2037年");
  });

  it("growth_plan 1.0 の契約（60セル・認定フィールドなし）に適合し、本人編集値を優先する", () => {
    const rows = toRows();
    rows[0].edited_text = "SNS で月10人と出会う"; rows[0].target_level = 2;
    const payload = buildGrowthPlan({ planId: randomUUID(), bp: null, visionVersion: 1, plan: plan({ focus: { "1": ["attraction"] } }), mode: "CONVICTION", cells: rows, position: { attraction: { yes: [true, true] } }, learning: {}, approvedAt: new Date().toISOString() });
    expect(GrowthPlanV1.safeParse(payload).success).toBe(true);
    expect(payload.cells[0]).toMatchObject({ ability: "attraction", year_index: "1", calendar_year: 2028, target: "SNS で月10人と出会う", target_level: 2 });
    expect(payload.provisional_assessment.attraction).toBe(2);
    expect(payload).not.toHaveProperty("certifications");
    expect(() => buildGrowthPlan({ planId: randomUUID(), bp: null, visionVersion: 1, plan: plan(), mode: "CONVICTION", cells: rows.slice(1), position: {}, learning: {}, approvedAt: "" })).toThrow();
  });
});

describe("APP02 ChatGPT 相談文（仕様 §08 の代替）", () => {
  it("人生ビジョンと AI ルール（断定しない・根拠区分・最大3問・未確認）を含む", () => {
    const p = scenePrompt("analysis", { vision: visionContext(null, "海の見える家で家族と暮らす") });
    expect(p).toContain("海の見える家で家族と暮らす");
    expect(p).toContain("必ず願望が叶う」とは言わない");
    expect(p).toContain("最大3つ");
    expect(p).toContain("未確認");
    expect(scenePrompt("position", { vision: "x", ability: "education" })).toContain("教育力");
  });
});
