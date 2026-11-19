import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { ABILITIES, ABILITY_CHAIN, ABILITY_CHAIN_NOTE, ABILITY_CODES, LEVELS, abilityName } from "@/features/app02/content";
import { loadBlueprint, loadSteps, stepData, stepDone } from "@/features/app02/data";
import { scenePrompt, visionContext } from "@/features/app02/prompts";
import { StepHeader, nextPath } from "@/features/app02/step-header";
import { AbilitiesForm } from "@/features/app02/forms/abilities-form";
import { requireStarted } from "@/features/app02/guard";

/** S04 6大能力理解（仕様 §06）：能力の説明、相互関係、本人の願望との関係 */
export default async function AbilitiesPage() {
  await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02/abilities");
  const supabase = await createClient();
  const ws = await requireStarted(supabase);
  const [steps, { bp }] = await Promise.all([loadSteps(supabase), loadBlueprint(supabase)]);
  const ctx = visionContext(bp, String(stepData(steps, "vision").provisional_vision ?? ""));
  return (
    <>
      <StepHeader code="abilities" intro={ws.mode === "DISCOVERY" ? "人生を豊かにする6つの力と、あなたの願望とのつながりを理解します。" : "6大能力の役割と相互関係、あなたの願望とのつながりを理解します。"} />
      <div className="grid two">
        {ABILITY_CODES.map((a) => (
          <div key={a} className="card">
            <div className="stage-code">{ws.mode === "DISCOVERY" ? ABILITIES[a].name : ABILITIES[a].plain}</div>
            <h3 style={{ margin: "4px 0" }}>{abilityName(a, ws.mode)}</h3>
            <p className="small">{ABILITIES[a].role}</p>
          </div>
        ))}
      </div>
      <div className="card">
        <h2 className="section-title">HOW THEY CONNECT<span>｜代表的な相互関係</span></h2>
        <p><b>{ABILITY_CHAIN}</b></p>
        <p className="small muted">{ABILITY_CHAIN_NOTE}</p>
        <details><summary className="small">レベルの定義（LV0〜LV5）</summary>
          <dl className="kv small">{LEVELS.map((l) => (<div key={l.lv} style={{ display: "contents" }}><dt>{l.label}</dt><dd>{l.desc}</dd></div>))}</dl>
        </details>
      </div>
      <AbilitiesForm initial={stepData(steps, "abilities")} done={stepDone(steps, "abilities")} mode={ws.mode} next={nextPath("abilities")}
        prompt={scenePrompt("abilities", { vision: ctx })} />
    </>
  );
}
