/**
 * APP02 ロジック（AI を使わないルールベース。仕様 §19「AI 利用不能時は標準テンプレートと手動入力で継続」）
 */
import { ABILITIES, ABILITY_CODES, abilityName, classify, type AbilityCode, type Mode } from "./content";

export type Json = Record<string, unknown>;
export const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/* ---------- APP01 から受け取った人生設計（life_blueprint 1.0） ---------- */
export type Blueprint = {
  blueprint_id: string; life_purpose: string; priority_desires: string[];
  goals: { type: "long" | "mid" | "short"; description: string; deadline: string | null }[];
  priority_capabilities: string[]; first_action: string; first_action_date: string | null;
  budget_summary?: Json; gap_analysis?: Json;
};
export const GOAL_LABEL = { long: "長期", mid: "中期", short: "短期" } as const;

/* ---------- 8ステップ（§04） ---------- */
export const STEPS = [
  { no: 1, code: "vision", path: "vision", en: "MY LIFE VISION", ja: "人生ビジョン確認" },
  { no: 2, code: "sales", path: "sales", en: "THE POWER OF SALES", ja: "セールス力理解" },
  { no: 3, code: "abilities", path: "abilities", en: "SIX CORE ABILITIES", ja: "6大能力理解" },
  { no: 4, code: "position", path: "position", en: "MY CURRENT POSITION", ja: "現在地診断" },
  { no: 5, code: "environment", path: "environment", en: "GROWTH ENVIRONMENT", ja: "環境比較" },
  { no: 6, code: "roadmap", path: "roadmap", en: "MY 10-YEAR ROADMAP", ja: "10ヵ年計画" },
  { no: 7, code: "commitment", path: "commitment", en: "MY COMMITMENT", ja: "意思決定" },
  { no: 8, code: "presentation", path: "presentation", en: "MY LIFE PRESENTATION", ja: "プレゼン" },
] as const;
/** 横断機能（§07）：AI 自己実現・因果関係分析 */
export const ANALYSIS = { code: "analysis", path: "analysis", en: "SELF-REALIZATION ANALYSIS", ja: "自己実現・因果関係分析" } as const;

/* ---------- 現在地診断（§10）：具体的な経験の質問に「はい」が続いた最高段階を暫定レベルとする ---------- */
export type PositionAnswer = { yes?: boolean[]; evidence?: string; override?: number | null; override_reason?: string; unsure?: boolean[] };
export function provisionalLevel(a: PositionAnswer | undefined): { level: number; unsure: boolean; reason: string } {
  const yes = a?.yes ?? [];
  let level = 0;
  for (let i = 0; i < 5; i++) {
    if (yes[i]) level = i + 1;
    else break;
  }
  const unsure = (a?.unsure ?? []).some(Boolean);
  const reason = level === 0 ? "経験の質問に「はい」がないため LV0（未経験・未習得）と暫定しました。"
    : `「LV${level}」までの質問すべてに「はい」と答えたため、暫定 LV${level} としました。`;
  return { level, unsure, reason: unsure ? `${reason}「分からない」と答えた項目があり、判断できない部分があります。` : reason };
}
/** 本人の修正を優先した現在地（正式認定ではない） */
export function currentLevel(a: PositionAnswer | undefined): number {
  const o = a?.override;
  return typeof o === "number" && o >= 0 && o <= 5 ? o : provisionalLevel(a).level;
}

/* ---------- 計画（セル） ---------- */
export type CellRow = {
  ability: AbilityCode; year_index: number; recommended_text: string; recommended_level: number;
  rec_experiences: string; rec_criteria: string; edited_text: string | null; target_level: number | null;
  experiences: string | null; criteria: string | null; updated_at?: string;
};
export type PlanRow = { plan_id: string; start_year: number; version: number; focus: Record<string, string[]>; commit_year: number | null; commit_needs_recheck: boolean };

export const cellText = (c: CellRow) => c.edited_text ?? c.recommended_text;
export const cellLevel = (c: CellRow) => c.target_level ?? c.recommended_level;
export const cellExperiences = (c: CellRow) => c.experiences ?? c.rec_experiences;
export const cellCriteria = (c: CellRow) => c.criteria ?? c.rec_criteria;
export const cellCategory = (c: CellRow) => classify(c.recommended_text, c.ability).category;
export const calendarYear = (startYear: number, yearIndex: number) => startYear + yearIndex - 1;

export function validStartYear(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return /^\d{4}$/.test(String(v)) && Number.isInteger(n) && n >= 2000 && n <= 2091 ? n : null;
}

/* ---------- 整合性チェック（§12-6）。「実現不可能」と断定せず、理由と改善案を示す ---------- */
export type Finding = { kind: "jump" | "focus_over" | "focus_none" | "start_gap" | "commit_order" | "missing_text" | "conditions" | "commit_recheck"; ability?: AbilityCode; year_index?: number; message: string; suggestion: string };

export function consistencyCheck(opts: {
  cells: CellRow[]; plan: PlanRow; mode: Mode; current: Partial<Record<AbilityCode, number>>; conditionsWritten: boolean;
}): Finding[] {
  const { cells, plan, mode, current } = opts;
  const out: Finding[] = [];
  const by = (a: AbilityCode, y: number) => cells.find((c) => c.ability === a && c.year_index === y);
  for (const a of ABILITY_CODES) {
    const name = abilityName(a, mode);
    const first = by(a, 1);
    if (first && cellLevel(first) - (current[a] ?? 0) >= 3) {
      out.push({ kind: "start_gap", ability: a, year_index: 1, message: `${name}：現在地（LV${current[a] ?? 0}）から1年目の目標（LV${cellLevel(first)}）までの差が大きくなっています。`, suggestion: "1年目は1〜2段階上を目標にするか、必要な経験・学習を具体的に書き足してください。" });
    }
    for (let y = 2; y <= 10; y++) {
      const p = by(a, y - 1), c = by(a, y);
      if (p && c && cellLevel(c) - cellLevel(p) >= 2) {
        out.push({ kind: "jump", ability: a, year_index: y, message: `${name}：${calendarYear(plan.start_year, y)}年に目標レベルが前年から2段階以上上がっています（LV${cellLevel(p)}→LV${cellLevel(c)}）。`, suggestion: "間の段階を前年に入れるか、急に伸ばせる根拠（経験・環境）を必要な経験欄に書いてください。" });
      }
      if (c && !cellExperiences(c).trim()) {
        out.push({ kind: "missing_text", ability: a, year_index: y, message: `${name}：${calendarYear(plan.start_year, y)}年の必要な経験・学習が空欄です。`, suggestion: "推奨に戻すか、具体的な経験を書いてください。" });
      }
    }
  }
  for (let y = 1; y <= 10; y++) {
    const f = plan.focus[String(y)] ?? [];
    if (f.length > 2) out.push({ kind: "focus_over", year_index: y, message: `${calendarYear(plan.start_year, y)}年の重点能力が${f.length}つあります。`, suggestion: "重点は原則1〜2能力です。本当に必要な場合は例外としてそのままにできます。" });
  }
  const anyFocus = Object.values(plan.focus).some((f) => f.length > 0);
  if (!anyFocus) out.push({ kind: "focus_none", message: "重点能力がまだ選ばれていません。", suggestion: "各年に1〜2つ、特に力を入れる能力を選んでください。" });
  if (plan.commit_year) {
    const idx = plan.commit_year - plan.start_year + 1;
    const m = by("management", idx);
    if (mode === "LEGACY" && m && cellLevel(m) < 3) {
      out.push({ kind: "commit_order", ability: "management", year_index: idx, message: `目標年度（${plan.commit_year}年）の時点で、経営力の目標が LV${cellLevel(m)} です。`, suggestion: "目標年度までに経営力を高める計画にするか、目標年度を見直してください（能力レベルだけで経営者の適格性は決まりません）。" });
    }
    if (plan.commit_needs_recheck) out.push({ kind: "commit_recheck", message: `開始年を変更したため、目標年度（${plan.commit_year}年）の再確認が必要です。`, suggestion: "意思決定（STEP 7）で目標年度を確認し、保存し直してください。" });
  }
  if (!opts.conditionsWritten) out.push({ kind: "conditions", message: "実現条件（能力以外の条件を含む）がまだ書かれていません。", suggestion: "自己実現・因果関係分析で、願望ごとの実現条件を書いてください。" });
  return out;
}

/* ---------- 修了条件（§04） ---------- */
export type StepRow = { step_code: string; status: "draft" | "done"; data: Json; updated_at?: string };
export function completionChecklist(opts: { steps: StepRow[]; plan: PlanRow | null; hasVision: boolean }) {
  const done = (c: string) => opts.steps.some((s) => s.step_code === c && s.status === "done");
  const focusYears = opts.plan ? Object.values(opts.plan.focus).filter((f) => f.length > 0).length : 0;
  const items = [
    { key: "vision", label: "人生ビジョンを確認した", ok: opts.hasVision && done("vision") },
    { key: "sales", label: "セールス力を理解し、自分の言葉で説明した", ok: done("sales") },
    { key: "abilities", label: "6大能力と願望の関係を理解した", ok: done("abilities") },
    { key: "analysis", label: "自己実現・因果関係分析（根拠マップ）を確認した", ok: done("analysis") },
    { key: "position", label: "6大能力の現在地を診断した", ok: done("position") },
    { key: "environment", label: "成長環境を比較した", ok: done("environment") },
    { key: "roadmap", label: "10ヵ年計画（60セル）を作成した", ok: Boolean(opts.plan) },
    { key: "focus", label: "重点能力を選んだ", ok: focusYears > 0 },
    { key: "commitment", label: "目標年度・成長方針・コミットを決めた", ok: done("commitment") && !opts.plan?.commit_needs_recheck },
    { key: "presentation", label: "自己実現プレゼンを確認した", ok: done("presentation") },
  ];
  return { items, ready: items.every((i) => i.ok) };
}

/* ---------- プレゼン（§15）：承認済み入力から下書きを作る。本人の言葉と自動下書きを区別する ---------- */
export const PRESENTATION_SECTIONS = [
  "実現したい人生", "実現理由", "実現条件", "セールス力を学ぶ理由", "6大能力の相互関係",
  "現在地", "成長環境", "10ヵ年計画", "年間重点能力", "今後の意思決定",
] as const;

export function presentationDraft(o: {
  bp: Blueprint | null; steps: Record<string, Json>; cells: CellRow[]; plan: PlanRow | null; mode: Mode;
}): string[] {
  const v = o.steps.vision ?? {}, s = o.steps.sales ?? {}, ab = o.steps.abilities ?? {}, an = o.steps.analysis ?? {};
  const pos = o.steps.position ?? {}, env = o.steps.environment ?? {}, cm = o.steps.commitment ?? {};
  const desires = o.bp?.priority_desires.join("、") || str(v.provisional_vision) || "（未確認）";
  const level = (a: AbilityCode) => currentLevel((pos as Record<string, PositionAnswer>)[a]);
  const focusText = o.plan
    ? Object.entries(o.plan.focus).filter(([, f]) => f.length).sort((x, y) => Number(x[0]) - Number(y[0]))
      .map(([y, f]) => `${calendarYear(o.plan!.start_year, Number(y))}年：${f.map((a) => abilityName(a as AbilityCode, o.mode)).join("・")}`).join("／")
    : "";
  const tenth = o.cells.filter((c) => c.year_index === 10).map((c) => `${abilityName(c.ability, o.mode)}「${cellText(c)}」`).join("、");
  return [
    `私が実現したい人生は、${o.bp?.life_purpose || "（人生の目的は未確認）"}。最も大切にしたい願望は、${desires}です。`,
    str(v.why) || str(an.story) || "（実現したい理由を書いてください）",
    arr<Json>(an.desires).map((d) => `${str(d.desire)}：${str(d.conditions) || "条件未記入"}`).join("\n") || "（自己実現・因果関係分析で実現条件を書いてください）",
    str(s.own_words) || str(s.relation) || "（セールス力を学ぶ理由を書いてください）",
    str(ab.relation_summary) || "6つの力は、出会い→仲間→伝える→育てる→チームで実現→未来をつくる、とつながって私の願望を支えます。",
    ABILITY_CODES.map((a) => `${abilityName(a, o.mode)} LV${level(a)}`).join("、") + "（暫定。正式な認定ではありません）",
    str(env.decision_note) || "（成長環境の比較から、自分に合う条件を書いてください）",
    o.plan ? `${o.plan.start_year}年から${o.plan.start_year + 9}年までの10年間で、${tenth}を目指します。` : "（10ヵ年計画を作成してください）",
    focusText || "（重点能力を選んでください）",
    [str(cm.policy), str(cm.statement)].filter(Boolean).join("\n") || "（意思決定で成長方針とコミットを書いてください）",
  ];
}

/* ---------- APP03 への引継ぎ（§21・growth_plan 1.0） ---------- */
export function buildGrowthPlan(o: {
  planId: string; bp: Blueprint | null; visionVersion: string | number; plan: PlanRow; mode: Mode; cells: CellRow[];
  position: Record<string, PositionAnswer>; learning: Json; approvedAt: string;
}) {
  if (o.cells.length !== 60) throw new Error("PLAN_INCOMPLETE");
  const focus = [...new Set(Object.values(o.plan.focus).flat())].filter((a): a is AbilityCode => (ABILITY_CODES as readonly string[]).includes(a));
  return {
    plan_id: o.planId,
    vision_version: o.visionVersion,
    start_year: o.plan.start_year,
    mode: o.mode,
    focus_abilities: focus,
    focus_by_year: o.plan.focus,
    commit_year: o.plan.commit_year,
    cells: [...o.cells].sort((a, b) => ABILITY_CODES.indexOf(a.ability) - ABILITY_CODES.indexOf(b.ability) || a.year_index - b.year_index).map((c) => ({
      ability: c.ability,
      year_index: String(c.year_index),
      calendar_year: calendarYear(o.plan.start_year, c.year_index),
      target: cellText(c),
      target_level: cellLevel(c),
      experiences: cellExperiences(c),
      criteria: cellCriteria(c),
    })),
    provisional_assessment: Object.fromEntries(ABILITY_CODES.map((a) => [a, currentLevel(o.position[a])])),
    learning: o.learning,
    approved_at: o.approvedAt,
  };
}

export const abilityLabel = (a: string) => ABILITIES[a as AbilityCode]?.name ?? a;
