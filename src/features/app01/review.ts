/**
 * APP01 各 LEVEL の「ChatGPT で分析・評価・改善提案」相談文（表示中の入力から作る。保存・変更はしない）。
 */
import { buildReviewPrompt, type ReviewItem } from "@/lib/review-prompt";
import { CAPABILITIES, type StageDef, type StageInput } from "./stages";
import { visionImages, type Answers } from "./logic";

const capLabel = (v: string) => CAPABILITIES.find((c) => c.value === v)?.label ?? v;

function inputText(input: StageInput, value: unknown): string {
  if (value === undefined || value === null) return "";
  switch (input.kind) {
    case "money": {
      const n = String(value).replace(/[^\d]/g, "");
      return n ? `${Number(n).toLocaleString("ja-JP")}円` : "";
    }
    case "year":
      return String(value).trim() ? `${String(value).trim()}年` : "";
    case "yesno":
      return value === "yes" ? "はい" : value === "no" ? "いいえ" : "";
    case "multi":
      return Array.isArray(value) ? (value as string[]).map(capLabel).join("、") : "";
    case "lines":
      return Array.isArray(value) ? (value as string[]).filter(Boolean).join("\n") : String(value);
    default:
      return typeof value === "string" ? value : "";
  }
}

export function stageReviewItems(stage: StageDef, answers: Answers): ReviewItem[] {
  if (stage.no === 3) {
    const imgs = visionImages(answers);
    if (!imgs.length) return [{ label: "ビジョンボード", value: "" }];
    return imgs.map((img, i) => ({
      label: `画像${i + 1}（どの願望／時期／誰と何を／どんな気持ち）`,
      value: [img.desire && `願望：${img.desire}`, img.when && `時期：${img.when}`, img.who && `誰と何を：${img.who}`, img.feeling && `気持ち：${img.feeling}`, img.caption && `メモ：${img.caption}`]
        .filter(Boolean).join("\n"),
    }));
  }
  return stage.questions.map((q) => {
    const parts = q.inputs.map((input) => {
      const t = inputText(input, answers[input.key]);
      return input.label && t ? `${input.label}：${t}` : t;
    }).filter(Boolean);
    return {
      label: q.optional ? `${q.label}（任意）` : q.label,
      value: parts.join("\n"),
      sensitive: q.inputs.some((i) => i.sensitive),
    };
  });
}

export function stageReviewPrompt(stage: StageDef, answers: Answers, includeSensitive = false): string {
  return buildReviewPrompt({
    app: "APP01 THE FINAL DISCOVERY",
    title: `LEVEL ${String(stage.no).padStart(2, "0")} ${stage.title}`,
    purpose: stage.intro,
    items: stageReviewItems(stage, answers),
    includeSensitive,
  });
}

export const stageHasSensitive = (stage: StageDef) => stage.questions.some((q) => q.inputs.some((i) => i.sensitive));
