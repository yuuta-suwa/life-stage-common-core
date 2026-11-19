/**
 * APP01 THE FINAL DISCOVERY｜ステージ定義（仕様書 v7 §4・§5）
 *
 * 画面文言・設問は仕様書の原文を実装基準とする。
 * ただし原本PDF自体にフォント欠けがあり、一部の文字が欠落している。
 * 文脈から一意に推定できる箇所のみ補い、`TEXT_CORRECTIONS` に原文と併記して記録した
 * （docs/DECISIONS.md D-33・Q-17。発注者確認後に確定）。
 */

export type InputKind = "textarea" | "text" | "money" | "year" | "date" | "yesno" | "multi" | "lines";

export type StageInput = {
  key: string;
  kind: InputKind;
  /** 複合設問の小見出し（例：「長期」「中期」） */
  label?: string;
  suffix?: string;
  options?: { value: string; label: string }[];
  max?: number;
  /** 個人情報・家計・資産・人間関係の詳細：共有の初期値 OFF（仕様 §7-1） */
  sensitive?: boolean;
};

export type StageQuestion = { no: number; label: string; inputs: StageInput[]; optional?: boolean };

export type StageDef = {
  no: number;
  code: string; // 英語見出し
  title: string; // 画面タイトル
  intro: string; // 導入文
  aiTarget: string; // AI 精査・確定対象（説明として表示）
  clear: string; // クリア表示
  questions: StageQuestion[];
};

/** 6大能力（仕様 §5）。コードは APP02 連携用（DECISIONS D-13） */
export const CAPABILITIES = [
  { value: "attraction", label: "集客力", definition: "必要とする人に価値を届け、出会いと機会を生み出す力。" },
  { value: "recruitment", label: "採用アクティブ化力", definition: "仲間を増やし、目的に向けて主体的に活動できる状態をつくる力。" },
  { value: "education", label: "教育力", definition: "知識・技術・考え方を相手が理解し、実践できるように伝える力。" },
  { value: "development", label: "育成力", definition: "一人ひとりの可能性を引き出し、継続的な成長と成果につなげる力。" },
  { value: "operations", label: "運営力", definition: "目標・役割・行動・数値を管理し、組織や仕組みを機能させる力。" },
  { value: "management", label: "経営力", definition: "資源を最適に配分し、価値と利益を生み出しながら持続的に発展させる力。" },
] as const;

export const LIFE_STAGE_STEPS = [
  { code: "1.0", label: "自己理解" },
  { code: "2.0", label: "共通ビジョン" },
  { code: "3.0", label: "基礎実践" },
  { code: "4.0", label: "応用と再現性" },
  { code: "5.0", label: "高度な育成・運営・経営" },
];

const t = (key: string, opts: Partial<StageInput> = {}): StageInput => ({ key, kind: "textarea", ...opts });
const yen = (key: string, label?: string, opts: Partial<StageInput> = {}): StageInput => ({ key, kind: "money", suffix: "円", label, sensitive: true, ...opts });
const yesno = (key: string): StageInput => ({ key, kind: "yesno" });
const capabilityOptions = CAPABILITIES.map((c) => ({ value: c.value, label: c.label }));

export const STAGES: StageDef[] = [
  {
    no: 1, code: "DISCOVER YOUR DESIRES", title: "心から望む願望を発見する",
    intro: "周囲の期待ではなく、あなたが本当に実現したいことを見つけよう。",
    aiTarget: "願望の背景にある動機・優先順位を整理し、本人の言葉で優先願望を確定する。",
    clear: "心から望むことが、少しずつ形になってきた。",
    questions: [
      { no: 1, label: "何を手に入れたい？", inputs: [t("q1")] },
      { no: 2, label: "どんな体験をしたい？", inputs: [t("q2")] },
      { no: 3, label: "行ってみたい場所は？", inputs: [t("q3")] },
      { no: 4, label: "どんな暮らしを実現したい？", inputs: [t("q4")] },
      { no: 5, label: "大切な人と何を分かち合いたい？", inputs: [t("q5", { sensitive: true })] },
      { no: 6, label: "仕事や事業で何に挑戦したい？", inputs: [t("q6")] },
      { no: 7, label: "身につけたい力は？", inputs: [t("q7")] },
      { no: 8, label: "人生で成し遂げたいことは？", inputs: [t("q8")] },
      { no: 9, label: "今、最も優先したい願望を 3 つ選ぶとしたら？", inputs: [{ key: "q9", kind: "lines", max: 3 }] },
    ],
  },
  {
    no: 2, code: "FUTURE LIFE BUDGET", title: "幸福の未来家計簿",
    intro: "理想の暮らしに必要なお金を、具体的な数字に変えていこう。",
    aiTarget: "月額・年額・必要額・差額を自動計算。未入力は 0 ではなく「未入力」。税・物価・運用利回りは前提表示。",
    clear: "望む暮らしに必要な金額と時期が見えてきた。",
    questions: [
      { no: 1, label: "理想の住居費（月額）は？", inputs: [yen("q1")] },
      { no: 2, label: "食費・日用品（月額）は？", inputs: [yen("q2")] },
      { no: 3, label: "衣服・美容（月額）は？", inputs: [yen("q3")] },
      { no: 4, label: "交通・自動車（月額）は？", inputs: [yen("q4")] },
      { no: 5, label: "旅行・趣味（年間）は？", inputs: [yen("q5")] },
      { no: 6, label: "健康・教育（年間）は？", inputs: [yen("q6")] },
      { no: 7, label: "家族や大切な人のための費用（年間）は？", inputs: [yen("q7")] },
      { no: 8, label: "その他の費用は？", inputs: [yen("q8", "月額"), t("q8_note", { label: "内容", sensitive: true })] },
      { no: 9, label: "実現したい資産額と時期は？", inputs: [yen("q9_amount", "資産額"), { key: "q9_year", kind: "year", label: "時期（西暦）", sensitive: true }] },
      {
        no: 10, label: "現在の収入・支出・資産は？（任意）", optional: true,
        inputs: [yen("q10_income", "収入（月額）"), yen("q10_expense", "支出（月額）"), yen("q10_assets", "資産")],
      },
    ],
  },
  {
    no: 3, code: "MY VISION BOARD", title: "理想の未来を可視化する",
    intro: "叶えたい未来を、毎日見返したくなる一枚にしよう。",
    aiTarget: "画像追加／並び替え／削除／願望 ID 紐づけ／キャプション／画像保存。著作権と人物写真の共有範囲を確認。",
    clear: "理想の未来が、目に見える形になった。",
    // 設問は画像ごとに回答する（UI で images[] として保存）
    questions: [
      { no: 1, label: "この画像はどの願望を表している？", inputs: [] },
      { no: 2, label: "実現したい時期は？", inputs: [] },
      { no: 3, label: "この場面で、誰と何をしていたい？", inputs: [] },
      { no: 4, label: "その瞬間、どんな気持ちでいたい？", inputs: [] },
    ],
  },
  {
    no: 4, code: "LIFE PURPOSE", title: "人生の目的を明確にする",
    intro: "願望の先にある、あなたにとって大切な理由を言葉にしよう。",
    aiTarget: "価値観と願望の共通点を抽出し、本人が人生の目的文を編集・確定。",
    clear: "あなたが人生で大切にしたい目的が明確になった。",
    questions: [
      { no: 1, label: "なぜ、その願望を叶えたい？", inputs: [t("q1")] },
      { no: 2, label: "実現した先に、どんな喜びを感じたい？", inputs: [t("q2")] },
      { no: 3, label: "誰と幸せを分かち合いたい？", inputs: [t("q3", { sensitive: true })] },
      { no: 4, label: "誰に、どんな価値を届けたい？", inputs: [t("q4")] },
      { no: 5, label: "人生で譲れない価値観は？", inputs: [t("q5")] },
      { no: 6, label: "人生の目的を一文で表すと？", inputs: [{ key: "q6", kind: "text" }] },
    ],
  },
  {
    no: 5, code: "REALITY GAP ANALYSIS", title: "理想と現実のギャップを明確にする",
    intro: "望む未来と今の自分の間にある差を、具体的に確認しよう。",
    aiTarget: "お金・時間・人望／関係・能力の現状／目標／差／改善優先度を表示。",
    clear: "実現に向けて、何を変える必要があるかが見えてきた。",
    questions: [
      { no: 1, label: "現在のお金の状況は？", inputs: [t("q1", { sensitive: true })] },
      { no: 2, label: "理想までに必要なお金の差は？", inputs: [t("q2", { sensitive: true })] },
      { no: 3, label: "現在、自由に使える時間は？", inputs: [t("q3")] },
      { no: 4, label: "目標に使いたい時間は？", inputs: [t("q4")] },
      { no: 5, label: "現在の協力者や信頼関係は？", inputs: [t("q5", { sensitive: true })] },
      { no: 6, label: "これから必要な協力やつながりは？", inputs: [t("q6", { sensitive: true })] },
      { no: 7, label: "今ある能力と、これから必要な能力は？", inputs: [t("q7")] },
      { no: 8, label: "最優先で解消したい差は？", inputs: [t("q8")] },
    ],
  },
  {
    no: 6, code: "PAIN & REWARD", title: "痛みと報酬の原則",
    intro: "挑戦する価値と、先延ばしにする代償を整理しよう。",
    aiTarget: "恐怖を煽らず、挑戦の意味と本人が重視する価値を整理。",
    clear: "あなたが挑戦する理由が、より明確になった。",
    questions: [
      { no: 1, label: "今のままなら、何が変わらない？", inputs: [t("q1")] },
      { no: 2, label: "行動を先延ばしにすると、失う可能性があるものは？", inputs: [t("q2")] },
      { no: 3, label: "実現したとき、どんな喜びがある？", inputs: [t("q3")] },
      { no: 4, label: "大切な人に、どんな良い影響がある？", inputs: [t("q4", { sensitive: true })] },
      { no: 5, label: "今、挑戦する理由を一文で表すと？", inputs: [{ key: "q5", kind: "text" }] },
    ],
  },
  {
    no: 7, code: "SIX CORE CAPABILITIES", title: "自己実現に必要な 6 大能力",
    intro: "あなたの目標に必要な力を、具体的に理解しよう。",
    aiTarget: "6 能力を各自の目標に結びつけて説明。全員一律の必須度とは扱わない。",
    clear: "自己実現のために、これから磨く力が見えてきた。",
    questions: [
      { no: 1, label: "集客力は、自分の目標にどう役立つ？", inputs: [t("q1")] },
      { no: 2, label: "採用アクティブ化力はどう役立つ？", inputs: [t("q2")] },
      { no: 3, label: "教育力はどう役立つ？", inputs: [t("q3")] },
      { no: 4, label: "育成力はどう役立つ？", inputs: [t("q4")] },
      { no: 5, label: "運営力はどう役立つ？", inputs: [t("q5")] },
      { no: 6, label: "経営力はどう役立つ？", inputs: [t("q6")] },
      { no: 7, label: "今、優先して身につけたい力は？", inputs: [{ key: "q7", kind: "multi", options: capabilityOptions }] },
      { no: 8, label: "その理由は？", inputs: [t("q8")] },
    ],
  },
  {
    no: 8, code: "LIFE STAGE GROWTH PATH", title: "LIFE STAGE 1.0〜5.0 の理解",
    intro: "これから何を学び、どんな成長につなげるのかを確かめよう。",
    aiTarget: "1.0 自己理解／2.0 共通ビジョン／3.0 基礎実践／4.0 応用と再現性／5.0 高度な育成・運営・経営。4.0・5.0 の詳細教材は別途確定。",
    clear: "学ぶ理由と、成長の道筋がつながった。",
    questions: [
      { no: 1, label: "LIFE STAGE 1.0 で理解することは？", inputs: [t("q1")] },
      { no: 2, label: "2.0 で身につけることは？", inputs: [t("q2")] },
      { no: 3, label: "3.0 で実践することは？", inputs: [t("q3")] },
      { no: 4, label: "4.0 と 5.0 で目指す発展は？", inputs: [t("q4")] },
      { no: 5, label: "あなたの目標と学習ステップはどうつながる？", inputs: [t("q5")] },
      { no: 6, label: "次に学びたいことは？", inputs: [t("q6")] },
    ],
  },
  {
    no: 9, code: "MY LIFE ROADMAP", title: "人生の目標と期限を決定する",
    intro: "描いた未来を、期限と行動のある計画に変えよう。",
    aiTarget: "長期・中期・短期の目標、期限、前提、最初の行動と開始日を確定。",
    clear: "目標と期限、最初の一歩が決まった。",
    questions: [
      { no: 1, label: "長期的に実現したいことは？", inputs: [t("q1")] },
      { no: 2, label: "中期目標は？", inputs: [t("q2")] },
      { no: 3, label: "直近の短期目標は？", inputs: [t("q3")] },
      {
        no: 4, label: "それぞれの達成期限は？",
        inputs: [
          { key: "q4_long", kind: "date", label: "長期" },
          { key: "q4_mid", kind: "date", label: "中期" },
          { key: "q4_short", kind: "date", label: "短期" },
        ],
      },
      { no: 5, label: "必要な金額と条件は？", inputs: [t("q5", { sensitive: true })] },
      { no: 6, label: "優先して磨く力は？", inputs: [{ key: "q6", kind: "multi", options: capabilityOptions }] },
      { no: 7, label: "最初に実行する行動は？", inputs: [{ key: "q7", kind: "text" }] },
      { no: 8, label: "いつ開始する？", inputs: [{ key: "q8", kind: "date" }] },
    ],
  },
  {
    no: 10, code: "THE FINAL DISCOVERY", title: "最終統合精査・人生設計の完成",
    intro: "ここまでの発見を振り返り、あなた自身の人生設計として完成させよう。",
    aiTarget: "全 9LEVEL の最新確定回答を読み込み、矛盾・未確認・計算前提を示す。本人の確認後に完成版スナップショット作成。",
    clear: "あなたの人生設計が完成した。",
    questions: [
      { no: 1, label: "願望と人生の目的はつながっている？", inputs: [yesno("q1")] },
      { no: 2, label: "未来家計簿と目標・期限は整合している？", inputs: [yesno("q2")] },
      { no: 3, label: "ビジョンボードは望む人生を表している？", inputs: [yesno("q3")] },
      { no: 4, label: "優先して解消するギャップは明確？", inputs: [yesno("q4")] },
      { no: 5, label: "必要な力と最初の行動は明確？", inputs: [yesno("q5")] },
      { no: 6, label: "この人生設計を、自分の意思で確定する？", inputs: [yesno("q6")] },
    ],
  },
];

export function getStage(no: number): StageDef | undefined {
  return STAGES.find((s) => s.no === no);
}

/** 原本PDFのフォント欠けを補った箇所（発注者確認待ち） */
export const TEXT_CORRECTIONS: { where: string; original: string; implemented: string }[] = [
  { where: "LEVEL01 設問2", original: "どんなをしたい？", implemented: "どんな体験をしたい？" },
  { where: "LEVEL02 設問2", original: "食費日用品（月額）は？", implemented: "食費・日用品（月額）は？" },
  { where: "LEVEL02 設問3", original: "衣服美容（月額）は？", implemented: "衣服・美容（月額）は？" },
  { where: "LEVEL02 設問4", original: "交通自動車（月額）は？", implemented: "交通・自動車（月額）は？" },
  { where: "LEVEL02 設問5", original: "旅行趣味（年間）は？", implemented: "旅行・趣味（年間）は？" },
  { where: "LEVEL02 設問6", original: "健康育（年間）は？", implemented: "健康・教育（年間）は？" },
  { where: "LEVEL07 設問5", original: "運力はどう役立つ？", implemented: "運営力はどう役立つ？" },
  { where: "6大能力 表示原稿", original: "育力／運力／力", implemented: "教育力／運営力／経営力" },
  { where: "LEVEL09 設問1", original: "長期的に現したいことは？", implemented: "長期的に実現したいことは？" },
  { where: "LEVEL09 設問5", original: "必要な金額と件は？", implemented: "必要な金額と条件は？" },
  { where: "共通文言 共有確認", original: "選した相手に、プレビュに表示された容を共有します。よろしいですか？", implemented: "選択した相手に、プレビューに表示された内容を共有します。よろしいですか？" },
  { where: "最終メッセージ", original: "二度ない人生を", implemented: "（変更禁止のため原文どおり「二度ない人生を」で表示。「二度とない」の欠けの可能性あり）" },
];
