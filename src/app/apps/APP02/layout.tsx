import Link from "next/link";
import { requirePage } from "@/lib/access";

/**
 * APP02 の外枠。ここでは「有効な利用者」であることのみ確認する
 * （共有を受け取るリーダー・トレーナー・メンター、エスカレーションを扱う運営管理者は APP02 権限が無い場合があるため）。
 * 本人用の各ページは requirePage({ kind: "app", code: "APP02" }) で改めて守る（レイアウトだけで守らない）。
 */
export default async function App02Layout({ children }: { children: React.ReactNode }) {
  const access = await requirePage({ kind: "active" }, "/apps/APP02");
  const app02 = access.apps.find((a) => a.code === "APP02" && a.granted);
  const legacy = Boolean(app02?.app_roles?.some((r) => r.role === "legacy_eligible"));
  return (
    <div className="app01 app02">
      <nav className="app01-nav no-print" aria-label="APP02 メニュー">
        <span className="app01-brand">APP02<b>SELF-REALIZATION ENGINE</b></span>
        {app02 ? (
          <>
            <Link href="/apps/APP02">HOME</Link>
            <Link href="/apps/APP02/analysis">自己実現分析</Link>
            <Link href="/apps/APP02/roadmap">10ヵ年計画</Link>
            {legacy ? <Link href="/apps/APP02/ladder">経営者志望ラダー</Link> : null}
            <Link href="/apps/APP02/share">共有</Link>
            <Link href="/apps/APP02/history">履歴</Link>
            <Link href="/apps/APP02/complete">修了・APP03</Link>
          </>
        ) : null}
        <Link href="/apps/APP02/purpose">軸に戻す</Link>
        <Link href="/apps/APP02/received">受け取った共有</Link>
      </nav>
      <main className="narrow app01-main app02-main">{children}</main>
    </div>
  );
}
