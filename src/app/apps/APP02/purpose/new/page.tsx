import { requirePage } from "@/lib/access";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PURPOSE_REASONS } from "@/features/app02/content";
import { reportPurposeForm } from "../../actions-p2";

const SOURCES = [
  ["vision", "人生ビジョン確認"], ["sales", "セールス力理解"], ["abilities", "6大能力理解"], ["analysis", "自己実現・因果関係分析"],
  ["position", "現在地診断"], ["environment", "成長環境比較"], ["roadmap", "10ヵ年計画（推奨・整合性の指摘）"], ["commitment", "意思決定"],
  ["presentation", "プレゼン"], ["ai", "ChatGPT の提案"], ["other", "その他"],
] as const;

/** 本人による新規報告 */
export default async function NewPurpose({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02/purpose/new");
  const sp = await searchParams;
  return (
    <>
      <div className="page-head"><div className="en">RETURN TO PURPOSE｜新しい報告</div><h1>違和感を報告する</h1>
        <p>理由に応じて、メンター（人生ビジョン）・トレーナー（能力・計画）・リーダー（事実・その他）に割り当てられます。担当者がいない場合は、一覧から割り当てられます。</p></div>
      <Flash error={sp.error} />
      <form action={reportPurposeForm} className="card">
        <input type="hidden" name="back" value="/apps/APP02/purpose/new" />
        <div className="row">
          <div className="field"><label htmlFor="source">どこで感じた違和感ですか</label>
            <select id="source" name="source" defaultValue="analysis">{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label htmlFor="reason">理由</label>
            <select id="reason" name="reason" defaultValue="vision">{PURPOSE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
        </div>
        <div className="field"><label htmlFor="original">元になった AI の提案・推奨の内容（任意）<small>担当者が元の内容を確認できるよう、貼り付けてください</small></label><textarea id="original" name="original" rows={4} maxLength={6000} /></div>
        <div className="field"><label htmlFor="comment">どこが、なぜ自分の軸とずれていると感じましたか</label><textarea id="comment" name="comment" rows={3} maxLength={2000} /></div>
        <SubmitButton className="btn gold">報告する</SubmitButton>
      </form>
    </>
  );
}
