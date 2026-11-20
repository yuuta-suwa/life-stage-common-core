"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { messageFor } from "@/lib/errors";
import { completeStep, saveStep } from "@/app/apps/APP02/actions";
import type { Json } from "./logic";
import { SCENE_LABEL, type Scene } from "./prompts";
import { ReportButton } from "./report-button";

type SaveState = "idle" | "saving" | "saved" | "error" | "offline" | "conflict";
type Server = { data: Json; updatedAt: string | null };
type Backup = { data: Json; at: number; base: string | null };

const backupKey = (uid: string, step: string) => `lsc:app02:${uid}:${step}`;
const readBackup = (k: string): Backup | null => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as Backup) : null; } catch { return null; } };
const writeBackup = (k: string, b: Backup) => { try { localStorage.setItem(k, JSON.stringify(b)); } catch { /* 端末の保存領域が使えない場合は保持しない */ } };
const clearBackup = (k: string) => { try { localStorage.removeItem(k); } catch { /* noop */ } };
const strip = (d: Json): Json => { const { __v, __u, ...rest } = d; void __v; void __u; return rest; };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * ステップの入力を1秒後に自動保存する（仕様 §17・T16）。
 *  - 画面を離れる・タブを隠す時にも未保存分を保存
 *  - 保存できなかった入力はこの端末（ブラウザ）に一時保持し、通信が戻ったら自動で再送。同期できたら端末から消す
 *  - 他の端末・タブで先に保存されていたら上書きせず、差分を示して本人に選んでもらう
 */
export function useStepData<T extends Json>(step: string, initial: T & { __v?: string | null; __u?: string }) {
  const key = backupKey(initial.__u ?? "me", step);
  const [data, setData] = useState<T>(() => strip(initial) as T);
  const [state, setState] = useState<SaveState>("idle");
  const [conflict, setConflict] = useState<Server | null>(null);
  const [local, setLocal] = useState<Backup | null>(null);
  const dirty = useRef(false);
  const latest = useRef(data);
  const expected = useRef<string | null>(initial.__v ?? null);
  const blocked = useRef(false); // 競合の解決待ちの間は自動保存しない

  // 端末に未同期の入力が残っていれば知らせる（サーバーと同じ内容なら破棄）
  // （端末の保存領域はブラウザでしか読めないため、表示後に確認する）
  useEffect(() => {
    const t = setTimeout(() => {
      const b = readBackup(key);
      if (!b) return;
      if (same(b.data, strip(initial))) clearBackup(key);
      else setLocal(b);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const persist = useCallback(async (value: T, overrideExpected?: string | null) => {
    if (blocked.current && overrideExpected === undefined) return false;
    setState("saving");
    const r = await saveStep(step, value, overrideExpected === undefined ? expected.current : overrideExpected).catch(() => ({ ok: false as const, code: "NETWORK" }));
    if (r.ok) {
      expected.current = r.updatedAt;
      if (same(latest.current, value)) { dirty.current = false; clearBackup(key); }
      blocked.current = false;
      setConflict(null);
      setState("saved");
      return true;
    }
    if (r.code === "CONFLICT" && "server" in r && r.server) {
      blocked.current = true;
      setConflict(r.server);
      setState("conflict");
      return false;
    }
    setState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
    return false;
  }, [step, key]);

  useEffect(() => {
    latest.current = data;
    if (!dirty.current) return;
    writeBackup(key, { data, at: Date.now(), base: expected.current });
    const t = setTimeout(() => void persist(data), 1000);
    return () => clearTimeout(t);
  }, [data, persist, key]);

  useEffect(() => {
    const flush = () => { if (dirty.current && !blocked.current) void persist(latest.current); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (dirty.current) { flush(); e.preventDefault(); } };
    const onOnline = () => flush();
    const onOffline = () => setState("offline");
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      flush();
    };
  }, [persist]);

  const set = useCallback(<K extends string>(k: K, value: unknown) => {
    dirty.current = true;
    setData((d) => ({ ...d, [k]: value }));
  }, []);
  const flushNow = useCallback(async () => (dirty.current ? persist(latest.current) : !blocked.current), [persist]);

  /** 競合の解決：mine＝この画面の内容で上書き／server＝サーバーの内容に切り替え */
  const resolve = useCallback(async (choice: "mine" | "server") => {
    if (!conflict) return;
    if (choice === "server") {
      blocked.current = false; dirty.current = false;
      expected.current = conflict.updatedAt;
      setData(conflict.data as T);
      clearBackup(key); setConflict(null); setState("idle");
    } else {
      await persist(latest.current, conflict.updatedAt);
    }
  }, [conflict, persist, key]);

  /** 端末に残っていた入力の扱い */
  const useLocal = useCallback((choice: "restore" | "discard") => {
    if (choice === "restore" && local) { dirty.current = true; setData(local.data as T); }
    else clearBackup(key);
    setLocal(null);
  }, [local, key]);

  return { data, set, state, flushNow, latest, conflict, resolve, local, useLocal };
}
export type StepSync = Pick<ReturnType<typeof useStepData>, "state" | "flushNow" | "conflict" | "resolve" | "local" | "useLocal" | "data">;

const preview = (v: unknown) => {
  if (v === undefined || v === null || v === "") return "（なし）";
  const t = typeof v === "string" ? v : JSON.stringify(v);
  return t.length > 140 ? `${t.slice(0, 140)}…` : t;
};

const FIELD_LABEL: Record<string, string> = {
  provisional_vision: "暫定の人生ビジョン", why: "実現したい理由", priorities: "優先順位と期限のメモ", constraints: "制約や気がかり", confirmed: "内容の確認",
  relation: "願望との関係", quiz: "理解確認", own_words: "自分の言葉による説明", relations: "能力と願望のつながり", relation_summary: "6つの力の関係のまとめ",
  desires: "根拠マップ（願望ごと）", relevance: "関連度", conditions: "能力以外の条件", risks: "障害とリスク", alternatives: "代替ルート", story: "自己実現ストーリー",
  attraction: "集客力", recruitment: "採用力", education: "教育力", development: "育成力", operations: "運営力", management: "経営力",
  grid: "比較表", names: "候補の名前", decision_note: "比較して分かったこと", policy: "成長方針", statement: "コミット", decided: "意思の確認",
  sections: "プレゼンの各セクション", approved: "内容の確認", ai: "ChatGPT の提案メモ", rungs: "ラダーの各段階", prerequisites: "前提条件", note: "メモ",
};

/** 競合時の差分確認（項目ごとに、この画面の内容とサーバーの内容を並べる） */
function ConflictPanel({ sync }: { sync: StepSync }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, []);
  const c = sync.conflict!;
  const mine = sync.data as Json, theirs = c.data;
  const keys = [...new Set([...Object.keys(mine), ...Object.keys(theirs)])].filter((k) => !same(mine[k], theirs[k]));
  return (
    <div ref={ref} className="notice warn conflict-panel" role="alert">
      <b>別の端末・タブで、先にこのステップが保存されています。</b>上書きはしていません。どちらの内容を残すか選んでください。
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <thead><tr><th>項目</th><th>この画面の内容</th><th>保存されている内容</th></tr></thead>
          <tbody>{keys.map((k) => (<tr key={k}><th scope="row">{FIELD_LABEL[k] ?? k}</th><td className="small">{preview(mine[k])}</td><td className="small">{preview(theirs[k])}</td></tr>))}</tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn small" onClick={() => void sync.resolve("mine")}>この画面の内容で保存する</button>
        <button type="button" className="btn small ghost" onClick={() => void sync.resolve("server")}>保存されている内容を使う</button>
      </div>
    </div>
  );
}

/** 端末に残っていた未同期の入力 */
function LocalPanel({ sync }: { sync: StepSync }) {
  const b = sync.local!;
  return (
    <div className="notice info local-panel" role="status">
      この端末に、保存できていなかった入力が残っています（{new Date(b.at).toLocaleString("ja-JP")}）。
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn small" onClick={() => sync.useLocal("restore")}>端末の入力を復元して保存する</button>
        <button type="button" className="btn small ghost" onClick={() => sync.useLocal("discard")}>破棄する</button>
      </div>
      <p className="small muted" style={{ margin: "6px 0 0" }}>未保存の入力は、このブラウザにだけ一時的に保存され、保存できた時点で消去されます。共用の端末では、作業後にログアウトしてください。</p>
    </div>
  );
}

/** 保存状態＋「このステップを完了」。missing が空でなければ完了させない（修了判定に必要な項目だけを示す） */
export function StepSaveBar({ step, sync, missing, done, next }: {
  step: string; sync: StepSync; missing: string[]; done: boolean; next?: string;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const state = sync.state;
  async function onComplete(flag: boolean) {
    setErr(null);
    if (flag && missing.length) { setErr(`未入力の必須項目：${missing.join("、")}`); return; }
    setBusy(true);
    if (!(await sync.flushNow())) { setBusy(false); setErr(sync.conflict ? "先に、上の競合を解決してください。" : messageFor("NETWORK").ja); return; }
    const r = await completeStep(step, flag).catch(() => ({ ok: false as const, code: "NETWORK" }));
    setBusy(false);
    if (!r.ok) { setErr(messageFor(r.code).ja); return; }
    if (flag && next) router.push(next);
    router.refresh();
  }
  return (
    <>
      {sync.local ? <LocalPanel sync={sync} /> : null}
      {sync.conflict ? <ConflictPanel sync={sync} /> : null}
      <div className="save-bar no-print" role="status" aria-live="polite">
        <span className={`save-state ${state}`}>
          {state === "saving" ? "保存中…" : state === "saved" ? "保存しました"
            : state === "offline" ? "オフラインです（未同期）。入力はこの端末に保持し、接続が戻ると自動で保存します。"
            : state === "conflict" ? "未同期：別の端末で保存された内容との違いを、この上の確認欄で選んでください"
            : state === "error" ? "保存できませんでした（未同期）。入力はこの端末に保持しています。" : ""}
        </span>
        {state === "error" || state === "offline" ? <button type="button" className="btn small ghost" onClick={() => void sync.flushNow()}>再試行</button> : null}
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
    </>
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
      <ReportButton source={`ai:${scene}`} original={{ scene, prompt: prompt.slice(0, 3000), proposal: (n.text ?? "").slice(0, 6000) }} label="AI の提案に違和感を報告／軸に戻す" />
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
