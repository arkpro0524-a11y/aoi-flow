// lib/vento/marketResearch.ts
// AOI FLOW / Vento 市場発見OSの固定ルール層。
// 重要方針：AIに点数を丸投げせず、特徴量を抽出してからルールで評価します。
// 「価格がある = 市場がある」ではなく、「市場候補 → 理論 → 追加観測 → 商品 → 価格」の順で判断します。

export type VentoInputClass =
  | "NEWS"
  | "VIDEO"
  | "SOCIAL"
  | "MARKETPLACE"
  | "PRODUCT"
  | "SEARCH_RESULT";

export type VentoJudgement = "有望" | "弱い" | "検証優先" | "見送り" | "監視";
export type ZeroToThree = 0 | 1 | 2 | 3;

export type DemandLevel = "未確認" | "弱い" | "中" | "強い";
export type MarketStatus = "researching" | "validated" | "watch" | "pass";

export type MarketCard = {
  id?: string;
  marketName: string;
  domesticDemand: DemandLevel | string;
  overseasDemand: DemandLevel | string;
  researchSources: string[];
  searchWords: string[];
  observationItems: string[];
  hypothesis: string;
  theory: string;
  evidence: string[];
  missingInfo: string[];
  researchPlan?: string[];
  searchKeywords?: string[];
  observationTargets?: string[];
  nextResearchActions?: string[];
  missingInformation?: string[];
  status: MarketStatus;
  updatedAt: string;
};

export type SourceCheckInput = {
  sellerScreenshotNotes: string;
  listingText: string;
  itemDescription: string;
};

export type SourceCheckResult = {
  repeatSupplyPotential: ZeroToThree;
  deadStockPotential: ZeroToThree;
  warehousePotential: ZeroToThree;
  bundlePotential: ZeroToThree;
  contactValue: ZeroToThree;
  negotiationPotential: ZeroToThree;
  shippingCompatibility: ZeroToThree;
  supplyPotential: number;
  repeatSupply: number;
  totalScore: number;
  judgement: "供給源として強い" | "会話する価値あり" | "商品単位で確認" | "供給源価値は弱い";
  reasons: string[];
  nextAction: string;
};


export type MarketResearchInput = {
  theme: string;
  sourceText: string;
  visualNotes: string;
  productCandidates: string;
  sourceNotes: string;
  budget: number;
  imageNames: string[];
};

export type MarketCandidate = {
  marketName: string;
  score: number;
  reason: string;
  domesticHypothesis: string;
  overseasHypothesis: string;
  relatedProducts: string[];
  searchWords: string[];
  risks: string[];
  ventoFit: number;
};

export type ObservationPlan = {
  sourceName: string;
  searchWords: string[];
  targetCount: number;
  observationItems: string[];
  reason: string;
};

export type TrendKnowledgeCard = {
  marketName: string;
  marketId: string;
  status: "未調査" | "調査中" | "検証済" | "監視中" | "見送り";
  summary: string;
  theoryJudgement: VentoJudgement;
  dataJudgement: VentoJudgement;
  integratedJudgement: VentoJudgement;
  domesticDemand: string;
  overseasDemand: string;
  marketFormationScore: number;
  marketGrowthScore: number;
  ventoFitScore: number;
  theoryReasons: string[];
  missingData: string[];
  nextResearch: string[];
  relatedProducts: string[];
  searchWords: string[];
  // TREND KNOWLEDGE強化：Firestore trend_knowledge_cards / API出力で使う正式フィールド
  researchPlan: string[];
  searchKeywords: string[];
  observationTargets: string[];
  nextResearchActions: string[];
  missingInformation: string[];
};

export type MarketTheoryEngineResult = {
  marketExistence: VentoJudgement;
  marketExistenceLevel: "低" | "中" | "高";
  marketExistenceScore: number;
  dataJudgement: string;
  theoryJudgement: string;
  seriesScore: ZeroToThree;
  storyScore: ZeroToThree;
  worldviewScore: ZeroToThree;
  overseasDistributionScore: ZeroToThree;
  collectorScore: ZeroToThree;
  communityScore: ZeroToThree;
  searchCultureScore: ZeroToThree;
  snsScore: ZeroToThree;
  youtubeScore: ZeroToThree;
  redditScore: ZeroToThree;
  marketFormationScore: number;
  marketFormationMaxScore: 30;
  marketTheory: string;
  evidence: string[];
  scoreReasons: string[];
  missingInformation: string[];
  missingEvidence: string[];
  confidence: "低" | "中" | "高";
  domesticDemand: string;
  overseasDemand: string;
  nextHypothesisTests: string[];
};

export type DesignLearningResult = {
  colorPattern: string;
  shapePattern: string;
  materialTexture: string;
  sizeFeeling: string;
  decorativeElements: string;
  displayValue: string;
  photoValue: string;
  worldview: string;
  designGrammar: string[];
  marketTheory: string;
  commonColors: string[];
  commonShapes: string[];
  commonMaterials: string[];
  commonWorldviews: string[];
  commonStories: string[];
  storedTheoryNote: string;
  targetFeatures: string[];
  domesticDesignDemand: string;
  overseasDesignDemand: string;
};

export type DesignScoreBreakdown = {
  series: ZeroToThree;
  worldview: ZeroToThree;
  story: ZeroToThree;
  display: ZeroToThree;
  photogenic: ZeroToThree;
  brand: ZeroToThree;
  collectingCulture: ZeroToThree;
  // DESIGN SCORE正式フィールド。既存名も残しつつ追加します。
  seriesScore: ZeroToThree;
  worldviewScore: ZeroToThree;
  storyScore: ZeroToThree;
  displayScore: ZeroToThree;
  photoScore: ZeroToThree;
  brandScore: ZeroToThree;
  collectorScore: ZeroToThree;
  total: number;
  reasons: string[];
};

export type MarketFormationBreakdown = {
  series: ZeroToThree;
  overseasDistribution: ZeroToThree;
  searchWords: ZeroToThree;
  community: ZeroToThree;
  collectors: ZeroToThree;
  soldHistory: ZeroToThree;
  sns: ZeroToThree;
  youtube: ZeroToThree;
  reddit: ZeroToThree;
  total: number;
  reasons: string[];
};

export type MultiDataIntegrationResult = {
  commonMarket: string;
  integratedSources: string[];
  extractedCommonSignals: string[];
  sourceGaps: string[];
  conclusion: string;
};

export type ProductPick = {
  name: string;
  action: "SELL CHECKへ" | "先に検索" | "観測のみ";
  score: number;
  reason: string;
  checkPoints: string[];
  sellCheckKeywords: string[];
};

export type SourceCheckSummary = {
  sourceType: string;
  sourceScore: number;
  supplyPotential: number;
  repeatSupply: number;
  warehousePotential: number;
  deadStockPotential: number;
  bundlePotential: number;
  contactValue: number;
  sellerPotential: string;
  reasons: string[];
  risks: string[];
  nextAction: string;
};

export type SellCheckUpgradePreview = {
  theoryJudgement: VentoJudgement;
  dataJudgement: VentoJudgement;
  integratedJudgement: VentoJudgement;
  seriesScore: number;
  designScore: number;
  displayScore: number;
  marketFormationScore: number;
  monopolyScore: number;
  quickSalePriceBand: string;
  rotationPriceBand: string;
  standardPriceBand: string;
  highWaitPriceBand: string;
  collectorPriceBand: string;
  passConditions: string[];
  buyConditions: string[];
};

export type MarketResearchResult = {
  inputClass: VentoInputClass;
  inputClassReason: string;
  trendRadar: {
    summary: string;
    marketCandidates: MarketCandidate[];
  };
  trendKnowledge: {
    cards: TrendKnowledgeCard[];
    theoryHistoryNote: string;
    observationPlans: ObservationPlan[];
  };
  marketTheoryEngine: MarketTheoryEngineResult;
  designLearning: DesignLearningResult;
  designScore: DesignScoreBreakdown;
  marketFormation: MarketFormationBreakdown;
  multiDataIntegration: MultiDataIntegrationResult;
  productSelector: {
    summary: string;
    picks: ProductPick[];
  };
  sourceCheck: SourceCheckSummary;
  sellCheckUpgradePreview: SellCheckUpgradePreview;
  snsLearningPlan: string[];
  domesticDemand: string;
  overseasDemand: string;
};

function safeText(...values: string[]): string {
  return values.filter(Boolean).join("\n").toLowerCase();
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w.toLowerCase()));
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = String(raw || "").trim();
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function score03(text: string, signals: string[]): ZeroToThree {
  const hit = signals.filter((s) => text.includes(s.toLowerCase())).length;
  if (hit >= 3) return 3;
  if (hit === 2) return 2;
  if (hit === 1) return 1;
  return 0;
}

function scoreFromText(text: string, signals: string[]): number {
  let score = 0;
  for (const s of signals) {
    if (text.includes(s.toLowerCase())) score += 1;
  }
  return score;
}

export function classifyVentoInput(input: MarketResearchInput): { inputClass: VentoInputClass; reason: string } {
  const text = safeText(input.theme, input.sourceText, input.visualNotes, input.productCandidates, input.sourceNotes, input.imageNames.join(" "));
  if (includesAny(text, ["youtube", "動画", "shorts", "tiktok", "リール"])) {
    return { inputClass: "VIDEO", reason: "動画・SNS動画を示す語が含まれています。" };
  }
  if (includesAny(text, ["reddit", "x.com", "twitter", "instagram", "sns", "投稿", "ポスト"])) {
    return { inputClass: "SOCIAL", reason: "SNS・投稿系の観測素材として扱います。" };
  }
  if (includesAny(text, ["メルカリ", "mercari", "ジモティー", "jimoty", "ebay", "ヤフオク", "ラクマ", "出品", "売却"])) {
    return { inputClass: "MARKETPLACE", reason: "マーケットプレイスの出品・検索結果として扱います。" };
  }
  if (includesAny(text, ["ニュース", "記事", "news", "press", "報道"])) {
    return { inputClass: "NEWS", reason: "ニュース・記事の市場兆候として扱います。" };
  }
  if (includesAny(text, ["検索結果", "google", "画像検索", "search"])) {
    return { inputClass: "SEARCH_RESULT", reason: "検索結果から市場候補を抽出します。" };
  }
  return { inputClass: "PRODUCT", reason: "商品画像・商品候補を中心に分析します。" };
}

function marketFromSignals(text: string): MarketCandidate[] {
  const candidates: MarketCandidate[] = [];
  const add = (c: MarketCandidate) => candidates.push(c);

  if (includesAny(text, ["企業", "ノベルティ", "非売品", "ロゴ", "販促", "記念", "限定配布"])) {
    add({
      marketName: "昭和企業ノベルティ市場",
      score: 78,
      reason: "企業ロゴ・非売品・当時物は、価格データが少なくても理論上のコレクション性があります。",
      domesticHypothesis: "国内では昭和企業ロゴ、懐かしさ、非売品性に反応する層が期待できます。",
      overseasHypothesis: "海外では vintage Japanese corporate novelty / old Japanese logo goods として日本固有性が出ます。",
      relatedProducts: ["企業ロゴ入り文具", "非売品グッズ", "記念品", "販促キーホルダー"],
      searchWords: ["昭和 ノベルティ 非売品", "企業ロゴ 昭和 グッズ", "vintage Japanese corporate novelty"],
      risks: ["売却履歴が少ない可能性", "企業名単体では検索需要が弱い可能性"],
      ventoFit: 82,
    });
  }

  if (includesAny(text, ["ミニチュア", "ハウス", "置物", "飾り", "インテリア", "ドール", "shoemaker", "村", "童話", "家"])) {
    add({
      marketName: "ミニチュアハウス・世界観ディスプレイ市場",
      score: 78,
      reason: "同一商品売却履歴が少なくても、シリーズ性・飾り映え・世界観で市場を作れる可能性があります。",
      domesticHypothesis: "国内ではインテリア雑貨、ミニチュア収集、飾り物需要が想定されます。",
      overseasHypothesis: "海外では miniature house / display collectible / shoemaker miniature の文脈で探せます。",
      relatedProducts: ["ミニチュアハウス", "職人工房モチーフ", "飾れる置物", "シリーズ雑貨"],
      searchWords: ["ミニチュアハウス 置物", "shoemaker miniature", "display collectible miniature"],
      risks: ["市場が小さい", "同一商品データ不足", "破損リスク"],
      ventoFit: 80,
    });
  }

  if (includesAny(text, ["時計", "記念時計", "会館", "記念品", "周年", "婦人時計", "レディース時計"])) {
    add({
      marketName: includesAny(text, ["婦人", "レディース", "装飾", "金色"]) ? "昭和婦人時計・アクセサリー市場" : "記念品・限定配布物市場",
      score: includesAny(text, ["婦人", "レディース", "装飾", "金色"]) ? 66 : 52,
      reason: includesAny(text, ["婦人", "レディース", "装飾", "金色"])
        ? "時計としてではなく、小型アクセサリー・装飾品として市場が成立する可能性があります。"
        : "記念品は希少性が出る一方、固有名詞が弱いと需要が見えにくいです。",
      domesticHypothesis: "国内では施設名・地域名・昭和感・アクセサリー感に反応する層が限定的に存在します。",
      overseasHypothesis: "海外では Japanese vintage ladies watch / commemorative clock の文脈で、デザイン性が必要です。",
      relatedProducts: ["記念時計", "昭和婦人時計", "装飾時計", "施設記念品"],
      searchWords: ["昭和 婦人時計", "vintage ladies watch Japan", "Japanese commemorative clock vintage"],
      risks: ["市場不明", "売却履歴が少ない", "同一比較不可"],
      ventoFit: includesAny(text, ["婦人", "レディース", "装飾", "金色"]) ? 62 : 42,
    });
  }

  if (includesAny(text, ["casio", "カシオ", "電卓", "デジタル時計", "ラジオ", "カメラ", "日本製"])) {
    add({
      marketName: "古いCASIO・日本製ガジェット市場",
      score: 72,
      reason: "日本製・旧ロゴ・小型ガジェットは海外検索語と相性がよく、発送性も比較的良いです。",
      domesticHypothesis: "国内ではレトロ家電・旧製品コレクター需要が考えられます。",
      overseasHypothesis: "海外では vintage CASIO / made in Japan gadget の検索導線が作りやすいです。",
      relatedProducts: ["古いCASIO", "電卓", "デジタル時計", "小型ラジオ"],
      searchWords: ["古い CASIO 日本製", "vintage CASIO made in Japan", "old Japanese calculator"],
      risks: ["動作確認が必要", "電池液漏れ", "型番不明だと弱い"],
      ventoFit: 70,
    });
  }

  if (includesAny(text, ["ガラス", "昭和ガラス", "皿", "花瓶", "食器"])) {
    add({
      marketName: "昭和ガラス・レトロ食器市場",
      score: 62,
      reason: "視覚性は高い一方、割れ物で送料・破損リスクが重く、Vento初期予算では慎重です。",
      domesticHypothesis: "国内では昭和レトロ食器・喫茶店風インテリアとして需要があります。",
      overseasHypothesis: "海外では Japanese retro glassware として可能性はありますが発送難易度が高いです。",
      relatedProducts: ["昭和ガラス皿", "レトロ花瓶", "喫茶店風グラス"],
      searchWords: ["昭和ガラス レトロ", "Japanese retro glassware", "vintage Japanese glass"],
      risks: ["破損リスク", "送料高", "保管コスト"],
      ventoFit: 54,
    });
  }

  if (includesAny(text, ["ミニカー", "トミカ", "日本製ミニカー", "車"])) {
    add({
      marketName: "日本製ミニカー市場",
      score: 76,
      reason: "小型・収集性・型番検索・海外需要の条件が揃いやすい市場です。",
      domesticHypothesis: "国内ではトミカ・旧車・絶版ミニカーの収集需要があります。",
      overseasHypothesis: "海外では Japanese diecast / Tomica made in Japan の文脈で強い可能性があります。",
      relatedProducts: ["日本製トミカ", "絶版ミニカー", "企業ロゴ車両"],
      searchWords: ["日本製 トミカ 絶版", "Tomica made in Japan vintage", "Japanese diecast vintage"],
      risks: ["状態差が大きい", "箱有無で価格差", "偽物・再塗装リスク"],
      ventoFit: 78,
    });
  }

  if (candidates.length === 0) {
    add({
      marketName: "仮説市場（要追加観測）",
      score: 42,
      reason: "市場名を確定するには素材が不足しています。まずは固有名詞・素材・年代・売買例を追加してください。",
      domesticHypothesis: "国内需要は未確定です。",
      overseasHypothesis: "海外需要は未確定です。",
      relatedProducts: ["小型軽量品", "当時物", "シリーズ物"],
      searchWords: ["昭和 当時物", "vintage Japanese collectible", "非売品 グッズ"],
      risks: ["市場未形成", "データ不足", "判断不能"],
      ventoFit: 30,
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

function buildObservationPlans(best: MarketCandidate): ObservationPlan[] {
  const baseItems = ["形", "色", "素材", "年代", "シリーズ性", "売却履歴", "出品数", "写真映え", "送料リスク"];
  return [
    {
      sourceName: "Google画像 / Pinterest",
      searchWords: best.searchWords,
      targetCount: 50,
      observationItems: ["共通デザイン", "色・形", "置き画の見え方", "シリーズの有無"],
      reason: "市場が視覚で成立しているか確認します。",
    },
    {
      sourceName: "eBay SOLD / メルカリ売却済み",
      searchWords: best.searchWords,
      targetCount: 30,
      observationItems: ["売却価格", "売却頻度", "箱・状態差", "海外需要"],
      reason: "価格ではなく、市場が実際に動いているか確認します。",
    },
    {
      sourceName: "YouTube / Reddit / Instagram",
      searchWords: best.searchWords,
      targetCount: 20,
      observationItems: baseItems,
      reason: "コミュニティ・紹介文化・収集文化の有無を確認します。",
    },
  ];
}

function buildKnowledgeCard(candidate: MarketCandidate, text: string): TrendKnowledgeCard {
  const dataSignals = scoreFromText(text, ["売却", "sold", "落札", "相場", "履歴", "出品数", "メルカリ", "ebay"]);
  const theorySignals = scoreFromText(text, ["非売品", "限定", "日本製", "当時物", "シリーズ", "ロゴ", "コレクション", "小型", "軽量", "飾り", "世界観", "物語"]);

  const theoryJudgement: VentoJudgement =
    candidate.score >= 72 || theorySignals >= 3 ? "有望" : candidate.score >= 55 ? "検証優先" : "監視";
  const dataJudgement: VentoJudgement =
    dataSignals >= 4 ? "有望" : dataSignals >= 2 ? "検証優先" : "弱い";
  const integratedJudgement: VentoJudgement =
    theoryJudgement === "有望" && dataJudgement === "弱い"
      ? "検証優先"
      : theoryJudgement === "監視" && dataJudgement === "弱い"
        ? "監視"
        : theoryJudgement;

  const id = candidate.marketName
    .toLowerCase()
    .replace(/[^a-z0-9ぁ-んァ-ヶー一-龠]+/g, "-")
    .replace(/^-|-$/g, "");

  const missing = [
    dataSignals < 2 ? "売却履歴" : "",
    !includesAny(text, ["海外", "ebay", "reddit", "vintage", "japanese"]) ? "海外需要" : "",
    !includesAny(text, ["類似", "シリーズ", "同シリーズ", "関連"]) ? "類似市場データ" : "",
    !includesAny(text, ["youtube", "reddit", "instagram", "sns"]) ? "コミュニティ観測" : "",
  ].filter(Boolean);

  return {
    marketName: candidate.marketName,
    marketId: id || `market-${Date.now()}`,
    status: integratedJudgement === "検証優先" ? "調査中" : integratedJudgement === "監視" ? "監視中" : "未調査",
    summary: candidate.reason,
    theoryJudgement,
    dataJudgement,
    integratedJudgement,
    domesticDemand: candidate.domesticHypothesis,
    overseasDemand: candidate.overseasHypothesis,
    marketFormationScore: clampScore(candidate.score - (dataJudgement === "弱い" ? 18 : 0)),
    marketGrowthScore: clampScore(candidate.score - 8 + theorySignals * 3),
    ventoFitScore: candidate.ventoFit,
    theoryReasons: uniq([
      ...candidate.reason.split("。").map((x) => x.trim()).filter(Boolean),
      includesAny(text, ["小型", "軽量"]) ? "小型軽量で発送適性がある" : "",
      includesAny(text, ["非売品", "限定"]) ? "非売品・限定性が理論価値になる" : "",
      includesAny(text, ["シリーズ", "ナンバリング", "複数作品"]) ? "シリーズ性があり市場学習しやすい" : "",
      includesAny(text, ["日本製", "昭和", "当時物"]) ? "日本固有性・当時物文脈がある" : "",
      includesAny(text, ["物語", "世界観", "童話", "村"]) ? "物語性・世界観が購買理由になり得る" : "",
    ]),
    missingData: missing.length > 0 ? missing : ["追加検証データ"],
    nextResearch: candidate.searchWords,
    relatedProducts: candidate.relatedProducts,
    searchWords: candidate.searchWords,
    researchPlan: [
      "Google画像/Pinterestで共通デザインを50件観測する",
      "eBay SOLD/メルカリ売却済みで売買履歴を30件確認する",
      "YouTube/Reddit/SNSで収集文化・紹介文化を20件確認する",
    ],
    searchKeywords: candidate.searchWords,
    observationTargets: [
      "ケース形状",
      "色・素材感",
      "シリーズ性",
      "売買履歴",
      "国内需要",
      "海外需要",
    ],
    nextResearchActions: [
      `${candidate.marketName} をGoogle画像で検索する`,
      `${candidate.searchWords[0] ?? candidate.marketName} をeBay SOLDで検索する`,
      "YouTube/Reddit/SNSで市場名・コレクター語句を確認する",
    ],
    missingInformation: missing.length > 0 ? missing : ["追加検証データ"],
  };
}

function buildDesignScore(text: string): DesignScoreBreakdown {
  const series = score03(text, ["シリーズ", "複数", "ナンバリング", "コレクション"]);
  const worldview = score03(text, ["世界観", "村", "童話", "昭和", "レトロ", "アクセサリー"]);
  const story = score03(text, ["物語", "ストーリー", "職人", "工房", "shoemaker", "記念"]);
  const display = score03(text, ["飾り", "置物", "ディスプレイ", "インテリア", "小型"]);
  const photogenic = score03(text, ["写真映え", "色", "金色", "装飾", "かわいい", "デザイン"]);
  const brand = score03(text, ["ブランド", "casio", "citizen", "ロゴ", "メーカー", "日本製"]);
  const collectingCulture = score03(text, ["コレクター", "収集", "collector", "レア", "限定", "当時物"]);
  const total = series + worldview + story + display + photogenic + brand + collectingCulture;

  return {
    series,
    worldview,
    story,
    display,
    photogenic,
    brand,
    collectingCulture,
    seriesScore: series,
    worldviewScore: worldview,
    storyScore: story,
    displayScore: display,
    photoScore: photogenic,
    brandScore: brand,
    collectorScore: collectingCulture,
    total,
    reasons: uniq([
      series > 0 ? "シリーズ性があるため、単品ではなく集める市場として見られます。" : "",
      worldview > 0 ? "世界観・年代感があり、商品名以外の検索導線を作れます。" : "",
      story > 0 ? "物語性があるため、データ不足でも仮説構築できます。" : "",
      display > 0 ? "飾れる・置ける要素があり、実用品以外の価値が出ます。" : "",
      photogenic > 0 ? "写真映え要素があり、SNSや出品画像で訴求できます。" : "",
      brand > 0 ? "ブランド・メーカー・ロゴが検索語として使えます。" : "",
      collectingCulture > 0 ? "収集文化・限定性の手がかりがあります。" : "",
    ]),
  };
}

function buildMarketFormation(text: string): MarketFormationBreakdown {
  const series = score03(text, ["シリーズ", "複数作品", "同シリーズ"]);
  const overseasDistribution = score03(text, ["海外", "ebay", "vintage", "japanese", "etsy"]);
  const searchWords = score03(text, ["検索", "キーワード", "google", "型番", "英語"]);
  const community = score03(text, ["コミュニティ", "forum", "掲示板", "ファン", "紹介"]);
  const collectors = score03(text, ["コレクター", "collector", "収集", "レア"]);
  const soldHistory = score03(text, ["sold", "売却", "落札", "販売済み", "相場"]);
  const sns = score03(text, ["instagram", "x.com", "twitter", "sns", "投稿"]);
  const youtube = score03(text, ["youtube", "動画", "レビュー", "shorts"]);
  const reddit = score03(text, ["reddit", "subreddit", "スレ"]);
  const total = series + overseasDistribution + searchWords + community + collectors + soldHistory + sns + youtube + reddit;

  return {
    series,
    overseasDistribution,
    searchWords,
    community,
    collectors,
    soldHistory,
    sns,
    youtube,
    reddit,
    total,
    reasons: uniq([
      series > 0 ? "シリーズがあるため、同一商品に限らず横展開で観測できます。" : "",
      overseasDistribution > 0 ? "海外流通・英語検索の手がかりがあります。" : "",
      searchWords > 0 ? "検索語を作れるため、追加観測に進めます。" : "",
      community > 0 ? "コミュニティ観測の可能性があります。" : "",
      collectors > 0 ? "コレクター文脈があります。" : "",
      soldHistory > 0 ? "売買履歴の手がかりがあります。" : "",
      sns > 0 ? "SNS反応を市場検証に使えます。" : "",
      youtube > 0 ? "YouTubeで紹介・レビュー文化を確認できます。" : "",
      reddit > 0 ? "Redditで海外コミュニティを確認できます。" : "",
    ]),
  };
}

function buildMarketTheoryEngine(card: TrendKnowledgeCard, design: DesignScoreBreakdown, formation: MarketFormationBreakdown): MarketTheoryEngineResult {
  // 指示仕様どおり、AIの直接採点ではなく既存の特徴語から0〜3点へルール化します。
  // 市場理論エンジンは10項目×3点=30点満点で marketFormationScore を返します。
  const seriesScore = design.series;
  const storyScore = design.story;
  const worldviewScore = design.worldview;
  const overseasDistributionScore = formation.overseasDistribution;
  const collectorScore = Math.max(formation.collectors, design.collectingCulture) as ZeroToThree;
  const communityScore = Math.max(formation.community, formation.reddit, formation.youtube) as ZeroToThree;
  const searchCultureScore = formation.searchWords;
  const snsScore = formation.sns;
  const youtubeScore = formation.youtube;
  const redditScore = formation.reddit;

  const rawTotal =
    seriesScore +
    storyScore +
    worldviewScore +
    overseasDistributionScore +
    collectorScore +
    communityScore +
    searchCultureScore +
    snsScore +
    youtubeScore +
    redditScore;

  const marketExistenceLevel: "低" | "中" | "高" = rawTotal >= 20 ? "高" : rawTotal >= 10 ? "中" : "低";
  const marketExistence: VentoJudgement =
    marketExistenceLevel === "高" || card.integratedJudgement === "有望"
      ? "有望"
      : marketExistenceLevel === "中"
        ? "検証優先"
        : "弱い";
  const confidence: "低" | "中" | "高" = marketExistenceLevel;

  const scoreReasons = uniq([
    seriesScore > 0 ? `シリーズ性 ${seriesScore}/3：シリーズ・連続作品・型番違いとして観測できる可能性があります。` : "シリーズ性 0/3：シリーズ性は未確認です。",
    storyScore > 0 ? `物語性 ${storyScore}/3：物語・背景説明で価値を説明できる余地があります。` : "物語性 0/3：物語性は未確認です。",
    worldviewScore > 0 ? `世界観 ${worldviewScore}/3：世界観・雰囲気で市場を作れる可能性があります。` : "世界観 0/3：世界観は未確認です。",
    overseasDistributionScore > 0 ? `海外流通 ${overseasDistributionScore}/3：海外流通・英語検索導線の可能性があります。` : "海外流通 0/3：海外流通は未確認です。",
    collectorScore > 0 ? `コレクター文化 ${collectorScore}/3：コレクター・収集文化につながる要素があります。` : "コレクター文化 0/3：コレクター需要は未確認です。",
    communityScore > 0 ? `コミュニティ ${communityScore}/3：YouTube / Reddit / フォーラムで語られる余地があります。` : "コミュニティ 0/3：コミュニティは未確認です。",
    searchCultureScore > 0 ? `検索文化 ${searchCultureScore}/3：検索語・呼び名・市場名を作れる可能性があります。` : "検索文化 0/3：検索文化は未確認です。",
    snsScore > 0 ? `SNS文化 ${snsScore}/3：SNSで見せ方・保存・拡散の余地があります。` : "SNS文化 0/3：SNS反応は未確認です。",
    youtubeScore > 0 ? `YouTube存在 ${youtubeScore}/3：動画紹介・レビュー文化を確認できます。` : "YouTube存在 0/3：YouTube上の文脈は未確認です。",
    redditScore > 0 ? `Reddit存在 ${redditScore}/3：海外掲示板・コミュニティで検証できます。` : "Reddit存在 0/3：Reddit上の文脈は未確認です。",
  ]);

  return {
    marketExistence,
    marketExistenceLevel,
    marketExistenceScore: rawTotal,
    dataJudgement: card.dataJudgement,
    theoryJudgement: card.theoryJudgement,
    seriesScore,
    storyScore,
    worldviewScore,
    overseasDistributionScore,
    collectorScore,
    communityScore,
    searchCultureScore,
    snsScore,
    youtubeScore,
    redditScore,
    marketFormationScore: rawTotal,
    marketFormationMaxScore: 30,
    marketTheory:
      rawTotal >= 20
        ? `${card.marketName}は、売却履歴だけでなく、シリーズ性・物語性・世界観・海外流通・収集文化から市場存在性が高いと説明できる段階です。`
        : rawTotal >= 10
          ? `${card.marketName}は、データ不足で終了せず、10項目の不足を追加観測しながら市場理論を作る段階です。`
          : `${card.marketName}は、現時点では市場存在性が弱く、まず検索語・売買履歴・コミュニティ・世界観の追加観測が必要です。`,
    evidence: uniq([...card.theoryReasons, ...design.reasons, ...formation.reasons, ...scoreReasons]).slice(0, 18),
    scoreReasons,
    missingInformation: card.missingData,
    missingEvidence: card.missingData,
    confidence,
    domesticDemand: card.domesticDemand,
    overseasDemand: card.overseasDemand,
    nextHypothesisTests: [
      "シリーズ性：同シリーズ・型番違い・連作があるか確認する",
      "物語性：物語・背景説明があるか確認する",
      "世界観：商品単体ではなく世界観市場として説明できるか見る",
      "海外流通：eBay / Google英語検索で海外流通を確認する",
      "コレクター文化：収集対象として語られているか確認する",
      "コミュニティ：YouTube / Reddit / フォーラムで語られているか確認する",
      "検索文化：市場名として成立する検索語を複数作る",
      "SNS文化：Instagram / X / Pinterestで保存・見せ方の文脈を見る",
      "YouTube存在：紹介動画・レビュー・コレクション動画を確認する",
      "Reddit存在：海外掲示板で検索し、反応と呼び名を確認する",
    ],
  };
}

function buildDesignLearning(card: TrendKnowledgeCard, text: string, design: DesignScoreBreakdown): DesignLearningResult {
  const colorPattern = includesAny(text, ["金色", "ゴールド", "暖色", "ブラウン", "木目"])
    ? "暖色・金色・木目など、飾り物/アクセサリー文脈に寄る色が観測できます。"
    : "色の共通パターンは未確定です。Google画像や出品画像を並べて観測してください。";
  const shapePattern = includesAny(text, ["小型", "ミニチュア", "ハウス", "丸", "ケース", "文字盤"])
    ? "小型・家型・丸形・ケース形状など、遠目でも識別できる形の文法があります。"
    : "形の共通パターンは未確定です。外形・輪郭・サイズ比を追加観測してください。";
  const materialTexture = includesAny(text, ["木", "陶器", "金属", "プラスチック", "真鍮", "レザー"])
    ? "素材感が価値説明に使える可能性があります。木目・金属感・陶器感などを分けて見ます。"
    : "素材感は未確定です。写真から質感と破損リスクを分けて観測してください。";
  const sizeFeeling = includesAny(text, ["小型", "ミニ", "卓上", "置物", "持ち運び", "軽い"])
    ? "小型・卓上・飾りやすさが価値になり得ます。送料とディスプレイ性を同時に見ます。"
    : "サイズ感は未確定です。送料・保管・飾りやすさを追加確認してください。";
  const decorativeElements = includesAny(text, ["装飾", "柄", "ロゴ", "文字盤", "村", "童話", "限定"])
    ? "装飾・ロゴ・柄・物語モチーフが価値説明に使える可能性があります。"
    : "装飾要素は未確定です。買い手が何に惹かれるかを画像で確認してください。";
  const displayValue = design.display > 0
    ? "ディスプレイ性があります。置いた時の見栄え・棚映え・コレクション並びを観測します。"
    : "ディスプレイ価値は未確定です。飾った写真や使用例を追加観測してください。";
  const photoValue = design.photogenic > 0
    ? "写真映えがあります。SNS・販売画像で魅力を伝えやすい可能性があります。"
    : "写真映えは未確定です。背景・明るさ・角度で価値が変わるか確認してください。";
  const worldview = includesAny(text, ["世界観", "物語", "童話", "村", "シリーズ", "shoemaker"])
    ? "世界観で市場化できる可能性があります。単品ではなくシリーズ/物語として扱います。"
    : "世界観は未確定です。商品単体ではなく、周辺シリーズや文脈を探してください。";

  const grammar = uniq([
    includesAny(text, ["ミニチュア", "ハウス", "村", "童話", "shoemaker"]) ? "ミニチュアハウス市場は、置物市場ではなく世界観市場として見る。" : "",
    includesAny(text, ["婦人時計", "レディース", "金色", "装飾"]) ? "昭和婦人時計は、時計市場ではなくアクセサリー市場として見る。" : "",
    includesAny(text, ["非売品", "ロゴ", "企業", "記念"]) ? "企業ノベルティは、実用品ではなくロゴ・時代性・非売品性で見る。" : "",
    includesAny(text, ["日本製", "casio", "カシオ", "電卓"]) ? "古い日本製ガジェットは、機能より型番・旧ロゴ・海外検索語で見る。" : "",
    ...design.reasons,
  ]);

  const marketTheory =
    grammar[0] ||
    (design.total >= 8
      ? `${card.marketName}は、色・形・素材感・飾りやすさの共通文法を追加観測して理論化できます。`
      : `${card.marketName}の共通文法は未確定です。`);

  const commonColors = uniq([
    includesAny(text, ["金色", "ゴールド"]) ? "金色/ゴールド" : "",
    includesAny(text, ["暖色", "ブラウン", "木目"]) ? "暖色/ブラウン/木目" : "",
    includesAny(text, ["昭和", "レトロ"]) ? "昭和レトロ色" : "",
  ]);
  const commonShapes = uniq([
    includesAny(text, ["小型", "ミニ"]) ? "小型" : "",
    includesAny(text, ["ハウス", "家"]) ? "家型/ハウス型" : "",
    includesAny(text, ["丸", "文字盤", "ケース"]) ? "丸形/ケース形状" : "",
  ]);
  const commonMaterials = uniq([
    includesAny(text, ["木", "木目"]) ? "木/木目" : "",
    includesAny(text, ["陶器"]) ? "陶器" : "",
    includesAny(text, ["金属", "真鍮"]) ? "金属/真鍮" : "",
    includesAny(text, ["プラスチック"]) ? "プラスチック" : "",
  ]);
  const commonWorldviews = uniq([
    includesAny(text, ["世界観", "童話", "村", "shoemaker"]) ? "童話/村/世界観" : "",
    includesAny(text, ["昭和", "レトロ"]) ? "昭和レトロ" : "",
    includesAny(text, ["企業", "ロゴ", "記念"]) ? "企業ロゴ/記念品" : "",
  ]);
  const commonStories = uniq([
    includesAny(text, ["物語", "ストーリー", "職人", "工房"]) ? "物語/職人工房" : "",
    includesAny(text, ["シリーズ", "複数作品"]) ? "シリーズ展開" : "",
    includesAny(text, ["記念", "周年"]) ? "記念/周年背景" : "",
  ]);

  return {
    colorPattern,
    shapePattern,
    materialTexture,
    sizeFeeling,
    decorativeElements,
    displayValue,
    photoValue,
    worldview,
    designGrammar: grammar.length > 0 ? grammar : ["市場文法は未確定です。色・形・素材・サイズ感・装飾・世界観を追加観測してください。"],
    marketTheory,
    commonColors: commonColors.length > 0 ? commonColors : ["未確定"],
    commonShapes: commonShapes.length > 0 ? commonShapes : ["未確定"],
    commonMaterials: commonMaterials.length > 0 ? commonMaterials : ["未確定"],
    commonWorldviews: commonWorldviews.length > 0 ? commonWorldviews : ["未確定"],
    commonStories: commonStories.length > 0 ? commonStories : ["未確定"],
    storedTheoryNote: "この理論は市場カードの theory に保存して更新していく市場仮説です。",
    targetFeatures: [
      "colorPattern",
      "shapePattern",
      "materialTexture",
      "sizeFeeling",
      "decorativeElements",
      "displayValue",
      "photoValue",
      "worldview",
    ],
    domesticDesignDemand: "国内は懐かしさ・飾りやすさ・実用外価値を分けて観測します。",
    overseasDesignDemand: "海外は Japanese / vintage / miniature / collectible など英語検索語で観測します。",
  };
}

function buildMultiDataIntegration(input: MarketResearchInput, best: MarketCandidate, text: string): MultiDataIntegrationResult {
  const sources = uniq([
    includesAny(text, ["google", "画像検索"]) ? "Google画像" : "",
    includesAny(text, ["ebay"]) ? "eBay / eBay SOLD" : "",
    includesAny(text, ["メルカリ", "mercari"]) ? "メルカリ" : "",
    includesAny(text, ["ジモティー", "jimoty"]) ? "ジモティー" : "",
    includesAny(text, ["reddit"]) ? "Reddit" : "",
    includesAny(text, ["youtube"]) ? "YouTube" : "",
    includesAny(text, ["instagram", "twitter", "x.com", "sns"]) ? "SNS" : "",
    includesAny(text, ["記事", "ニュース", "news"]) ? "記事" : "",
    input.imageNames.length > 0 ? "投入画像" : "",
  ]);

  return {
    commonMarket: best.marketName,
    integratedSources: sources.length > 0 ? sources : ["未投入：まず検索結果・売却済み・SNSのいずれかを追加"],
    extractedCommonSignals: uniq([
      ...best.relatedProducts,
      includesAny(text, ["シリーズ", "世界観"]) ? "シリーズ・世界観" : "",
      includesAny(text, ["海外", "ebay", "vintage"]) ? "海外検索導線" : "",
      includesAny(text, ["飾り", "インテリア", "写真映え"]) ? "ディスプレイ需要" : "",
      includesAny(text, ["倉庫", "在庫", "まとめ"]) ? "供給源価値" : "",
    ]),
    sourceGaps: uniq([
      !includesAny(text, ["sold", "売却", "落札"]) ? "売却済みデータ" : "",
      !includesAny(text, ["reddit", "youtube", "instagram"]) ? "コミュニティ観測" : "",
      !includesAny(text, ["海外", "ebay", "vintage"]) ? "海外需要" : "",
    ]),
    conclusion: "AIは商品名ではなく、投入データ間に共通する市場文脈を抽出します。ここで出た共通市場を次の観測対象にします。",
  };
}

function extractProductPicks(input: MarketResearchInput, candidates: MarketCandidate[], text: string): ProductPick[] {
  const raw = uniq(input.productCandidates.split(/\n|,|、/).map((x) => x.trim()).filter(Boolean));
  const fallback = candidates.flatMap((c) => c.relatedProducts).slice(0, 6);
  const names = raw.length > 0 ? raw : fallback;

  return names.slice(0, 6).map((name) => {
    const lower = name.toLowerCase();
    let score = 45;
    const reasons: string[] = [];

    if (includesAny(lower, ["非売品", "限定", "ロゴ", "企業"])) {
      score += 18;
      reasons.push("非売品・企業ロゴ・限定性がある");
    }
    if (includesAny(lower, ["日本製", "昭和", "当時物", "古い"])) {
      score += 14;
      reasons.push("日本固有性・当時物文脈がある");
    }
    if (includesAny(lower, ["ミニ", "小型", "シール", "ピン", "キーホルダー", "文具"])) {
      score += 12;
      reasons.push("小型軽量で発送しやすい");
    }
    if (includesAny(lower, ["皿", "ガラス", "陶器", "大型", "家電"])) {
      score -= 10;
      reasons.push("破損・送料・動作確認リスクがある");
    }
    if (includesAny(text, ["売却", "相場", "履歴", "出品"])) {
      score += 6;
      reasons.push("市場データ確認余地がある");
    }

    const finalScore = clampScore(score);
    const action: ProductPick["action"] = finalScore >= 68 ? "SELL CHECKへ" : finalScore >= 52 ? "先に検索" : "観測のみ";

    return {
      name,
      action,
      score: finalScore,
      reason: reasons.length > 0 ? reasons.join(" / ") : "特徴が薄いため、まず市場名と検索語を確認してください。",
      checkPoints: ["同一・類似の売却履歴", "市場形成スコア", "デザイン文法", "供給源価値", "国内需要と海外需要の分離"],
      sellCheckKeywords: uniq([name, ...(candidates[0]?.searchWords ?? [])]).slice(0, 5),
    };
  }).sort((a, b) => b.score - a.score);
}

function buildResearchSourceCheck(input: MarketResearchInput, text: string): SourceCheckSummary {
  let score = 40;
  const reasons: string[] = [];
  const risks: string[] = [];

  if (includesAny(text, ["倉庫", "整理", "在庫", "大量", "まとめ", "店舗", "閉店"])) {
    score += 25;
    reasons.push("継続在庫・倉庫整理・まとめ仕入れの可能性があります。");
  }
  if (includesAny(text, ["未使用", "デッドストック", "長期保管"])) {
    score += 18;
    reasons.push("未使用品・デッドストックの可能性があります。");
  }
  if (includesAny(text, ["返信", "郵送", "相談", "値下げ", "価格交渉"])) {
    score += 10;
    reasons.push("返信品質・郵送対応・価格交渉余地を確認する価値があります。");
  }
  if (includesAny(text, ["単品", "一点", "個人保管"])) {
    score -= 6;
    risks.push("単発供給で継続性は弱い可能性があります。");
  }
  if (includesAny(text, ["割れ", "壊れ", "ジャンク", "動作未確認"])) {
    score -= 12;
    risks.push("状態・動作確認リスクがあります。");
  }

  return {
    sourceType: includesAny(text, ["ジモティー", "メルカリ", "ebay"]) ? "マーケットプレイス供給源" : "未分類供給源",
    sourceScore: clampScore(score),
    supplyPotential: clampScore(score),
    repeatSupply: includesAny(text, ["倉庫", "整理", "在庫", "大量", "まとめ", "店舗", "閉店"]) ? 3 : includesAny(text, ["他にも", "複数", "セット"]) ? 2 : 1,
    warehousePotential: includesAny(text, ["倉庫", "店舗", "閉店", "在庫"]) ? 3 : includesAny(text, ["整理", "片付け", "実家"]) ? 2 : 1,
    deadStockPotential: includesAny(text, ["未使用", "デッドストック", "長期保管"]) ? 3 : 0,
    bundlePotential: includesAny(text, ["まとめ", "セット", "一括", "複数"]) ? 3 : 0,
    contactValue: includesAny(text, ["返信", "郵送", "相談", "値下げ", "価格交渉"]) ? 2 : 0,
    sellerPotential: score >= 68 ? "供給源として会話する価値あり" : score >= 50 ? "商品単位で確認" : "供給源価値は低め",
    reasons: reasons.length > 0 ? reasons : ["供給源評価に必要な情報が不足しています。"],
    risks: risks.length > 0 ? risks : ["出品者の継続在庫・保管状況は未確認です。"],
    nextAction: score >= 68 ? "在庫が他にもあるか、まとめ購入可能か、郵送対応できるか確認してください。" : "まず個別商品のSELL CHECKより前に、供給源価値の有無を確認してください。",
  };
}

function buildSellCheckPreview(cards: TrendKnowledgeCard[], picks: ProductPick[], design: DesignScoreBreakdown, formation: MarketFormationBreakdown): SellCheckUpgradePreview {
  const best = cards[0];
  const bestPick = picks[0];
  const market = best?.marketFormationScore ?? 35;
  const series = design.series > 0 ? 55 + design.series * 15 : 42;
  const designScore = clampScore((design.total / 21) * 100);
  const display = design.display > 0 || design.photogenic > 0 ? 56 + Math.max(design.display, design.photogenic) * 12 : 38;
  const monopoly = market < 65 && best?.dataJudgement === "弱い" && formation.total >= 8 ? 72 : 44;

  const integrated: VentoJudgement =
    best?.integratedJudgement === "有望" || bestPick?.score >= 70 || design.total >= 13 ? "検証優先" : best?.integratedJudgement ?? "監視";

  return {
    theoryJudgement: best?.theoryJudgement ?? "監視",
    dataJudgement: best?.dataJudgement ?? "弱い",
    integratedJudgement: integrated,
    seriesScore: clampScore(series),
    designScore,
    displayScore: clampScore(display),
    marketFormationScore: clampScore(market + formation.total),
    monopolyScore: clampScore(monopoly),
    quickSalePriceBand: "売却履歴が少ない場合は低めに置く",
    rotationPriceBand: "類似売却中央値の下〜中央値",
    standardPriceBand: "中央値〜販売中中央値の下",
    highWaitPriceBand: "デザイン性・シリーズ性が強い場合のみ",
    collectorPriceBand: "市場形成後に検証",
    passConditions: ["市場形成0〜弱い", "誰が買うか説明できない", "送料・破損・動作未確認リスクが利益を食う", "供給源価値がなく単発で高い"],
    buyConditions: ["市場名を説明できる", "同一でなくても同シリーズ・同世界観の売買がある", "小型軽量で損失限定", "供給源として継続会話できる"],
  };
}

export function analyzeMarketResearch(input: MarketResearchInput): MarketResearchResult {
  const text = safeText(input.theme, input.sourceText, input.visualNotes, input.productCandidates, input.sourceNotes, input.imageNames.join(" "));
  const classified = classifyVentoInput(input);
  const markets = marketFromSignals(text);
  const cards = markets.map((m) => buildKnowledgeCard(m, text));
  const designScore = buildDesignScore(text);
  const marketFormation = buildMarketFormation(text);
  const marketTheoryEngine = buildMarketTheoryEngine(cards[0], designScore, marketFormation);
  const designLearning = buildDesignLearning(cards[0], text, designScore);
  const multiDataIntegration = buildMultiDataIntegration(input, markets[0], text);
  const picks = extractProductPicks(input, markets, text);
  const sourceCheck = buildResearchSourceCheck(input, text);
  const preview = buildSellCheckPreview(cards, picks, designScore, marketFormation);

  return {
    inputClass: classified.inputClass,
    inputClassReason: classified.reason,
    trendRadar: {
      summary: "入力素材から、商品単体ではなく市場候補を抽出しました。国内需要と海外需要は分けて扱います。",
      marketCandidates: markets,
    },
    trendKnowledge: {
      cards,
      theoryHistoryNote: "データ不足で終了せず、なぜ有望か・なぜ弱いか・何が不足かを理論履歴として保存する前提です。",
      observationPlans: buildObservationPlans(markets[0]),
    },
    marketTheoryEngine,
    designLearning,
    designScore,
    marketFormation,
    multiDataIntegration,
    productSelector: {
      summary: "提出された商品候補または市場候補から、次に調べるべき商品を優先順位化しました。SELL CHECKは最後の価格判断として使います。",
      picks,
    },
    sourceCheck,
    sellCheckUpgradePreview: preview,
    snsLearningPlan: [
      "閲覧・保存・いいね・DM・売却・売却日数を市場カードに戻す",
      "投稿反応が高く売却が弱い市場は、投稿価値高・物販価値低として補正する",
      "売却が早い市場は、SELL CHECKの回転価格帯を優先する",
    ],
    domesticDemand: marketTheoryEngine.domesticDemand,
    overseasDemand: marketTheoryEngine.overseasDemand,
  };
}

export function normalizeMarketResearchInput(raw: unknown): MarketResearchInput {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const toString = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const budget = Number(obj.budget);
  return {
    theme: toString(obj.theme),
    sourceText: toString(obj.sourceText),
    visualNotes: toString(obj.visualNotes),
    productCandidates: toString(obj.productCandidates),
    sourceNotes: toString(obj.sourceNotes),
    budget: Number.isFinite(budget) && budget >= 0 ? Math.round(budget) : 5000,
    imageNames: Array.isArray(obj.imageNames) ? obj.imageNames.map((x) => String(x ?? "").trim()).filter(Boolean) : [],
  };
}


// -----------------------------------------------------------------------------
// 市場研究レイヤー追加機能
// -----------------------------------------------------------------------------
// ここから下は、既存の市場調査OSを置き換えずに追加するための補助ロジックです。
// TREND KNOWLEDGEの市場カード保存、SOURCE CHECK単独画面で使います。

function marketLayerText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function marketLayerArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 50);
}

function marketLayerUniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const item = String(value ?? "").trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function marketLayerScore03(text: string, signals: string[], strongSignals: string[] = []): ZeroToThree {
  const normalHits = signals.filter((signal) => text.includes(signal.toLowerCase())).length;
  const strongHits = strongSignals.filter((signal) => text.includes(signal.toLowerCase())).length;
  const rawScore = normalHits + strongHits * 2;
  if (rawScore >= 4) return 3;
  if (rawScore >= 2) return 2;
  if (rawScore >= 1) return 1;
  return 0;
}

function marketLayerTotalScore(scores: ZeroToThree[]): number {
  const max = scores.length * 3;
  const total = scores.reduce<number>((sum, score) => sum + score, 0);
  return Math.round((total / max) * 100);
}

export function normalizeSourceCheckInput(raw: unknown): SourceCheckInput {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    sellerScreenshotNotes: marketLayerText(obj.sellerScreenshotNotes),
    listingText: marketLayerText(obj.listingText),
    itemDescription: marketLayerText(obj.itemDescription),
  };
}

export function normalizeMarketCard(raw: unknown): MarketCard {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const statusRaw = marketLayerText(obj.status);
  const status: MarketStatus =
    statusRaw === "validated" || statusRaw === "pass" || statusRaw === "researching" || statusRaw === "watch"
      ? statusRaw
      : "researching";

  return {
    marketName: marketLayerText(obj.marketName) || "未命名市場",
    domesticDemand: marketLayerText(obj.domesticDemand) || "未確認",
    overseasDemand: marketLayerText(obj.overseasDemand) || "未確認",
    researchSources: marketLayerArray(obj.researchSources),
    searchWords: marketLayerArray(obj.searchWords),
    observationItems: marketLayerArray(obj.observationItems),
    hypothesis: marketLayerText(obj.hypothesis),
    theory: marketLayerText(obj.theory),
    evidence: marketLayerArray(obj.evidence),
    missingInfo: marketLayerArray(obj.missingInfo),
    researchPlan: marketLayerArray(obj.researchPlan),
    searchKeywords: marketLayerArray(obj.searchKeywords),
    observationTargets: marketLayerArray(obj.observationTargets),
    nextResearchActions: marketLayerArray(obj.nextResearchActions),
    missingInformation: marketLayerArray(obj.missingInformation),
    status,
    updatedAt: marketLayerText(obj.updatedAt) || new Date().toISOString(),
  };
}

export function buildSourceCheck(input: SourceCheckInput | MarketResearchInput): SourceCheckResult {
  const text =
    "sellerScreenshotNotes" in input
      ? [input.sellerScreenshotNotes, input.listingText, input.itemDescription].join("\n").toLowerCase()
      : [input.sourceNotes, input.sourceText, input.productCandidates].join("\n").toLowerCase();

  const repeatSupplyPotential = marketLayerScore03(
    text,
    ["他にも", "多数", "継続", "定期", "店舗", "出品一覧", "大量"],
    ["在庫多数"]
  );
  const deadStockPotential = marketLayerScore03(
    text,
    ["未使用", "デッドストック", "長期保管", "倉庫", "閉店", "廃業"],
    ["デッドストック"]
  );
  const warehousePotential = marketLayerScore03(
    text,
    ["倉庫", "保管", "整理", "片付け", "蔵", "実家", "店舗在庫"],
    ["倉庫整理"]
  );
  const bundlePotential = marketLayerScore03(
    text,
    ["まとめ", "セット", "一括", "複数", "全部", "引き取り"],
    ["まとめ売り"]
  );
  const contactValue = marketLayerScore03(text, ["返信", "丁寧", "相談", "質問", "連絡", "対応", "評価"]);
  const negotiationPotential = marketLayerScore03(
    text,
    ["値下げ", "交渉", "相談可", "価格", "まとめ割", "希望額"],
    ["価格交渉"]
  );
  const shippingCompatibility = marketLayerScore03(
    text,
    ["郵送", "発送", "配送", "宅急便", "ゆうパック", "小型", "軽い"],
    ["郵送対応"]
  );

  const scores = [
    repeatSupplyPotential,
    deadStockPotential,
    warehousePotential,
    bundlePotential,
    contactValue,
    negotiationPotential,
    shippingCompatibility,
  ];
  const totalScore = marketLayerTotalScore(scores);

  const reasons = marketLayerUniq([
    repeatSupplyPotential > 0
      ? `継続仕入れ ${repeatSupplyPotential}/3：単発商品ではなく出品者側に価値がある可能性。`
      : "継続仕入れ 0/3：単発出品に見えます。",
    deadStockPotential > 0
      ? `デッドストック ${deadStockPotential}/3：未使用・長期保管品の可能性。`
      : "デッドストック 0/3：保管在庫の根拠は不足。",
    warehousePotential > 0
      ? `倉庫在庫 ${warehousePotential}/3：倉庫/店舗/実家整理の兆候。`
      : "倉庫在庫 0/3：在庫母体は不明。",
    bundlePotential > 0
      ? `まとめ仕入れ ${bundlePotential}/3：一括購入交渉の余地。`
      : "まとめ仕入れ 0/3：まとめ買い余地は未確認。",
    contactValue > 0
      ? `接触価値 ${contactValue}/3：返信品質や相談余地あり。`
      : "接触価値 0/3：連絡して得られる情報がまだ不明。",
    negotiationPotential > 0
      ? `価格交渉 ${negotiationPotential}/3：値下げ/まとめ割の余地。`
      : "価格交渉 0/3：価格調整余地は未確認。",
    shippingCompatibility > 0
      ? `郵送対応 ${shippingCompatibility}/3：遠隔仕入れに向く可能性。`
      : "郵送対応 0/3：受け渡し制約あり得ます。",
  ]);

  const judgement =
    totalScore >= 72
      ? "供給源として強い"
      : totalScore >= 50
        ? "会話する価値あり"
        : totalScore >= 28
          ? "商品単位で確認"
          : "供給源価値は弱い";

  return {
    repeatSupplyPotential,
    deadStockPotential,
    warehousePotential,
    bundlePotential,
    contactValue,
    negotiationPotential,
    shippingCompatibility,
    supplyPotential: totalScore,
    repeatSupply: repeatSupplyPotential,
    totalScore,
    judgement,
    reasons,
    nextAction:
      totalScore >= 50
        ? "商品価格より先に、他在庫・まとめ購入・郵送対応・値下げ余地を確認してください。"
        : "まず商品単体のSELL CHECKに進む前に、出品者に追加在庫・保管状況・配送可否を確認してください。",
  };
}
