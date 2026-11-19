import Link from "next/link";
import { ANALYSIS, STEPS } from "./logic";

/** 各ステップ共通の見出しと 戻る／次へ（仕様 §16「戻る／次へ／保存状態表示を共通化」） */
export function StepHeader({ code, intro }: { code: string; intro: string }) {
  const order = [STEPS[0], STEPS[1], STEPS[2], ANALYSIS, ...STEPS.slice(3)] as { code: string; path: string; en: string; ja: string; no?: number }[];
  const i = order.findIndex((s) => s.code === code);
  const s = order[i];
  const prev = order[i - 1], next = order[i + 1];
  return (
    <>
      <div className="page-head">
        <div className="en">{s.no ? `STEP ${s.no}｜` : "CORE｜"}{s.en}</div>
        <h1>{s.ja}</h1>
        <p>{intro}</p>
      </div>
      <nav className="row step-nav no-print" aria-label="前後のステップ">
        {prev ? <Link className="btn small ghost" href={`/apps/APP02/${prev.path}`}>← {prev.ja}</Link> : <Link className="btn small ghost" href="/apps/APP02">← HOME</Link>}
        {next ? <Link className="btn small ghost" href={`/apps/APP02/${next.path}`}>{next.ja} →</Link> : <Link className="btn small ghost" href="/apps/APP02/complete">修了確認 →</Link>}
      </nav>
    </>
  );
}

export const nextPath = (code: string) => {
  const order = [STEPS[0], STEPS[1], STEPS[2], ANALYSIS, ...STEPS.slice(3)] as { code: string; path: string }[];
  const i = order.findIndex((s) => s.code === code);
  return `/apps/APP02/${order[i + 1]?.path ?? "complete"}`;
};
