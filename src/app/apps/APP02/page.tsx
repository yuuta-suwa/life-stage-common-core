import Link from "next/link";
import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { MODES } from "@/features/app02/content";
import { ANALYSIS, STEPS, completionChecklist, type Json } from "@/features/app02/logic";
import { hasApp02Consent, loadBlueprint, loadGrowthPlanState, loadPlan, loadSteps, loadWorkspace, stepData, stepDone } from "@/features/app02/data";
import { changeMode, startApp02 } from "./actions";

/** S00 初回案内・モード確認／S01 ダッシュボード */
export default async function App02Home({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const access = await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02");
  const sp = await searchParams;
  const supabase = await createClient();
  const [ws, consented] = await Promise.all([loadWorkspace(supabase), hasApp02Consent(supabase)]);
  const legacyEligible = access.apps.some((a) => a.code === "APP02" && (a.app_roles ?? []).some((r) => r.role === "legacy_eligible"));
  const modes = MODES.filter((m) => m.code !== "LEGACY" || legacyEligible);

  if (!ws || !consented) {
    return (
      <>
        <section className="hero">
          <div className="en">LIFE STAGE 2.0｜APP02 SELF-REALIZATION ENGINE</div>
          <h1>自己実現戦略を設計する</h1>
          <p>APP01 で明確にした人生ビジョンを出発点に、必要な条件・能力・環境・10年間の成長計画を、あなた自身が納得して選べる形にします。</p>
        </section>
        <Flash error={sp.error} />
        <form action={startApp02} className="card">
          <h2 className="section-title">BEFORE YOU START<span>｜はじめに</span></h2>
          <ul>
            <li><b>APP02 の役割</b>：計画と納得をつくるアプリです。実践・日々の KPI・成果の認定は APP03（LIFE STAGE 3.0）が担当します。</li>
            <li><b>役割分担</b>：AI は考えるための材料を出し、リーダー・トレーナー・メンターが方向性を確認し、<b>最後に決めるのはあなた</b>です。</li>
            <li><b>AI について</b>：アプリには AI を組み込んでいません。各画面の「ChatGPT に相談する」から、ご自身の ChatGPT に相談文を貼り付けて使えます（任意）。提案はあなたが採用・保留・却下を選ぶまで、計画には反映されません。</li>
            <li><b>データの利用</b>：入力はあなた本人だけが閲覧・編集できます。管理者も内容は閲覧しません。いつでも出力・削除の請求ができます。</li>
            <li><b>強制しません</b>：特定の環境や団体への参加を結論にしません。セールス力と6大能力を身につければ必ず願望が叶う、とも断定しません。</li>
          </ul>
          <fieldset className="field">
            <legend><b>利用モード</b><small>あとから変更でき、変更しても入力は保持されます</small></legend>
            <div className="mode-list">
              {modes.map((m, i) => (
                <label key={m.code} className="check mode-option">
                  <input type="radio" name="mode" value={m.code} defaultChecked={i === 1 || modes.length === 1} required />
                  <span><b>{m.label}｜{m.title}</b><span className="small muted">　対象：{m.target}</span><br /><span className="small">{m.note}</span></span>
                </label>
              ))}
            </div>
            {!legacyEligible ? <p className="small muted">LEGACY（経営者・子会社社長志望）は、管理者が利用資格を設定した方のみ選べます。</p> : null}
          </fieldset>
          <label className="check"><input type="checkbox" name="consent" required /> 上記の目的・役割分担・データの利用に同意します</label>
          <div style={{ marginTop: 12 }}><SubmitButton className="btn gold">APP02 を始める</SubmitButton></div>
        </form>
      </>
    );
  }

  const [steps, { plan }, { bp }, gp] = await Promise.all([loadSteps(supabase), loadPlan(supabase), loadBlueprint(supabase), loadGrowthPlanState(supabase)]);
  const vision = stepData(steps, "vision") as Json;
  const check = completionChecklist({ steps, plan, hasVision: Boolean(bp) || Boolean(vision.provisional_vision) });
  const order = [STEPS[0], STEPS[1], STEPS[2], ANALYSIS, ...STEPS.slice(3)];
  const isDone = (code: string) => (code === "roadmap" ? Boolean(plan) && check.items.find((i) => i.key === "focus")!.ok : stepDone(steps, code));
  const next = order.find((s) => !isDone(s.code));
  const doneCount = order.filter((s) => isDone(s.code)).length;
  const mode = MODES.find((m) => m.code === ws.mode)!;

  return (
    <>
      <section className="hero" style={{ paddingTop: 24 }}>
        <div className="en">LIFE STAGE 2.0｜APP02 SELF-REALIZATION ENGINE</div>
        <h1>MY SELF-REALIZATION STRATEGY</h1>
        <p>モード：<b>{mode.label}｜{mode.title}</b></p>
      </section>
      <Flash error={sp.error} ok={sp.ok === "mode" ? "モードを変更しました（入力は保持されています）。" : undefined} />

      <div className="grid kpi">
        <div className="card kpi-card gold"><div className="label"><b>PROGRESS</b>進捗</div><div className="value">{doneCount}<span className="small muted"> / {order.length}</span></div></div>
        <div className="card kpi-card"><div className="label"><b>VISION</b>人生ビジョン</div><div className="value" style={{ fontSize: 16 }}>{bp ? "APP01 から受信" : vision.provisional_vision ? "暫定入力" : "未確認"}</div></div>
        <div className="card kpi-card"><div className="label"><b>PLAN</b>10ヵ年計画</div><div className="value" style={{ fontSize: 16 }}>{gp.snapshot ? "承認済み" : plan ? `${plan.start_year}〜${plan.start_year + 9}` : "未作成"}</div></div>
      </div>

      {bp ? (
        <div className="card">
          <h2 className="section-title">MY LIFE VISION<span>｜人生ビジョンの要約</span></h2>
          <p><b>{bp.life_purpose}</b></p>
          <p className="small">優先したい願望：{bp.priority_desires.join("／") || "未設定"}</p>
        </div>
      ) : null}

      <div className="row" style={{ margin: "18px 0" }}>
        {next ? <Link className="btn gold" href={`/apps/APP02/${next.path}`}>次の学習：{next.ja} →</Link>
          : <Link className="btn gold" href="/apps/APP02/complete">修了確認・APP03 へ →</Link>}
      </div>

      <h2 className="section-title">8 STEPS<span>｜全体の流れ</span></h2>
      <ol className="stage-list app02-steps">
        {order.map((s) => (
          <li key={s.code}>
            <Link className={`stage-item ${isDone(s.code) ? "confirmed" : ""}`} href={`/apps/APP02/${s.path}`}>
              <div className="stage-no">{"no" in s ? `STEP ${s.no}` : "CORE"}</div>
              <div className="stage-code">{s.en}</div>
              <div className="stage-title">{s.ja}</div>
              <span className={`badge ${isDone(s.code) ? "ok" : "plain"}`}>{isDone(s.code) ? "✓ 完了" : "未完了"}</span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="small muted">未入力があっても、どの画面も閲覧できます。修了に必要な項目は各画面とSTEP の修了確認で示します。</p>

      <h2 className="section-title">SUPPORT<span>｜伴走・履歴</span></h2>
      <div className="row">
        <Link className="btn ghost" href="/apps/APP02/share">共有（リーダー・トレーナー・メンター）</Link>
        <Link className="btn ghost" href="/apps/APP02/purpose">軸に戻す（違和感の報告）</Link>
        <Link className="btn ghost" href="/apps/APP02/history">履歴・復元</Link>
        {ws.mode === "LEGACY" ? <Link className="btn ghost" href="/apps/APP02/ladder">経営者志望ラダー</Link> : null}
      </div>

      <details className="card" style={{ marginTop: 16 }}>
        <summary>利用モードを変更する</summary>
        <form action={changeMode} className="row" style={{ marginTop: 8 }}>
          <select name="mode" defaultValue={ws.mode} aria-label="利用モード">
            {modes.map((m) => <option key={m.code} value={m.code}>{m.label}｜{m.title}</option>)}
          </select>
          <SubmitButton className="btn small">変更する</SubmitButton>
        </form>
        <p className="small muted">人生ビジョンは共通です。表示する名称・説明がモードに合わせて変わります。入力済みのデータは保持されます。</p>
      </details>
    </>
  );
}
