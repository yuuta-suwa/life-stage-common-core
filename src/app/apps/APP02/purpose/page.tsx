import Link from "next/link";
import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash, formatDateTime } from "@/components/ui";
import { PURPOSE_REASONS, PURPOSE_STATUS, RELATION_LABEL } from "@/features/app02/content";

/** S16 RETURN TO PURPOSE（軸に戻す）：本人・報告者・割当先・（エスカレーション時）運営管理者が見られる報告の一覧 */
export default async function PurposeList({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const access = await requirePage({ kind: "active" }, "/apps/APP02/purpose");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: reports } = await supabase.from("app02_purpose_reports")
    .select("id, owner_id, reporter_id, assignee_id, source, reason, status, assigned_role, escalated, created_at, updated_at").order("updated_at", { ascending: false }).limit(200);
  const hasApp02 = access.apps.some((a) => a.code === "APP02" && a.granted);
  const ownerIds = [...new Set((reports ?? []).map((r) => r.owner_id))];
  const { data: profiles } = ownerIds.length ? await supabase.from("profiles").select("id, display_name").in("id", ownerIds) : { data: [] };
  const nameOf = (id: string) => (id === access.user_id ? "あなた" : `${(profiles ?? []).find((p) => p.id === id)?.display_name || "利用者"}さん`);
  return (
    <>
      <div className="page-head">
        <div className="en">RETURN TO PURPOSE｜軸に戻す</div>
        <h1>AI や推奨のズレを、人が確認して軸に戻す</h1>
        <p>AI が思考を支援し、人が方向性を確認し、本人が人生を決定します。報告は「受付 → 確認中 → 修正案提示 → 本人確認待ち → 完了」と進み、経過はすべて記録されます。</p>
      </div>
      <Flash error={sp.error} />
      {hasApp02 ? <p><Link className="btn gold" href="/apps/APP02/purpose/new">＋ 新しく報告する</Link></p> : null}
      {!(reports ?? []).length ? <p className="muted">表示できる報告はありません。</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>対象者</th><th>理由・対象</th><th>担当</th><th>状態</th><th>更新</th></tr></thead>
            <tbody>
              {(reports ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{nameOf(r.owner_id)}</td>
                  <td><Link href={`/apps/APP02/purpose/${r.id}`}>{PURPOSE_REASONS.find((x) => x.value === r.reason)?.label}</Link><div className="small muted">{r.source}</div></td>
                  <td>{r.assigned_role ? RELATION_LABEL[r.assigned_role] : "未割当"}{r.escalated ? <span className="badge danger" style={{ marginLeft: 6 }}>エスカレーション</span> : null}</td>
                  <td><span className="badge gold">{PURPOSE_STATUS[r.status]}</span></td>
                  <td className="small">{formatDateTime(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
