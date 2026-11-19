"use client";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { VISION_STYLES, visionPrompt } from "./logic";

/**
 * LEVEL03：ChatGPT 投げ込みガイド。
 * アプリから外部 AI へは何も送信しない（有料 AI API は導入しない方針 D-35）。
 * 本人が文章をコピーして自分の ChatGPT に貼り付け、できた画像を保存して「＋画像を追加」で登録する。
 */
export function VisionChatGptGuide({ desires }: { desires: string[] }) {
  const [desire, setDesire] = useState(desires[0] ?? "");
  const [scene, setScene] = useState("");
  const [when, setWhen] = useState("");
  const [who, setWho] = useState("");
  const [feeling, setFeeling] = useState("");
  const [style, setStyle] = useState<string>(VISION_STYLES[0].value);
  const prompt = useMemo(() => visionPrompt({ desire, scene, when, who, feeling, style }), [desire, scene, when, who, feeling, style]);

  return (
    <details className="card vision-guide">
      <summary><b>ChatGPT でビジョン画像を作る</b><span className="small muted">（投げ込みガイド・任意）</span></summary>
      <ol className="guide-steps">
        <li>下の項目を入力すると、ChatGPT に貼り付ける文章ができます。</li>
        <li>「文章をコピー」→「ChatGPT を開く」→ 入力欄に貼り付けて送信します（画像を作成できる ChatGPT を使ってください）。</li>
        <li>できた画像を保存します（スマホは画像を長押し →「写真に保存」、PC は右クリック →「画像を保存」）。</li>
        <li>この画面に戻り「＋ 画像を追加」で登録し、ChatGPT が書いた4行を参考に、願望・時期・誰と何を・気持ちを記入します。</li>
      </ol>

      <div className="row">
        <div className="field">
          <label htmlFor="vg-desire">叶えたい願望<small>LEVEL01 で選んだ優先願望から選べます</small></label>
          <input id="vg-desire" list="vg-desires" type="text" maxLength={200} value={desire} onChange={(e) => setDesire(e.target.value)} placeholder="例：家族で海の見える家に暮らす" />
          <datalist id="vg-desires">{desires.map((d) => <option key={d} value={d} />)}</datalist>
        </div>
        <div className="field" style={{ flex: "0 1 220px" }}>
          <label htmlFor="vg-style">雰囲気</label>
          <select id="vg-style" value={style} onChange={(e) => setStyle(e.target.value)}>
            {VISION_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="vg-scene">場面・場所（任意）</label><input id="vg-scene" type="text" maxLength={200} value={scene} onChange={(e) => setScene(e.target.value)} placeholder="例：朝日の差し込むリビング" /></div>
        <div className="field"><label htmlFor="vg-when">実現したい時期（任意）</label><input id="vg-when" type="text" maxLength={100} value={when} onChange={(e) => setWhen(e.target.value)} placeholder="例：5年後の春" /></div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="vg-who">誰と、何をしているか（任意）</label><input id="vg-who" type="text" maxLength={200} value={who} onChange={(e) => setWho(e.target.value)} placeholder="例：家族と朝ごはんを囲んでいる" /></div>
        <div className="field"><label htmlFor="vg-feeling">その瞬間の気持ち（任意）</label><input id="vg-feeling" type="text" maxLength={200} value={feeling} onChange={(e) => setFeeling(e.target.value)} placeholder="例：穏やかで満たされている" /></div>
      </div>

      <div className="field">
        <label>ChatGPT に貼り付ける文章<small>内容を確認してからコピーしてください</small></label>
        <pre className="share-preview">{prompt}</pre>
      </div>
      <div className="row">
        <CopyButton className="btn gold" label="文章をコピー" text={prompt} />
        <a className="btn ghost" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT を開く ↗</a>
      </div>

      <div className="notice info small" style={{ marginTop: 12 }}>
        <b>ご注意</b>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          <li>この文章は、あなた自身の操作で ChatGPT（OpenAI 社の外部サービス）に送られます。LIFE STAGE から自動で送ることはありません。</li>
          <li>氏名・住所・勤務先・家族の名前や写真などの個人情報は入れないでください。ご自身や家族の写真を使う場合は、ChatGPT に送らず、直接「＋ 画像を追加」で登録してください。</li>
          <li>有名人・キャラクター・ブランドロゴを指定しないでください。作成した画像の利用条件は ChatGPT の利用規約に従います。キャプションに「AI生成」と書いておくと、後で見返すときに区別できます。</li>
          <li>ChatGPT の利用料金や回数の制限は、ご自身の ChatGPT の契約内容によります。</li>
        </ul>
      </div>
    </details>
  );
}
