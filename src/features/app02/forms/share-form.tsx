"use client";
import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { shareApp02 } from "@/app/apps/APP02/actions-p2";
import { RELATION_LABEL, RELATION_ROLE, SHARE_DEFAULTS, SHARE_ITEMS } from "../content";

type Target = { mentor_id: string; display_name: string; relation: string };

/** S14 共有設定：宛先（担当者のみ）・項目（役割ごとの初期選択、センシティブは初期 OFF）・プレビュー・同意 */
export function ShareForm({ targets, previews }: { targets: Target[]; previews: Record<string, string> }) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [items, setItems] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const relations = useMemo(() => [...new Set(targets.filter((t) => recipients.includes(t.mentor_id)).map((t) => t.relation))], [targets, recipients]);
  const effective = touched ? items : [...new Set(relations.flatMap((r) => SHARE_DEFAULTS[r] ?? []))];
  const toggleItem = (k: string, on: boolean, sensitive: boolean) => {
    if (on && sensitive && !window.confirm("個人的な事情を含む項目です。共有してよろしいですか？")) return;
    setTouched(true);
    setItems((cur) => { const base = touched ? cur : effective; return on ? [...new Set([...base, k])] : base.filter((x) => x !== k); });
  };
  if (!targets.length) return <div className="notice info">共有できる担当者（リーダー・トレーナー・メンター）が登録されていません。管理者に確認するか、プレゼンの全文コピー・印刷を使ってください。</div>;
  return (
    <form action={shareApp02} className="card share-form">
      <fieldset className="field">
        <legend><b>宛先</b><small>あなたの担当者だけが表示されます（複数選択可）</small></legend>
        <div className="checks">
          {targets.map((t) => (
            <label key={t.mentor_id} className="check">
              <input type="checkbox" name="recipients" value={t.mentor_id} checked={recipients.includes(t.mentor_id)}
                onChange={(e) => setRecipients((r) => (e.target.checked ? [...r, t.mentor_id] : r.filter((x) => x !== t.mentor_id)))} />
              {RELATION_LABEL[t.relation] ?? t.relation}　{t.display_name || "（表示名未設定）"}
            </label>
          ))}
        </div>
        {relations.map((r) => <p key={r} className="small muted" style={{ margin: "4px 0 0" }}>{RELATION_LABEL[r]}の役割：{RELATION_ROLE[r]}</p>)}
      </fieldset>
      <fieldset className="field">
        <legend><b>共有する項目</b><small>{touched ? "あなたが選んだ項目" : "宛先の役割に合わせた初期選択（変更できます）"}</small></legend>
        <div className="share-items">
          {SHARE_ITEMS.map((i) => (
            <label key={i.key} className="check" style={{ width: "100%" }}>
              <input type="checkbox" name="items" value={i.key} checked={effective.includes(i.key)} onChange={(e) => toggleItem(i.key, e.target.checked, i.sensitive)} />
              <span><b>{i.label}</b>{i.sensitive ? <span className="badge warn" style={{ marginLeft: 6 }}>要確認</span> : null}
                <br /><span className="small muted share-preview-line">{(previews[i.key] ?? "").slice(0, 160)}{(previews[i.key] ?? "").length > 160 ? "…" : ""}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field"><label htmlFor="share-message">メッセージ（任意）</label><textarea id="share-message" name="message" rows={2} maxLength={1000} placeholder="例：10ヵ年計画の2〜3年目について意見をください" /></div>
      <p className="small">相手は<b>閲覧とコメント・修正案の提示のみ</b>できます。あなたの回答や計画を編集することはできません。共有した時点の内容が届き、いつでも撤回できます（相手がコピーした内容は回収できません）。</p>
      <label className="check"><input type="checkbox" name="consent" required /> 選んだ項目を、選んだ相手に共有することに同意します</label>
      <div style={{ marginTop: 12 }}><SubmitButton className="btn gold">共有する</SubmitButton></div>
    </form>
  );
}
