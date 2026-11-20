import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash, formatDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { abilityName, type AbilityCode } from "@/features/app02/content";
import { requireStarted } from "@/features/app02/guard";
import { resetAllPlan, restoreFromHistory, restoreVersion, saveVersion } from "../actions-p2";

const KIND: Record<string, string> = {
  cell_edit: "セルの編集", cell_reset: "推奨に戻す", undo: "ひとつ戻す", start_year: "開始年の変更", focus: "重点能力", commitment: "目標年度",
  regenerate: "推奨の再生成", restore: "版の復元", reset_all: "全体初期化", version: "版の保存",
};
const REASON: Record<string, string> = {
  manual: "手動保存", before_start_year: "開始年変更前（自動）", before_regenerate: "推奨の再生成前（自動）", before_restore: "復元前（自動）", before_reset: "全体初期化前（自動）", approved: "承認時（自動）",
};
const OK: Record<string, string> = { version: "現在の計画を版として保存しました。", restored: "版を復元しました（復元前の計画も版として保存しています）。", cell_restored: "セルを履歴の値に戻しました。", reset: "全体を初期化しました（初期化前の計画は版として保存しています）。" };
type Cell = { edited_text?: string | null; target_level?: number | null } | null;
const show = (v: Cell) => (!v ? "—" : v.edited_text || v.target_level !== null && v.target_level !== undefined ? `${v.edited_text ?? "（推奨の文）"}${v.target_level !== null && v.target_level !== undefined ? `／LV${v.target_level}` : ""}` : "推奨のまま");

/** S17 履歴・復元（仕様 §12-4・§12-5）。全体初期化は通常画面に置かず、ここの設定で二段階確認 */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requirePage({ kind: "app", code: "APP02" }, "/apps/APP02/history");
  const sp = await searchParams;
  const supabase = await createClient();
  const ws = await requireStarted(supabase);
  const [{ data: versions }, { data: history }, { data: plan }] = await Promise.all([
    supabase.from("app02_plan_versions").select("id, version_no, label, reason, start_year, commit_year, created_at").order("version_no", { ascending: false }),
    supabase.from("app02_plan_history").select("id, kind, ability, year_index, before, after, reason, undone, created_at").order("id", { ascending: false }).limit(300),
    supabase.from("app02_plans").select("start_year").maybeSingle(),
  ]);
  return (
    <>
      <div className="page-head"><div className="en">HISTORY｜履歴・復元</div><h1>計画の変更履歴と、過去の版</h1>
        <p>10ヵ年計画の変更はすべて記録されています。過去の版に戻したり、セルを履歴の時点の値に戻したりできます。戻す操作そのものも記録されます。</p></div>
      <Flash error={sp.error} ok={sp.ok ? OK[sp.ok] : undefined} />
      {!plan ? <div className="notice info">10ヵ年計画を作成すると、ここに履歴が表示されます。</div> : (
        <>
          <section className="card">
            <h2 className="section-title">VERSIONS<span>｜計画の版</span></h2>
            <form action={saveVersion} className="row" style={{ alignItems: "flex-end" }}>
              <div className="field"><label htmlFor="label">名前を付けて現在の計画を保存</label><input id="label" name="label" type="text" maxLength={80} placeholder="例：メンター面談前" /></div>
              <div className="field" style={{ flex: "0 0 auto" }}><SubmitButton>版を保存</SubmitButton></div>
            </form>
            {(versions ?? []).length ? (
              <div className="table-wrap"><table>
                <thead><tr><th>版</th><th>名前</th><th>種類</th><th>開始年・目標年度</th><th>日時</th><th></th></tr></thead>
                <tbody>{(versions ?? []).map((v) => (
                  <tr key={v.id}><td>第{v.version_no}版</td><td>{v.label}</td><td className="small">{REASON[v.reason]}</td><td className="small">{v.start_year}年開始{v.commit_year ? `／${v.commit_year}年` : ""}</td><td className="small">{formatDateTime(v.created_at)}</td>
                    <td><form action={restoreVersion}><input type="hidden" name="version_id" value={v.id} /><SubmitButton className="btn small ghost" confirm={`第${v.version_no}版の計画に戻します。現在の計画は版として自動保存されます。よろしいですか？`}>この版に戻す</SubmitButton></form></td></tr>
                ))}</tbody>
              </table></div>
            ) : <p className="small muted">まだ版はありません（開始年の変更・推奨の再生成・承認のときに自動で保存されます）。</p>}
          </section>

          <section className="card">
            <h2 className="section-title">CHANGES<span>｜変更履歴（新しい順）</span></h2>
            <div className="table-wrap"><table className="history-table">
              <thead><tr><th>日時</th><th>操作</th><th>対象</th><th>変更前 → 変更後</th><th>理由</th><th></th></tr></thead>
              <tbody>{(history ?? []).map((h) => {
                const isCell = Boolean(h.ability) && ["cell_edit", "cell_reset", "undo"].includes(h.kind);
                return (
                  <tr key={h.id} className={h.undone ? "muted" : undefined}>
                    <td className="small">{formatDateTime(h.created_at)}</td>
                    <td>{KIND[h.kind] ?? h.kind}{h.undone ? <span className="small">（取り消し済み）</span> : null}</td>
                    <td className="small">{h.ability ? `${abilityName(h.ability as AbilityCode, ws.mode)}・${h.year_index}年目` : h.year_index ? `${h.year_index}年目` : "—"}</td>
                    <td className="small">{isCell ? `${show(h.before as Cell)} → ${show(h.after as Cell)}` : h.kind === "start_year" ? `${(h.before as { start_year?: number })?.start_year} → ${(h.after as { start_year?: number })?.start_year}` : h.kind === "commitment" ? `${(h.before as { commit_year?: number })?.commit_year ?? "なし"} → ${(h.after as { commit_year?: number })?.commit_year ?? "なし"}` : "—"}</td>
                    <td className="small">{h.reason ?? ""}</td>
                    <td>{isCell ? (
                      <form action={restoreFromHistory} className="row" style={{ gap: 4 }}>
                        <input type="hidden" name="history_id" value={h.id} />
                        <button name="side" value="before" type="submit" className="btn small ghost">変更前に戻す</button>
                        <button name="side" value="after" type="submit" className="btn small ghost">この値に戻す</button>
                      </form>
                    ) : null}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          </section>

          <details className="card" id="settings">
            <summary><b>設定｜全体初期化</b>（すべてのセルを推奨に戻し、重点能力と目標年度を解除します）</summary>
            <form action={resetAllPlan} style={{ marginTop: 10 }}>
              <p className="small">初期化の前の計画は版として自動で保存されるため、上の「この版に戻す」で元に戻せます。</p>
              <label className="check"><input type="checkbox" name="understand" required /> 内容を理解しました（1段階目）</label>
              <div className="field" style={{ maxWidth: 320 }}><label htmlFor="confirm_text">確認のため「全体初期化」と入力（2段階目）</label><input id="confirm_text" name="confirm_text" type="text" required autoComplete="off" /></div>
              <SubmitButton className="btn danger" confirm="10ヵ年計画を全体初期化します。よろしいですか？">全体初期化する</SubmitButton>
            </form>
          </details>
        </>
      )}
    </>
  );
}
