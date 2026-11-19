import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { COPY, FINAL_MESSAGE } from "@/features/app01/copy";
import { loadBlueprintState, loadStageRows } from "@/features/app01/data";
import { isBlueprintStale, stageStates } from "@/features/app01/logic";
import { handoffToApp02, retryHandoff } from "../actions";

/** 承認済み最終メッセージ（仕様 §9・変更禁止）と APP02 への引き継ぎ（§10） */
export default async function FinalPage({ searchParams }: { searchParams: Promise<{ error?: string; transfer?: string }> }) {
  const access = await requirePage({ kind: "app", code: "APP01" }, "/apps/APP01/final");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ snapshot, transfer }, rows] = await Promise.all([loadBlueprintState(supabase), loadStageRows(supabase)]);
  if (!snapshot) redirect("/apps/APP01/discovery");
  const stale = isBlueprintStale(stageStates(rows), true);
  const hasApp02 = access.apps.some((a) => a.code === "APP02" && a.granted);

  return (
    <>
      <article className="final-message">
        {FINAL_MESSAGE.map((para, i) => (
          <p key={i} className={i < 2 ? "final-head" : i === FINAL_MESSAGE.length - 1 ? "final-next" : undefined}>
            {para.map((line, j) => (<span key={j}>{line}<br /></span>))}
          </p>
        ))}
      </article>

      <div className="card no-print">
        <h2 className="section-title">APP02<span>｜SELF-REALIZATION ENGINE への引き継ぎ</span></h2>
        <Flash error={sp.error} />
        {stale ? (
          <div className="notice warn">
            {COPY.blueprintStale} 再完成するまで、APP02 への引き継ぎは行えません。
            <div style={{ marginTop: 8 }}><Link className="btn small gold" href="/apps/APP01/level/10">LEVEL10 で再確認する</Link></div>
          </div>
        ) : transfer?.status === "succeeded" ? (
          <>
            <div className="notice ok">あなたの人生設計（確定版）を APP02 に引き継ぎました。<span className="en">Handed over to APP02.</span></div>
            {hasApp02 ? <Link className="btn gold" href="/apps/APP02">{COPY.app02Cta}</Link>
              : <p className="small muted">APP02 の利用権限が付与されると、APP02 から引き継いだ内容を利用できます。</p>}
          </>
        ) : transfer?.status === "failed" ? (
          <>
            <div className="notice warn">
              {COPY.app02Failed}（引き継ぎが完了していません。APP01 の人生設計はそのまま保存されています）
              {transfer.last_error === "TARGET_APP_ACCESS_DENIED" ? "（APP02 の利用権限がまだ付与されていません。管理者にご確認ください）" : ""}
            </div>
            <form action={retryHandoff}>
              <input type="hidden" name="transfer_id" value={transfer.id} />
              <SubmitButton className="btn gold">{COPY.app02Retry}</SubmitButton>
            </form>
          </>
        ) : (
          <form action={handoffToApp02}>
            <p>APP02 では、あなたの最新の確定版の人生設計だけを、学習計画の土台として使います。APP01 の内容が書き換えられることはありません。</p>
            <label className="check"><input type="checkbox" name="consent" required /> 人生設計（確定版）を APP02 に引き継ぐことに同意します</label>
            <div style={{ marginTop: 12 }}><SubmitButton className="btn gold">{COPY.app02Cta}</SubmitButton></div>
          </form>
        )}
        <p className="small muted">人生設計を編集して再度完成させた場合は、新しい版をもう一度引き継ぎます。</p>
      </div>
      <div className="row no-print"><Link className="btn ghost" href="/apps/APP01/discovery">MY LIFE DISCOVERY へ戻る</Link></div>
    </>
  );
}
