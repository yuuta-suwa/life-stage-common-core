import Link from "next/link";
import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { loadSteps, stepDone, stepInit } from "@/features/app02/data";
import { requireStarted } from "@/features/app02/guard";
import { LadderForm } from "@/features/app02/forms/ladder-form";

/** S11 経営者志望ラダー（仕様 §14）。LEGACY 専用 */
export default async function LadderPage() {
  const access = await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02/ladder");
  const supabase = await createClient();
  const ws = await requireStarted(supabase);
  const steps = await loadSteps(supabase);
  return (
    <>
      <div className="page-head"><div className="en">LEGACY｜EXECUTIVE LADDER</div><h1>経営者志望ラダー</h1>
        <p>経営に必要な能力・経験・成果を段階的に整理します。能力レベルだけで経営者としての適格性を判断したり、役職への就任を保証・決定したりするものではありません。</p></div>
      {ws.mode !== "LEGACY" ? (
        <div className="notice info">経営者志望ラダーは LEGACY モードで利用できます（利用資格は管理者が設定します）。<Link href="/apps/APP02">HOME</Link> でモードを確認してください。</div>
      ) : (
        <>
          <LadderForm initial={stepInit(steps, "ladder", access.user_id!)} done={stepDone(steps, "ladder")} />
          <p className="small muted">子会社社長の目標年度（コミット）は <Link href="/apps/APP02/commitment">意思決定</Link> で設定します。コミットの有無はあなたが決めます。</p>
        </>
      )}
    </>
  );
}
