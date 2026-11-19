"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { messageFor } from "@/lib/errors";
import { completeStep, saveStep } from "@/app/apps/APP02/actions";
import type { Json } from "./logic";
import { SCENE_LABEL, type Scene } from "./prompts";

type SaveState = "idle" | "saving" | "saved" | "error";

/** ステップの入力を1秒後に自動保存し、画面を離れる・タブを隠す時にも未保存分を保存する（APP01 と同じ方式） */
export function useStepData<T extends Json>(step: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [state, setState] = useState<SaveState>("idle");
  const dirty = useRef(false);
  const latest = useRef(data);

  const persist = useCallback(async (value: T) => {
    setState("saving");
    const r = await saveStep(step, value).catch(() => ({ ok: false as const, code: "NETWORK" }));
    if (r.ok) dirty.current = false;
    setState(r.ok ? "saved" : "error");
    return r.ok;
  }, [step]);

  useEffect(() => {
    latest.current = data;
    if (!dirty.current) return;
    const t = setTimeout(() => void persist(data), 1000);
    return () => clearTimeout(t);
  }, [data, persist]);

  useEffect(() => {
    const flush = () => { if (dirty.current) void saveStep(step, latest.current).then((r) => { if (r.ok) dirty.current = false; }); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (dirty.current) { flush(); e.preventDefault(); } };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("beforeunload", onBeforeUnload); flush(); };
  }, [step]);

  const set = useCallback(<K extends string>(key: K, value: unknown) => {
    dirty.current = true;
    setData((d) => ({ ...d, [key]: value }));
  }, []);
  const flushNow = useCallback(async () => (dirty.current ? persist(latest.current) : true), [persist]);
  return { data, set, state, persist, flushNow, latest };
}

/** 保存状態＋「このステップを完了」。missing が空でなければ完了させない（修了判定に必要な項目だけを示す） */
export function StepSaveBar({ step, state, missing, done, flushNow, next }: {
  step: string; state: SaveState; missing: string[]; done: boolean; flushNow: () => Promise<boolean>; next?: string;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onComplete(flag: boolean) {
    setErr(null);
    if (flag && missing.length) { setErr(`未入力の必須項目：${missing.join("、")}`); return; }
    setBusy(true);
    if (!(await flushNow())) { setBusy(false); setErr(messageFor("NETWORK").ja); return; }
    const r = await completeStep(step, flag).catch(() => ({ ok: false as const, code: "NETWORK" }));
    setBusy(false);
    if (!r.ok) { setErr(messageFor(r.code).ja); return; }
    if (flag && next) router.push(next);
    router.refresh();
  }
  return (
    <div className="save-bar no-print" role="status" aria-live="polite">
      <span className={`save-state ${state}`}>
        {state === "saving" ? "保存中…" : state === "saved" ? "保存しました" : state === "error" ? "保存できませんでした。通信を確認してください。入力は画面に保持しています。" : ""}
      </span>
      {done ? (
        <>
          <span className="badge ok">✓ 完了</span>
          <button type="button" className="btn small ghost" disabled={busy} onClick={() => onComplete(false)}>完了を取り消す</button>
          {next ? <button type="button" className="btn gold" onClick={() => router.push(next)}>次へ →</button> : null}
        </>
      ) : (
        <button type="button" className="btn gold" disabled={busy} onClick={() => onComplete(true)}>{busy ? "処理中…" : "このステップを完了する"}</button>
      )}
      {err ? <div className="notice error save-error" role="alert">{err}</div> : null}
    </div>
  );
}

export type AiNote = { text?: string; status?: "proposed" | "adopted" | "hold" | "rejected" };
const AI_STATUS: Record<NonNullable<AiNote["status"]>, string> = { proposed: "提案（未判断）", adopted: "採用", hold: "保留", rejected: "却下" };

/**
 * ChatGPT に相談（仕様 §08 の代替）。相談文をコピーして本人の ChatGPT に貼り付ける。
 * 回答は「提案」として保存し、本人が採用・保留・却下を選ぶ。採用しても計画や回答は自動では変わらない。
 */
export function AiPanel({ scene, prompt, note, onChange, hint }: {
  scene: Scene; prompt: string; note?: AiNote; onChange?: (n: AiNote) => void; hint?: string;
}) {
  const n = note ?? {};
  return (
    <details className="card ai-panel no-print">
      <summary><b>ChatGPT に相談する</b><span className="small muted">　{SCENE_LABEL[scene]}（任意）</span></summary>
      {hint ? <p className="small">{hint}</p> : null}
      <ol className="guide-steps small">
        <li>「相談文をコピー」→「ChatGPT を開く」→ 貼り付けて送信します。</li>
        <li>回答を読み、参考になる部分を下の欄に貼り付けます（提案として保存されます）。</li>
        <li>採用する場合も、あなたの回答欄にはご自身の言葉で書いてください。AI の提案で計画や回答が自動で変わることはありません。</li>
      </ol>
      <pre className="share-preview">{prompt}</pre>
      <div className="row">
        <CopyButton className="btn" label="相談文をコピー" text={prompt} />
        <a className="btn ghost" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT を開く ↗</a>
      </div>
      {onChange ? (<>
      <div className="field" style={{ marginTop: 12 }}>
        <label>ChatGPT の提案（メモ）<small>状態：{AI_STATUS[n.status ?? "proposed"]}</small></label>
        <textarea rows={4} maxLength={6000} value={n.text ?? ""} onChange={(e) => onChange({ ...n, text: e.target.value, status: n.status ?? "proposed" })} placeholder="ChatGPT の回答から、参考にしたい部分を貼り付け" />
      </div>
      <div className="row" role="group" aria-label="提案の扱い">
        {(["adopted", "hold", "rejected"] as const).map((s) => (
          <button key={s} type="button" className={`btn small ${n.status === s ? "" : "ghost"}`} aria-pressed={n.status === s} disabled={!n.text?.trim()} onClick={() => onChange({ ...n, status: s })}>{AI_STATUS[s]}</button>
        ))}
      </div>
      </>) : <p className="small muted">ChatGPT の提案を採用する場合は、上の入力欄にご自身で反映して保存してください。</p>}
      <p className="small muted">相談文はあなたの操作で ChatGPT（OpenAI 社の外部サービス）に送られます。氏名・住所・勤務先・家族の名前などの個人情報は入れないでください。専門的な判断（医療・法律・投資など）は専門家に確認してください。</p>
    </details>
  );
}

export function TextArea({ id, label, sub, value, onChange, rows = 3, max = 2000, placeholder }: {
  id: string; label: string; sub?: string; value: unknown; onChange: (v: string) => void; rows?: number; max?: number; placeholder?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}{sub ? <small>{sub}</small> : null}</label>
      <textarea id={id} rows={rows} maxLength={max} value={typeof value === "string" ? value : ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Quiz({ items, value, onChange }: { items: { q: string; options: string[]; answer: number }[]; value: number[] | undefined; onChange: (v: number[]) => void }) {
  const v = value ?? [];
  return (
    <div className="quiz">
      {items.map((it, i) => (
        <fieldset key={i} className="card">
          <legend className="q-label"><span className="q-no">{i + 1}</span>{it.q}</legend>
          <div className="checks">
            {it.options.map((o, j) => (
              <label key={j} className="check"><input type="radio" name={`quiz-${i}`} checked={v[i] === j} onChange={() => { const n = [...v]; n[i] = j; onChange(n); }} /> {o}</label>
            ))}
          </div>
          {v[i] !== undefined ? (
            <p className={`small ${v[i] === it.answer ? "ok-text" : "warn-text"}`} role="status">{v[i] === it.answer ? "そのとおりです。" : "もう一度、上の説明を読んで考えてみましょう。"}</p>
          ) : null}
        </fieldset>
      ))}
    </div>
  );
}
export const quizPassed = (items: { answer: number }[], v: unknown) => Array.isArray(v) && items.every((it, i) => v[i] === it.answer);
