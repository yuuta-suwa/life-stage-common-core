/**
 * APP03（MAKE IT REAL）連携：APP02 の承認済み成長計画（growth_plan 1.0）を、APP03 の接続契約の records 形式に変換する。
 * APP03 側の契約：{records:[{id:string,...}]}、最大100件・1MB。records は参照用で APP03 の認定にはならない。
 */
const APP03_CAPABILITY: Record<string, string> = {
  attraction: "集客力", recruitment: "採用力", education: "教育力", development: "育成力", operations: "運営力", management: "経営力",
};
type Cell = { ability: string; year_index: string; calendar_year?: number; target?: string; target_level?: number; experiences?: string; criteria?: string };
type GrowthPlan = {
  plan_id?: string; start_year: number; mode?: string; commit_year?: number | null; focus_by_year?: Record<string, string[]>;
  focus_abilities?: string[]; cells: Cell[]; provisional_assessment?: Record<string, number>; approved_at?: string;
};

export const TOKEN_PATTERN = /^lsc_app03_[A-Za-z0-9_-]{40,60}$/;

export function toApp03Record(row: { snapshot_id: string; version: number; received_at: string; payload: GrowthPlan }) {
  const p = row.payload;
  const focus = p.focus_by_year ?? {};
  const capabilities = Object.keys(APP03_CAPABILITY).map((a) => ({
    app03_capability: APP03_CAPABILITY[a],
    app02_ability: a,
    provisional_level_app02: p.provisional_assessment?.[a] ?? null,
    years: p.cells.filter((c) => c.ability === a).sort((x, y) => Number(x.year_index) - Number(y.year_index)).map((c) => ({
      year_index: Number(c.year_index),
      calendar_year: c.calendar_year ?? p.start_year + Number(c.year_index) - 1,
      target: c.target ?? "",
      target_level: c.target_level ?? null,
      experiences: c.experiences ?? "",
      criteria: c.criteria ?? "",
      focus: (focus[c.year_index] ?? []).includes(a),
    })),
  }));
  return {
    id: `app02-growth-plan-${row.snapshot_id}`,
    kind: "APP02_GROWTH_PLAN",
    schema: "growth_plan/1.0",
    title: `APP02 承認済み10ヵ年成長計画（第${row.version}版）`,
    note: "APP02 で本人が承認した計画（目標）です。APP03 の認定・実績ではありません。セールス力の行は APP03 側で設定します。目標レベル（LV0〜5）は APP02 の目標であり、APP03 の能力認定 LV1〜5 とは別の軸です。",
    version: row.version,
    approved_at: p.approved_at ?? null,
    delivered_at: row.received_at,
    start_year: p.start_year,
    end_year: p.start_year + 9,
    mode: p.mode ?? null,
    commit_year: p.commit_year ?? null,
    capabilities,
  };
}

/* ---------- APP01 → APP03：人生設計（必要最小限の項目だけを渡す） ---------- */
type Blueprint = {
  life_purpose?: string; priority_desires?: string[]; goals?: { type: string; description: string; deadline: string | null }[];
  priority_capabilities?: string[]; first_action?: string; first_action_date?: string | null;
};
const GOAL_TYPE: Record<string, string> = { long: "長期", mid: "中期", short: "短期" };

export function toApp03BlueprintRecord(row: { snapshot_id: string; version: number; received_at: string; payload: Blueprint }) {
  const p = row.payload;
  return {
    id: `app01-life-blueprint-${row.snapshot_id}`,
    kind: "APP01_LIFE_BLUEPRINT",
    schema: "life_blueprint/1.0",
    title: `APP01 人生設計 MY LIFE BLUEPRINT（第${row.version}版）`,
    note: "APP01 で本人が完成させた人生設計（理想）です。APP03 の認定・実績ではありません。家計・資産・人間関係の詳細やビジョンボードの画像は含めていません。",
    version: row.version,
    delivered_at: row.received_at,
    life_purpose: p.life_purpose ?? "",
    priority_desires: (p.priority_desires ?? []).slice(0, 10),
    goals: (p.goals ?? []).map((g) => ({ type: g.type, type_label: GOAL_TYPE[g.type] ?? g.type, description: g.description, deadline: g.deadline })),
    priority_capabilities: (p.priority_capabilities ?? []).map((c) => APP03_CAPABILITY[c] ?? c),
    first_action: p.first_action ?? "",
    first_action_date: p.first_action_date ?? null,
  };
}
