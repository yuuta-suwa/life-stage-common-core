"use client";
import { useMemo, useState } from "react";
import { messageFor } from "@/lib/errors";
import { shareStage } from "@/app/apps/APP01/actions";
import { COPY } from "./copy";
import { shareText, type DisplayItem } from "./logic";

type Target = { mentor_id: string; display_name: string; relation: string };
const RELATION: Record<string, string> = { mentor: "メンター", trainer: "トレーナー", leader: "リーダー" };

/** 共有（仕様 §7）：宛先・範囲・内容・形式・プレビュー。本人の明示操作のみ */
export function SharePanel({ stageNo, items, targets, displayName, defaultNextAction = "" }: {
  stageNo: number; items: DisplayItem[]; targets: Target[]; displayName: string; defaultNextAction?: string;
}) {
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>(items.filter((i) => !i.sensitive).map((i) => i.key));
  const [comment, setComment] = useState("");
  const [nextAction, setNextAction] = useState(defaultNextAction);
  const [result, setResult] = useState<{ ok: boolean; code?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const chosen = items.filter((i) => selected.includes(i.key));
  const first = targets.find((t) => recipients.includes(t.mentor_id));
  const preview = useMemo(() => shareText({
    displayName, recipientRole: first ? RELATION[first.relation] ?? "" : "", recipientName: first?.display_name ?? "",
    stageNo, state: "confirmed", sharedAt: new Date(), items: chosen, nextAction, comment,
  }), [displayName, first, stageNo, chosen, nextAction, comment]);

  function toggleItem(i: DisplayItem, on: boolean) {
    if (on && i.sensitive && !window.confirm("個人情報・家計・資産・人間関係の詳細を含む項目です。共有してよろしいですか？")) return;
    setSelected((s) => (on ? [...s, i.key] : s.filter((k) => k !== i.key)));
  }

  async function shareInApp() {
    if (!window.confirm(COPY.shareConfirm)) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("stage", String(stageNo));
    recipients.forEach((r) => fd.append("recipients", r));
    selected.forEach((k) => fd.append("items", k));
    fd.set("comment", comment);
    fd.set("next_action", nextAction);
    const r = await shareStage(fd).catch(() => ({ ok: false, code: "UNKNOWN" }));
    setBusy(false);
    setResult(r);
  }

  if (!open) {
    return (
      <div className="card no-print">
        <button type="button" className="btn ghost" onClick={() => setOpen(true)}>{COPY.shareCta}</button>
        <p className="small muted" style={{ margin: "6px 0 0" }}>{COPY.optionalShare}</p>
      </div>
    );
  }

  return (
    <div className="card no-print share-panel">
      <h3 className="section-title">SHARE<span>｜{COPY.shareCta}</span></h3>

      <div className="field">
        <label>宛先<small>{COPY.shareTargets}（複数選択可）</small></label>
        {targets.length ? (
          <div className="checks">
            {targets.map((t) => (
              <label key={t.mentor_id} className="check">
                <input type="checkbox" checked={recipients.includes(t.mentor_id)}
                  onChange={(e) => setRecipients((r) => (e.target.checked ? [...r, t.mentor_id] : r.filter((x) => x !== t.mentor_id)))} />
                {RELATION[t.relation] ?? t.relation}　{t.display_name || "（表示名未設定）"}
              </label>
            ))}
          </div>
        ) : <div className="notice info">{COPY.noShareTarget}</div>}
      </div>

      <div className="field">
        <label>共有する内容<small>範囲：現在の LEVEL のみ／本人の確定回答。AI の結果は含めません</small></label>
        <div className="share-items">
          {items.map((i) => (
            <label key={i.key} className="check" style={{ width: "100%" }}>
              <input type="checkbox" checked={selected.includes(i.key)} onChange={(e) => toggleItem(i, e.target.checked)} />
              <span><b>{i.label}</b>{i.sensitive ? <span className="badge warn" style={{ marginLeft: 6 }}>要確認</span> : null}<br /><span className="small muted">{i.value}</span></span>
            </label>
          ))}
        </div>
      </div>

      <div className="row">
        <div className="field"><label htmlFor={`na-${stageNo}`}>次に取り組むこと</label><input id={`na-${stageNo}`} type="text" maxLength={500} value={nextAction} onChange={(e) => setNextAction(e.target.value)} /></div>
        <div className="field"><label htmlFor={`cm-${stageNo}`}>本人からのコメント</label><input id={`cm-${stageNo}`} type="text" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
      </div>

      <div className="field">
        <label>プレビュー<small>形式：{COPY.shareFormats}</small></label>
        <pre className="share-preview">{preview}</pre>
      </div>

      <div className="row">
        <button type="button" className="btn" disabled={busy || !recipients.length || !selected.length} onClick={shareInApp}>
          {busy ? "共有中…" : "アプリ内で共有する"}
        </button>
        <button type="button" className="btn ghost" onClick={async () => { await navigator.clipboard.writeText(preview); setCopied(true); }}>
          {copied ? "コピーしました" : "文章で共有（コピー）"}
        </button>
        <button type="button" className="btn ghost" onClick={() => window.print()}>PDF で共有（印刷・PDF保存）</button>
        <button type="button" className="btn ghost" disabled title="準備中">画像で共有（準備中）</button>
      </div>
      {result ? (
        result.ok ? <div className="notice ok" role="status">{COPY.shareSuccess}</div>
          : <div className="notice error" role="alert">{COPY.shareFailed}（{messageFor(result.code).ja}）</div>
      ) : null}
      <p className="small muted">{COPY.irrevocable}</p>
    </div>
  );
}
