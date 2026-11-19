import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { STAGES, TEXT_CORRECTIONS } from "@/features/app01/stages";
import { FINAL_MESSAGE } from "@/features/app01/copy";
import {
  BlueprintIncompleteError, budgetSummary, buildBlueprint, consistencyReport, isOwnVisionKey, money, resumeStage,
  shareText, stageItems, stageStates, xp, type StageRow,
} from "@/features/app01/logic";
import { LifeBlueprintV1 } from "@/lib/transfer-contract";

const row = (stage_no: number, over: Partial<StageRow> = {}): StageRow => ({
  stage_no, answers: {}, status: "confirmed", version: 1, needs_recheck: false, first_confirmed_at: "2026-11-19T00:00:00Z", ...over,
});

describe("ステージ定義", () => {
  it("10 LEVEL・設問数が仕様どおり", () => {
    expect(STAGES.map((s) => s.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(STAGES.map((s) => s.questions.length)).toEqual([9, 10, 4, 6, 8, 5, 8, 6, 8, 6]);
    const keys = STAGES.flatMap((s) => s.questions.flatMap((q) => q.inputs.map((i) => `${s.no}:${i.key}`)));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("フォント欠けを補った箇所を記録している", () => {
    expect(TEXT_CORRECTIONS.length).toBeGreaterThan(5);
    expect(STAGES[0].questions[1].label).toBe("どんな体験をしたい？");
  });
  it("最終メッセージは原文どおり（変更禁止）", () => {
    const flat = FINAL_MESSAGE.flat();
    expect(flat[0]).toBe("THE FINAL DISCOVERY");
    expect(flat).toContain("二度ない人生を");
    expect(flat.at(-1)).toBe("YOUR NEXT CHAPTER BEGINS NOW.");
    expect(flat).toHaveLength(47); // 原文47行（仕様書 §9）
  });
});

describe("状態判定・XP", () => {
  it("前 LEVEL 未確定はロック、LEVEL10 は全9LEVELの最新確定が必要", () => {
    const s0 = stageStates([]);
    expect(s0[1]).toBe("available");
    expect(s0[2]).toBe("locked");
    const nine = Array.from({ length: 9 }, (_, i) => row(i + 1));
    expect(stageStates(nine)[10]).toBe("available");
    const withRecheck = nine.map((r) => (r.stage_no === 4 ? { ...r, needs_recheck: true } : r));
    const s = stageStates(withRecheck);
    expect(s[4]).toBe("recheck");
    expect(s[10]).toBe("locked");
    expect(resumeStage(s)).toBe(4);
    const draft = nine.map((r) => (r.stage_no === 2 ? { ...r, status: "draft" as const } : r));
    expect(stageStates(draft)[2]).toBe("draft");
    expect(stageStates(draft)[3]).toBe("confirmed"); // 一度確定済みなら開ける
  });
  it("XP は初回確定のみ 100XP", () => {
    expect(xp([row(1, { version: 3 }), row(2), row(3, { first_confirmed_at: null, status: "draft" })])).toEqual({ xp: 200, max: 1000, badges: [1, 2] });
  });
});

describe("未来家計簿（未入力は 0 ではない）", () => {
  it("月額・年額・必要月額・差額を計算", () => {
    const b = budgetSummary({ q1: "150000", q2: "80,000", q5: "600000", q9_amount: "30000000", q9_year: "2036", q10_income: "500000", q10_assets: "5000000" });
    expect(b.monthly_total).toBe(230000);
    expect(b.annual_items_total).toBe(600000);
    expect(b.annual_total).toBe(230000 * 12 + 600000);
    expect(b.required_monthly).toBe(280000);
    expect(b.monthly_gap).toBe(220000);
    expect(b.assets_gap).toBe(25000000);
    expect(b.unentered).toEqual(["q3", "q4", "q8", "q6", "q7"]);
  });
  it("何も入力しなければ合計は「未入力」（null）", () => {
    const b = budgetSummary({});
    expect(b.monthly_total).toBeNull();
    expect(b.annual_total).toBeNull();
    expect(money("")).toBeNull();
    expect(money("0")).toBe(0);
    expect(money("-5")).toBeNull();
  });
});

describe("ブループリント（life_blueprint 1.0）", () => {
  const confirmed = {
    1: { q9: "家族旅行\n独立\n学び\n" },
    2: { q1: "150000", q9_amount: "30000000", q9_year: "2036" },
    3: { images: [{ key: "u/APP01/vision/abcdefgh.png", desire: "家族旅行" }] },
    4: { q6: "大切な人と豊かに生きる" },
    5: { q1: "貯蓄100万円", q8: "時間" },
    7: { q7: ["education"] },
    9: { q1: "独立", q4_long: "2031-12-31", q2: "副業開始", q7: "毎朝30分学習", q8: "2026-12-01", q6: ["development", "unknown"] },
  };
  it("APP02 引き継ぎ契約のスキーマを満たす", () => {
    const bp = buildBlueprint(confirmed, randomUUID());
    expect(LifeBlueprintV1.safeParse(bp).success).toBe(true);
    expect(bp.priority_desires).toEqual(["家族旅行", "独立", "学び"]);
    expect(bp.goals).toEqual([{ type: "long", description: "独立", deadline: "2031-12-31" }, { type: "mid", description: "副業開始", deadline: null }]);
    expect(bp.priority_capabilities).toEqual(["development"]); // 不明なコードは除外
    expect(bp.vision_board_asset_refs).toEqual(["u/APP01/vision/abcdefgh.png"]);
    expect(bp.budget_summary.monthly_total).toBe(150000);
  });
  it("人生の目的・目標が無ければ作成しない", () => {
    expect(() => buildBlueprint({ 9: { q1: "x" } }, randomUUID())).toThrow(BlueprintIncompleteError);
  });
  it("整合性レポートが未確認・期限のずれを示す", () => {
    const r = consistencyReport({ ...confirmed, 9: { ...confirmed[9], q4_long: "2030-01-01", q2: "副業開始" } });
    expect(r.some((x) => x.message.includes("資産目標の時期"))).toBe(true);
    expect(r.some((x) => x.message.includes("中期目標の期限"))).toBe(true);
  });
});

describe("共有・画像", () => {
  it("文章共有テンプレートに本人が選んだ項目だけが入る", () => {
    const items = stageItems(STAGES[0], { q1: "家", q5: "家族と旅" }).filter((i) => !i.sensitive);
    const text = shareText({ displayName: "山田", recipientRole: "メンター", recipientName: "佐藤", stageNo: 1, state: "confirmed", sharedAt: new Date(), items });
    expect(text).toContain("【LIFE STAGE｜APP01 進捗共有】");
    expect(text).toContain("何を手に入れたい？：家");
    expect(text).not.toContain("家族と旅"); // 人間関係の詳細は初期 OFF
    expect(text).toContain("■ 次に取り組むこと\n未設定");
  });
  it("ビジョンボード画像のパスは本人の APP01 フォルダのみ", () => {
    const uid = randomUUID();
    expect(isOwnVisionKey(`${uid}/APP01/vision/abcdefgh12.png`, uid)).toBe(true);
    expect(isOwnVisionKey(`${randomUUID()}/APP01/vision/abcdefgh12.png`, uid)).toBe(false);
    expect(isOwnVisionKey(`${uid}/APP01/vision/../../x.png`, uid)).toBe(false);
    expect(isOwnVisionKey(`${uid}/APP02/vision/abcdefgh12.png`, uid)).toBe(false);
  });
});

describe("isBlueprintStale（仕様 §14：更新後は BLUEPRINT も要再確認）", () => {
  it("完成後に LEVEL10 が確定のままなら最新", async () => {
    const { isBlueprintStale } = await import("@/features/app01/logic");
    const all = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, "confirmed"])) as Record<number, "confirmed">;
    expect(isBlueprintStale(all, true)).toBe(false);
    expect(isBlueprintStale({ ...all, 10: "recheck" }, true)).toBe(true);
    expect(isBlueprintStale({ ...all, 10: "draft" }, true)).toBe(true);
    expect(isBlueprintStale({ ...all, 10: "recheck" }, false)).toBe(false);
  });
});
