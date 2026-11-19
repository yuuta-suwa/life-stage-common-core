import Link from "next/link";
import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash, formatDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { completionChecklist, type Json } from "@/features/app02/logic";
import { loadBlueprint, loadGrowthPlanState, loadPlan, loadSteps, stepData } from "@/features/app02/data";
import { requireStarted } from "@/features/app02/guard";
import { finishApp02, handoffToApp03, retryHandoff } from "../actions";

/** S18 修了確認・APP03 引継ぎ（仕様 §04・§21）。将来の達成や APP03 の認定は修了条件にしない */
export default async function CompletePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; transfer?: string }> }) {
  const access = await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02/complete");
  const sp = await searchParams;
  const supabase = await createClient();
  await requireStarted(supabase);
  const [steps, { plan }, { bp }, { snapshot, transfer }] = await Promise.all([loadSteps(supabase), loadPlan(supabase), loadBlueprint(supabase), loadGrowthPlanState(supabase)]);
  const check = completionChecklist({ steps, plan, hasVision: Boolean(bp) || Boolean((stepData(steps, "vision") as Json).provisional_vision) });
  const hasApp03 = access.apps.some((a) => a.code === "APP03" && a.granted);
  const stale = Boolean(snapshot && plan && (snapshot.payload as { start_year?: number }).start_year !== plan.start_year);

  return (
    <>
      <div className="page-head">
        <div className="en">COMPLETION｜修了確認・APP03 引継ぎ</div>
        <h1>あなたの10ヵ年計画を承認する</h1>
        <p>修了に必要な項目を確認し、計画を承認します。承認した計画は、APP03 で「目標」として受け取られ、実績とは別に管理されます。</p>
      </div>
      <Flash error={sp.error} ok={sp.ok === "approved" ? "計画を承認しました。" : undefined} />

      <section className="card">
        <h2 className="section-title">CHECKLIST<span>｜修了に必要な項目</span></h2>
        <ul className="checklist">
          {check.items.map((i) => (
            <li key={i.key} className={i.ok ? "ok-text" : undefined}>{i.ok ? "✓" : "□"} {i.label}</li>
          ))}
        </ul>
        <p className="small muted">将来の達成や APP03 での認定は、APP02 の修了条件ではありません。</p>
      </section>

      {snapshot ? (
        <section className="card">
          <h2 className="section-title">APPROVED<span>｜承認済みの計画（第{snapshot.version}版・{formatDateTime(snapshot.confirmed_at)}）</span></h2>
          {stale ? <div className="notice warn">承認後に計画を変更しています。変更を APP03 に渡すには、もう一度承認してください（新しい版になります）。</div> : null}
          {transfer?.status === "succeeded" ? (
            <div className="notice ok">承認済みの計画を APP03 に引き継ぎました。{hasApp03 ? <Link href="/apps/APP03"> APP03 へ進む →</Link> : "APP03 の利用権限が付与されると、APP03 で計画を使えます。"}</div>
          ) : transfer?.status === "failed" ? (
            <>
              <div className="notice warn">計画は保存されています。APP03 への引き継ぎを再試行してください。{transfer.last_error === "TARGET_APP_ACCESS_DENIED" ? "（APP03 の利用権限がまだ付与されていません。管理者にご確認ください）" : ""}</div>
              <form action={retryHandoff}><input type="hidden" name="transfer_id" value={transfer.id} /><SubmitButton className="btn gold">引き継ぎを再試行する</SubmitButton></form>
            </>
          ) : (
            <form action={handoffToApp03}>
              <p>APP03 には、承認した人生ビジョンの版・学習結果・能力別の暫定現在地・年度別の到達目標・重点能力・必要な経験・達成判断基準・目標年度・承認日時を渡します。APP03 の実績が APP02 の承認済み計画を書き換えることはありません。</p>
              <label className="check"><input type="checkbox" name="consent" required /> 承認済みの計画を APP03 に引き継ぐことに同意します</label>
              <div style={{ marginTop: 12 }}><SubmitButton className="btn gold">APP03 に引き継ぐ</SubmitButton></div>
            </form>
          )}
        </section>
      ) : null}

      {!snapshot || stale ? (
        <form action={finishApp02} className="card">
          <h2 className="section-title">APPROVE<span>｜計画の承認</span></h2>
          {!check.ready ? <div className="notice info">未完了の項目があります。上のチェックリストの □ の項目を完了してください。</div> : null}
          <label className="check"><input type="checkbox" name="confirm" required disabled={!check.ready} /> 内容を確認し、この10ヵ年計画を自分の意思で承認します</label>
          <div style={{ marginTop: 12 }}><SubmitButton className="btn gold" disabled={!check.ready}>計画を承認する</SubmitButton></div>
        </form>
      ) : null}
    </>
  );
}
