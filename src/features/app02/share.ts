/**
 * 共有内容の組み立て（サーバー側で、本人の現在の入力から本人が選んだ項目だけを作る）。
 * 受信者は data_shares.scope に固定された内容だけを見る（本人のテーブルは読めない）。
 */
import { ABILITY_CODES, SHARE_ITEMS, abilityName, type ShareKey, type Mode } from "./content";
import { calendarYear, cellLevel, cellText, currentLevel, str, arr, GOAL_LABEL, PRESENTATION_SECTIONS, type Blueprint, type CellRow, type Json, type PlanRow, type PositionAnswer } from "./logic";

export function shareItemValue(key: ShareKey, o: { bp: Blueprint | null; steps: Record<string, Json>; plan: PlanRow | null; cells: CellRow[]; mode: Mode }): string {
  const v = o.steps.vision ?? {}, an = o.steps.analysis ?? {}, env = o.steps.environment ?? {}, cm = o.steps.commitment ?? {}, pr = o.steps.presentation ?? {};
  switch (key) {
    case "vision":
      return [
        `人生の目的：${o.bp?.life_purpose || str(v.provisional_vision) || "未確認"}`,
        `優先したい願望：${o.bp?.priority_desires.join("／") || "未確認"}`,
        o.bp?.goals.length ? `目標と期限：${o.bp.goals.map((g) => `${GOAL_LABEL[g.type]}「${g.description}」${g.deadline ? `（${g.deadline}）` : ""}`).join("／")}` : "",
        `実現したい理由：${str(v.why) || "未記入"}`,
      ].filter(Boolean).join("\n");
    case "vision_constraints":
      return str(v.constraints) || "（記入なし）";
    case "analysis":
      return [
        ...arr<Json>(an.desires).filter((d) => str(d.desire)).map((d) => `■ ${str(d.desire)}：${str(d.conditions) || "実現条件 未記入"}`),
        `ストーリー：${str(an.story) || "未記入"}`,
      ].join("\n");
    case "position": {
      const pos = (o.steps.position ?? {}) as Record<string, PositionAnswer>;
      return ABILITY_CODES.map((a) => `${abilityName(a, o.mode)}：LV${currentLevel(pos[a])}`).join("／") + "（暫定。正式な認定ではありません）";
    }
    case "environment":
      return str(env.decision_note) || "（記入なし）";
    case "roadmap":
      if (!o.plan) return "（未作成）";
      return ABILITY_CODES.map((a) => `${abilityName(a, o.mode)}：` + o.cells.filter((c) => c.ability === a).sort((x, y) => x.year_index - y.year_index)
        .map((c) => `${calendarYear(o.plan!.start_year, c.year_index)}「${cellText(c)}」LV${cellLevel(c)}`).join(" → ")).join("\n");
    case "focus":
      if (!o.plan) return "（未作成）";
      return Object.entries(o.plan.focus).filter(([, f]) => f.length).sort((x, y) => Number(x[0]) - Number(y[0]))
        .map(([y, f]) => `${calendarYear(o.plan!.start_year, Number(y))}年：${f.map((a) => abilityName(a as (typeof ABILITY_CODES)[number], o.mode)).join("・")}`).join("\n") || "（未選択）";
    case "commitment":
      return [o.plan?.commit_year ? `目標年度：${o.plan.commit_year}年` : "目標年度：設定なし", `成長方針：${str(cm.policy) || "未記入"}`, `コミット：${str(cm.statement) || "未記入"}`].join("\n");
    case "presentation": {
      const secs = arr<{ text?: string }>(pr.sections);
      return secs.length ? PRESENTATION_SECTIONS.map((t, i) => `【${i + 1}. ${t}】\n${secs[i]?.text ?? ""}`).join("\n\n") : "（未作成）";
    }
  }
}

export function buildShareItems(keys: string[], o: Parameters<typeof shareItemValue>[1]) {
  return SHARE_ITEMS.filter((i) => keys.includes(i.key)).map((i) => ({ key: i.key, label: i.label, value: shareItemValue(i.key, o) }));
}
