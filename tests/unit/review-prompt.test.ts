import { describe, expect, it } from "vitest";
import { buildReviewPrompt, EMPTY_TEXT, HIDDEN_TEXT, valueToText } from "@/lib/review-prompt";
import { getStage } from "@/features/app01/stages";
import { stageHasSensitive, stageReviewItems, stageReviewPrompt } from "@/features/app01/review";
import { stepReviewPrompt } from "@/features/app02/ui";

describe("ChatGPT 分析・評価・改善提案の相談文", () => {
  it("分析・評価・改善提案・次の一歩とルールを含み、入力を番号付きで並べる", () => {
    const p = buildReviewPrompt({ app: "APP01", title: "LEVEL 01 テスト", purpose: "目的", items: [{ label: "問1", value: "答え1" }, { label: "問2", value: "" }] });
    expect(p).toContain("「APP01｜LEVEL 01 テスト」");
    expect(p).toContain("（このステップの目的：目的）");
    expect(p).toContain("1. 問1\n答え1");
    expect(p).toContain(`2. 問2\n${EMPTY_TEXT}`);
    for (const w of ["① 分析", "② 評価", "③ 改善提案", "④ 次の一歩", "決めるのは私です"]) expect(p).toContain(w);
  });

  it("機微な項目は既定で非表示。本人が選んだときだけ含める", () => {
    const items = [{ label: "家計", value: "月30万円", sensitive: true }];
    expect(buildReviewPrompt({ app: "A", title: "T", items })).toContain(HIDDEN_TEXT);
    expect(buildReviewPrompt({ app: "A", title: "T", items })).not.toContain("月30万円");
    expect(buildReviewPrompt({ app: "A", title: "T", items, includeSensitive: true })).toContain("月30万円");
  });

  it("APP01：各 LEVEL の設問・入力形式（金額・年・はい/いいえ・選択・複数行）を文章にし、回答データは変更しない", () => {
    const l2 = getStage(2)!;
    const a2 = { q1: "150000", q9_amount: "30000000", q9_year: "2036" };
    const before = JSON.stringify(a2);
    const p2 = stageReviewPrompt(l2, a2, true);
    expect(p2).toContain("150,000円");
    expect(p2).toContain("資産額：30,000,000円");
    expect(p2).toContain("時期（西暦）：2036年");
    expect(JSON.stringify(a2)).toBe(before);
    expect(stageHasSensitive(l2)).toBe(true);
    expect(stageReviewPrompt(l2, a2)).not.toContain("150,000円");

    const l1 = getStage(1)!;
    const p1 = stageReviewPrompt(l1, { q1: "海の見える家", q9: ["家族と暮らす", "事業をつくる"] });
    expect(p1).toContain("何を手に入れたい？\n海の見える家");
    expect(p1).toContain("家族と暮らす\n事業をつくる");
    expect(p1).toContain("LEVEL 01 心から望む願望を発見する");

    const l7 = getStage(7)!;
    expect(stageReviewPrompt(l7, { q7: ["attraction", "management"] })).toContain("集客力、経営力");
    const l10 = getStage(10)!;
    expect(stageReviewPrompt(l10, { q1: "yes", q2: "no" })).toContain("はい");

    const l3 = getStage(3)!;
    const items = stageReviewItems(l3, { images: [{ key: "u/APP01/vision/a.png", desire: "海の見える家", when: "2036年", who: "家族と朝食", feeling: "穏やか" }] });
    expect(items[0].value).toContain("願望：海の見える家");
    expect(JSON.stringify(items)).not.toContain("u/APP01/vision/a.png");
  });

  it("APP02：ステップの保存データを項目名つきで文章にし、ChatGPT メモ（ai）と内部項目は含めない", () => {
    const data = { why: "家族のため", constraints: "", confirmed: true, ai: { text: "前回の提案" }, __v: "x", attraction: { yes: [true, false], evidence: "月10件の紹介" } };
    const before = JSON.stringify(data);
    const p = stepReviewPrompt("vision", data);
    expect(p).toContain("STEP 1 人生ビジョン確認");
    expect(p).toContain("実現したい理由\n家族のため");
    expect(p).toContain(`制約や気がかり\n${EMPTY_TEXT}`);
    expect(p).toContain("根拠となる経験：月10件の紹介");
    expect(p).not.toContain("前回の提案");
    expect(p).not.toContain("__v");
    expect(JSON.stringify(data)).toBe(before);
  });

  it("valueToText：配列・入れ子・真偽値", () => {
    expect(valueToText(["a", "b"])).toBe("・a\n・b");
    expect(valueToText({ x: "1", y: false }, { x: "エックス" })).toBe("エックス：1\ny：いいえ");
  });
});
