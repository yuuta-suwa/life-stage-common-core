/**
 * APP02 AI コーチ（仕様 §08）の代替：本人が自分の ChatGPT に貼り付ける相談文を作る。
 * アプリから外部 AI へは送信しない（D-35・D-43）。ChatGPT の回答は「提案」として扱い、本人が採用・保留・却下を選ぶ（§08-2）。
 */
import { ABILITIES, ABILITY_CHAIN, ABILITY_CODES, LEVELS, SALES, type AbilityCode } from "./content";
import { GOAL_LABEL, type Blueprint } from "./logic";

const one = (v: string | undefined | null, max = 400) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** 仕様 §07-2・§07-3・§19 の AI 指示 */
const RULES = [
  "【回答のルール】",
  "・私の人生ビジョンを判断の軸にしてください。押し付けや断定はしないでください。",
  "・「セールス力と6大能力を身につければ必ず願望が叶う」とは言わないでください。能力以外の条件や代替手段も示してください。",
  "・根拠は「私が書いた事実」「一般的な因果関係」「あなた（AI）の仮説」を区別して書いてください。根拠のない数値や成功率は作らないでください。",
  "・情報が足りない場合は、仮定を明示した暫定案を出し、本当に必要な確認質問だけを最大3つ書いてください。分からないことは「未確認」と書いてください。",
  "・医療・法律・投資・資格など専門的な判断が必要な点は一般的な説明に留め、専門家への確認を勧めてください。",
  "・特定の団体やサービスへの参加を結論にしないでください。",
].join("\n");

export function visionContext(bp: Blueprint | null, extra?: string) {
  if (!bp) return `■ 私の人生ビジョン（暫定）：${one(extra) || "未確認"}`;
  return [
    `■ 人生の目的：${one(bp.life_purpose)}`,
    `■ 優先したい願望：${bp.priority_desires.map((d) => one(d, 120)).join("／") || "未確認"}`,
    `■ 目標と期限：${bp.goals.map((g) => `${GOAL_LABEL[g.type]}「${one(g.description, 120)}」${g.deadline ? `（${g.deadline}）` : ""}`).join("／") || "未確認"}`,
    `■ 最初の行動：${one(bp.first_action, 120) || "未確認"}`,
  ].join("\n");
}

export type Scene =
  | "vision" | "priority" | "sales" | "abilities" | "analysis" | "hidden" | "position" | "environment" | "compare"
  | "roadmap" | "cell" | "consistency" | "change" | "presentation" | "understanding";

export const SCENE_LABEL: Record<Scene, string> = {
  vision: "1｜人生ビジョンの具体化", sales: "2｜セールス力の価値理解", abilities: "3｜6大能力の理解", analysis: "4｜自己実現の根拠分析",
  position: "5｜現在地診断", environment: "6｜成長環境の理解", roadmap: "7｜10ヵ年計画の作成", cell: "8｜到達目標の具体化",
  consistency: "9｜計画の整合性確認", presentation: "10｜自己実現プレゼン", priority: "11｜願望の優先順位整理", hidden: "12｜隠れた前提条件の発見",
  compare: "13｜選択肢の比較", change: "14｜計画変更の支援", understanding: "15｜理解度の確認",
};

export function scenePrompt(scene: Scene, ctx: { vision: string; detail?: string; ability?: AbilityCode }): string {
  const head = "あなたは私の自己実現を支援するコーチです。以下は私の人生ビジョンです。";
  const body: Record<Scene, string> = {
    vision: "私の願望を、収入・時間・暮らし・人間関係などの「実現したい状態」と「必要な条件」に分解してください。",
    priority: "私の願望の優先順位を、重要度・期限・制約の観点で整理してください。順位は私が決めるので、判断材料だけを出してください。",
    sales: `次の定義のセールス力が、私の願望にどう役立つか、直接・間接の関係を例を挙げて説明してください。私に合わない例は不要です。\n定義：${SALES.definition}`,
    abilities: `6大能力（${ABILITY_CODES.map((a) => ABILITIES[a].name).join("・")}）を、私の願望に関係する身近な例で説明してください。代表的な関係は「${ABILITY_CHAIN}」ですが、私の場合に順序を変えたほうがよい点があれば理由とともに教えてください。`,
    analysis: "願望ごとに「願望→実現条件→必要な能力・資源→行動・経験→期待される成果→願望への貢献」の流れで整理してください。セールス力と6大能力それぞれの関連度を「直接関連／間接関連／現時点では関連が弱い・不明」で示し、理由を書いてください。最後に、私が読み返せる短い『私の自己実現ストーリー』（300字程度）を書いてください。",
    hidden: "私の計画で見落としている可能性のある前提条件（資金・時間・健康・資格・家族・地域・法規制・専門知識・外部環境・人脈）を挙げてください。",
    position: `次の能力の現在地を一緒に整理したいです。具体的な経験・頻度・結果・再現性について、私に質問を3つまでしてください。その後、レベル定義（${LEVELS.map((l) => `${l.label} ${l.desc}`).join("、")}）に沿った暫定レベルと理由、判断できない部分を示してください。正式な認定ではありません。`,
    environment: "私が成長するために必要な環境の条件（教育体系・実践機会・指導者・振り返り・成果検証・仲間・挑戦機会・費用・時間負担・価値観との適合）を、私の願望に照らして整理してください。",
    compare: "下に書いた成長ルート・環境の候補を、期間・費用・負担・必要条件・リスクで比較する表を作ってください。情報が足りない項目は「未確認」とし、不利と断定しないでください。決めるのは私です。",
    roadmap: "6大能力×10年の成長計画について、私の現在地と願望から、各能力の推奨の成長順序と、無理のない年ごとの到達状態の考え方を説明してください。",
    cell: "下の到達目標を、第三者が見て達成したか判断できる「観察可能な到達状態」と「到達判断基準」に書き換える案を3つ出してください。",
    consistency: "下の10ヵ年計画について、年度間の急な飛躍、前提の不足、重点能力の過剰、目標年度との矛盾を指摘し、改善案を示してください。「実現不可能」とは断定しないでください。",
    change: "目標を下のように変更したいと考えています。10ヵ年計画のどこに影響するか、見直す順番を教えてください。",
    presentation: "下の内容をもとに、私が自分の言葉で話せる自己実現プレゼン（①実現したい人生 ②実現理由 ③実現条件 ④セールス力を学ぶ理由 ⑤6大能力の相互関係 ⑥現在地 ⑦成長環境 ⑧10ヵ年計画 ⑨年間重点能力 ⑩今後の意思決定）の構成と文章の案を作ってください。あなたが補った部分は【AI補足】と明記してください。",
    understanding: "私がセールス力と6大能力を理解しているか確認したいです。私の願望に関係する短い質問を3つ出し、私が答えたら、良い点と補足を教えてください。",
  };
  const target = ctx.ability ? `\n■ 対象の能力：${ABILITIES[ctx.ability].name}（${ABILITIES[ctx.ability].role}）` : "";
  const detail = ctx.detail ? `\n\n■ 補足（私の入力）\n${ctx.detail.slice(0, 3000)}` : "";
  return `${head}\n\n${ctx.vision}${target}${detail}\n\n【お願い】\n${body[scene]}\n\n${RULES}`;
}
