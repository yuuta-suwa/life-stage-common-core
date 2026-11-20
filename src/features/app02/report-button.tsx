"use client";
import { useState } from "react";
import Link from "next/link";
import { messageFor } from "@/lib/errors";
import { reportPurpose } from "@/app/apps/APP02/actions-p2";
import { PURPOSE_REASONS } from "./content";
import type { Json } from "./logic";

/** 「違和感を報告／軸に戻す」（仕様 §09-1）：各 AI 分析・推奨結果に設置 */
export function ReportButton({ source, original, label = "違和感を報告／軸に戻す" }: { source: string; original?: Json; label?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("vision");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ok: boolean; text: string; id?: string } | null>(null);
  async function submit() {
    setBusy(true);
    const r = await reportPurpose({ source, reason, comment, original }).catch(() => ({ ok: false as const, code: "NETWORK" }));
    setBusy(false);
    setDone(r.ok ? { ok: true, text: "報告しました。担当者が確認します。", id: r.id } : { ok: false, text: messageFor(r.code).ja });
    if (r.ok) setOpen(false);
  }
  return (
    <div className="report-button no-print">
      {!open ? <button type="button" className="btn small ghost" onClick={() => { setOpen(true); setDone(null); }}>⚑ {label}</button> : (
        <div className="card report-form">
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor={`rp-${source}`}>理由</label>
            <select id={`rp-${source}`} value={reason} onChange={(e) => setReason(e.target.value)}>
              {PURPOSE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor={`rpc-${source}`}>コメント（任意）</label><textarea id={`rpc-${source}`} rows={2} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
          <div className="row">
            <button type="button" className="btn small" disabled={busy} onClick={submit}>{busy ? "送信中…" : "報告する"}</button>
            <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>やめる</button>
          </div>
          <p className="small muted">報告は、理由に応じてメンター（人生ビジョン）・トレーナー（能力・計画）・リーダー（事実・その他）に届きます。決めるのはあなたです。</p>
        </div>
      )}
      {done ? <div className={`notice ${done.ok ? "ok" : "error"} small`} role="status">{done.text}{done.id ? <> <Link href={`/apps/APP02/purpose/${done.id}`}>経過を見る</Link></> : null}</div> : null}
    </div>
  );
}
