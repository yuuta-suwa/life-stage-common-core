import Link from "next/link";
import { requirePage } from "@/lib/access";

/**
 * APP01 の外枠。ここでは「有効な利用者」であることのみ確認する（共有を受け取るメンターは APP01 権限が無い場合があるため）。
 * 各ページで改めて requirePage を呼ぶ（レイアウトだけで守らない）。
 */
export default async function App01Layout({ children }: { children: React.ReactNode }) {
  const access = await requirePage({ kind: "active" }, "/apps/APP01");
  const hasApp = access.apps.some((a) => a.code === "APP01" && a.granted);
  return (
    <div className="app01">
      <nav className="app01-nav no-print" aria-label="APP01 メニュー">
        <span className="app01-brand">APP01<b>THE FINAL DISCOVERY</b></span>
        {hasApp ? (
          <>
            <Link href="/apps/APP01">HOME</Link>
            <Link href="/apps/APP01/discovery">MY LIFE DISCOVERY</Link>
            <Link href="/apps/APP01/shares">共有と返信</Link>
          </>
        ) : null}
        <Link href="/apps/APP01/received">受け取った共有</Link>
      </nav>
      <main className="narrow app01-main">{children}</main>
    </div>
  );
}
