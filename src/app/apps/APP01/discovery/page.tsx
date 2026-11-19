import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { CopyButton, PrintButton } from "@/components/copy-button";
import { formatDateTime } from "@/components/ui";
import { getStage } from "@/features/app01/stages";
import { COPY } from "@/features/app01/copy";
import { DISCOVERY_CARDS, blueprintShareText, isBlueprintStale, shareText, stageItems, stageStates, visionImages, type DisplayItem } from "@/features/app01/logic";
import { hasApp01Consent, loadBlueprintState, loadLatestConfirmed, loadStageRows, signedVisionUrls } from "@/features/app01/data";
import type { buildBlueprint } from "@/features/app01/logic";

/** MY LIFE DISCOVERY｜あなたが明確にした 10 のこと（仕様 §8） */
export default async function DiscoveryPage() {
  const access = await requirePage({ kind: "app", code: "APP01" }, "/apps/APP01/discovery");
  const supabase = await createClient();
  if (!(await hasApp01Consent(supabase))) redirect("/apps/APP01");
  const [rows, latest, bp] = await Promise.all([loadStageRows(supabase), loadLatestConfirmed(supabase), loadBlueprintState(supabase)]);
  const states = stageStates(rows);
  const stale = isBlueprintStale(states, Boolean(bp.snapshot));
  const vision = latest[3] ? visionImages(latest[3].answers) : [];
  const urls = await signedVisionUrls(supabase, vision.map((v) => v.key));
  const name = access.display_name ?? "";

  const cardItems = (no: number): DisplayItem[] => {
    if (no === 10) {
      // 自己実現への決意：最初の行動・開始日（LEVEL09 の確定回答）
      const s9 = getStage(9)!;
      return latest[9] ? stageItems(s9, latest[9].answers).filter((i) => i.key === "q7" || i.key === "q8") : [];
    }
    const s = getStage(no)!;
    return latest[no] ? stageItems(s, latest[no].answers) : [];
  };

  return (
    <>
      <div className="page-head">
        <div className="en">MY LIFE DISCOVERY</div>
        <h1>{COPY.discoveryTitle}</h1>
        <p>各項目には、あなたが最後に確定した回答をそのまま表示しています。</p>
      </div>

      <div className="discovery-grid">
        {DISCOVERY_CARDS.map((c) => {
          const items = cardItems(c.no);
          const sourceNo = c.no === 10 ? 9 : c.no;
          const st = states[sourceNo];
          const recheck = st === "recheck" || (st === "draft" && Boolean(latest[sourceNo]));
          return (
            <section key={c.no} className="card discovery-card">
              <div className="stage-no">{String(c.no).padStart(2, "0")}</div>
              <h2>{c.name}</h2>
              <p className="small muted">{c.data}</p>
              {recheck ? <span className="badge danger">{COPY.recheck}</span> : null}
              {c.no === 3 && vision.length ? (
                <div className="vision-thumbs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {vision.map((v) => (urls[v.key] ? <img key={v.key} src={urls[v.key]} alt={v.caption || v.desire || "ビジョン画像"} /> : null))}
                </div>
              ) : null}
              {items.length ? (
                <dl className="answers">
                  {items.map((i) => (<div key={i.key}><dt>{i.label}</dt><dd>{i.value}</dd></div>))}
                </dl>
              ) : <p className="muted">{COPY.unset}</p>}
              <div className="row no-print">
                <Link className="btn small ghost" href={`/apps/APP01/level/${sourceNo}`}>編集</Link>
                {items.length ? (
                  <CopyButton label="文章で共有" text={shareText({
                    displayName: name, recipientRole: "", recipientName: "", stageNo: sourceNo, state: "confirmed",
                    sharedAt: new Date(), items: items.filter((i) => !i.sensitive),
                  })} />
                ) : null}
                <button type="button" className="btn small ghost" disabled title="準備中">画像で共有</button>
              </div>
            </section>
          );
        })}
      </div>

      <div className="card no-print" style={{ marginTop: 20 }}>
        <h2 className="section-title">MY LIFE BLUEPRINT<span>｜人生設計の完成・出力</span></h2>
        {bp.snapshot ? (
          <>
            {stale ? <div className="notice warn">{COPY.blueprintStale}<div style={{ marginTop: 8 }}><Link className="btn small gold" href="/apps/APP01/level/10">LEVEL10 で再確認する</Link></div></div>
              : <p>人生設計は完成しています（第{bp.snapshot.version}版・{formatDateTime(bp.snapshot.confirmed_at)}）。</p>}
            {stale ? <p className="small muted">以下は前回完成時（第{bp.snapshot.version}版）の内容です。</p> : null}
            <div className="row">
              <PrintButton className="btn gold" label={COPY.saveBlueprint} />
              <CopyButton className="btn ghost" label="文章で共有する" text={blueprintShareText(name, bp.snapshot.payload as ReturnType<typeof buildBlueprint>)} />
              <button type="button" className="btn ghost" disabled title="準備中">画像で共有する</button>
              <PrintButton className="btn ghost" label="PDF で共有する" />
              <Link className="btn" href="/apps/APP01/final">最終メッセージへ</Link>
            </div>
            <p className="small muted">印刷画面で「PDF に保存」を選ぶと PDF として保存できます。{COPY.irrevocable}</p>
          </>
        ) : (
          <p>LEVEL10 で「{COPY.finalize}」を行うと、MY LIFE BLUEPRINT が完成します。</p>
        )}
      </div>
    </>
  );
}
