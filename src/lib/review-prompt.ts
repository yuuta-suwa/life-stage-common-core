/**
 * 「ChatGPT で分析・評価・改善提案」用の相談文（APP01 各 LEVEL・APP02 各 STEP 共通）。
 *
 *  - 本人がコピーして自分の ChatGPT に貼り付ける。アプリから外部 AI へは送信しない（D-35・D-43・D-57）。
 *  - 画面に表示中の入力から文章を作るだけで、回答データの保存・変更は一切しない（純粋関数）。
 *  - 家計・資産・人間関係など機微な項目は、本人が明示的に含めない限り「非表示」にする（APP01 仕様 §7-1 の共有初期値 OFF と同じ考え方）。
 */

export type ReviewItem = { label: string; value: string; sensitive?: boolean };

export const HIDDEN_TEXT = "（非表示：家計・人間関係などの機微な内容のため省略）";
export const EMPTY_TEXT = "（未入力）";
const MAX_VALUE = 1200;
const MAX_TOTAL = 9000;

const clean = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

export function buildReviewPrompt(opts: {
  app: string;
  title: string;
  purpose?: string;
  items: ReviewItem[];
  includeSensitive?: boolean;
}): string {
  const lines: string[] = [];
  opts.items.forEach((it, i) => {
    const raw = it.sensitive && !opts.includeSensitive ? HIDDEN_TEXT : clean(it.value) || EMPTY_TEXT;
    const value = raw.length > MAX_VALUE ? `${raw.slice(0, MAX_VALUE)}…（以下省略）` : raw;
    lines.push(`${i + 1}. ${clean(it.label)}\n${value}`);
  });
  let body = lines.join("\n\n");
  if (body.length > MAX_TOTAL) body = `${body.slice(0, MAX_TOTAL)}…（以下省略）`;

  return [
    "あなたは、私の人生設計と自己実現を支援するコーチです。",
    `以下は、私が「${opts.app}｜${opts.title}」で書いた内容です。`,
    opts.purpose ? `（このステップの目的：${clean(opts.purpose)}）` : "",
    "",
    "■ 私の入力",
    body || EMPTY_TEXT,
    "",
    "【お願い】",
    "① 分析：私の答えから読み取れること（大切にしている価値観・強み・傾向）を3〜5点で整理してください。",
    "② 評価：「具体性」「一貫性（答え同士のつながり）」「実行しやすさ」の3つの観点で、それぞれ「十分／もう少し／不足」と、その理由を書いてください。",
    "③ 改善提案：答えごとに、より具体的で前向きな書き直し案を1つずつ（30〜60字程度）示してください。未入力の項目には、考えるためのヒントを書いてください。",
    "④ 次の一歩：さらに考えを深めるための質問を2つください。",
    "",
    "【回答のルール】",
    "・決めるのは私です。押し付けや断定はしないでください。",
    "・私が書いた事実と、あなたの推測・提案をはっきり区別してください。根拠のない数値や成功率は作らないでください。",
    "・お金・健康・法律・投資など専門的な判断が必要な点は一般的な説明にとどめ、専門家への確認を勧めてください。",
    "・「非表示」「未入力」の項目は、内容を推測で補わないでください。",
    "・日本語で、やさしく前向きな言葉で答えてください。",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

/** 任意の入力値を、読みやすい文章にする（APP02 の各ステップの保存データ用） */
export function valueToText(v: unknown, labels: Record<string, string> = {}, depth = 0): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "はい" : "いいえ";
  if (Array.isArray(v)) {
    return v.map((x) => valueToText(x, labels, depth + 1)).filter(Boolean).map((t) => (t.includes("\n") ? t : `・${t}`)).join("\n");
  }
  if (typeof v === "object" && depth < 4) {
    return Object.entries(v as Record<string, unknown>)
      .filter(([k]) => !k.startsWith("__") && k !== "ai")
      .map(([k, x]) => {
        const t = valueToText(x, labels, depth + 1);
        return t ? `${labels[k] ?? k}：${t.includes("\n") ? `\n${t}` : t}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}
