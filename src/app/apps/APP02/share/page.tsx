import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash, formatDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { RELATION_LABEL, SHARE_ITEMS, type Mode } from "@/features/app02/content";
import { shareItemValue } from "@/features/app02/share";
import { loadBlueprint, loadPlan, loadSteps } from "@/features/app02/data";
import { requireStarted } from "@/features/app02/guard";
import { ShareForm } from "@/features/app02/forms/share-form";
import type { Json } from "@/features/app02/logic";
import { decideReview, revokeShareApp02 } from "../actions-p2";

type Scope = { items?: { key: string; label: string; value: string }[]; message?: string };
const REVIEW_STATUS: Record<string, string> = { open: "未判断", adopted: "採用", hold: "保留", rejected: "却下" };
const OK: Record<string, string> = { shared: "共有しました。", revoked: "共有を撤回しました。", review: "レビューの扱いを記録しました。" };

/** S14 共有設定（SHARED VISION）と、伴走者からのコメント・修正案（T07・T17） */
export default async function SharePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const access = await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02/share");
  const sp = await searchParams;
  const supabase = await createClient();
  const ws = await requireStarted(supabase);
  const [steps, { plan, cells }, { bp }, { data: targets }, { data: shares }] = await Promise.all([
    loadSteps(supabase), loadPlan(supabase), loadBlueprint(supabase), supabase.rpc("my_share_targets"),
    supabase.from("data_shares").select("id, grantee_id, scope, status, created_at, revoked_at").eq("owner_id", access.user_id!).eq("app_code", "APP02").order("created_at", { ascending: false }),
  ]);
  const byCode = Object.fromEntries(steps.map((s) => [s.step_code, s.data])) as Record<string, Json>;
  const previews = Object.fromEntries(SHARE_ITEMS.map((i) => [i.key, shareItemValue(i.key, { bp, steps: byCode, plan, cells, mode: ws.mode as Mode })]));
  const ids = (shares ?? []).map((s) => s.id);
  const people = [...new Set((shares ?? []).map((s) => s.grantee_id))];
  const [{ data: reviews }, { data: profiles }] = await Promise.all([
    ids.length ? supabase.from("app02_reviews").select("id, share_id, kind, target, body, status, created_at").in("share_id", ids).order("created_at") : Promise.resolve({ data: [] }),
    people.length ? supabase.from("profiles").select("id, display_name").in("id", people) : Promise.resolve({ data: [] }),
  ]);
  const t = (targets ?? []) as { mentor_id: string; display_name: string; relation: string }[];
  const nameOf = (id: string) => (profiles ?? []).find((p) => p.id === id)?.display_name || "担当者";
  const relOf = (id: string) => t.find((x) => x.mentor_id === id)?.relation;

  return (
    <>
      <div className="page-head">
        <div className="en">SHARED VISION｜共有設定</div>
        <h1>リーダー・トレーナー・メンターに共有する</h1>
        <p>あなたが選んだ項目だけを、あなたの担当者に共有します。AI が考え、人が方向性を確認し、あなたが決めるための仕組みです。</p>
      </div>
      <Flash error={sp.error} ok={sp.ok ? OK[sp.ok] : undefined} />
      <ShareForm targets={t} previews={previews} />

      <h2 className="section-title">HISTORY<span>｜共有履歴と、届いたコメント・修正案</span></h2>
      {!(shares ?? []).length ? <p className="muted">まだ共有していません。</p> : null}
      {(shares ?? []).map((s) => {
        const scope = (s.scope ?? {}) as Scope;
        const rv = (reviews ?? []).filter((r) => r.share_id === s.id);
        const rel = relOf(s.grantee_id);
        return (
          <section key={s.id} className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div><b>{rel ? `${RELATION_LABEL[rel]}　` : ""}{nameOf(s.grantee_id)}</b><div className="small muted">共有日時：{formatDateTime(s.created_at)}／{(scope.items ?? []).map((i) => i.label.replace(/（.*$/, "")).join("・")}</div></div>
              {s.status === "active" ? <span className="badge ok">共有中</span> : <span className="badge plain">撤回済（{formatDateTime(s.revoked_at)}）</span>}
            </div>
            {rv.length ? rv.map((r) => (
              <div key={r.id} className="feedback">
                <div className="small muted">{r.kind === "proposal" ? "修正案" : "コメント"}{r.target ? `（${SHARE_ITEMS.find((i) => i.key === r.target)?.label ?? r.target}）` : ""}・{formatDateTime(r.created_at)}・<b>{REVIEW_STATUS[r.status]}</b></div>
                {r.body}
                <form action={decideReview} className="row" style={{ marginTop: 6 }}>
                  <input type="hidden" name="review_id" value={r.id} />
                  {(["adopted", "hold", "rejected"] as const).map((st) => (
                    <button key={st} name="status" value={st} type="submit" className={`btn small ${r.status === st ? "" : "ghost"}`}>{REVIEW_STATUS[st]}</button>
                  ))}
                </form>
              </div>
            )) : <p className="small muted">コメント・修正案はまだありません。</p>}
            <p className="small muted">修正案を採用しても、計画は自動では変わりません。採用する内容は、該当する画面であなたが反映してください。</p>
            {s.status === "active" ? (
              <form action={revokeShareApp02}><input type="hidden" name="share_id" value={s.id} />
                <SubmitButton className="btn small danger" confirm="この共有を撤回します。相手はアプリ内で閲覧できなくなります。よろしいですか？">撤回する</SubmitButton></form>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
