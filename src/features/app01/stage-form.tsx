"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { messageFor } from "@/lib/errors";
import { confirmStage, saveDraft } from "@/app/apps/APP01/actions";
import { COPY } from "./copy";
import type { StageDef, StageInput } from "./stages";
import { BUDGET_ASSUMPTION, budgetSummary, visionImages, yenText, type Answers, type StageState, type VisionImage } from "./logic";

type SaveState = "idle" | "saving" | "saved" | "error";

export function StageForm(props: {
  stage: StageDef;
  initial: Answers;
  state: StageState;
  userId: string;
  imageUrls: Record<string, string>;
  desires: string[];
  report?: { level: number; message: string }[];
}) {
  const { stage } = props;
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(props.initial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<{ code: string; missing?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const latest = useRef(answers);

  const persist = useCallback(async (value: Answers) => {
    setSaveState("saving");
    const r = await saveDraft(stage.no, value).catch(() => ({ ok: false as const, code: "NETWORK" }));
    if (r.ok) {
      dirty.current = false;
      setSaveState("saved");
    } else {
      setSaveState("error");
      if (r.code !== "NETWORK") setError({ code: r.code });
    }
    return r.ok;
  }, [stage.no]);

  // 自動保存（入力が止まってから 1 秒後）
  useEffect(() => {
    latest.current = answers;
    if (!dirty.current) return;
    const t = setTimeout(() => void persist(answers), 1000);
    return () => clearTimeout(t);
  }, [answers, persist]);

  // 自動保存の待ち時間（1秒）の間に画面を離れても入力を失わない：
  // 画面遷移（アンマウント）・タブを閉じる／隠す時に未保存分を保存し、閉じる前には確認を出す
  useEffect(() => {
    const flush = () => {
      if (dirty.current) void saveDraft(stage.no, latest.current).then((r) => { if (r.ok) dirty.current = false; });
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      flush();
      e.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      flush();
    };
  }, [stage.no]);

  const set = (key: string, value: unknown) => {
    dirty.current = true;
    setAnswers((a) => ({ ...a, [key]: value }));
  };

  async function onConfirm() {
    if (!window.confirm(COPY.confirmDialog)) return;
    setBusy(true);
    setError(null);
    if (dirty.current && !(await persist(latest.current))) {
      setBusy(false);
      return;
    }
    const r = await confirmStage(stage.no).catch(() => ({ ok: false as const, code: "UNKNOWN" }));
    setBusy(false);
    if (r.ok) {
      router.push(r.redirectTo);
      router.refresh();
    } else setError({ code: r.code, missing: "missing" in r ? r.missing : undefined });
  }

  const err = error ? messageFor(error.code) : null;

  return (
    <div>
      <p className="muted small">{COPY.typing}</p>

      {stage.no === 3 ? (
        <VisionBoard answers={answers} set={set} userId={props.userId} imageUrls={props.imageUrls} desires={props.desires} />
      ) : (
        stage.questions.map((q) => (
          <div key={q.no} className="card app01-question">
            <label className="q-label">
              <span className="q-no">{q.no}</span>
              {q.label}
              {q.optional ? <small>任意</small> : null}
            </label>
            <div className={q.inputs.length > 1 ? "row" : undefined}>
              {q.inputs.map((input) => (
                <Field key={input.key} input={input} value={answers[input.key]} onChange={(v) => set(input.key, v)} />
              ))}
            </div>
          </div>
        ))
      )}

      {stage.no === 2 ? <BudgetPanel answers={answers} /> : null}

      {stage.no === 10 && props.report ? (
        <div className="card">
          <h3 className="section-title">CONSISTENCY<span>｜整合性レポート（ルールによる確認）</span></h3>
          {props.report.length ? (
            <ul>{props.report.map((r, i) => <li key={i}>LEVEL {String(r.level).padStart(2, "0")}：{r.message}</li>)}</ul>
          ) : <p>未確認・未入力の項目は見つかりませんでした。</p>}
          <p className="small muted">上の6項目すべてに「はい」と答えると、人生設計を完成できます。</p>
        </div>
      ) : null}

      <div className="card ai-card">
        <button type="button" className="btn ghost" disabled>{COPY.aiCta}</button>
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          AI 精査は現在利用できません（有料の AI は導入していません）。内容をご自身で確認し、そのまま確定できます。
          <br />{COPY.aiNotice}
        </p>
      </div>

      <div className="save-bar no-print" role="status" aria-live="polite">
        <span className={`save-state ${saveState}`}>
          {saveState === "saving" ? "保存中…" : saveState === "saved" ? COPY.saved : saveState === "error" ? COPY.saveFailed : ""}
        </span>
        {saveState === "error" ? <button type="button" className="btn small ghost" onClick={() => void persist(latest.current)}>再試行</button> : null}
        <button type="button" className="btn gold" disabled={busy} onClick={onConfirm}>
          {busy ? "処理中…" : stage.no === 10 ? COPY.finalize : COPY.confirmCta}
        </button>
        {err ? (
          <div className="notice error save-error" role="alert">
            {err.ja}
            {error?.missing?.length ? <div>未設定：{error.missing.join("、")}</div> : null}
            <span className="en">{err.en}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Field({ input, value, onChange }: { input: StageInput; value: unknown; onChange: (v: unknown) => void }) {
  const v = typeof value === "string" ? value : "";
  const label = input.label ? <span className="small muted" style={{ display: "block" }}>{input.label}</span> : null;
  switch (input.kind) {
    case "textarea":
      return <div className="field">{label}<textarea rows={3} maxLength={2000} value={v} onChange={(e) => onChange(e.target.value)} /></div>;
    case "lines":
      return (
        <div className="field">
          <textarea rows={3} maxLength={600} value={Array.isArray(value) ? value.join("\n") : v} onChange={(e) => onChange(e.target.value)} />
          <span className="small muted">1行に1つ入力（最大{input.max ?? 3}つ）</span>
        </div>
      );
    case "text":
      return <div className="field">{label}<input type="text" maxLength={300} value={v} onChange={(e) => onChange(e.target.value)} /></div>;
    case "money":
      return (
        <div className="field">
          {label}
          <div className="row" style={{ alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
            <input type="text" inputMode="numeric" placeholder="未入力" value={v} onChange={(e) => onChange(e.target.value.replace(/[^\d,]/g, ""))} />
            <span>{input.suffix}</span>
          </div>
        </div>
      );
    case "year":
      return <div className="field">{label}<input type="text" inputMode="numeric" maxLength={4} placeholder="例：2036" value={v} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} /></div>;
    case "date":
      return <div className="field">{label}<input type="date" value={v} onChange={(e) => onChange(e.target.value)} /></div>;
    case "yesno":
      return (
        <div className="checks">
          {[["yes", "はい"], ["no", "いいえ"]].map(([val, text]) => (
            <label key={val} className="check"><input type="radio" name={input.key} checked={value === val} onChange={() => onChange(val)} /> {text}</label>
          ))}
        </div>
      );
    case "multi": {
      const sel = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="checks">
          {input.options?.map((o) => (
            <label key={o.value} className="check">
              <input type="checkbox" checked={sel.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...sel, o.value] : sel.filter((x) => x !== o.value))} /> {o.label}
            </label>
          ))}
        </div>
      );
    }
  }
}

function BudgetPanel({ answers }: { answers: Answers }) {
  const b = budgetSummary(answers);
  return (
    <div className="card budget">
      <h3 className="section-title">AUTO CALC<span>｜自動計算</span></h3>
      <dl className="kv">
        <dt>月額の合計</dt><dd>{yenText(b.monthly_total)}</dd>
        <dt>年間費用の合計</dt><dd>{yenText(b.annual_items_total)}</dd>
        <dt>年額（月額×12＋年間費用）</dt><dd>{yenText(b.annual_total)}</dd>
        <dt>必要な月額（年額÷12）</dt><dd>{yenText(b.required_monthly)}</dd>
        <dt>実現したい資産額・時期</dt><dd>{yenText(b.target_assets)}{b.target_year ? `（${b.target_year}年）` : ""}</dd>
        <dt>現在の収入との差（月額）</dt><dd>{b.monthly_gap === null ? "未入力" : `${b.monthly_gap >= 0 ? "＋" : "−"}${Math.abs(b.monthly_gap).toLocaleString("ja-JP")}円`}</dd>
        <dt>資産目標までの差</dt><dd>{yenText(b.assets_gap)}</dd>
      </dl>
      <p className="small muted">{BUDGET_ASSUMPTION} 未入力の項目は 0 円として扱わず「未入力」と表示します（未入力 {b.unentered.length} 件）。</p>
    </div>
  );
}

const ACCEPT = ["image/png", "image/jpeg", "image/webp"];

function VisionBoard({ answers, set, userId, imageUrls, desires }: {
  answers: Answers; set: (k: string, v: unknown) => void; userId: string; imageUrls: Record<string, string>; desires: string[];
}) {
  const [supabase] = useState(() => createClient());
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const images = visionImages(answers);
  const update = (next: VisionImage[]) => set("images", next);

  async function upload(file: File) {
    setMsg(null);
    if (!ACCEPT.includes(file.type)) return setMsg("PNG・JPEG・WebP の画像を選んでください。");
    if (file.size > 10 * 1024 * 1024) return setMsg("10MB 以下の画像を選んでください。");
    if (images.length >= 12) return setMsg("画像は12枚までです。");
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = `${userId}/APP01/vision/${crypto.randomUUID().replace(/-/g, "")}.${ext}`;
    const { error } = await supabase.storage.from("user-files").upload(key, file, { contentType: file.type, upsert: false });
    if (error) return setMsg("画像を保存できませんでした。通信を確認して再試行してください。");
    setPreviews((p) => ({ ...p, [key]: URL.createObjectURL(file) }));
    update([...images, { key }]);
  }

  async function remove(i: number) {
    if (!window.confirm("この画像を削除します。よろしいですか？")) return;
    const key = images[i].key;
    await supabase.storage.from("user-files").remove([key]);
    update(images.filter((_, j) => j !== i));
  }

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };
  const edit = (i: number, k: keyof VisionImage, v: string) => update(images.map((img, j) => (j === i ? { ...img, [k]: v } : img)));

  return (
    <div>
      <div className="card">
        <label className="btn ghost" style={{ cursor: "pointer" }}>
          ＋ 画像を追加
          <input type="file" accept={ACCEPT.join(",")} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        </label>
        <p className="small muted">画像は非公開で保存され、本人だけが表示できます（10MB まで・12枚まで）。</p>
        {msg ? <div className="notice error">{msg}</div> : null}
        <label className="check" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={answers.rights_confirmed === true} onChange={(e) => set("rights_confirmed", e.target.checked)} />
          著作権に問題がない画像であること、人物が写る写真は本人の了承を得ていることを確認しました（共有時は人物写真・ビジョンボードを含めるかを別途選べます）
        </label>
      </div>
      <div className="vision-grid">
        {images.map((img, i) => (
          <div key={img.key} className="card vision-item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previews[img.key] ?? imageUrls[img.key] ?? ""} alt={img.caption || `ビジョン画像 ${i + 1}`} />
            <div className="field"><label>1. この画像はどの願望を表している？</label>
              <input list={`desires-${i}`} type="text" maxLength={200} value={img.desire ?? ""} onChange={(e) => edit(i, "desire", e.target.value)} />
              <datalist id={`desires-${i}`}>{desires.map((d) => <option key={d} value={d} />)}</datalist>
            </div>
            <div className="field"><label>2. 実現したい時期は？</label><input type="text" maxLength={100} value={img.when ?? ""} onChange={(e) => edit(i, "when", e.target.value)} /></div>
            <div className="field"><label>3. この場面で、誰と何をしていたい？</label><textarea rows={2} maxLength={500} value={img.who ?? ""} onChange={(e) => edit(i, "who", e.target.value)} /></div>
            <div className="field"><label>4. その瞬間、どんな気持ちでいたい？</label><textarea rows={2} maxLength={500} value={img.feeling ?? ""} onChange={(e) => edit(i, "feeling", e.target.value)} /></div>
            <div className="field"><label>キャプション</label><input type="text" maxLength={200} value={img.caption ?? ""} onChange={(e) => edit(i, "caption", e.target.value)} /></div>
            <div className="row">
              <button type="button" className="btn small ghost" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
              <button type="button" className="btn small ghost" onClick={() => move(i, 1)} disabled={i === images.length - 1}>↓</button>
              <button type="button" className="btn small danger" onClick={() => void remove(i)}>削除</button>
            </div>
          </div>
        ))}
      </div>
      {!images.length ? <p className="muted">まだ画像がありません。叶えたい未来を表す画像を追加しましょう。</p> : null}
    </div>
  );
}
