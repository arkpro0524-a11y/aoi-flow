// lib/vento/marketResearch.ts
// AOI FLOW / Vento 市場調査OSの固定ルール層。
// AIに点数を丸投げせず、入力から特徴量を抽出し、理論判定・データ判定・統合判定を分けます。

export type VentoInputClass =
  | "NEWS"
  | "VIDEO"
  | "SOCIAL"
  | "MARKETPLACE"
  | "PRODUCT"
  | "SEARCH_RESULT";

export type VentoJudgement = "有望" | "弱い" | "検証優先" | "見送り" | "監視";

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
  };
  productSelector: {
    summary: string;
    picks: ProductPick[];
  };
  sourceCheck: SourceCheckSummary;
  sellCheckUpgradePreview: SellCheckUpgradePreview;
  snsLearningPlan: string[];
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

  if (includesAny(text, ["ミニチュア", "ハウス", "置物", "飾り", "インテリア", "ドール", "shoemaker"])) {
    add({
      marketName: "ミニチュアハウス・ディスプレイ市場",
      score: 74,
      reason: "同一商品売却履歴が少なくても、シリーズ性・飾り映え・世界観で市場を作れる可能性があります。",
      domesticHypothesis: "国内ではインテリア雑貨、ミニチュア収集、飾り物需要が想定されます。",
      overseasHypothesis: "海外では miniature house / display collectible / shoemaker miniature の文脈で探せます。",
      relatedProducts: ["ミニチュアハウス", "職人工房モチーフ", "飾れる置物", "シリーズ雑貨"],
      searchWords: ["ミニチュアハウス 置物", "shoemaker miniature", "display collectible miniature"],
      risks: ["市場が小さい", "同一商品データ不足", "破損リスク"],
      ventoFit: 76,
    });
  }

  if (includesAny(text, ["時計", "記念時計", "会館", "記念品", "周年"])) {
    add({
      marketName: "記念品・限定配布物市場",
      score: 58,
      reason: "記念品は希少性が出る一方、固有名詞が弱いと需要が見えにくいです。",
      domesticHypothesis: "国内では施設名・地域名・イベント記念に反応する層が限定的に存在します。",
      overseasHypothesis: "海外では日本ローカル記念品としての文脈は弱めで、デザイン性が必要です。",
      relatedProducts: ["記念時計", "記念メダル", "周年グッズ", "施設記念品"],
      searchWords: ["記念品 時計 売却", "施設 記念品 昭和", "Japanese commemorative clock vintage"],
      risks: ["市場不明", "売却履歴が少ない", "同一比較不可"],
      ventoFit: 44,
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

function scoreFromText(text: string, signals: string[]): number {
  let score = 0;
  for (const s of signals) {
    if (text.includes(s.toLowerCase())) score += 1;
  }
  return score;
}

function buildKnowledgeCard(candidate: MarketCandidate, text: string): TrendKnowledgeCard {
  const dataSignals = scoreFromText(text, ["売却", "sold", "落札", "相場", "履歴", "出品数", "メルカリ", "ebay"]);
  const theorySignals = scoreFromText(text, ["非売品", "限定", "日本製", "当時物", "シリーズ", "ロゴ", "コレクション", "小型", "軽量", "飾り"]);

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
      includesAny(text, ["シリーズ", "ナンバリング"]) ? "シリーズ性があり市場学習しやすい" : "",
      includesAny(text, ["日本製", "昭和", "当時物"]) ? "日本固有性・当時物文脈がある" : "",
    ]),
    missingData: missing.length > 0 ? missing : ["追加検証データ"],
    nextResearch: candidate.searchWords,
    relatedProducts: candidate.relatedProducts,
    searchWords: candidate.searchWords,
  };
}

function extractProductPicks(input: MarketResearchInput, candidates: MarketCandidate[], text: string): ProductPick[] {
  const raw = uniq(
    input.productCandidates
      .split(/\n|,|、/)
      .map((x) => x.trim())
      .filter(Boolean)
  );

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
    return {
      name,
      action: finalScore >= 68 ? "SELL CHECKへ" : finalScore >= 52 ? "先に検索" : "観測のみ",
      score: finalScore,
      reason: reasons.length > 0 ? reasons.join(" / ") : "特徴が薄いため、まず市場名と検索語を確認してください。",
      checkPoints: [
        "同一・類似の売却履歴",
        "出品数と市場総額",
        "状態差・付属品・箱の有無",
        "国内需要と海外需要の分離",
      ],
      sellCheckKeywords: uniq([name, ...(candidates[0]?.searchWords ?? [])]).slice(0, 5),
    };
  }).sort((a, b) => b.score - a.score);
}

function buildSourceCheck(input: MarketResearchInput, text: string): SourceCheckSummary {
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
    sellerPotential: score >= 68 ? "供給源として会話する価値あり" : score >= 50 ? "商品単位で確認" : "供給源価値は低め",
    reasons: reasons.length > 0 ? reasons : ["供給源評価に必要な情報が不足しています。"],
    risks: risks.length > 0 ? risks : ["出品者の継続在庫・保管状況は未確認です。"],
    nextAction: score >= 68 ? "在庫が他にもあるか、まとめ購入可能か確認してください。" : "まず個別商品のSELL CHECKを優先してください。",
  };
}

function buildSellCheckPreview(cards: TrendKnowledgeCard[], picks: ProductPick[]): SellCheckUpgradePreview {
  const best = cards[0];
  const bestPick = picks[0];
  const market = best?.marketFormationScore ?? 35;
  const series = best?.theoryReasons.some((x) => x.includes("シリーズ")) ? 82 : 52;
  const design = best?.ventoFitScore ?? 50;
  const display = design >= 70 ? 78 : 50;
  const monopoly = market < 65 && best?.dataJudgement === "弱い" ? 72 : 44;

  const integrated: VentoJudgement =
    best?.integratedJudgement === "有望" || bestPick?.score >= 70 ? "検証優先" : best?.integratedJudgement ?? "監視";

  return {
    theoryJudgement: best?.theoryJudgement ?? "監視",
    dataJudgement: best?.dataJudgement ?? "弱い",
    integratedJudgement: integrated,
    seriesScore: clampScore(series),
    designScore: clampScore(design),
    displayScore: clampScore(display),
    marketFormationScore: clampScore(market),
    monopolyScore: clampScore(monopoly),
    quickSalePriceBand: "売却履歴が少ない場合は低めに置く",
    rotationPriceBand: "類似売却中央値の下〜中央値",
    standardPriceBand: "中央値〜販売中中央値の下",
    highWaitPriceBand: "デザイン性・シリーズ性が強い場合のみ",
    collectorPriceBand: "市場形成後に検証",
  };
}

export function analyzeMarketResearch(input: MarketResearchInput): MarketResearchResult {
  const text = safeText(input.theme, input.sourceText, input.visualNotes, input.productCandidates, input.sourceNotes, input.imageNames.join(" "));
  const classified = classifyVentoInput(input);
  const markets = marketFromSignals(text);
  const cards = markets.map((m) => buildKnowledgeCard(m, text));
  const picks = extractProductPicks(input, markets, text);
  const sourceCheck = buildSourceCheck(input, text);
  const preview = buildSellCheckPreview(cards, picks);

  return {
    inputClass: classified.inputClass,
    inputClassReason: classified.reason,
    trendRadar: {
      summary: "入力素材から、商品単体ではなく市場候補を抽出しました。国内需要と海外需要は分けて扱います。",
      marketCandidates: markets,
    },
    trendKnowledge: {
      cards,
      theoryHistoryNote: "結論だけでなく、なぜ有望か・なぜ弱いか・何が不足かを理論履歴として保存する前提です。",
    },
    productSelector: {
      summary: "提出された商品候補または市場候補から、次に調べるべき商品を優先順位化しました。",
      picks,
    },
    sourceCheck,
    sellCheckUpgradePreview: preview,
    snsLearningPlan: [
      "閲覧・保存・いいね・DM・売却・売却日数を市場カードに戻す",
      "投稿反応が高く売却が弱い市場は、投稿価値高・物販価値低として補正する",
      "売却が早い市場は、SELL CHECKの回転価格帯を優先する",
    ],
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
    imageNames: Array.isArray(obj.imageNames)
      ? obj.imageNames.map((x) => String(x ?? "").trim()).filter(Boolean)
      : [],
  };
}
