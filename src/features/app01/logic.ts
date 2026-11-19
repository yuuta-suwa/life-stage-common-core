/**
 * APP01 の純粋ロジック（状態判定・XP・未来家計簿・ブループリント生成・共有文面）。単体テスト対象。
 */
import { CAPABILITIES, STAGES, getStage, type StageDef } from "./stages";
import { APP01_CONSENT_VERSION, COPY } from "./copy";

export type Answers = Record<string, unknown>;
export type StageRow = {
  stage_no: number;
  answers: Answers;
  status: "draft" | "confirmed";
  version: number;
  needs_recheck: boolean;
  first_confirmed_at: string | null;
  updated_at?: string;
  confirmed_at?: string | null;
};
export type StageState = "locked" | "available" | "draft" | "confirmed" | "recheck";

/** 状態判定（仕様 §3）。LEVEL10 は全9LEVELの最新確定が揃うと利用可能 */
export function stageStates(rows: StageRow[]): Record<number, StageState> {
  const byNo = new Map(rows.map((r) => [r.stage_no, r]));
  const out: Record<number, StageState> = {};
  for (const s of STAGES) {
    const row = byNo.get(s.no);
    const prev = byNo.get(s.no - 1);
    let available = s.no === 1 || Boolean(prev?.first_confirmed_at);
    if (s.no === 10) {
      available = STAGES.filter((x) => x.no < 10).every((x) => {
        const r = byNo.get(x.no);
        return r?.status === "confirmed" && !r.needs_recheck;
      });
      // 一度でも LEVEL10 を確定した後は、編集のため開けるようにする
      if (row?.first_confirmed_at) available = true;
    }
    if (!available) out[s.no] = "locked";
    else if (!row) out[s.no] = "available";
    else if (row.status === "confirmed") out[s.no] = row.needs_recheck ? "recheck" : "confirmed";
    else out[s.no] = "draft";
  }
  return out;
}

/** XP：初回確定につき 100XP（計 1000XP）。再確定では加算しない */
export function xp(rows: StageRow[]) {
  const cleared = rows.filter((r) => r.first_confirmed_at).map((r) => r.stage_no).sort((a, b) => a - b);
  return { xp: cleared.length * 100, max: 1000, badges: cleared };
}

/** 「前回の続きから始める」：最初の未確定・要再確認の LEVEL */
export function resumeStage(states: Record<number, StageState>): number {
  for (const s of STAGES) {
    const st = states[s.no];
    if (st === "available" || st === "draft" || st === "recheck") return s.no;
  }
  return 10;
}

// ---------------------------------------------------------------------
// 値の取り出し
// ---------------------------------------------------------------------
export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
export const lines = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map(str) : str(v).split(/\r?\n/)).map((s) => s.trim()).filter(Boolean);
export const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** 金額：未入力は null（0 として扱わない） */
export function money(v: unknown): number | null {
  const s = str(v).replace(/[,，円\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

// ---------------------------------------------------------------------
// LEVEL02 未来家計簿の自動計算（仕様 §4 LEVEL02）
// ---------------------------------------------------------------------
export const BUDGET_MONTHLY = ["q1", "q2", "q3", "q4", "q8"] as const;
export const BUDGET_ANNUAL = ["q5", "q6", "q7"] as const;
export const BUDGET_ASSUMPTION = "税・物価・運用利回りは計算に含めていません（前提）。";

export type BudgetSummary = {
  monthly_total: number | null;
  annual_items_total: number | null;
  annual_total: number | null;
  required_monthly: number | null;
  target_assets: number | null;
  target_year: number | null;
  current: { income: number | null; expense: number | null; assets: number | null };
  monthly_gap: number | null;
  assets_gap: number | null;
  unentered: string[];
  assumptions: string;
};

const sumOrNull = (vals: (number | null)[]) => {
  const xs = vals.filter((v): v is number => v !== null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
};

export function budgetSummary(a: Answers): BudgetSummary {
  const monthly = BUDGET_MONTHLY.map((k) => money(a[k]));
  const annual = BUDGET_ANNUAL.map((k) => money(a[k]));
  const monthlyTotal = sumOrNull(monthly);
  const annualItems = sumOrNull(annual);
  const annualTotal = monthlyTotal === null && annualItems === null ? null : (monthlyTotal ?? 0) * 12 + (annualItems ?? 0);
  const requiredMonthly = annualTotal === null ? null : Math.round(annualTotal / 12);
  const income = money(a.q10_income);
  const assets = money(a.q10_assets);
  const targetAssets = money(a.q9_amount);
  const year = Number(str(a.q9_year));
  const unentered = [...BUDGET_MONTHLY, ...BUDGET_ANNUAL, "q9_amount", "q9_year"].filter((k) =>
    k === "q9_year" ? !(year >= 1900 && year <= 2200) : money(a[k]) === null);
  return {
    monthly_total: monthlyTotal,
    annual_items_total: annualItems,
    annual_total: annualTotal,
    required_monthly: requiredMonthly,
    target_assets: targetAssets,
    target_year: year >= 1900 && year <= 2200 ? year : null,
    current: { income, expense: money(a.q10_expense), assets },
    monthly_gap: income !== null && requiredMonthly !== null ? income - requiredMonthly : null,
    assets_gap: targetAssets !== null && assets !== null ? targetAssets - assets : null,
    unentered,
    assumptions: BUDGET_ASSUMPTION,
  };
}

export const yenText = (n: number | null) => (n === null ? "未入力" : `${n.toLocaleString("ja-JP")}円`);

// ---------------------------------------------------------------------
// LEVEL03 ビジョンボード
// ---------------------------------------------------------------------
export type VisionImage = { key: string; desire?: string; when?: string; who?: string; feeling?: string; caption?: string };
export function visionImages(a: Answers): VisionImage[] {
  const imgs = Array.isArray(a.images) ? a.images : [];
  return imgs
    .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null && typeof (i as { key?: unknown }).key === "string")
    .map((i) => ({ key: String(i.key), desire: str(i.desire), when: str(i.when), who: str(i.who), feeling: str(i.feeling), caption: str(i.caption) }));
}

/** Storage のパスが本人の APP01 フォルダ内であることを確認（他人のファイル参照を防ぐ） */
export function isOwnVisionKey(key: string, userId: string) {
  return new RegExp(`^${userId}/APP01/vision/[A-Za-z0-9_-]{8,64}\\.(png|jpe?g|webp)$`).test(key);
}

// ---------------------------------------------------------------------
// LEVEL10 整合性レポート（AI 未使用：ルールで未確認・未入力を示す）
// ---------------------------------------------------------------------
export function consistencyReport(confirmed: Record<number, Answers>): { level: number; message: string }[] {
  const out: { level: number; message: string }[] = [];
  const a1 = confirmed[1] ?? {}, a2 = confirmed[2] ?? {}, a3 = confirmed[3] ?? {}, a4 = confirmed[4] ?? {};
  const a5 = confirmed[5] ?? {}, a7 = confirmed[7] ?? {}, a9 = confirmed[9] ?? {};
  if (!lines(a1.q9).length) out.push({ level: 1, message: "最も優先したい願望が未設定です（未確認）。" });
  const b = budgetSummary(a2);
  if (b.unentered.length) out.push({ level: 2, message: `未来家計簿に未入力の項目が ${b.unentered.length} 件あります（未入力は 0 円として計算していません）。` });
  if (b.target_year && a9.q4_long && Number(str(a9.q4_long).slice(0, 4)) < b.target_year)
    out.push({ level: 9, message: `長期目標の期限（${str(a9.q4_long)}）が、資産目標の時期（${b.target_year}年）より前です。整合しているか確認してください。` });
  if (!visionImages(a3).length) out.push({ level: 3, message: "ビジョンボードの画像が登録されていません。" });
  if (!str(a4.q6)) out.push({ level: 4, message: "人生の目的（一文）が未設定です（未確認）。" });
  if (!str(a5.q8)) out.push({ level: 5, message: "最優先で解消したい差が未設定です（未確認）。" });
  if (!list(a7.q7).length && !list(a9.q6).length) out.push({ level: 7, message: "優先して身につけたい力が未選択です。" });
  for (const [goal, deadline, label] of [["q1", "q4_long", "長期"], ["q2", "q4_mid", "中期"], ["q3", "q4_short", "短期"]] as const)
    if (str(a9[goal]) && !str(a9[deadline])) out.push({ level: 9, message: `${label}目標の期限が未設定です。` });
  if (!str(a9.q7)) out.push({ level: 9, message: "最初に実行する行動が未設定です（未確認）。" });
  if (!str(a9.q8)) out.push({ level: 9, message: "行動の開始日が未設定です（未確認）。" });
  return out;
}

// ---------------------------------------------------------------------
// MY LIFE BLUEPRINT（APP02 引き継ぎ契約 life_blueprint 1.0｜仕様 §10）
// ---------------------------------------------------------------------
export class BlueprintIncompleteError extends Error {
  constructor(public missing: string[]) {
    super("BLUEPRINT_INCOMPLETE");
  }
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export function buildBlueprint(confirmed: Record<number, Answers>, blueprintId: string) {
  const a1 = confirmed[1] ?? {}, a2 = confirmed[2] ?? {}, a3 = confirmed[3] ?? {}, a4 = confirmed[4] ?? {};
  const a5 = confirmed[5] ?? {}, a7 = confirmed[7] ?? {}, a9 = confirmed[9] ?? {};
  const missing: string[] = [];
  const lifePurpose = str(a4.q6);
  if (!lifePurpose) missing.push("LEVEL04 人生の目的");
  const goals = ([["long", "q1", "q4_long"], ["mid", "q2", "q4_mid"], ["short", "q3", "q4_short"]] as const)
    .map(([type, d, dl]) => ({ type, description: str(a9[d]), deadline: isDate(str(a9[dl])) ? str(a9[dl]) : null }))
    .filter((g) => g.description);
  if (!goals.length) missing.push("LEVEL09 目標");
  if (missing.length) throw new BlueprintIncompleteError(missing);
  const caps = list(a9.q6).length ? list(a9.q6) : list(a7.q7);
  return {
    blueprint_id: blueprintId,
    life_purpose: lifePurpose,
    priority_desires: lines(a1.q9).slice(0, 10),
    budget_summary: budgetSummary(a2),
    vision_board_asset_refs: visionImages(a3).map((i) => i.key),
    gap_analysis: {
      money: { current: str(a5.q1), gap: str(a5.q2) },
      time: { current: str(a5.q3), target: str(a5.q4) },
      relations: { current: str(a5.q5), needed: str(a5.q6) },
      capabilities: str(a5.q7),
      top_priority: str(a5.q8),
    },
    goals,
    priority_capabilities: caps.filter((c) => CAPABILITIES.some((x) => x.value === c)),
    first_action: str(a9.q7),
    first_action_date: isDate(str(a9.q8)) ? str(a9.q8) : null,
    consent_version: APP01_CONSENT_VERSION,
  };
}

// ---------------------------------------------------------------------
// 回答の表示用テキスト（総復習・共有用）
// ---------------------------------------------------------------------
export function inputDisplay(stage: StageDef, key: string, a: Answers): string {
  const input = stage.questions.flatMap((q) => q.inputs).find((i) => i.key === key);
  const v = a[key];
  if (!input) return str(v);
  switch (input.kind) {
    case "money": return money(v) === null ? "" : yenText(money(v));
    case "multi": return list(v).map((x) => input.options?.find((o) => o.value === x)?.label ?? x).join("、");
    case "lines": return lines(v).join(" ／ ");
    case "yesno": return v === "yes" ? "はい" : v === "no" ? "いいえ" : "";
    case "year": return str(v) ? `${str(v)}年` : "";
    default: return str(v);
  }
}

export type DisplayItem = { key: string; label: string; value: string; sensitive: boolean };

/** ステージの回答を「設問：回答」の一覧にする（未入力は除外） */
export function stageItems(stage: StageDef, a: Answers): DisplayItem[] {
  if (stage.no === 3) {
    return visionImages(a).map((img, i) => ({
      key: `image${i + 1}`,
      label: `画像${i + 1}`,
      value: [img.desire && `願望：${img.desire}`, img.when && `時期：${img.when}`, img.who && `場面：${img.who}`, img.feeling && `気持ち：${img.feeling}`, img.caption && `キャプション：${img.caption}`].filter(Boolean).join("／"),
      sensitive: true,
    }));
  }
  const out: DisplayItem[] = [];
  for (const q of stage.questions) {
    for (const input of q.inputs) {
      const value = inputDisplay(stage, input.key, a);
      if (!value) continue;
      out.push({ key: input.key, label: input.label ? `${q.label}（${input.label}）` : q.label, value, sensitive: Boolean(input.sensitive) });
    }
  }
  if (stage.no === 2) {
    const b = budgetSummary(a);
    out.push({ key: "budget", label: "自動計算", value: `月額合計 ${yenText(b.monthly_total)}／年額合計 ${yenText(b.annual_total)}（${BUDGET_ASSUMPTION}）`, sensitive: true });
  }
  return out;
}

/** 文章共有テンプレート（仕様 §7-2） */
export function shareText(p: {
  displayName: string; recipientRole: string; recipientName: string; stageNo: number; state: "draft" | "confirmed";
  sharedAt: Date; items: { label: string; value: string }[]; nextAction?: string; comment?: string;
}) {
  const stage = getStage(p.stageNo)!;
  const summary = p.items.length ? p.items.slice(0, 3).map((i) => `・${i.label}：${i.value}`).join("\n") : COPY.unset;
  return [
    "【LIFE STAGE｜APP01 進捗共有】",
    `共有者：${p.displayName || "（表示名未設定）"}`,
    `宛先：${p.recipientRole} ${p.recipientName}`.trimEnd(),
    `LEVEL ${String(p.stageNo).padStart(2, "0")}｜${stage.title}`,
    `状態：${p.state === "confirmed" ? "確定" : COPY.draftLabel}`,
    `共有日時：${p.sharedAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
    "",
    "■ 今回明確にしたこと",
    summary,
    "",
    "■ 本人が決めた内容",
    p.items.length ? p.items.map((i) => `・${i.label}：${i.value}`).join("\n") : COPY.unset,
    "",
    "■ 次に取り組むこと",
    p.nextAction?.trim() || COPY.unset,
    "",
    "■ 本人からのコメント",
    p.comment?.trim() || "",
    "",
    "※本人が選択した情報のみを共有しています。AI 提案は本人の決定と区別して表示します。",
  ].join("\n");
}

/** 最終共有テンプレート（仕様 §7-4） */
export function blueprintShareText(displayName: string, bp: ReturnType<typeof buildBlueprint>, comment = "") {
  const capLabel = (v: string) => CAPABILITIES.find((c) => c.value === v)?.label ?? v;
  const goalType = { long: "長期", mid: "中期", short: "短期" } as const;
  return [
    "【LIFE STAGE｜MY LIFE BLUEPRINT 完成報告】",
    `${displayName || "（表示名未設定）"}の人生設計が完成しました。`,
    "",
    `人生の目的：${bp.life_purpose}`,
    `最優先の願望：${bp.priority_desires.join("、") || COPY.unset}`,
    `目標と期限：${bp.goals.map((g) => `${goalType[g.type]}「${g.description}」${g.deadline ? `（${g.deadline}）` : ""}`).join("／")}`,
    `優先して身につける力：${bp.priority_capabilities.map(capLabel).join("、") || COPY.unset}`,
    `最初の行動・開始日：${bp.first_action || COPY.unset}${bp.first_action_date ? `（${bp.first_action_date}）` : ""}`,
    "",
    `本人からのメッセージ：${comment}`,
    "",
    "未来の自分が、今日の選択を誇れるように。",
    "",
    "※詳細項目は本人が共有を許可した範囲のみ表示。",
  ].join("\n");
}

/** MY LIFE DISCOVERY（総復習）10 項目のカード定義（仕様 §8） */
export const DISCOVERY_CARDS = [
  { no: 1, name: "心から望む人生", data: "願望・優先順位" },
  { no: 2, name: "幸福の未来家計簿", data: "月額・年額・必要資産・時期" },
  { no: 3, name: "MY VISION BOARD", data: "画像・願望紐づけ" },
  { no: 4, name: "人生の目的", data: "本人の確定した目的文" },
  { no: 5, name: "現実とのギャップ", data: "お金・時間・人望・能力" },
  { no: 6, name: "痛みと報酬の原則", data: "挑戦理由・代償・価値" },
  { no: 7, name: "自己実現に必要な 6 大能力", data: "優先能力・理由" },
  { no: 8, name: "LIFE STAGE の成長ステップ", data: "学習理解・次に学ぶ目的" },
  { no: 9, name: "目標と期限", data: "長中短期・期限" },
  { no: 10, name: "自己実現への決意", data: "最初の行動・開始日" },
] as const;
