import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ABILITY_CODES, abilityName, type AbilityCode } from "@/features/app02/content";
import { calendarYear, cellLevel, cellText, consistencyCheck, currentLevel, type Json, type PositionAnswer } from "@/features/app02/logic";
import { loadBlueprint, loadPlan, loadSteps, stepData, stepDone } from "@/features/app02/data";
import { scenePrompt, visionContext } from "@/features/app02/prompts";
import { StepHeader } from "@/features/app02/step-header";
import { RoadmapGrid } from "@/features/app02/roadmap";
import { AiPanel } from "@/features/app02/ui";
import { requireStarted } from "@/features/app02/guard";
import { ReviewPromptPanel } from "@/components/review-prompt-panel";
import { buildReviewPrompt } from "@/lib/review-prompt";
import { changeStartYear, createPlan, regeneratePlan, setFocus, undoLast } from "../actions";

const OK: Record<string, string> = {
  created: "10ヵ年計画を作成しました。推奨の到達目標を確認し、自由に編集してください。",
  regenerated: "推奨を再生成しました（あなたが編集したセルはそのままです）。",
  start_year: "開始年を変更しました。年次ごとの入力はそのまま、西暦の表示だけを変えています。",
  start_year_recheck: "開始年を変更しました。目標年度（暦年）は再確認が必要です。STEP 7 で確認してください。",
  undone: "直前の操作を取り消しました。",
  focus: "重点能力を保存しました。",
};

/** S08 10ヵ年ガント／S09 年度別目標編集／S10 重点能力・整合性（仕様 §12） */
export default async function RoadmapPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02/roadmap");
  const sp = await searchParams;
  const supabase = await createClient();
  const ws = await requireStarted(supabase);
  const [steps, { plan, cells }, { bp }] = await Promise.all([loadSteps(supabase), loadPlan(supabase), loadBlueprint(supabase)]);
  const ctx = visionContext(bp, String(stepData(steps, "vision").provisional_vision ?? ""));
  const pos = stepData(steps, "position") as Record<string, PositionAnswer>;
  const current = Object.fromEntries(ABILITY_CODES.map((a) => [a, currentLevel(pos[a])])) as Record<AbilityCode, number>;
  const nextYear = new Date().getFullYear() + 1;

  if (!plan) {
    return (
      <>
        <StepHeader code="roadmap" intro="6大能力×10年＝60セルの成長計画をつくります。開始年（西暦4桁）を入れると、10年分の推奨到達目標が表示されます。" />
        <Flash error={sp.error} />
        {!stepDone(steps, "position") ? <div className="notice warn">現在地診断（STEP 4）がまだ完了していません。完了すると、あなたの現在地に合わせて推奨が調整されます（このまま作成して、あとで「推奨を再生成」することもできます）。</div> : null}
        <form action={createPlan} className="card row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "0 1 220px" }}>
            <label htmlFor="start_year">開始年（西暦4桁）</label>
            <input id="start_year" name="start_year" type="text" inputMode="numeric" pattern="\d{4}" maxLength={4} required defaultValue={String(nextYear)} />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}><SubmitButton className="btn gold">10ヵ年計画を作成</SubmitButton></div>
        </form>
        <p className="small muted">推奨は仕様書の標準テンプレートを、あなたの現在地診断に合わせて調整したものです（正式な教育監修は未了）。空欄は作らず、すべてのセルに初期値が入ります。</p>
      </>
    );
  }

  const analysis = stepData(steps, "analysis") as Json;
  const conditionsWritten = Array.isArray(analysis.desires) && (analysis.desires as Json[]).some((d) => String(d.conditions ?? "").trim());
  const findings = consistencyCheck({ cells, plan, mode: ws.mode, current, conditionsWritten });
  const summary = ABILITY_CODES.map((a) => `${abilityName(a, ws.mode)}：` + cells.filter((c) => c.ability === a).sort((x, y) => x.year_index - y.year_index).map((c) => `${calendarYear(plan.start_year, c.year_index)}「${cellText(c)}」LV${cellLevel(c)}`).join("→")).join("\n");
  const years = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <>
      <StepHeader code="roadmap" intro={`${plan.start_year}年〜${plan.start_year + 9}年の10年間で、6つの能力をどこまで高めるかを決めます。推奨は自由に編集でき、いつでも推奨に戻せます。`} />
      <Flash error={sp.error} ok={sp.ok ? OK[sp.ok] : undefined} />
      <div className="row toolbar no-print">
        <form action={undoLast}><SubmitButton className="btn small ghost">↶ ひとつ戻す</SubmitButton></form>
        <form action={regeneratePlan}><SubmitButton className="btn small ghost" confirm="現在地診断の結果から推奨を作り直します。あなたが編集したセルはそのまま残ります。よろしいですか？">推奨を再生成</SubmitButton></form>
        <details className="inline-details">
          <summary className="btn small ghost">開始年を変更</summary>
          <form action={changeStartYear} className="row" style={{ marginTop: 8 }}>
            <input name="start_year" type="text" inputMode="numeric" pattern="\d{4}" maxLength={4} required defaultValue={String(plan.start_year)} aria-label="新しい開始年" style={{ width: 110 }} />
            <SubmitButton className="btn small" confirm="開始年を変更します。年次ごとの入力は保持され、西暦の表示だけが変わります。目標年度（暦年）は再確認が必要になります。">変更</SubmitButton>
          </form>
        </details>
      </div>

      <RoadmapGrid plan={plan} cells={cells} mode={ws.mode} findings={findings} visionCtx={ctx} />

      <section className="card" id="focus">
        <h2 className="section-title">FOCUS<span>｜年ごとの重点能力（原則1〜2つ）</span></h2>
        <div className="table-wrap">
          <table className="focus-table">
            <thead><tr><th>年</th><th>重点能力</th><th></th></tr></thead>
            <tbody>
              {years.map((y) => (
                <tr key={y}>
                  <th scope="row">{calendarYear(plan.start_year, y)}<span className="small muted">（{y}年目）</span></th>
                  <td colSpan={2}>
                    <form action={setFocus} className="row focus-form">
                      <input type="hidden" name="year_index" value={y} />
                      {ABILITY_CODES.map((a) => (
                        <label key={a} className="check small"><input type="checkbox" name="abilities" value={a} defaultChecked={(plan.focus[String(y)] ?? []).includes(a)} /> {abilityName(a, ws.mode)}</label>
                      ))}
                      <SubmitButton className="btn small">保存</SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AiPanel scene="roadmap" prompt={scenePrompt("roadmap", { vision: ctx, detail: `現在地（暫定）：${ABILITY_CODES.map((a) => `${abilityName(a, ws.mode)} LV${current[a]}`).join("、")}` })} />
      <ReviewPromptPanel prompt={buildReviewPrompt({
        app: "APP02 SELF-REALIZATION ENGINE", title: "STEP 6 10ヵ年計画",
        purpose: "6つの能力を、現在地から10年分の成長計画にする",
        items: [{ label: "私の人生ビジョン", value: ctx }, ...ABILITY_CODES.map((a) => ({
          label: `${abilityName(a, ws.mode)}の10年の目標`,
          value: cells.filter((c) => c.ability === a).sort((x, y) => x.year_index - y.year_index).map((c) => `${calendarYear(plan.start_year, c.year_index)}年：${cellText(c)}（LV${cellLevel(c)}）`).join("\n"),
        }))],
      })} />
      <AiPanel scene="consistency" prompt={scenePrompt("consistency", { vision: ctx, detail: summary })} />
      <AiPanel scene="change" prompt={scenePrompt("change", { vision: ctx, detail: `（変更したい目標を書き足してください）\n現在の計画：\n${summary}` })} />
    </>
  );
}
