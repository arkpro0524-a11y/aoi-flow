// /lib/productSelector/scoring.ts

/**
 * PRODUCT SELECTOR
 *
 * 役割：
 * - 相場や利益を直接判定する画面ではありません。
 * - ニュース、SNS、画像、記事、広告、店舗写真、スクショなどから、
 *   「今どんな文化・空気・時代感が再発生しているか」を整理する市場文脈OSです。
 *
 * 分担：
 * - PRODUCT SELECTOR：どのジャンル・文脈へ時間と資金を使うかを決める。
 * - SELL CHECK：個別商品をいくらで買い、いくらで売るかを判断する。
 */

export type ProductSelectorDecision =
  | "touch_now"
  | "research_first"
  | "watch_only"
  | "avoid_now";

export type ProductSelectorInput = {
  name: string;
  sourceTypes: string;
  sourceText: string;
  visualNotes: string;
  candidateHint: string;
  budget: number;
  category?: string;
  keywords?: string;
  memo?: string;
};

export type ProductSelectorAxisKey =
  | "context"
  | "visual"
  | "atmosphere"
  | "marketSignal"
  | "future"
  | "vento"
  | "smallCapital";

export type ProductSelectorAxis = {
  key: ProductSelectorAxisKey;
  label: string;
  score: number;
  reason: string;
};

export type ProductSelectorGenreCandidate = {
  name: string;
  score: number;
  reason: string;
  searchWords: string[];
};

export type ProductSelectorBuyCandidate = {
  name: string;
  score: number;
  action: "buy_candidate" | "research_first" | "watch_only";
  reason: string;
  evidence: string[];
  sellCheckKeywords: string[];
};

export type ProductSelectorObservationFact = {
  label: string;
  value: string;
  confidence: number;
};

export type ProductSelectorResult = {
  totalScore: number;
  decision: ProductSelectorDecision;
  decisionLabel: string;
  decisionSummary: string;
  demandLayer: string;
  atmosphereSummary: string;
  axes: ProductSelectorAxis[];
  genreCandidates: ProductSelectorGenreCandidate[];
  strengths: string[];
  risks: string[];
  nextActions: string[];
  sellCheckBridge: string[];
  searchKeywords: string[];
  buyCandidates: ProductSelectorBuyCandidate[];
  observationFacts: ProductSelectorObservationFact[];
  learningSignals: string[];
};

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeText(text: string | undefined | null): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xfee0)
    )
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, words: string[]): boolean {
  const normalized = normalizeText(text);
  return words.some((word) => normalized.includes(normalizeText(word)));
}

function hitCount(text: string, words: string[]): number {
  const normalized = normalizeText(text);
  return words.filter((word) => normalized.includes(normalizeText(word))).length;
}

function yen(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "未設定";
  return `${Math.round(n).toLocaleString()}円`;
}

function uniqKeepOrder(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of xs) {
    const value = String(raw || "").trim();
    const key = normalizeText(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }

  return out;
}

function mergedInputText(input: ProductSelectorInput): string {
  return [
    input.name,
    input.sourceTypes,
    input.sourceText,
    input.visualNotes,
    input.candidateHint,
    input.category,
    input.keywords,
    input.memo,
  ]
    .filter(Boolean)
    .join(" ");
}

const SOURCE_WORDS = [
  "yahoo",
  "ニュース",
  "x",
  "twitter",
  "instagram",
  "インスタ",
  "tiktok",
  "youtube",
  "pinterest",
  "雑誌",
  "ブログ",
  "海外",
  "collector",
  "コレクター",
  "オークション",
  "店舗",
  "倉庫",
  "広告",
  "映画",
  "アニメ",
  "スクショ",
  "画像",
  "写真",
];

const CONTEXT_WORDS = [
  "昭和",
  "平成",
  "y2k",
  "industrial",
  "インダストリアル",
  "analog",
  "アナログ",
  "retro future",
  "レトロフューチャー",
  "日本製",
  "made in japan",
  "手仕事",
  "無骨",
  "crt",
  "ブラウン管",
  "カセット",
  "vhs",
  "工業",
  "企業物",
  "ノベルティ",
  "古道具",
  "旧車",
  "文具",
  "工具",
  "家電",
  "ui",
];

const VISUAL_WORDS = [
  "色味",
  "質感",
  "金属",
  "プラスチック",
  "黄ばみ",
  "透明",
  "光",
  "影",
  "反射",
  "パッケージ",
  "ロゴ",
  "日本語",
  "タイポ",
  "ラベル",
  "ui",
  "ボタン",
  "ダイヤル",
  "画面",
  "crt",
  "粒子",
  "ノイズ",
  "古さ",
  "写真",
  "動画",
  "リール",
];

const ATMOSPHERE_WORDS = [
  "空気",
  "世界観",
  "ノスタルジー",
  "懐かしい",
  "静か",
  "生活感",
  "倉庫",
  "店舗",
  "工場",
  "路地",
  "昭和感",
  "平成感",
  "無骨",
  "未来感",
  "退廃",
  "再評価",
  "再発見",
  "再編集",
  "カルチャー",
];

const MARKET_SIGNAL_WORDS = [
  "急増",
  "増えている",
  "流行",
  "再放送",
  "復刻",
  "再始動",
  "周年",
  "映画化",
  "海外人気",
  "海外需要",
  "collector",
  "コレクター",
  "pinterest",
  "保存",
  "バズ",
  "話題",
  "検索",
  "オークション",
  "落札",
  "完売",
];

const FUTURE_WORDS = [
  "既に価値",
  "再評価",
  "日本製",
  "made in japan",
  "昭和",
  "平成",
  "80年代",
  "90年代",
  "vhs",
  "カセット",
  "casio",
  "sony",
  "panasonic",
  "任天堂",
  "企業物",
  "廃盤",
  "当時物",
  "復刻",
  "ブランド再始動",
  "海外",
];

const VENTO_WORDS = [
  "vento",
  "昭和",
  "日本",
  "日本製",
  "古い",
  "レトロ",
  "ヴィンテージ",
  "vintage",
  "金属",
  "質感",
  "静か",
  "ノスタルジー",
  "ミニカー",
  "カメラ",
  "時計",
  "ラジオ",
  "企業物",
  "日本語",
  "無骨",
  "工業",
  "アナログ",
];

const SMALL_CAPITAL_WORDS = [
  "小型",
  "軽量",
  "ピンバッジ",
  "キーホルダー",
  "缶バッジ",
  "ストラップ",
  "ミニカー",
  "カード",
  "ステッカー",
  "雑貨",
  "文具",
  "鉛筆",
  "消しゴム",
  "小物",
];

const HARD_MARKET_WORDS = [
  "偽物",
  "真贋",
  "コピー",
  "高額",
  "プレミア",
  "競争",
  "業者",
  "大量",
  "ブランド品",
  "鑑定",
  "修理前提",
  "動作未確認",
  "ジャンク",
];

const FRAGILE_WORDS = [
  "ガラス",
  "陶器",
  "大型",
  "重い",
  "壊れやすい",
  "精密",
  "液漏れ",
  "電池",
  "カビ",
];

type GenreRule = {
  name: string;
  words: string[];
  reason: string;
  searchWords: string[];
};

const GENRE_RULES: GenreRule[] = [
  {
    name: "旧SONY・旧CASIO小型機器",
    words: ["sony", "ソニー", "casio", "カシオ", "小型", "ガジェット", "日本製", "ui", "ボタン", "液晶"],
    reason: "日本製・小型機器・UIデザインの再評価文脈に接続しやすいです",
    searchWords: ["旧SONY 小型機器", "CASIO レトロ 日本製", "Japanese vintage gadget"],
  },
  {
    name: "昭和企業ノベルティ",
    words: ["昭和", "企業物", "ノベルティ", "非売品", "ロゴ", "日本語", "小物"],
    reason: "企業ロゴ・日本語・配布文化の文脈をVentoの世界観へ乗せやすいです",
    searchWords: ["昭和 企業物 ノベルティ", "非売品 企業物 売却済み", "Japanese corporate novelty"],
  },
  {
    name: "日本製文具・古い事務用品",
    words: ["文具", "鉛筆", "消しゴム", "事務", "日本製", "昭和", "パッケージ"],
    reason: "小資本で試しやすく、パッケージや日本語タイポの投稿価値があります",
    searchWords: ["昭和 文具 日本製", "古い事務用品 レトロ", "Japanese stationery vintage"],
  },
  {
    name: "古い工具・工業系小物",
    words: ["工具", "工業", "industrial", "無骨", "金属", "サビ", "ケース"],
    reason: "インダストリアル・無骨・金属質感の空気に接続しやすいです",
    searchWords: ["古い工具 日本製", "工業系 小物 レトロ", "industrial vintage japan"],
  },
  {
    name: "レトロ家電UI・操作パネル系",
    words: ["家電", "ui", "ボタン", "ダイヤル", "crt", "ブラウン管", "ラジオ", "カセット"],
    reason: "UI・ボタン・表示窓など視覚的に強く、画像/動画化に向きます",
    searchWords: ["レトロ家電 UI", "古いラジオ カセット", "CRT design vintage"],
  },
  {
    name: "90s国内ホビー・キャラクター小物",
    words: ["90年代", "平成", "ホビー", "アニメ", "ゲーム", "キャラクター", "ピンバッジ", "キーホルダー"],
    reason: "平成/Y2K再評価と小型発送の現実性を両立しやすいです",
    searchWords: ["90s 日本 ホビー", "平成レトロ キャラクター 小物", "Y2K Japanese toy"],
  },
  {
    name: "VHS・カセット文化",
    words: ["vhs", "カセット", "テープ", "映像", "映画", "アナログ", "パッケージ"],
    reason: "アナログメディア・パッケージ・ノイズ表現の文化文脈が強いです",
    searchWords: ["VHS レトロ 日本語", "カセット 昭和 レトロ", "analog media vintage"],
  },
  {
    name: "日本製ミニカー・小型模型",
    words: ["ミニカー", "模型", "旧車", "日本製", "金属", "小型", "昭和"],
    reason: "小型・金属・旧車文脈があり、海外コレクターと投稿価値の両方を狙えます",
    searchWords: ["日本製 ミニカー 昭和", "旧車 ミニカー 売却済み", "Japanese diecast vintage"],
  },
];


type ProductGroupRule = {
  name: string;
  words: string[];
  smallCapitalWords: string[];
  riskWords: string[];
  reason: string;
  evidence: string[];
  sellCheckKeywords: string[];
};

const PRODUCT_GROUP_RULES: ProductGroupRule[] = [
  {
    name: "平成レトロ文具・メモ帳/シール",
    words: ["平成", "レトロ", "メモ", "メモ帳", "シール", "文具", "便箋", "手帳", "紙もの", "サンリオ", "zashikibuta"],
    smallCapitalWords: ["メモ", "メモ帳", "シール", "文具", "紙もの", "便箋", "手帳"],
    riskWords: ["汚れ", "折れ", "書き込み", "欠品"],
    reason: "スクショ上で複数見えやすい紙もの・文具系です。小型軽量で送料が抑えやすく、平成レトロ/キャラ文具の文脈にも接続できます。",
    evidence: ["小型・軽量で小資本検証に向く", "複数セット化しやすい", "写真で量感と柄のかわいさを出しやすい"],
    sellCheckKeywords: ["平成レトロ メモ帳", "平成レトロ シール", "レトロ 文具 売り切れ", "サンリオ メモ帳 レトロ"],
  },
  {
    name: "レトロキャラクター雑貨・紙ものセット",
    words: ["キャラクター", "アニメ", "サンリオ", "キキララ", "アーミー", "army", "平成", "昭和", "紙もの", "雑貨", "グッズ", "セット"],
    smallCapitalWords: ["紙もの", "雑貨", "グッズ", "セット", "シール", "カード"],
    riskWords: ["偽物", "版権", "高額", "プレミア"],
    reason: "単品名よりも、キャラクター性・時代感・セット量で価値が出やすい候補です。まずは同系統の売却済みをSELL CHECKで確認する対象です。",
    evidence: ["キャラ・時代感・量感をまとめて訴求できる", "投稿素材として見た目が強い", "個別IPの人気差を確認すれば精度が上がる"],
    sellCheckKeywords: ["平成レトロ キャラクター グッズ", "昭和 キャラクター 紙もの", "レトロ サンリオ 雑貨", "キャラクター メモ帳 セット"],
  },
  {
    name: "ぬいぐるみ・マスコット小物セット",
    words: ["ぬいぐるみ", "マスコット", "キイロイトリ", "リラックマ", "キャラクター", "小物", "セット"],
    smallCapitalWords: ["ぬいぐるみ", "マスコット", "小物", "セット"],
    riskWords: ["汚れ", "におい", "毛玉", "大型"],
    reason: "キャラ認知と見た目の分かりやすさがあります。小型マスコット中心なら発送しやすい一方、汚れ・におい・状態差の確認が必要です。",
    evidence: ["キャラクター認知が強い", "複数まとめ売りで単価を作れる", "状態写真が売れ行きに直結する"],
    sellCheckKeywords: ["ぬいぐるみ マスコット セット 売り切れ", "リラックマ キイロイトリ マスコット", "平成 キャラクター ぬいぐるみ"],
  },
  {
    name: "レトロTシャツ・スウェット/アパレル",
    words: ["tシャツ", "tee", "シャツ", "スウェット", "アパレル", "ヴィンテージ", "vintage", "usa製", "bose", "paul smith", "saturdays"],
    smallCapitalWords: ["tシャツ", "シャツ", "スウェット"],
    riskWords: ["高額", "偽物", "サイズ", "シミ", "穴", "ブランド品"],
    reason: "視覚的に目立つ候補ですが、ブランド・サイズ・状態・真贋でブレます。小資本ではまず安価で状態が明確なものだけ確認対象です。",
    evidence: ["SNS映えと着用文脈を作りやすい", "ブランド/サイズで価格差が大きい", "高額品は初心者フェーズでは慎重"],
    sellCheckKeywords: ["ヴィンテージ Tシャツ 売り切れ", "90s Tシャツ USA製", "レトロ アパレル 売却済み"],
  },
  {
    name: "昭和レトロ小型家電・卓上雑貨",
    words: ["扇風機", "卓上", "家電", "水切り", "ざる", "昭和", "レトロ", "プラスチック", "生活雑貨"],
    smallCapitalWords: ["卓上", "小型", "ざる", "生活雑貨"],
    riskWords: ["動作未確認", "大型", "壊れ", "送料", "電池", "カビ"],
    reason: "生活感と昭和レトロの見た目はありますが、家電系は動作・送料・破損リスクが出ます。小型で非電動に近いものから確認です。",
    evidence: ["昭和生活感の写真素材になる", "家電は動作確認が必要", "送料と破損リスクで利益が削られやすい"],
    sellCheckKeywords: ["昭和レトロ 卓上 扇風機", "昭和レトロ 生活雑貨 売り切れ", "レトロ プラスチック 雑貨"],
  },
  {
    name: "高額スニーカー/ブランド衣類は今回は見送り寄り",
    words: ["nike", "ナイキ", "air jordan", "スニーカー", "45,250", "67,500", "高額", "ブランド"],
    smallCapitalWords: [],
    riskWords: ["偽物", "真贋", "高額", "ブランド", "サイズ", "競争"],
    reason: "スクショ内では価格が高く、真贋・サイズ・競争リスクが大きい候補です。現在予算が小さい段階では観測に留めるのが安全です。",
    evidence: ["高額で仕入れ上限を超えやすい", "真贋/サイズ/相場ブレが大きい", "小資本の学習対象としては損失幅が大きい"],
    sellCheckKeywords: ["スニーカー 売却済み 真贋", "Air Jordan レトロ 売り切れ"],
  },
];

function buildProductGroupBuyCandidates(args: {
  input: ProductSelectorInput;
  text: string;
  axes: ProductSelectorAxis[];
}): ProductSelectorBuyCandidate[] {
  const { input, text, axes } = args;
  const visualScore = axes.find((axis) => axis.key === "visual")?.score ?? 0;
  const marketScore = axes.find((axis) => axis.key === "marketSignal")?.score ?? 0;
  const smallCapitalScore = axes.find((axis) => axis.key === "smallCapital")?.score ?? 0;
  const budget = Number.isFinite(input.budget) ? input.budget : 0;
  const isSmallBudget = budget > 0 && budget <= 5000;

  return PRODUCT_GROUP_RULES.map((rule) => {
    const itemHits = hitCount(text, rule.words);
    const smallHits = hitCount(text, rule.smallCapitalWords);
    const riskHits = hitCount(text, rule.riskWords);
    const broadPenalty = rule.name.includes("高額") ? 22 : 0;
    const apparelPenalty = rule.name.includes("アパレル") && isSmallBudget ? 8 : 0;

    if (itemHits <= 0) return null;

    const score = clampScore(
      34 +
        itemHits * 10 +
        smallHits * 7 +
        visualScore * 0.12 +
        marketScore * 0.08 +
        smallCapitalScore * 0.12 +
        (isSmallBudget ? 8 : 0) -
        riskHits * 9 -
        broadPenalty -
        apparelPenalty
    );

    return {
      name: rule.name,
      score,
      action: actionFromCandidateScore(score),
      reason: rule.reason,
      evidence: uniqKeepOrder([
        ...rule.evidence,
        isSmallBudget ? "現在予算5,000円前後では小型・軽量を優先" : "予算に対して仕入れ上限確認が必要",
        riskHits > 0 ? "状態・真贋・送料リスク語があるためSELL CHECK確認必須" : "大きな危険語は少なめ",
      ]),
      sellCheckKeywords: uniqKeepOrder(rule.sellCheckKeywords),
    };
  })
    .filter((x): x is ProductSelectorBuyCandidate => Boolean(x))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function scoreAxis(
  key: ProductSelectorAxisKey,
  label: string,
  text: string,
  words: string[],
  base: number,
  step: number,
  successReason: string,
  weakReason: string
): ProductSelectorAxis {
  const hits = hitCount(text, words);
  return {
    key,
    label,
    score: clampScore(base + hits * step),
    reason: hits > 0 ? successReason : weakReason,
  };
}

function scoreContext(text: string): ProductSelectorAxis {
  return scoreAxis(
    "context",
    "文脈強度",
    text,
    CONTEXT_WORDS,
    28,
    8,
    "昭和/Y2K/工業/アナログなど、文化文脈として拾える語句があります",
    "文化文脈がまだ薄いです。時代・素材・カルチャー語を追加してください"
  );
}

function scoreVisual(text: string): ProductSelectorAxis {
  return scoreAxis(
    "visual",
    "視覚素材性",
    text,
    VISUAL_WORDS,
    26,
    8,
    "色味・質感・UI・ロゴ・パッケージなど、画像/動画化しやすい要素があります",
    "視覚的な見せ場がまだ弱いです。色味・質感・構図を追加してください"
  );
}

function scoreAtmosphere(text: string): ProductSelectorAxis {
  return scoreAxis(
    "atmosphere",
    "空気検知",
    text,
    ATMOSPHERE_WORDS,
    24,
    9,
    "単品の相場ではなく、時代感・世界観として再編集できる余地があります",
    "空気感の説明がまだ少ないです。どんな世界観が増えているかを足してください"
  );
}

function scoreMarketSignal(text: string): ProductSelectorAxis {
  const sourceHits = hitCount(text, SOURCE_WORDS);
  const signalHits = hitCount(text, MARKET_SIGNAL_WORDS);
  const score = clampScore(22 + sourceHits * 5 + signalHits * 8);

  return {
    key: "marketSignal",
    label: "市場兆候",
    score,
    reason:
      sourceHits + signalHits > 0
        ? "SNS・ニュース・海外投稿・復刻/再始動など、市場文脈の兆候があります"
        : "観測元や市場兆候がまだ不足しています。どこで見た情報かを追加してください",
  };
}

function scoreFuture(text: string): ProductSelectorAxis {
  return scoreAxis(
    "future",
    "未来文脈",
    text,
    FUTURE_WORDS,
    24,
    8,
    "既に価値があり、さらに再評価される可能性のある文脈があります",
    "未来文脈はまだ弱めです。復刻・再放送・海外人気・日本製などの根拠を足してください"
  );
}

function scoreVento(text: string): ProductSelectorAxis {
  return scoreAxis(
    "vento",
    "Vento相性",
    text,
    VENTO_WORDS,
    26,
    8,
    "Ventoの静かな質感・日本感・レトロ感・工業感へ接続しやすいです",
    "Ventoらしい空気へ乗せるには、撮影・背景・文章の設計が必要です"
  );
}

function scoreSmallCapital(text: string, budget: number): ProductSelectorAxis {
  const smallHits = hitCount(text, SMALL_CAPITAL_WORDS);
  const hardHits = hitCount(text, HARD_MARKET_WORDS);
  const fragileHits = hitCount(text, FRAGILE_WORDS);

  let score = 38 + smallHits * 9 - hardHits * 8 - fragileHits * 8;
  if (budget > 0 && budget <= 5000) score += 10;
  if (budget >= 20000) score -= 4;

  return {
    key: "smallCapital",
    label: "小資本適性",
    score: clampScore(score),
    reason:
      smallHits > 0
        ? "小型・軽量・発送しやすい候補が含まれ、現在フェーズに合いやすいです"
        : "小資本で触れるかは未確定です。送料・保管・破損・真贋を確認してください",
  };
}

function decisionFromScore(score: number, axes: ProductSelectorAxis[]): ProductSelectorDecision {
  const market = axes.find((x) => x.key === "marketSignal")?.score ?? 0;
  const vento = axes.find((x) => x.key === "vento")?.score ?? 0;
  const capital = axes.find((x) => x.key === "smallCapital")?.score ?? 0;

  if (score >= 76 && vento >= 55 && capital >= 45) return "touch_now";
  if (score >= 62 && market >= 42) return "research_first";
  if (score >= 45) return "watch_only";
  return "avoid_now";
}

function decisionLabel(decision: ProductSelectorDecision): string {
  if (decision === "touch_now") return "今触る文脈候補";
  if (decision === "research_first") return "調査してから触る文脈";
  if (decision === "watch_only") return "観測継続";
  return "今は避ける";
}

function decisionSummary(decision: ProductSelectorDecision): string {
  if (decision === "touch_now") {
    return "Vento/AOI FLOWで再編集する価値があります。個別商品はSELL CHECKで価格・仕入れ上限を確認してください。";
  }

  if (decision === "research_first") {
    return "文化文脈はありますが、同一商品データ・SNS増加・販売中価格を確認してから触ってください。";
  }

  if (decision === "watch_only") {
    return "今すぐ買うより、SNS・ニュース・画像傾向・売却済みデータを観測する段階です。";
  }

  return "現在フェーズでは、文脈・投稿価値・小資本適性の根拠が不足しています。";
}

function demandLayer(text: string): string {
  if (includesAny(text, ["海外", "japanese", "vintage", "made in japan", "collector"])) {
    return "海外コレクター / Japanese Vintage層";
  }
  if (includesAny(text, ["昭和", "レトロ", "日本製", "企業物", "ノベルティ"])) {
    return "昭和文化・日本レトロ・企業物層";
  }
  if (includesAny(text, ["y2k", "平成", "90年代", "ゲーム", "アニメ"])) {
    return "平成/Y2K・国内ホビー層";
  }
  if (includesAny(text, ["vhs", "カセット", "crt", "ラジオ", "casio", "sony"])) {
    return "アナログメディア・旧ガジェット層";
  }
  if (includesAny(text, ["工業", "industrial", "工具", "無骨"])) {
    return "インダストリアル・古道具・工業系層";
  }
  return "需要層未確定。観測元と文脈語の追加が必要です";
}

function atmosphereSummary(text: string): string {
  const pieces: string[] = [];

  if (includesAny(text, ["昭和", "レトロ", "日本製"])) pieces.push("昭和・日本製の再評価");
  if (includesAny(text, ["y2k", "平成", "90年代"])) pieces.push("平成/Y2Kの再発生");
  if (includesAny(text, ["industrial", "工業", "工具", "無骨"])) pieces.push("工業系・無骨な質感");
  if (includesAny(text, ["vhs", "カセット", "crt", "アナログ"])) pieces.push("アナログメディア文化");
  if (includesAny(text, ["企業物", "ノベルティ", "非売品"])) pieces.push("企業物・配布文化の再編集");
  if (includesAny(text, ["ui", "ボタン", "ダイヤル", "画面"])) pieces.push("古いUI/操作感の視覚価値");

  if (pieces.length === 0) {
    return "まだ空気の核が弱いです。観測した画像・投稿・記事から、時代感や質感を言語化してください。";
  }

  return pieces.join(" / ");
}

function buildGenreCandidates(text: string): ProductSelectorGenreCandidate[] {
  const candidates = GENRE_RULES.map((rule) => {
    const hits = hitCount(text, rule.words);
    return {
      name: rule.name,
      score: clampScore(30 + hits * 14),
      reason: rule.reason,
      searchWords: rule.searchWords,
    };
  })
    .filter((x) => x.score >= 44)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (candidates.length > 0) return candidates;

  return [
    {
      name: "観測候補未確定",
      score: 40,
      reason: "入力された情報だけでは、触るべき商品ジャンルをまだ絞れません",
      searchWords: ["昭和 レトロ 小物", "Japanese vintage", "Vento 仕入れ候補"],
    },
  ];
}

function buildSearchKeywords(input: ProductSelectorInput, text: string): string[] {
  const rawWords = [
    input.name,
    input.candidateHint,
    input.sourceTypes,
    input.category,
    input.keywords,
    ...String(input.sourceText || "").split(/[\s,、\n]+/),
    ...String(input.visualNotes || "").split(/[\s,、\n]+/),
  ];

  const extra: string[] = [
    "Pinterest 増加",
    "海外コレクター",
    "売却済み",
    "ヤフオク 落札",
    "Instagram vintage",
  ];

  if (includesAny(text, ["昭和", "レトロ", "日本製"])) extra.push("Japanese vintage", "昭和レトロ");
  if (includesAny(text, ["企業物", "ノベルティ"])) extra.push("企業物 ノベルティ", "非売品 企業物");
  if (includesAny(text, ["sony", "casio", "カシオ", "ソニー"])) extra.push("旧SONY", "CASIO レトロ");
  if (includesAny(text, ["vhs", "カセット"])) extra.push("VHS レトロ", "analog media vintage");
  if (includesAny(text, ["工業", "industrial", "工具"])) extra.push("industrial vintage", "古い工具 日本製");

  return uniqKeepOrder([...rawWords, ...extra].filter((word): word is string => typeof word === "string" && word.trim().length > 0)).slice(0, 14);
}

function actionFromCandidateScore(score: number): ProductSelectorBuyCandidate["action"] {
  if (score >= 76) return "buy_candidate";
  if (score >= 58) return "research_first";
  return "watch_only";
}

function actionLabel(action: ProductSelectorBuyCandidate["action"]): string {
  if (action === "buy_candidate") return "今買う候補";
  if (action === "research_first") return "先に確認";
  return "観測のみ";
}

function buildObservationFacts(input: ProductSelectorInput, text: string, axes: ProductSelectorAxis[]): ProductSelectorObservationFact[] {
  const source = input.sourceTypes || "観測元未指定";
  const visualScore = axes.find((axis) => axis.key === "visual")?.score ?? 0;
  const marketScore = axes.find((axis) => axis.key === "marketSignal")?.score ?? 0;
  const contextScore = axes.find((axis) => axis.key === "context")?.score ?? 0;

  return [
    {
      label: "観測元",
      value: source,
      confidence: source === "観測元未指定" ? 35 : 75,
    },
    {
      label: "抽出文脈",
      value: input.name || input.candidateHint || "未確定",
      confidence: contextScore,
    },
    {
      label: "視覚素材",
      value: visualScore >= 50 ? "画像・スクショから見た目の特徴あり" : "視覚根拠はまだ弱い",
      confidence: visualScore,
    },
    {
      label: "市場兆候",
      value: marketScore >= 50 ? "売買・投稿・検索の兆候あり" : "価格や売れ行きの直接根拠は不足",
      confidence: marketScore,
    },
    {
      label: "検出キーワード",
      value: uniqKeepOrder(text.split(/[\s,、。\n]+/).slice(0, 18)).slice(0, 8).join(" / ") || "未検出",
      confidence: 55,
    },
  ];
}

function buildLearningSignals(input: ProductSelectorInput, text: string): string[] {
  const signals = [
    "このスクショ/観測はPRODUCT SELECTOR用の市場観測データとして保存対象",
    "個別商品の価格判断はSELL CHECK側の売却済み学習データで補強",
    "同じ候補が複数回出るほど、次回以降の候補優先度を上げる",
  ];

  if (includesAny(text, ["スクショ", "画像", "写真"])) {
    signals.push("画像由来の視覚特徴を理論DB候補として蓄積");
  }

  if (input.budget > 0) {
    signals.push(`予算${yen(input.budget)}に対して小型・軽量・壊れにくい候補を優先`);
  }

  return signals;
}


function uniqProductSelectorBuyCandidates(candidates: ProductSelectorBuyCandidate[]): ProductSelectorBuyCandidate[] {
  const seen = new Set<string>();
  const out: ProductSelectorBuyCandidate[] = [];

  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    const key = normalizeText(candidate.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }

  return out;
}

function buildBuyCandidates(args: {
  input: ProductSelectorInput;
  text: string;
  axes: ProductSelectorAxis[];
  genreCandidates: ProductSelectorGenreCandidate[];
}): ProductSelectorBuyCandidate[] {
  const { input, text, axes, genreCandidates } = args;
  const marketScore = axes.find((axis) => axis.key === "marketSignal")?.score ?? 0;
  const visualScore = axes.find((axis) => axis.key === "visual")?.score ?? 0;
  const smallCapitalScore = axes.find((axis) => axis.key === "smallCapital")?.score ?? 0;
  const budgetBoost = input.budget > 0 && input.budget <= 5000 ? 8 : 0;

  const baseEvidence = [
    marketScore >= 55 ? "市場兆候スコアが一定以上" : "市場兆候は弱めなので追加確認が必要",
    visualScore >= 55 ? "スクショ/画像から視覚的な売り場感を確認" : "画像特徴はまだ弱め",
    smallCapitalScore >= 55 ? "小資本で試しやすい可能性あり" : "送料・破損・保管リスクの確認が必要",
  ];

  // スクショに複数の商品群が見える場合、
  // 「レトロアパレル」などの大きすぎる一括判定に寄せず、
  // 文具・キャラ雑貨・ぬいぐるみ・小型家電・高額品リスクなどへ分解します。
  const fromProductGroups = buildProductGroupBuyCandidates({ input, text, axes });

  const fromGenre = genreCandidates
    .filter((candidate) => candidate.name !== "観測候補未確定")
    .map((candidate) => {
      const score = clampScore(candidate.score * 0.58 + marketScore * 0.18 + visualScore * 0.12 + smallCapitalScore * 0.12 + budgetBoost);
      const action = actionFromCandidateScore(score);

      return {
        name: candidate.name,
        score,
        action,
        reason:
          action === "buy_candidate"
            ? "スクショ/観測文脈・市場兆候・小資本適性のバランスが高く、まず候補として見る価値があります。最終購入前にSELL CHECKで個別価格を確認してください。"
            : action === "research_first"
              ? "候補としては有望ですが、売却済み件数・送料・状態リスクを確認してから判断してください。"
              : "現時点では観測優先です。候補名を保存し、似た商品データを増やしてください。",
        evidence: uniqKeepOrder([candidate.reason, ...baseEvidence]),
        sellCheckKeywords: uniqKeepOrder(candidate.searchWords),
      };
    });

  const mergedCandidates = uniqProductSelectorBuyCandidates([...fromProductGroups, ...fromGenre]);
  if (mergedCandidates.length > 0) return mergedCandidates.slice(0, 6);

  const fallbackName = input.candidateHint || input.name || "スクショ内で目立つ小型商品";
  const fallbackScore = clampScore((marketScore + visualScore + smallCapitalScore) / 3);

  return [
    {
      name: fallbackName,
      score: fallbackScore,
      action: actionFromCandidateScore(fallbackScore),
      reason: "候補はまだ弱いですが、スクショから気になる対象として一時保存できます。まず同一/類似商品の売却済みを3件確認してください。",
      evidence: baseEvidence,
      sellCheckKeywords: buildSearchKeywords(input, text).slice(0, 6),
    },
  ];
}

export function evaluateProductCandidate(input: ProductSelectorInput): ProductSelectorResult {
  const mergedText = mergedInputText(input);

  const axes = [
    scoreContext(mergedText),
    scoreVisual(mergedText),
    scoreAtmosphere(mergedText),
    scoreMarketSignal(mergedText),
    scoreFuture(mergedText),
    scoreVento(mergedText),
    scoreSmallCapital(mergedText, input.budget),
  ];

  const totalScore = clampScore(
    axes.reduce((sum, axis) => sum + axis.score, 0) / axes.length
  );

  const decision = decisionFromScore(totalScore, axes);

  const strengths = axes
    .filter((axis) => axis.score >= 65)
    .map((axis) => `${axis.label}：${axis.reason}`);

  const weakAxes = axes
    .filter((axis) => axis.score < 45)
    .map((axis) => `${axis.label}：${axis.reason}`);

  const risks = [
    ...weakAxes,
    ...(includesAny(mergedText, HARD_MARKET_WORDS)
      ? ["市場リスク：真贋・高額化・競争過多・修理前提の可能性があります"]
      : []),
    ...(includesAny(mergedText, FRAGILE_WORDS)
      ? ["実務リスク：破損・動作確認・送料・保管コストを確認してください"]
      : []),
  ];

  const genreCandidates = buildGenreCandidates(mergedText);
  const buyCandidates = buildBuyCandidates({ input, text: mergedText, axes, genreCandidates });
  const observationFacts = buildObservationFacts(input, mergedText, axes);
  const learningSignals = buildLearningSignals(input, mergedText);

  const nextActions = [
    "気になった空気・文脈を3〜5件の画像/投稿/記事で追加観測する",
    "候補ジャンルを1つに絞り、同一商品または近い商品を3件検索する",
    "売却済み価格と販売中価格を分けて記録する",
    "投稿素材として、写真・リール・AI背景で見せ場を作れるか確認する",
    "個別商品を買う前にSELL CHECKで価格・回転・仕入れ上限を診断する",
  ];

  const sellCheckBridge = [
    "PRODUCT SELECTORは文化・空気・時代感の観測用です。価格判断はSELL CHECKで行います",
    `現在の予算入力：${yen(input.budget)}。この範囲で試せる個体を優先してください`,
    "同一商品データが3件以上集まったら、SELL CHECKの判断精度が大きく上がります",
  ];

  return {
    totalScore,
    decision,
    decisionLabel: decisionLabel(decision),
    decisionSummary: decisionSummary(decision),
    demandLayer: demandLayer(mergedText),
    atmosphereSummary: atmosphereSummary(mergedText),
    axes,
    genreCandidates,
    strengths:
      strengths.length > 0
        ? strengths
        : ["明確な強みはまだ少なめです。観測元・視覚要素・時代文脈を追加してください"],
    risks:
      risks.length > 0
        ? risks
        : ["大きな危険語は検出していません。ただし個別商品の状態・送料・真贋はSELL CHECKで確認してください"],
    nextActions,
    sellCheckBridge,
    searchKeywords: buildSearchKeywords(input, mergedText),
    buyCandidates,
    observationFacts,
    learningSignals,
  };
}
