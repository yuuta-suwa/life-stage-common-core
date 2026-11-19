import { Fragment } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getStage, CAPABILITIES, LIFE_STAGE_STEPS } from "@/features/app01/stages";
import { COPY } from "@/features/app01/copy";
import { consistencyReport, lines, stageItems, stageStates, str, visionImages, xp } from "@/features/app01/logic";
import { answersByStage, hasApp01Consent, loadLatestConfirmed, loadStageRows, signedVisionUrls } from "@/features/app01/data";
import { StageForm } from "@/features/app01/stage-form";
import { SharePanel } from "@/features/app01/share-panel";
import { SideQuest } from "@/features/app01/side-quest";

export default async function LevelPage({ params, searchParams }: {
  params: Promise<{ n: string }>; searchParams: Promise<{ cleared?: string }>;
}) {
  const { n } = await params;
  const no = Number(n);
  const stage = Number.isInteger(no) ? getStage(no) : undefined;
  if (!stage) notFound();
  const access = await requirePage({ kind: "app", code: "APP01" }, `/apps/APP01/level/${no}`);
  const supabase = await createClient();
  if (!(await hasApp01Consent(supabase))) redirect("/apps/APP01");
  const sp = await searchParams;

  const [rows, latest] = await Promise.all([loadStageRows(supabase), loadLatestConfirmed(supabase)]);
  const states = stageStates(rows);
  const state = states[no];
  const row = rows.find((r) => r.stage_no === no);
  const confirmed = answersByStage(latest);
  const header = (
    <div className="page-head">
      <div className="en">LEVEL {String(no).padStart(2, "0")}｜{stage.code}</div>
      <h1>{stage.title}</h1>
      <p>{stage.intro}</p>
    </div>
  );

  if (state === "locked") {
    return (
      <>
        {header}
        <div className="notice info">
          {no === 10 ? "LEVEL01〜09 の最新の内容をすべて確定すると、LEVEL10 に挑戦できます。" : `LEVEL ${String(no - 1).padStart(2, "0")} を確定すると開放されます。`}
        </div>
        <Link className="btn ghost" href="/apps/APP01">{COPY.back}</Link>
      </>
    );
  }

  // STAGE CLEAR（確定直後）
  if (sp.cleared === "1" && row?.status === "confirmed" && latest[no]) {
    const score = xp(rows);
    const { data: targets } = await supabase.rpc("my_share_targets");
    const items = stageItems(stage, latest[no].answers);
    return (
      <>
        <section className="hero clear-hero">
          <div className="en">STAGE CLEAR</div>
          <h1>{stage.clear}</h1>
          <p>{COPY.clear}</p>
          <p className="small muted">XP {score.xp} / {score.max}　バッジ {score.badges.length} / 10（再確定では XP は増えません）</p>
        </section>
        <div className="row" style={{ justifyContent: "center", marginBottom: 16 }}>
          <Link className="btn ghost" href="/apps/APP01">{COPY.back}</Link>
          {no < 10 ? <Link className="btn gold" href={`/apps/APP01/level/${no + 1}`}>{COPY.next}</Link>
            : <Link className="btn gold" href="/apps/APP01/discovery">MY LIFE DISCOVERY へ</Link>}
          <Link className="btn ghost" href={`/apps/APP01/level/${no}`}>{COPY.editCta}</Link>
        </div>
        <SharePanel stageNo={no} items={items} targets={(targets ?? []) as { mentor_id: string; display_name: string; relation: string }[]}
          displayName={access.display_name ?? ""} defaultNextAction={no < 10 ? `LEVEL ${String(no + 1).padStart(2, "0")} に進む` : str(confirmed[9]?.q7)} />
      </>
    );
  }

  const answers = row?.answers ?? {};
  const imageUrls = no === 3 ? await signedVisionUrls(supabase, visionImages(answers).map((i) => i.key)) : {};
  const desires = lines((rows.find((r) => r.stage_no === 1)?.answers ?? {}).q9);

  return (
    <>
      {header}
      {state === "recheck" ? <div className="notice warn">{COPY.recheckNotice}（前の LEVEL が編集されたため、{COPY.recheck}です。内容を確認して、もう一度確定してください）</div> : null}
      {state === "confirmed" ? <div className="notice ok">確定済みです（第{row?.version}版）。編集すると下書きに戻り、確定済みの後続 LEVEL は再確認が必要になります。</div> : null}
      <details className="card"><summary>AI 精査・確定対象</summary><p className="small">{stage.aiTarget}</p></details>

      {no === 7 ? (
        <div className="card">
          <h3 className="section-title">6 CORE CAPABILITIES<span>｜6大能力</span></h3>
          <dl className="kv">{CAPABILITIES.map((c) => <Fragment key={c.value}><dt>{c.label}</dt><dd>{c.definition}</dd></Fragment>)}</dl>
          <p className="small muted">6つの力を、あなたの目標に結びつけて考えます。全員に一律で必要という意味ではありません。</p>
        </div>
      ) : null}
      {no === 8 ? (
        <div className="card">
          <h3 className="section-title">LIFE STAGE<span>｜1.0〜5.0</span></h3>
          <dl className="kv">{LIFE_STAGE_STEPS.map((s) => <Fragment key={s.code}><dt>LIFE STAGE {s.code}</dt><dd>{s.label}</dd></Fragment>)}</dl>
          <p className="small muted">4.0・5.0 の詳細教材は別途確定します。</p>
        </div>
      ) : null}
      {no === 9 ? <SideQuest /> : null}

      <StageForm stage={stage} initial={answers} state={state} userId={access.user_id!} imageUrls={imageUrls} desires={desires}
        report={no === 10 ? consistencyReport(confirmed) : undefined} />

      <div className="row" style={{ marginTop: 16 }}>
        <Link className="btn ghost" href="/apps/APP01">{COPY.back}</Link>
        {no > 1 ? <Link className="btn ghost" href={`/apps/APP01/level/${no - 1}`}>← LEVEL {String(no - 1).padStart(2, "0")}</Link> : null}
      </div>
    </>
  );
}
