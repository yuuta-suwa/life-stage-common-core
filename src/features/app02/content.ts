/**
 * APP02 SELF-REALIZATION ENGINE｜教材・定義（仕様書 v1.0 §03・§05・§06・§10・§13）
 * 文言は仕様書の記載を基準にする。教育監修（§24「推奨60セルの正式な教育監修」）は未了のため、
 * 60セルの推奨は仕様書 §13 の「初期テンプレート例」をそのまま用いる。
 */

export type Mode = "DISCOVERY" | "CONVICTION" | "LEGACY";
export const ABILITY_CODES = ["attraction", "recruitment", "education", "development", "operations", "management"] as const;
export type AbilityCode = (typeof ABILITY_CODES)[number];

export const MODES: { code: Mode; label: string; title: string; target: string; note: string }[] = [
  { code: "DISCOVERY", label: "DISCOVERY", title: "自己実現の発見", target: "ゲスト", note: "6大能力を「人生を豊かにする6つの力」として、平易な言葉で説明します。" },
  { code: "CONVICTION", label: "CONVICTION", title: "成長への確信", target: "既存メンバー", note: "集客力・採用力・教育力・育成力・運営力・経営力を、実務成果につながる目標として設計します。" },
  { code: "LEGACY", label: "LEGACY", title: "未来への価値創造", target: "経営者・子会社社長志望", note: "目標年度のコミットを設定できます（利用資格は管理者が設定します）。" },
];

export const ABILITIES: Record<AbilityCode, { name: string; plain: string; role: string }> = {
  attraction: { name: "集客力", plain: "出会いをつくる力", role: "必要な相手と接点をつくり、価値提供の機会を増やす。" },
  recruitment: { name: "採用力", plain: "仲間をつくる力", role: "目的を共有できる人と協力関係を築く。" },
  education: { name: "教育力", plain: "伝える力", role: "知識や方法を伝え、相手が実践できるようにする。" },
  development: { name: "育成力", plain: "人を育てる力", role: "自立して成果を出せる人材やリーダーを育てる。" },
  operations: { name: "運営力", plain: "チームで実現する力", role: "役割、時間、情報、資源を調整し、継続的に組織成果を出す。" },
  management: { name: "経営力", plain: "未来をつくる力", role: "目的、収益、資源、リスクを判断し、持続的な価値を生む。" },
};

/** モードに応じた能力名（DISCOVERY は平易な名称を主に表示） */
export function abilityName(code: AbilityCode, mode: Mode) {
  const a = ABILITIES[code];
  return mode === "DISCOVERY" ? `${a.plain}（${a.name}）` : a.name;
}

export const ABILITY_CHAIN =
  "集客による機会創出 → 採用による仲間づくり → 教育による実践の再現 → 育成による自立 → 運営による組織の継続 → 経営による資源配分と持続的価値";
export const ABILITY_CHAIN_NOTE = "これは代表的な相互関係です。順序は固定的な唯一解ではなく、あなたの人生目標と環境に応じて変えられます。";

export const LEVELS = [
  { lv: 0, label: "LV0", desc: "未経験・未習得" },
  { lv: 1, label: "LV1", desc: "理解している" },
  { lv: 2, label: "LV2", desc: "自分で実践している" },
  { lv: 3, label: "LV3", desc: "継続して成果を出している" },
  { lv: 4, label: "LV4", desc: "他者に教え、成果を再現している" },
  { lv: 5, label: "LV5", desc: "他者を育成できる人材を育てている" },
] as const;

/* ---------- §05 セールス力 ---------- */
export const SALES = {
  definition:
    "セールス力とは、相手の願望・課題・価値観を理解し、信頼を築き、価値を伝え、相手が納得して意思決定できるよう支援する能力である。販売や押し売りに限定しない。",
  components: ["相手を理解する力", "信頼関係構築", "課題・願望の明確化", "価値伝達", "提案", "意思決定支援", "約束履行と継続関係"],
  examples: [
    { area: "収入", text: "相手の課題を理解して価値を提案できると、仕事の依頼や契約につながり、収入の選択肢が広がる。" },
    { area: "仕事", text: "上司・同僚・取引先の意図を理解し、納得して動いてもらうことで、仕事が前に進む。" },
    { area: "人間関係", text: "相手の願望を聴き、約束を守ることで、信頼が積み重なる。" },
    { area: "仲間づくり", text: "目的を共有し、相手が自分の意思で参加を決められるよう支援することで、協力者が増える。" },
    { area: "経営", text: "顧客・社員・取引先それぞれの意思決定を支える力は、事業を続けるための土台になる。" },
    { area: "社会貢献", text: "活動の価値を分かりやすく伝え、共感した人が参加できるようにすることで、影響が広がる。" },
  ],
  limits:
    "セールス力だけで願望が必ず叶うわけではありません。資金・時間・健康・専門知識・環境など、ほかの条件も必要です。相手の意思を尊重し、押し付けや誤解を招く説明はセールス力ではありません。",
};

/** 理解確認（§04「理解度は短い説明・質問で確認する」）。正解は1つ */
export const SALES_QUIZ = [
  {
    q: "仕様で定義するセールス力に最も近いものはどれ？",
    options: ["商品をできるだけ多く売る力", "相手が納得して意思決定できるよう支援する力", "相手を説得して必ず契約させる力"],
    answer: 1,
  },
  {
    q: "セールス力について正しいものはどれ？",
    options: ["身につければ必ず願望が叶う", "販売の場面だけで使う", "人間関係や仲間づくりにも役立つが、ほかの条件も必要"],
    answer: 2,
  },
];

export const ABILITY_QUIZ = [
  {
    q: "「教育力」の説明として最も近いものはどれ？",
    options: ["知識や方法を伝え、相手が実践できるようにする", "必要な相手と接点をつくる", "収益とリスクを判断する"],
    answer: 0,
  },
  {
    q: "6大能力の相互関係について正しいものはどれ？",
    options: ["順序は全員同じで変えられない", "代表的な関係はあるが、本人の目標と環境で順序は変わる", "経営力だけ身につければよい"],
    answer: 1,
  },
];

/* ---------- §10 現在地診断の設問（具体的経験・頻度・結果・再現性） ---------- */
export const DIAGNOSIS_LADDER: { lv: 1 | 2 | 3 | 4 | 5; q: (a: string) => string }[] = [
  { lv: 1, q: (a) => `${a}について、方法や考え方を人に説明できる程度に理解していますか？` },
  { lv: 2, q: (a) => `${a}を、自分で実際に行ったことがありますか？（いつ・何を・どのくらい）` },
  { lv: 3, q: (a) => `${a}で、継続して（数か月以上）成果を出していますか？` },
  { lv: 4, q: (a) => `${a}を他の人に教え、その人も成果を出していますか？` },
  { lv: 5, q: (a) => `${a}を教えられる人（育成者）を育てたことがありますか？` },
];

/* ---------- §11 成長環境の比較軸 ---------- */
export const ENV_CRITERIA = [
  "教育体系", "実践機会", "指導者", "振り返り", "成果検証", "仲間", "挑戦機会", "費用", "時間負担", "本人の価値観との適合性",
] as const;
export const ENV_CANDIDATES = [
  { key: "current", label: "現在の環境" },
  { key: "lei", label: "LEI STYLE" },
  { key: "other", label: "その他の選択肢" },
] as const;

/* ---------- §07-1 能力以外の必要条件 ---------- */
export const NON_ABILITY_CONDITIONS = ["資金", "時間", "健康", "資格", "家族", "地域", "法規制", "専門知識", "外部環境"] as const;
export const EVIDENCE_TYPES = [
  { value: "fact", label: "本人が提供した事実" },
  { value: "record", label: "確認できる実績・資料" },
  { value: "general", label: "一般的な因果関係" },
  { value: "hypothesis", label: "仮説（未確認）" },
] as const;
export const RELEVANCE = [
  { value: "direct", label: "直接関連" },
  { value: "indirect", label: "間接関連" },
  { value: "weak", label: "現時点では関連が弱い／不明" },
] as const;

/* ---------- §13 10年間の標準推奨到達状態（60セル）---------- */
export type CellCategory = "prep" | "learn" | "practice" | "sustain" | "teach" | "build" | "legacy";
const T: Record<AbilityCode, string[]> = {
  attraction: ["自分で集客", "成果を継続", "他者に集客を教える", "組織で集客を継続", "集客の仕組みを改善", "集客リーダー育成", "複数チームで成果", "集客体制を仕組み化", "後継者に継承", "継続的な集客体制"],
  recruitment: ["採用方法を理解", "採用活動を実践", "採用成果を継続", "他者に採用を教える", "組織で採用を継続", "採用リーダー育成", "採用の仕組み化", "複数組織に展開", "後継者を育成", "採用体制を継承"],
  education: ["準備期間", "教育方法を理解", "教えた人が実践", "教育成果を継続", "教えた人も教育", "教育者を育成", "教育体系を構築", "教育の仕組みを改善", "後継教育者を育成", "教育文化を継承"],
  development: ["準備期間", "準備期間", "育成方法を理解", "人材の自立を支援", "育成成果を継続", "育成者を育成", "育成体制を構築", "自立したリーダー育成", "後継者を育成", "育成文化を継承"],
  operations: ["準備期間", "準備期間", "準備期間", "運営方法を理解", "チーム運営で成果", "組織成果を継続", "複数チームを運営", "運営を仕組み化", "次世代運営者育成", "自律する組織を構築"],
  management: ["準備期間", "準備期間", "準備期間", "準備期間", "経営原則を理解", "経営判断で利益創出", "事業収益を安定化", "経営体制を構築", "次世代経営者育成", "持続する事業を構築"],
};

/**
 * テンプレート各セルの目標レベル（§10 の LV 定義に沿って割り当て。年ごとに最大1段階ずつ上がるよう設計）。
 * 目標であり実績認定ではない。教育監修（§24）で変更可能。
 */
const L: Record<AbilityCode, number[]> = {
  attraction: [2, 3, 4, 4, 4, 5, 5, 5, 5, 5],
  recruitment: [1, 2, 3, 4, 4, 5, 5, 5, 5, 5],
  education: [0, 1, 2, 3, 4, 5, 5, 5, 5, 5],
  development: [0, 0, 1, 2, 3, 4, 5, 5, 5, 5],
  operations: [0, 0, 0, 1, 2, 3, 4, 5, 5, 5],
  management: [0, 0, 0, 0, 1, 2, 3, 4, 5, 5],
};
const LEVEL_OF = new Map<string, number>(ABILITY_CODES.flatMap((a) => T[a].map((t, i) => [`${a}:${t}`, L[a][i]] as [string, number])));

/** テンプレート文から段階（色分け用）と目標レベルを決める */
export function classify(text: string, ability?: AbilityCode): { category: CellCategory; level: number } {
  const known = ability ? LEVEL_OF.get(`${ability}:${text}`) : undefined;
  const level = known ?? (text === "準備期間" ? 0 : /理解|原則/.test(text) ? 1 : /継承|後継|次世代|文化|育成|体制|仕組み/.test(text) ? 5 : /教/.test(text) ? 4 : /継続|安定/.test(text) ? 3 : 2);
  const category: CellCategory = text === "準備期間" ? "prep"
    : /継承|後継|次世代|文化/.test(text) ? "legacy"
    : level >= 5 ? "build" : level === 4 ? "teach" : level === 3 ? "sustain" : level === 2 ? "practice" : "learn";
  return { category, level };
}

export const CATEGORY_LABEL: Record<CellCategory, string> = {
  prep: "準備期間（基礎能力・関連経験を積む）", learn: "学習", practice: "実践", sustain: "成果継続", teach: "教えて再現", build: "育成・仕組み化", legacy: "継承",
};

const REC: Record<CellCategory, { experiences: string; criteria: string }> = {
  prep: { experiences: "関連する基礎（他の能力の実践・人との関わり）を積み、この力が必要になる場面を観察する", criteria: "この力が自分の目標のどこで役立つかを、自分の言葉で説明できる" },
  learn: { experiences: "教材・研修・先輩の実践から方法を学び、一度試してみる", criteria: "方法と注意点を人に説明でき、試した結果を振り返っている" },
  practice: { experiences: "自分で実際に行い、記録を残して改善する", criteria: "一定期間、自分の行動で具体的な結果（人数・件数など）が出ている" },
  sustain: { experiences: "同じ成果を数か月以上続け、うまくいく条件を言語化する", criteria: "数か月以上、成果が安定して続いている" },
  teach: { experiences: "他の人に方法を教え、相手の実践を支援する", criteria: "教えた人が自分で実践し、成果を出している" },
  build: { experiences: "育成者・リーダーを育て、役割や仕組みとして整える", criteria: "自分がいなくても、チームや仕組みで成果が続いている" },
  legacy: { experiences: "次の担い手に役割と考え方を引き継ぐ", criteria: "後継者が自立して運営・育成を担っている" },
};

export type RecommendedCell = {
  ability: AbilityCode; year_index: number; text: string; level: number; category: CellCategory; experiences: string; criteria: string;
};

/**
 * 推奨60セル（§12-3）。現在地診断のレベルが高い能力は、テンプレートの到達済みの段階を前倒しする
 * （例：集客力が LV3 なら「成果を継続」までは到達済みとして、次の段階から始める）。末尾は最終段階で埋める。
 * 空欄は作らない。
 */
export function recommendCells(current: Partial<Record<AbilityCode, number>> = {}): RecommendedCell[] {
  return ABILITY_CODES.flatMap((ability) => {
    const base = T[ability];
    const lv = Math.max(0, Math.min(5, current[ability] ?? 0));
    // 到達済み（テンプレートのレベル <= 現在地 かつ 準備期間でない）段階を先頭から飛ばす
    let skip = 0;
    while (skip < base.length - 1) {
      const c = classify(base[skip], ability);
      if (c.category === "prep" ? lv >= 1 : c.level <= lv) skip++;
      else break;
    }
    const seq = base.slice(skip);
    while (seq.length < 10) seq.push(base[base.length - 1]);
    return seq.map((text, i) => {
      const c = classify(text, ability);
      return { ability, year_index: i + 1, text, level: c.level, category: c.category, ...REC[c.category] };
    });
  });
}

export const TEMPLATE = T;

/* ---------- §14 経営者志望ラダー（LEGACY 専用）。能力レベルだけで経営者の適格性を認定しない ---------- */
export const LADDER = [
  { no: 1, title: "経営の基本を理解する", needs: "経営原則・数字（売上・利益・費用）の基本を学び、自分の言葉で説明できる", evidence: "学んだ内容・説明した相手" },
  { no: 2, title: "チーム・事業の一部を任される", needs: "役割・目標・行動を管理し、チームで成果を出す（運営力）", evidence: "担当範囲・期間・成果" },
  { no: 3, title: "収益に責任を持つ", needs: "部門・プロジェクトの売上と利益に責任を持ち、継続して黒字にする", evidence: "対象・期間・売上と利益の推移" },
  { no: 4, title: "人と資源の配分を判断する", needs: "採用・育成・投資・撤退などの経営判断を行い、結果を振り返る", evidence: "判断の内容・理由・結果" },
  { no: 5, title: "事業の代表を担う準備ができている", needs: "後継者・幹部を育て、自分がいなくても回る体制をつくる", evidence: "育てた人・体制・継続している成果" },
] as const;
export const LADDER_STATUS = [["", "未着手"], ["doing", "取り組み中"], ["done", "経験あり"]] as const;
export const LEGACY_PREREQUISITES = ["売上", "利益", "人材育成", "組織運営", "経営判断"] as const;

/* ---------- §15・§18 共有できる項目（受信者の役割ごとの初期選択。センシティブ項目は初期 OFF） ---------- */
export const SHARE_ITEMS = [
  { key: "vision", label: "人生ビジョン（目的・優先したい願望・実現したい理由）", sensitive: false },
  { key: "vision_constraints", label: "制約や気がかり", sensitive: true },
  { key: "analysis", label: "自己実現ストーリーと実現条件", sensitive: false },
  { key: "position", label: "6大能力の現在地（暫定）", sensitive: false },
  { key: "environment", label: "成長環境の比較で分かったこと", sensitive: false },
  { key: "roadmap", label: "10ヵ年計画（6能力×10年の到達目標）", sensitive: false },
  { key: "focus", label: "年ごとの重点能力", sensitive: false },
  { key: "commitment", label: "目標年度・成長方針・コミット", sensitive: false },
  { key: "presentation", label: "自己実現プレゼン（全文）", sensitive: false },
] as const;
export type ShareKey = (typeof SHARE_ITEMS)[number]["key"];
export const SHARE_DEFAULTS: Record<string, ShareKey[]> = {
  leader: ["vision", "commitment", "presentation"],
  trainer: ["position", "roadmap", "focus"],
  mentor: ["vision", "analysis", "environment", "roadmap", "commitment"],
};
export const RELATION_LABEL: Record<string, string> = { mentor: "メンター", trainer: "トレーナー", leader: "リーダー", admin: "運営管理者" };
export const RELATION_ROLE: Record<string, string> = {
  leader: "日常の伴走・理解の確認・疑問の一次受付（本人の願望とのズレ、説明の分かりやすさ、進み具合）",
  trainer: "能力・教育内容の妥当性の確認（セールス力・6大能力・レベル・推奨目標・成長順序）",
  mentor: "人生と戦略の整合性の確認（人生ビジョン・価値観・10年計画・環境選択・長期の方向性）",
};
export const PURPOSE_REASONS = [
  { value: "vision", label: "人生ビジョンとの不一致", route: "mentor" },
  { value: "plan", label: "能力・成長計画の不一致", route: "trainer" },
  { value: "fact", label: "事実・前提の誤り", route: "leader" },
  { value: "other", label: "その他", route: "leader" },
] as const;
export const PURPOSE_STATUS: Record<string, string> = {
  received: "受付", reviewing: "確認中", proposed: "修正案提示", awaiting_user: "本人確認待ち", done: "完了", on_hold: "保留",
};
