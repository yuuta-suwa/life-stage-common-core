import Link from "next/link";
import { requirePage } from "@/lib/access";

/** APP02 の外枠。各ページでも requirePage を呼ぶ（レイアウトだけで守らない） */
export default async function App02Layout({ children }: { children: React.ReactNode }) {
  await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02");
  return (
    <div className="app01 app02">
      <nav className="app01-nav no-print" aria-label="APP02 メニュー">
        <span className="app01-brand">APP02<b>SELF-REALIZATION ENGINE</b></span>
        <Link href="/apps/APP02">HOME</Link>
        <Link href="/apps/APP02/analysis">自己実現分析</Link>
        <Link href="/apps/APP02/roadmap">10ヵ年計画</Link>
        <Link href="/apps/APP02/complete">修了・APP03</Link>
      </nav>
      <main className="narrow app01-main app02-main">{children}</main>
    </div>
  );
}
