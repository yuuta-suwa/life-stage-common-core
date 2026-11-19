import Link from "next/link";
import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { STAGES } from "@/features/app01/stages";
import { COPY } from "@/features/app01/copy";
import { resumeStage, stageStates, xp, type StageState } from "@/features/app01/logic";
import { hasApp01Consent, loadBlueprintState, loadStageRows } from "@/features/app01/data";
import { startQuest } from "./actions";

const STATE_LABEL: Record<StageState, { label: string; tone: string }> = {
  locked: { label: "🔒 未開放", tone: "plain" },
  available: { label: "挑戦できます", tone: "gold" },
  draft: { label: "入力中（下書き）", tone: "warn" },
  confirmed: { label: "✓ 確定済み", tone: "ok" },
  recheck: { label: "再確認が必要", tone: "danger" },
};

export default async function App01Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePage({ kind: "app", code: "APP01" }, "/apps/APP01");
  const sp = await searchParams;
  const supabase = await createClient();
  const consented = await hasApp01Consent(supabase);

  if (!consented) {
    return (
      <>
        <section className="hero">
          <div className="en">LIFE STAGE APP01｜THE FINAL DISCOVERY</div>
          <h1>{COPY.homeHeading}</h1>
          <p>{COPY.start}</p>
        </section>
        <Flash error={sp.error} />
        <div className="card">
          <h2 className="section-title">BEFORE YOU START<span>｜はじめに</span></h2>
          <ul>
            <li><b>APP01 の目的</b>：あなたの願望・幸福・人生の目的・目標と期限を明確にし、人生設計（MY LIFE BLUEPRINT）として完成させます。</li>
            <li><b>データの利用</b>：回答はあなた本人だけが閲覧・編集できます。管理者も内容は閲覧しません。いつでも出力・削除の請求ができます。</li>
            <li><b>共有は任意</b>：メンター／トレーナー／リーダーへの共有は、あなたが選んだ内容だけを、あなたの操作でのみ行います。レベルクリアに共有は必要ありません。</li>
            <li><b>AI について</b>：現在 AI 精査は導入していません。回答はあなた自身の言葉で確定します。</li>
          </ul>
          <form action={startQuest}>
            <SubmitButton className="btn gold">{COPY.startCta}（同意して開始）</SubmitButton>
          </form>
        </div>
      </>
    );
  }

  const [rows, bp] = await Promise.all([loadStageRows(supabase), loadBlueprintState(supabase)]);
  const states = stageStates(rows);
  const score = xp(rows);
  const resume = resumeStage(states);
  const started = rows.length > 0;

  return (
    <>
      <section className="hero" style={{ paddingTop: 24 }}>
        <div className="en">LIFE STAGE APP01｜THE FINAL DISCOVERY</div>
        <h1>{COPY.homeHeading}</h1>
        <p>{COPY.start}</p>
      </section>
      <Flash error={sp.error} />

      <div className="grid kpi">
        <div className="card kpi-card gold"><div className="label"><b>XP</b>経験値</div><div className="value">{score.xp}<span className="small muted"> / {score.max}</span></div></div>
        <div className="card kpi-card"><div className="label"><b>BADGES</b>バッジ</div><div className="value">{score.badges.length}<span className="small muted"> / 10</span></div></div>
        <div className="card kpi-card"><div className="label"><b>BLUEPRINT</b>人生設計</div><div className="value" style={{ fontSize: 18 }}>{bp.snapshot ? "完成" : "作成中"}</div></div>
      </div>

      <div className="row" style={{ margin: "18px 0" }}>
        <Link className="btn gold" href={`/apps/APP01/level/${resume}`}>{started ? COPY.resumeCta : COPY.startCta}</Link>
        {score.badges.length ? <Link className="btn ghost" href="/apps/APP01/discovery">MY LIFE DISCOVERY</Link> : null}
        {bp.snapshot ? <Link className="btn ghost" href="/apps/APP01/final">最終メッセージ・APP02 へ</Link> : null}
      </div>

      <h2 className="section-title">QUEST MAP<span>｜10 のステージ</span></h2>
      <div className="stage-list">
        {STAGES.map((s) => {
          const st = states[s.no];
          const content = (
            <>
              <div className="stage-no">LEVEL {String(s.no).padStart(2, "0")}{score.badges.includes(s.no) ? <span title="バッジ獲得"> 🏅</span> : null}</div>
              <div className="stage-code">{s.code}</div>
              <div className="stage-title">{s.title}</div>
              <span className={`badge ${STATE_LABEL[st].tone}`}>{STATE_LABEL[st].label}</span>
            </>
          );
          return st === "locked"
            ? <div key={s.no} className="stage-item locked" aria-disabled="true">{content}</div>
            : <Link key={s.no} className={`stage-item ${st}`} href={`/apps/APP01/level/${s.no}`}>{content}</Link>;
        })}
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        確定後もいつでも編集できます。編集するとその LEVEL は下書きに戻り、確定済みの後続 LEVEL は「再確認が必要」になります。ランキングや未達ペナルティはありません。
      </p>
    </>
  );
}
