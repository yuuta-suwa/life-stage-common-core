"use client";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";

/**
 * 「ChatGPT で分析・評価・改善提案」パネル（APP01 各 LEVEL・APP02 各 STEP）。
 * 表示中の入力から相談文を作ってコピーするだけで、入力内容の保存・変更は行わない。
 */
export function ReviewPromptPanel({ make, prompt, hasSensitive = false }: {
  /** 機微な項目を含めるかどうかを受け取り、相談文を返す（クライアントコンポーネントから渡す場合） */
  make?: (includeSensitive: boolean) => string;
  /** 固定の相談文（サーバーから渡す場合） */
  prompt?: string;
  hasSensitive?: boolean;
}) {
  const [include, setInclude] = useState(false);
  const [open, setOpen] = useState(false);
  const text = make ? make(include) : prompt ?? "";
  return (
    <details className="card ai-panel review-panel no-print" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><b>ChatGPT で分析・評価・改善提案</b><span className="small muted">　今の入力内容をコピーして相談（任意）</span></summary>
      <ol className="small">
        <li>「相談文をコピー」を押します（今この画面に入力されている内容が入ります）。</li>
        <li>「ChatGPT を開く」→ チャット欄に貼り付けて送信します。</li>
        <li>分析・評価・改善案が返ってきます。採用したい部分は、ご自身で入力欄を書き直してください。</li>
      </ol>
      {hasSensitive ? (
        <label className="check small">
          <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} />
          家計・資産・人間関係などの機微な項目も含める（初期状態は含めません）
        </label>
      ) : null}
      <div className="row" style={{ marginTop: 8 }}>
        <CopyButton className="btn" label="相談文をコピー" text={text} />
        <a className="btn ghost" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT を開く ↗</a>
      </div>
      {open ? (
        <details style={{ marginTop: 8 }}>
          <summary className="small">相談文を確認する</summary>
          <pre className="review-preview">{text}</pre>
        </details>
      ) : null}
      <p className="small muted" style={{ margin: "8px 0 0" }}>
        相談文はあなたの操作で ChatGPT（OpenAI 社の外部サービス）に送られます。アプリからは送信せず、入力内容が自動で書き換わることもありません。
        氏名・住所・勤務先・家族の名前などは入れないでください。ChatGPT の回答は参考情報です。決めるのはあなたです。
      </p>
    </details>
  );
}
