// /lib/sellCheck/scoring.ts

import type {
  SellCheckCategory,
  SellCheckCondition,
  SellCheckImageMeta,
  SellCheckResult,
  SellCheckLog,
  SellCheckImageAnalysis,
  SellCheckTextAnalysis,
  SellCheckSimilarData,
  SellCheckMarketAnalysis,
  SellCheckSource,
  SellCheckSellSpeed,
  SellCheckConfidenceLevel,
  SellCheckMarketType,
  SellCheckSmallSampleAnalysis,
  SellCheckDecisionMode,
  SellCheckScoreBreakdown,
  SellCheckSimilarMatchAnalysis,
} from "@/lib/types/sellCheck";
import { buildResearchGuide } from "@/lib/sellCheck/researchGuide";
import { calculateProfitAnalysis } from "@/lib/sellCheck/profit";
import { calculateAcquisitionAnalysis } from "@/lib/sellCheck/acquisition";
import { buildTheoryProfile, type TheoryProfile } from "@/lib/sellCheck/theoryDb";

import {
  categoryLabel,
  conditionLabel,
  conditionScore,
  priceBaseScore,
  countRareKeywordHits,
  normalizeSearchText,
} from "@/lib/sellCheck/rules";

import { buildActionGuide } from "@/lib/sellCheck/actionGuide";
import { buildMarketStructureAnalysis } from "@/lib/sellCheck/marketStructure";
import { buildPriceDistortionAnalysis } from "@/lib/sellCheck/priceDistortion";
import { buildRotationLearningAnalysis } from "@/lib/sellCheck/rotationLearning";

type LearnedData = {
  averageSoldPrice?: number;
  soldCount: number;
  totalCount: number;
  logs?: SellCheckLog[];
};

type WeightedLog = {
  log: SellCheckLog;
  weight: number;
};

type ConfidenceGuard = {
  isLowConfidence: boolean;
  reasons: string[];
};

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function rankFromScore(score: number): "A" | "B" | "C" | "D" {
  if (score >= 82) return "A";
  if (score >= 68) return "B";
  if (score >= 52) return "C";
  return "D";
}

function safePrice(n: number | undefined): number | undefined {
  if (typeof n !== "number") return undefined;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

function fallbackPrice(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 2000;
  return Math.round(n);
}

function safeScore(n: unknown, fallback = 50): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return clampScore(v);
}

function scoreWithFloor(value: unknown, fallback: number, floor: number): number {
  const raw = Number(value);
  const base = Number.isFinite(raw) && raw > 0 ? clampScore(raw) : fallback;
  return clampScore(Math.max(base, floor));
}

function median(values: number[]): number | undefined {
  const list = values
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  if (list.length === 0) return undefined;

  const mid = Math.floor(list.length / 2);

  if (list.length % 2 === 1) return list[mid];

  return Math.round((list[mid - 1] + list[mid]) / 2);
}

function percentile(values: number[], rate: number): number | undefined {
  const list = values
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  if (list.length === 0) return undefined;

  const index = Math.min(
    list.length - 1,
    Math.max(0, Math.floor((list.length - 1) * rate))
  );

  return list[index];
}

function pushUnique(list: string[], text: string) {
  const s = String(text || "").trim();
  if (!s) return;
  if (list.includes(s)) return;
  list.push(s);
}

function wordsFromTarget(textAnalysis?: SellCheckTextAnalysis): string[] {
  if (!textAnalysis) return [];

  return [
    textAnalysis.brandName,
    textAnalysis.modelName,
    textAnalysis.material,
    textAnalysis.productType,
    textAnalysis.characterName,
    textAnalysis.seriesName,
    textAnalysis.maker,
    textAnalysis.era,
    textAnalysis.collectorGenre,
    textAnalysis.materialType,
    ...(Array.isArray(textAnalysis.extractedKeywords)
      ? textAnalysis.extractedKeywords
      : []),
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
}

function wordsFromLog(log: SellCheckLog): string[] {
  return [
    log.title,
    log.brandName,
    log.modelName,
    log.material,
    log.productType,
    log.characterName,
    log.seriesName,
    log.maker,
    log.era,
    log.collectorGenre,
    log.materialType,
    ...(Array.isArray(log.extractedKeywords) ? log.extractedKeywords : []),
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
}

function includesNormalized(a: string, b: string): boolean {
  const x = normalizeSearchText(a);
  const y = normalizeSearchText(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

function sameField(a?: string, b?: string): boolean {
  const x = String(a ?? "").trim();
  const y = String(b ?? "").trim();
  if (!x || !y) return false;
  return includesNormalized(x, y);
}

function keywordHitCount(targetWords: string[], log: SellCheckLog): number {
  const logWords = wordsFromLog(log);
  let hit = 0;

  targetWords.forEach((target) => {
    if (logWords.some((word) => includesNormalized(word, target))) {
      hit += 1;
    }
  });

  return hit;
}

function countPatternHits(words: string[], patterns: string[]): number {
  const normalizedWords = words.map((x) => normalizeSearchText(x)).filter(Boolean);
  let count = 0;

  patterns.forEach((pattern) => {
    const p = normalizeSearchText(pattern);
    if (normalizedWords.some((word) => word.includes(p))) count += 1;
  });

  return count;
}

function hasAnyNormalized(words: string[], patterns: string[]): boolean {
  const normalizedWords = words.map((x) => normalizeSearchText(x)).filter(Boolean);

  return patterns.some((pattern) => {
    const p = normalizeSearchText(pattern);
    return normalizedWords.some((word) => word.includes(p));
  });
}

function calcTheorySignals(textAnalysis?: SellCheckTextAnalysis) {
  const words = wordsFromTarget(textAnalysis);

  const ageWords = [
    "昭和",
    "平成初期",
    "70年代",
    "1970",
    "80年代",
    "1980",
    "90年代",
    "1990",
    "当時物",
    "旧ロゴ",
    "初期",
    "ヴィンテージ",
    "ビンテージ",
    "レトロ",
    "アンティーク",
  ];

  const rarityWords = [
    "廃盤",
    "絶版",
    "限定",
    "非売品",
    "希少",
    "レア",
    "入手困難",
    "デッドストック",
    "未開封",
    "箱付き",
    "タグ付き",
    "初版",
    "初期型",
  ];

  const collectorWords = [
    "ソフビ",
    "ブリキ",
    "セルロイド",
    "フィギュア",
    "怪獣",
    "特撮",
    "円谷",
    "東映",
    "ポピー",
    "ブルマァク",
    "バンダイ",
    "タカラ",
    "トミー",
    "任天堂",
    "サンリオ",
    "ディズニー",
    "レゴ",
    "カード",
    "ミニカー",
  ];

  const materialWords = [
    "真鍮",
    "無垢材",
    "ホーロー",
    "琺瑯",
    "レザー",
    "本革",
    "シルバー",
    "陶器",
    "ガラス",
    "木製",
    "鋳物",
    "ソフビ",
    "ブリキ",
    "金属",
    "プラスチック",
  ];

  const creatorWords = [
    "jon herbert",
    "john herbert",
    "john hine",
    "john hine studios",
    "デザイナー",
    "作家",
    "工房",
    "スタジオ",
    "シリーズ",
  ];

  const demandWords = [
    "人気",
    "定番",
    "完売",
    "復刻",
    "コラボ",
    "キャラクター",
    "ブランド",
    "北欧",
    "ミッドセンチュリー",
    "昭和レトロ",
    "古着",
    "アウトドア",
  ];

  const ageHit = countPatternHits(words, ageWords);
  const rarityHit = countPatternHits(words, rarityWords);
  const collectorHit = countPatternHits(words, collectorWords);
  const materialHit = countPatternHits(words, materialWords);
  const demandHit = countPatternHits(words, demandWords);
  const creatorHit = countPatternHits(words, creatorWords);
  const rareHit = countRareKeywordHits(words);

  return {
    words,
    keywordCount: words.length,
    ageHit,
    rarityHit,
    collectorHit,
    materialHit,
    demandHit,
    creatorHit,
    rareHit,
    hasAge: ageHit > 0,
    hasRarity: rarityHit > 0,
    hasCollector: collectorHit > 0,
    hasMaterial: materialHit > 0,
    hasDemand: demandHit > 0,
    hasCreator: creatorHit > 0,
    hasShowa: hasAnyNormalized(words, ["昭和", "昭和レトロ"]),
  };
}

function sourceLabel(source: SellCheckSource): string {
  if (source === "mercari") return "メルカリ";
  if (source === "yahoo_shopping") return "Yahooショッピング";
  if (source === "yahoo_auction") return "ヤフオク";
  if (source === "jmty") return "ジモティー";
  if (source === "manual") return "手入力";
  if (source === "draft") return "下書き";
  if (source === "other") return "その他";
  return "取込";
}

function calcMarketAnalysis(
  textAnalysis?: SellCheckTextAnalysis,
  similarData?: SellCheckSimilarData
): SellCheckMarketAnalysis {
  const signals = calcTheorySignals(textAnalysis);
  const pressure = similarData?.marketPressure ?? "normal";
  const activeCount = similarData?.similarActiveCount ?? 0;

  const pressurePenalty = pressure === "high" ? 15 : pressure === "normal" ? 4 : 0;
  const pressureBonus = pressure === "low" ? 8 : 0;

  const rarityBase = 35 + signals.rareHit * 8 + signals.rarityHit * 10 + signals.ageHit * 5 + signals.creatorHit * 4;
  const demandBase = 42 + signals.demandHit * 8 + signals.collectorHit * 5 + signals.creatorHit * 4 + signals.keywordCount * 2;
  const brandBase = textAnalysis?.brandName || textAnalysis?.maker || textAnalysis?.seriesName || textAnalysis?.modelName || signals.hasCreator
    ? 58 + signals.collectorHit * 4 + signals.creatorHit * 8
    : 42;
  const collectorBase = 30 + signals.collectorHit * 11 + signals.ageHit * 5 + signals.rarityHit * 5 + signals.creatorHit * 7;
  const ageBase = signals.hasShowa ? 82 + signals.rarityHit * 3 : 35 + signals.ageHit * 12;
  const trendBase = 45 + signals.demandHit * 7 + signals.collectorHit * 3 + signals.creatorHit * 3;
  const supplyBase = 40 + signals.rarityHit * 10 + signals.ageHit * 5 + signals.collectorHit * 3 + signals.creatorHit * 4 - pressurePenalty + pressureBonus;
  const keywordBase = 35 + signals.keywordCount * 5 + signals.rareHit * 5 + signals.collectorHit * 4 + signals.creatorHit * 5;

  const rarityScore = scoreWithFloor(textAnalysis?.rarityScore, rarityBase, Math.min(68, rarityBase));
  const demandScore = scoreWithFloor(textAnalysis?.demandScore, demandBase, Math.min(66, demandBase));
  const brandPowerScore = scoreWithFloor(textAnalysis?.brandPowerScore, brandBase, Math.min(70, brandBase));
  const collectorScore = scoreWithFloor(textAnalysis?.collectorScore, collectorBase, Math.min(72, collectorBase));
  const ageValueScore = scoreWithFloor(textAnalysis?.ageValueScore, ageBase, Math.min(75, ageBase));
  const trendScore = scoreWithFloor(textAnalysis?.trendScore, trendBase, Math.min(65, trendBase));
  const marketSupplyScore = scoreWithFloor(textAnalysis?.marketSupplyScore, supplyBase, Math.min(68, supplyBase));
  const keywordStrength = scoreWithFloor(textAnalysis?.keywordStrength, keywordBase, Math.min(74, keywordBase));

  const rareReasons = Array.isArray(textAnalysis?.rareReasons)
    ? textAnalysis!.rareReasons!.filter(Boolean).slice(0, 10)
    : [];

  if (signals.hasAge) pushUnique(rareReasons, "年代価値につながる語句を検出しました");
  if (signals.hasRarity) pushUnique(rareReasons, "希少性につながる語句を検出しました");

  if (signals.hasCollector) {
    pushUnique(
      rareReasons,
      "コレクター需要につながるジャンル・メーカー・IP語句を検出しました"
    );
  }

  if (signals.hasMaterial) {
    pushUnique(rareReasons, "素材価値につながる語句を検出しました");
  }

  if (signals.hasDemand) {
    pushUnique(rareReasons, "需要・人気につながる語句を検出しました");
  }

  if (signals.hasCreator) {
    pushUnique(rareReasons, "作家・デザイナー・シリーズ名を価値シグナルとして検出しました");
  }

  if (activeCount > 0) {
    pushUnique(rareReasons, `販売中データ ${activeCount}件を市場在庫として参考にしています`);
  }

  if (pressure === "high") {
    pushUnique(rareReasons, "類似の販売中データが多いため、市場在庫圧を反映しています");
  }

  if (pressure === "low") {
    pushUnique(rareReasons, "販売中データが少ないため、低在庫市場として扱っています");
  }

  if (rareReasons.length === 0 && signals.keywordCount > 0) {
    pushUnique(rareReasons, "商品名・ブランド・素材・検索語から市場価値を理論推定しています");
  }

  const soldCount = similarData?.similarSoldCount ?? 0;
  const matchLevel = similarData?.matchLevel ?? "weak";
  const matchAnalysis = similarData?.matchAnalysis;
  const strongMatchCount = matchAnalysis?.strongMatchCount ?? 0;
  const maxMatchWeight = matchAnalysis?.maxWeight ?? 0;
  const averageMatchWeight = matchAnalysis?.averageWeight ?? 0;

  // 類似データの信頼度は「件数」だけで上げない。
  // 件数が多くても強一致が0件なら、別商品混入の可能性があるため high を禁止する。
  const hasHighQualitySimilarity =
    strongMatchCount >= 2 ||
    maxMatchWeight >= 65 ||
    (strongMatchCount >= 1 && averageMatchWeight >= 24);

  const hasMediumQualitySimilarity =
    strongMatchCount >= 1 ||
    maxMatchWeight >= 36 ||
    averageMatchWeight >= 18 ||
    matchLevel === "brand" ||
    matchLevel === "keyword";

  const dataConfidence: SellCheckMarketAnalysis["dataConfidence"] =
    soldCount >= 5 && hasHighQualitySimilarity
      ? "high"
      : soldCount >= 1 && hasMediumQualitySimilarity
      ? "medium"
      : "low";

  if (soldCount >= 5 && !hasHighQualitySimilarity) {
    pushUnique(
      rareReasons,
      "類似件数はありますが強一致が少ないため、信頼度は安全側に補正しています"
    );
  }

  return {
    rarityScore,
    demandScore,
    brandPowerScore,
    collectorScore,
    ageValueScore,
    trendScore,
    marketSupplyScore,
    keywordStrength,
    rareReasons,
    marketPressure: pressure,
    activeListingCount: activeCount,
    estimatedByTheory: dataConfidence === "low",
    dataConfidence,
  };
}

function weightedSimilarity(args: {
  log: SellCheckLog;
  price: number;
  category: SellCheckCategory;
  condition: SellCheckCondition;
  textAnalysis?: SellCheckTextAnalysis;
  imageAnalysis?: SellCheckImageAnalysis;
  marketAnalysis: SellCheckMarketAnalysis;
}): number {
  const targetWords = wordsFromTarget(args.textAnalysis);
  const log = args.log;
  let weight = 0;

  if (log.category === args.category) weight += 6;
  if (log.condition === args.condition) weight += 3;

  if (args.textAnalysis?.characterName && log.characterName) {
    if (sameField(args.textAnalysis.characterName, log.characterName)) weight += 30;
  }

  if (args.textAnalysis?.seriesName && log.seriesName) {
    if (sameField(args.textAnalysis.seriesName, log.seriesName)) weight += 22;
  }

  if (args.textAnalysis?.productType && log.productType) {
    if (sameField(args.textAnalysis.productType, log.productType)) weight += 20;
  }

  if (args.textAnalysis?.maker && log.maker) {
    if (sameField(args.textAnalysis.maker, log.maker)) weight += 18;
  }

  if (args.textAnalysis?.brandName && log.brandName) {
    if (sameField(args.textAnalysis.brandName, log.brandName)) weight += 14;
  }

  if (args.textAnalysis?.modelName && log.modelName) {
    if (sameField(args.textAnalysis.modelName, log.modelName)) weight += 26;
  }

  if (args.textAnalysis?.era && log.era) {
    if (sameField(args.textAnalysis.era, log.era)) weight += 12;
  }

  if (args.textAnalysis?.collectorGenre && log.collectorGenre) {
    if (sameField(args.textAnalysis.collectorGenre, log.collectorGenre)) weight += 12;
  }

  if (args.textAnalysis?.materialType && log.materialType) {
    if (sameField(args.textAnalysis.materialType, log.materialType)) weight += 12;
  }

  if (args.textAnalysis?.material && log.material) {
    if (sameField(args.textAnalysis.material, log.material)) weight += 8;
  }

  weight += Math.min(35, keywordHitCount(targetWords, log) * 5);

  const targetRareHits = countRareKeywordHits(targetWords);
  const logRareHits = countRareKeywordHits(wordsFromLog(log));

  if (targetRareHits > 0 && logRareHits > 0) {
    weight += Math.min(20, Math.min(targetRareHits, logRareHits) * 7);
  }

  const logPrice = safePrice(log.sold === true ? log.soldPrice : log.price);

  if (logPrice && args.price > 0) {
    const diffRate = Math.abs(logPrice - args.price) / args.price;

    if (diffRate <= 0.15) weight += 8;
    else if (diffRate <= 0.3) weight += 5;
    else if (diffRate <= 0.5) weight += 2;
  }

  weight += log.sold === true ? 3 : 1;

  if (
    typeof args.imageAnalysis?.overallImageScore === "number" &&
    typeof log.overallImageScore === "number"
  ) {
    const diff = Math.abs(args.imageAnalysis.overallImageScore - log.overallImageScore);

    if (diff <= 10) weight += 5;
    else if (diff <= 20) weight += 2;
  }

  if (
    typeof args.textAnalysis?.conditionRiskScore === "number" &&
    typeof log.conditionRiskScore === "number"
  ) {
    const diff = Math.abs(args.textAnalysis.conditionRiskScore - log.conditionRiskScore);

    if (diff <= 15) weight += 5;
    else if (diff <= 30) weight += 2;
  }

  if (args.marketAnalysis.rarityScore >= 70 && safeScore(log.rarityScore, 0) >= 60) {
    weight += 8;
  }

  if (args.marketAnalysis.collectorScore >= 70 && safeScore(log.collectorScore, 0) >= 60) {
    weight += 6;
  }

  if (args.marketAnalysis.ageValueScore >= 70 && safeScore(log.ageValueScore, 0) >= 60) {
    weight += 6;
  }

  return weight;
}

function getWeightedSimilarLogs(args: {
  logs?: SellCheckLog[];
  price: number;
  category: SellCheckCategory;
  condition: SellCheckCondition;
  textAnalysis?: SellCheckTextAnalysis;
  imageAnalysis?: SellCheckImageAnalysis;
  marketAnalysis: SellCheckMarketAnalysis;
}): WeightedLog[] {
  if (!Array.isArray(args.logs)) return [];

  return args.logs
    .map((log) => ({
      log,
      weight: weightedSimilarity({
        log,
        price: args.price,
        category: args.category,
        condition: args.condition,
        textAnalysis: args.textAnalysis,
        imageAnalysis: args.imageAnalysis,
        marketAnalysis: args.marketAnalysis,
      }),
    }))
    .filter((x) => x.weight >= 10)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 100);
}

function soldPriceFromLog(log: SellCheckLog): number | undefined {
  return safePrice(log.soldPrice) ?? safePrice(log.price);
}

function activePriceFromLog(log: SellCheckLog): number | undefined {
  return safePrice(log.price);
}

function uniqueSources(logs: SellCheckLog[]): SellCheckSource[] {
  const set = new Set<SellCheckSource>();

  logs.forEach((log) => {
    set.add(log.source ?? "import");
  });

  return Array.from(set);
}

function calcMarketPressure(args: { activeCount: number; soldCount: number }) {
  const active = args.activeCount;
  const sold = args.soldCount;

  if (active <= 0) return { pressure: "low" as const, ratio: 0 };

  const ratio = active / Math.max(1, sold);

  if (sold === 0 && active >= 5) return { pressure: "high" as const, ratio };
  if (ratio >= 3) return { pressure: "high" as const, ratio };
  if (ratio >= 1.2) return { pressure: "normal" as const, ratio };

  return { pressure: "low" as const, ratio };
}

function buildSimilarMatchAnalysis(
  weightedLogs: WeightedLog[],
  matchLevel: SellCheckSimilarData["matchLevel"]
): SellCheckSimilarMatchAnalysis {
  const maxWeight = weightedLogs[0]?.weight ?? 0;
  const averageWeight =
    weightedLogs.length > 0
      ? Math.round(weightedLogs.reduce((sum, x) => sum + x.weight, 0) / weightedLogs.length)
      : 0;

  const strongMatchCount = weightedLogs.filter((x) => x.weight >= 50).length;
  const modelMatchCount = weightedLogs.filter((x) => Boolean(x.log.modelName)).length;
  const brandMatchCount = weightedLogs.filter((x) => Boolean(x.log.brandName || x.log.maker)).length;
  const productTypeMatchCount = weightedLogs.filter((x) => Boolean(x.log.productType)).length;
  const materialMatchCount = weightedLogs.filter((x) => Boolean(x.log.material || x.log.materialType)).length;
  const eraMatchCount = weightedLogs.filter((x) => Boolean(x.log.era)).length;
  const keywordMatchCount = weightedLogs.filter((x) => Array.isArray(x.log.extractedKeywords) && x.log.extractedKeywords.length > 0).length;

  const reasons: string[] = [];
  const warnings: string[] = [];

  if (maxWeight >= 65) reasons.push("同一商品・強い固有名詞に近い類似データを検出しました");
  else if (maxWeight >= 50) reasons.push("型番・作品名・商品種別が近い類似データを検出しました");
  else if (maxWeight >= 36) reasons.push("ブランド・メーカー・シリーズの近さを主軸に類似判定しています");
  else if (maxWeight >= 24) reasons.push("キーワード一致を主軸にした弱めの類似判定です");
  else if (maxWeight >= 10) reasons.push("カテゴリ・状態が近いデータを参考値として使っています");
  else reasons.push("強い類似根拠は不足しています");

  if (brandMatchCount > 0) reasons.push(`ブランド・メーカー情報を持つ類似データ：${brandMatchCount}件`);
  if (modelMatchCount > 0) reasons.push(`型番・モデル情報を持つ類似データ：${modelMatchCount}件`);
  if (productTypeMatchCount > 0) reasons.push(`商品種別情報を持つ類似データ：${productTypeMatchCount}件`);
  if (materialMatchCount > 0) reasons.push(`素材情報を持つ類似データ：${materialMatchCount}件`);
  if (eraMatchCount > 0) reasons.push(`年代情報を持つ類似データ：${eraMatchCount}件`);

  if (matchLevel === "category" || matchLevel === "keyword" || matchLevel === "weak") {
    warnings.push("同一商品断定ではありません。売却中央値はそのまま信じず、商品名・作品名・状態別に再確認してください");
  }

  if (strongMatchCount === 0 && weightedLogs.length >= 10) {
    warnings.push("件数は多いですが、強一致データが少ないため、別商品混入の可能性があります");
  }

  return {
    matchLevel,
    maxWeight,
    averageWeight,
    strongMatchCount,
    modelMatchCount,
    brandMatchCount,
    productTypeMatchCount,
    materialMatchCount,
    eraMatchCount,
    keywordMatchCount,
    reasons: reasons.filter((x, i, arr) => arr.indexOf(x) === i),
    warnings: warnings.filter((x, i, arr) => arr.indexOf(x) === i),
  };
}

function buildSimilarData(weightedLogs: WeightedLog[]): SellCheckSimilarData {
  const soldWeighted = weightedLogs.filter((x) => x.log.sold === true);
  const activeWeighted = weightedLogs.filter((x) => x.log.sold !== true);

  const soldPrices = soldWeighted
    .map((x) => soldPriceFromLog(x.log))
    .filter((price): price is number => typeof price === "number" && price > 0);

  const activePrices = activeWeighted
    .map((x) => activePriceFromLog(x.log))
    .filter((price): price is number => typeof price === "number" && price > 0);

  const averageSoldPrice =
    soldPrices.length > 0
      ? Math.round(soldPrices.reduce((sum, n) => sum + n, 0) / soldPrices.length)
      : undefined;

  const averageActivePrice =
    activePrices.length > 0
      ? Math.round(activePrices.reduce((sum, n) => sum + n, 0) / activePrices.length)
      : undefined;

  const maxWeight = weightedLogs[0]?.weight ?? 0;

  const matchLevel: SellCheckSimilarData["matchLevel"] =
    maxWeight >= 65
      ? "rare"
      : maxWeight >= 50
      ? "model"
      : maxWeight >= 36
      ? "brand"
      : maxWeight >= 24
      ? "keyword"
      : maxWeight >= 10
      ? "category"
      : "weak";

  const pressure = calcMarketPressure({
    activeCount: activePrices.length,
    soldCount: soldPrices.length,
  });

  const matchAnalysis = buildSimilarMatchAnalysis(weightedLogs, matchLevel);

  return {
    similarCount: weightedLogs.length,
    similarSoldCount: soldPrices.length,
    similarActiveCount: activePrices.length,
    averageSoldPrice,
    medianSoldPrice: median(soldPrices),
    minSoldPrice: soldPrices.length > 0 ? Math.min(...soldPrices) : undefined,
    maxSoldPrice: soldPrices.length > 0 ? Math.max(...soldPrices) : undefined,
    premiumPrice: percentile(soldPrices, 0.8),
    averageActivePrice,
    medianActivePrice: median(activePrices),
    minActivePrice: activePrices.length > 0 ? Math.min(...activePrices) : undefined,
    maxActivePrice: activePrices.length > 0 ? Math.max(...activePrices) : undefined,
    activeToSoldRatio: pressure.ratio,
    marketPressure: pressure.pressure,
    matchLevel,
    activeSources: uniqueSources(activeWeighted.map((x) => x.log)),
    matchAnalysis,
  };
}

function categorySoldPrices(
  logs: SellCheckLog[] | undefined,
  category: SellCheckCategory
): number[] {
  if (!Array.isArray(logs)) return [];

  return logs
    .filter((log) => log.category === category && log.sold === true)
    .map(soldPriceFromLog)
    .filter((price): price is number => typeof price === "number" && price > 0);
}

function imageScore(
  imageMeta: SellCheckImageMeta,
  imageAnalysis?: SellCheckImageAnalysis
): number {
  if (imageAnalysis) {
    const overall = safeScore(imageAnalysis.overallImageScore, 50);
    const damageRisk = safeScore(imageAnalysis.damageRiskScore, 50);

    return clampScore(overall * 0.78 + (100 - damageRisk) * 0.22);
  }

  if (!imageMeta.hasImage) return 30;
  if (imageMeta.fileSize <= 0) return 38;
  if (imageMeta.fileSize < 80_000) return 50;
  if (imageMeta.fileSize > 8_000_000) return 62;
  if (imageMeta.fileSize >= 300_000 && imageMeta.fileSize <= 4_000_000) return 78;

  return 68;
}


function correctedDescriptionQuality(textAnalysis?: SellCheckTextAnalysis): number {
  if (!textAnalysis) return 55;

  const aiScore = safeScore(textAnalysis.descriptionQualityScore, 50);
  const textParts = [
    textAnalysis.brandName,
    textAnalysis.modelName,
    textAnalysis.material,
    textAnalysis.productType,
    textAnalysis.characterName,
    textAnalysis.seriesName,
    textAnalysis.maker,
    textAnalysis.era,
    textAnalysis.collectorGenre,
    textAnalysis.materialType,
    ...(Array.isArray(textAnalysis.extractedKeywords) ? textAnalysis.extractedKeywords : []),
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);

  let structureScore = 18;
  if (textAnalysis.brandName || textAnalysis.maker) structureScore += 14;
  if (textAnalysis.modelName || textAnalysis.seriesName || textAnalysis.characterName) structureScore += 14;
  if (textAnalysis.material || textAnalysis.materialType) structureScore += 10;
  if (textAnalysis.productType) structureScore += 8;
  if (textAnalysis.era) structureScore += 8;
  if (textParts.length >= 5) structureScore += 10;
  if (textParts.length >= 8) structureScore += 6;

  const keywordText = normalizeSearchText(textParts.join(" "));
  const hasSizeOrDetail = /cm|ｍｍ|mm|高さ|幅|奥行|サイズ|約\d|\d{2,}/i.test(keywordText);
  if (hasSizeOrDetail) structureScore += 6;

  const corrected = clampScore(structureScore);

  if (aiScore <= 15 && corrected >= 50) return corrected;
  if (aiScore < corrected) return clampScore(corrected * 0.85 + aiScore * 0.15);

  return aiScore;
}

function normalizeTextAnalysisForScoring(textAnalysis?: SellCheckTextAnalysis): SellCheckTextAnalysis | undefined {
  if (!textAnalysis) return undefined;

  const correctedQuality = correctedDescriptionQuality(textAnalysis);
  const textReasons = Array.isArray(textAnalysis.textReasons) ? [...textAnalysis.textReasons] : [];

  if (correctedQuality > safeScore(textAnalysis.descriptionQualityScore, 50)) {
    pushUnique(
      textReasons,
      `説明文品質を構造補正しました（AI評価 ${safeScore(textAnalysis.descriptionQualityScore, 50)}/100 → ${correctedQuality}/100）`
    );
  }

  return {
    ...textAnalysis,
    descriptionQualityScore: correctedQuality,
    textReasons,
  };
}

function textScore(textAnalysis?: SellCheckTextAnalysis): number {
  if (!textAnalysis) return 55;

  const conditionRisk = safeScore(textAnalysis.conditionRiskScore, 50);
  const descriptionQuality = correctedDescriptionQuality(textAnalysis);

  return clampScore(descriptionQuality * 0.7 + (100 - conditionRisk) * 0.3);
}

function marketScore(marketAnalysis: SellCheckMarketAnalysis): number {
  const pressurePenalty =
    marketAnalysis.marketPressure === "high"
      ? 6
      : marketAnalysis.marketPressure === "normal"
      ? 2
      : 0;

  return clampScore(
    marketAnalysis.rarityScore * 0.18 +
      marketAnalysis.demandScore * 0.18 +
      marketAnalysis.brandPowerScore * 0.14 +
      marketAnalysis.collectorScore * 0.16 +
      marketAnalysis.ageValueScore * 0.12 +
      marketAnalysis.trendScore * 0.08 +
      marketAnalysis.marketSupplyScore * 0.08 +
      marketAnalysis.keywordStrength * 0.06 -
      pressurePenalty
  );
}

function learnedReliability(similarData: SellCheckSimilarData): number {
  if (similarData.matchLevel === "rare" && similarData.similarSoldCount >= 1) return 0.9;
  if (similarData.matchLevel === "model" && similarData.similarSoldCount >= 1) return 0.82;
  if (similarData.similarSoldCount >= 10) return 0.8;
  if (similarData.similarSoldCount >= 5) return 0.65;
  if (similarData.similarSoldCount >= 3) return 0.5;
  if (similarData.similarSoldCount >= 1) return 0.3;
  return 0;
}

function learnedPriceScore(price: number, similarData: SellCheckSimilarData): number {
  const base = similarData.medianSoldPrice ?? similarData.averageSoldPrice;

  if (!base || base <= 0 || similarData.similarSoldCount < 1) return 55;

  const diffRate = Math.abs(price - base) / base;

  if (diffRate <= 0.1) return 88;
  if (diffRate <= 0.2) return 78;
  if (diffRate <= 0.35) return 62;
  if (diffRate <= 0.5) return 48;

  return 34;
}

function premiumRate(marketAnalysis: SellCheckMarketAnalysis): number {
  const total =
    marketAnalysis.rarityScore * 0.32 +
    marketAnalysis.collectorScore * 0.24 +
    marketAnalysis.ageValueScore * 0.18 +
    marketAnalysis.brandPowerScore * 0.16 +
    marketAnalysis.marketSupplyScore * 0.1;

  if (marketAnalysis.marketPressure === "high") {
    if (total >= 85) return 1.22;
    if (total >= 75) return 1.14;
    if (total >= 65) return 1.06;
    return 1;
  }

  if (total >= 85) return 1.45;
  if (total >= 75) return 1.3;
  if (total >= 65) return 1.18;
  if (total >= 55) return 1.08;

  return 1;
}

function priceSpreadRisk(similarData: SellCheckSimilarData): boolean {
  const min = similarData.minSoldPrice;
  const max = similarData.maxSoldPrice;
  const medianPrice = similarData.medianSoldPrice ?? similarData.averageSoldPrice;

  if (!min || !max || !medianPrice) return false;
  if (min <= 0 || max <= 0 || medianPrice <= 0) return false;

  return max / min >= 3 || (max - min) / medianPrice >= 1.6;
}

function isCollectorMarket(marketAnalysis: SellCheckMarketAnalysis): boolean {
  return (
    marketAnalysis.rarityScore >= 68 ||
    marketAnalysis.collectorScore >= 68 ||
    marketAnalysis.ageValueScore >= 68
  );
}

function buildConfidenceGuard(args: {
  price: number;
  learned: LearnedData;
  similarData: SellCheckSimilarData;
}): ConfidenceGuard {
  const reasons: string[] = [];
  const price = fallbackPrice(args.price);
  const base = args.similarData.medianSoldPrice ?? args.similarData.averageSoldPrice;

  if (args.learned.totalCount < 50) reasons.push("学習データ全体が50件未満です");
  if (args.similarData.similarCount < 10) reasons.push("類似データが10件未満です");
  if (args.similarData.similarSoldCount < 3) reasons.push("類似売却データが3件未満です");

  if (
    args.similarData.matchLevel === "weak" ||
    args.similarData.matchLevel === "category"
  ) {
    reasons.push(`類似一致度が ${args.similarData.matchLevel} のため、商品特定としては弱いです`);
  }

  if (priceSpreadRisk(args.similarData)) {
    reasons.push("類似売却データ内の価格ばらつきが大きいです");
  }

  if (args.similarData.marketPressure === "high") {
    reasons.push("類似の販売中データが多く、市場在庫圧があります");
  }

  if (base && base > 0) {
    if (base >= price * 3) {
      reasons.push("類似中央値が入力価格の3倍以上で、別商品群が混ざっている可能性があります");
    }

    if (price >= base * 3) {
      reasons.push("入力価格が類似中央値の3倍以上で、比較対象が不安定です");
    }
  }

  return {
    isLowConfidence: reasons.length > 0,
    reasons,
  };
}

function applyLowConfidencePriceGuard(args: {
  priceInput: number;
  range: { min: number; max: number };
  guard: ConfidenceGuard;
  similarData: SellCheckSimilarData;
  marketAnalysis: SellCheckMarketAnalysis;
}): { min: number; max: number } {
  if (!args.guard.isLowConfidence) return args.range;

  const price = fallbackPrice(args.priceInput);
  const base = args.similarData.medianSoldPrice ?? args.similarData.averageSoldPrice;
  const collectorMarket = isCollectorMarket(args.marketAnalysis);

  if (!base || base <= 0 || args.similarData.similarSoldCount < 1) {
    const min = Math.max(300, Math.round(price * 0.75));
    const max = Math.max(min + 100, Math.round(price * 1.45));
    return { min, max };
  }

  const evidenceMin = args.similarData.minSoldPrice;
  const lowPressure = args.similarData.marketPressure === "low";
  const highPressure = args.similarData.marketPressure === "high";

  const lowerRate = collectorMarket ? (lowPressure ? 0.52 : 0.58) : 0.65;
  const upperRate = highPressure ? 1.05 : collectorMarket ? 1.18 : 1.12;

  let min = Math.round(base * lowerRate);
  let max = Math.round(base * upperRate);

  if (evidenceMin && evidenceMin > 0 && evidenceMin >= base * 0.25 && evidenceMin <= base) {
    min = Math.min(min, Math.round(evidenceMin * 0.92));
  }

  const maxCapRate = collectorMarket ? (lowPressure ? 1.35 : 1.28) : 1.22;
  const maxCap = Math.round(base * maxCapRate);
  max = Math.min(max, maxCap);

  if (highPressure && args.similarData.medianActivePrice) {
    const activeCap = Math.round(args.similarData.medianActivePrice * 0.98);
    max = Math.min(max, activeCap);
  }

  min = Math.max(300, min);
  max = Math.max(min + 100, max);

  return { min, max };
}

function suggestedPriceRange(args: {
  priceInput: number;
  learned: LearnedData;
  category: SellCheckCategory;
  similarData: SellCheckSimilarData;
  marketAnalysis: SellCheckMarketAnalysis;
  guard?: ConfidenceGuard;
}): { min: number; max: number } {
  const price = fallbackPrice(args.priceInput);
  const reliability = learnedReliability(args.similarData);
  const categoryMedian = median(categorySoldPrices(args.learned.logs, args.category));

  const base =
    reliability >= 0.3
      ? args.similarData.medianSoldPrice ??
        args.similarData.averageSoldPrice ??
        categoryMedian ??
        price
      : args.similarData.medianSoldPrice ??
        args.similarData.averageSoldPrice ??
        categoryMedian ??
        price;

  const premium = premiumRate(args.marketAnalysis);

  const premiumBase =
    args.similarData.matchLevel === "rare" && args.similarData.premiumPrice
      ? Math.max(base, args.similarData.premiumPrice)
      : base;

  const activeCap =
    args.similarData.medianActivePrice && args.similarData.marketPressure === "high"
      ? Math.round(args.similarData.medianActivePrice * 0.92)
      : undefined;

  const correctedBase = Math.round(premiumBase * premium);
  const cappedBase = activeCap ? Math.min(correctedBase, activeCap) : correctedBase;

  const minRate = reliability >= 0.6 ? 0.88 : 0.82;
  const maxRate =
    args.similarData.marketPressure === "high"
      ? 1.05
      : premium >= 1.18
      ? 1.25
      : reliability >= 0.6
      ? 1.12
      : 1.16;

  const min = Math.max(300, Math.round(cappedBase * minRate));
  const max = Math.max(min + 100, Math.round(cappedBase * maxRate));

  return applyLowConfidencePriceGuard({
    priceInput: price,
    range: { min, max },
    guard: args.guard ?? { isLowConfidence: false, reasons: [] },
    similarData: args.similarData,
    marketAnalysis: args.marketAnalysis,
  });
}

function buildAction(score: number, guard?: ConfidenceGuard): string {
  if (guard?.isLowConfidence) return "参考診断（追加データ推奨）";
  if (score >= 82) return "強く出品OK";
  if (score >= 68) return "出品OK";
  if (score >= 52) return "改善して出品";
  return "出品前に修正推奨";
}

function applyLowConfidenceScoreGuard(args: {
  rawScore: number;
  guard: ConfidenceGuard;
  marketAnalysis: SellCheckMarketAnalysis;
  similarData: SellCheckSimilarData;
}): number {
  if (!args.guard.isLowConfidence) return args.rawScore;

  const collectorMarket = isCollectorMarket(args.marketAnalysis);

  if (
    collectorMarket &&
    args.similarData.similarSoldCount >= 1 &&
    args.similarData.marketPressure !== "high"
  ) {
    return Math.min(args.rawScore, 74);
  }

  return Math.min(args.rawScore, 67);
}

function rankLabel(rank: "A" | "B" | "C" | "D"): string {
  if (rank === "A") return "A：強い出品候補";
  if (rank === "B") return "B：出品候補";
  if (rank === "C") return "C：改善して出品";
  return "D：情報不足・改善推奨";
}

function confidenceLevel(
  guard: ConfidenceGuard,
  marketAnalysis: SellCheckMarketAnalysis
): SellCheckConfidenceLevel {
  if (!guard.isLowConfidence && marketAnalysis.dataConfidence === "high") return "high";
  if (marketAnalysis.dataConfidence === "high" || marketAnalysis.dataConfidence === "medium") {
    return "medium";
  }
  return "low";
}

function confidenceLabel(level: SellCheckConfidenceLevel): string {
  if (level === "high") return "高：類似データを比較的強く参照できます";
  if (level === "medium") return "中：参考診断として扱ってください";
  return "低：追加データ推奨です";
}

function marketType(args: {
  marketAnalysis: SellCheckMarketAnalysis;
  similarData: SellCheckSimilarData;
}): SellCheckMarketType {
  if (args.similarData.marketPressure === "high") return "competitive";

  if (
    isCollectorMarket(args.marketAnalysis) &&
    args.similarData.marketPressure === "low"
  ) {
    return "low_rotation";
  }

  if (isCollectorMarket(args.marketAnalysis)) return "collector";

  if (args.similarData.similarSoldCount <= 0 && args.marketAnalysis.dataConfidence === "low") {
    return "unknown";
  }

  return "normal";
}

function marketTypeLabel(type: SellCheckMarketType): string {
  if (type === "collector") return "コレクター市場";
  if (type === "low_rotation") return "低回転コレクター市場";
  if (type === "competitive") return "競合多めの市場";
  if (type === "unknown") return "市場タイプ不明";
  return "通常市場";
}

function sellSpeed(args: {
  score: number;
  marketType: SellCheckMarketType;
  similarData: SellCheckSimilarData;
}): SellCheckSellSpeed {
  if (args.marketType === "unknown") return "unknown";
  if (args.marketType === "low_rotation") return "collector_wait";
  if (args.similarData.marketPressure === "high" && args.score < 68) return "slow";
  if (args.score >= 82 && args.similarData.marketPressure !== "high") return "fast";
  if (args.score >= 68) return "normal";
  if (args.marketType === "collector") return "collector_wait";
  return "slow";
}

function sellSpeedLabel(speed: SellCheckSellSpeed): string {
  if (speed === "fast") return "早めに反応が出る可能性あり";
  if (speed === "normal") return "通常ペース";
  if (speed === "slow") return "売れ行きは遅め";
  if (speed === "collector_wait") return "低回転・コレクター待ち";
  return "不明";
}

function scoreLabel(score: number): string {
  if (score >= 82) return "総合診断スコア：高";
  if (score >= 68) return "総合診断スコア：やや高";
  if (score >= 52) return "総合診断スコア：中";
  return "総合診断スコア：低";
}

function buildSmallSampleAnalysis(args: {
  learned: LearnedData;
  weightedLogs: WeightedLog[];
  similarData: SellCheckSimilarData;
  textAnalysis?: SellCheckTextAnalysis;
}): SellCheckSmallSampleAnalysis {
  const targetSampleCount = 5;
  const usableSampleCount = args.similarData.similarSoldCount;

  const missingData: string[] = [];
  const nextDataToCollect: string[] = [];
  const decisionNotes: string[] = [];

  const text = args.textAnalysis;

  const hasCharacter = Boolean(text?.characterName || text?.seriesName);
  const hasMaterial = Boolean(text?.materialType || text?.material);
  const hasProductType = Boolean(text?.productType);
  const hasSold = args.similarData.similarSoldCount > 0;
  const hasActive = args.similarData.similarActiveCount > 0;

  const sameCharacterCount = args.weightedLogs.filter((x) => {
    if (!text?.characterName && !text?.seriesName) return false;

    return (
      sameField(text.characterName, x.log.characterName) ||
      sameField(text.characterName, x.log.title) ||
      sameField(text.seriesName, x.log.seriesName) ||
      sameField(text.seriesName, x.log.title)
    );
  }).length;

  const sameMaterialCount = args.weightedLogs.filter((x) => {
    if (!text?.material && !text?.materialType) return false;

    return (
      sameField(text.material, x.log.material) ||
      sameField(text.materialType, x.log.materialType) ||
      sameField(text.materialType, x.log.material)
    );
  }).length;

  const sameProductTypeCount = args.weightedLogs.filter((x) => {
    if (!text?.productType) return false;

    return sameField(text.productType, x.log.productType) || sameField(text.productType, x.log.title);
  }).length;

  if (!hasCharacter || sameCharacterCount < 2) {
    missingData.push("同一キャラクター・同一作品名の売却済みデータが不足しています");
    nextDataToCollect.push("同じキャラクター名・作品名の商品を2件集める");
  }

  if (!hasMaterial || sameMaterialCount < 2) {
    missingData.push("同じ素材・近い商品種別の比較データが不足しています");
    nextDataToCollect.push("同じ素材・同じ商品種別の商品を2件集める");
  }

  if (!hasSold || usableSampleCount < 3) {
    missingData.push("価格判断の主軸になる売却済みデータが不足しています");
    nextDataToCollect.push("売却済み価格が確認できる近い商品を最低3件集める");
  }

  if (!hasActive) {
    missingData.push("販売中価格・競合在庫の比較データが不足しています");
    nextDataToCollect.push("販売中の高値商品を1件集める");
  }

  if (!hasProductType || sameProductTypeCount < 2) {
    missingData.push("商品種別が近いデータが不足しています");
    nextDataToCollect.push("同じ商品種別の商品を追加する");
  }

  if (args.similarData.marketPressure === "high") {
    decisionNotes.push("販売中在庫が多いため、価格上限は慎重に見ます");
  }

  if (args.similarData.marketPressure === "low") {
    decisionNotes.push("販売中在庫が少ないため、即売ではなくコレクター待ちの可能性があります");
  }

  if (args.similarData.similarSoldCount >= targetSampleCount) {
    decisionNotes.push("少数判定としては必要最低限の売却済みデータがあります");
  } else {
    decisionNotes.push("現時点の価格帯は参考値です。追加データで精度が上がります");
  }

  const uniqueNext = nextDataToCollect.filter((x, i, arr) => arr.indexOf(x) === i);

  return {
    isSmallSample: usableSampleCount < targetSampleCount,
    usableSampleCount,
    targetSampleCount,
    summary:
      usableSampleCount >= targetSampleCount
        ? "少数判定に必要な最低ラインは満たしています。"
        : `少数判定としては ${usableSampleCount}/${targetSampleCount} 件です。価格を確定するには追加データ推奨です。`,
    missingData: missingData.filter((x, i, arr) => arr.indexOf(x) === i),
    nextDataToCollect: uniqueNext.slice(0, 5),
    decisionNotes: decisionNotes.filter((x, i, arr) => arr.indexOf(x) === i),
  };
}

function buildScoreBreakdown(args: {
  priceScoreValue: number;
  conditionScoreValue: number;
  imageScoreValue: number;
  textScoreValue: number;
  learnedPriceScoreValue: number;
  marketScoreValue: number;
  pressurePenalty: number;
  rawScore: number;
  finalScore: number;
  guard: ConfidenceGuard;
}): SellCheckScoreBreakdown {
  const reasons: string[] = [
    `価格点 ${args.priceScoreValue}/100 ×15%`,
    `状態点 ${args.conditionScoreValue}/100 ×12%`,
    `画像点 ${args.imageScoreValue}/100 ×15%`,
    `説明文点 ${args.textScoreValue}/100 ×12%`,
    `類似価格点 ${args.learnedPriceScoreValue}/100 ×21%`,
    `市場価値点 ${args.marketScoreValue}/100 ×25%`,
  ];

  if (args.pressurePenalty > 0) reasons.push(`在庫圧ペナルティ -${args.pressurePenalty}点`);
  if (args.guard.isLowConfidence && args.finalScore < args.rawScore) {
    reasons.push(`低信頼補正で ${args.rawScore}/100 → ${args.finalScore}/100 に上限調整`);
  }

  return {
    priceScore: args.priceScoreValue,
    conditionScore: args.conditionScoreValue,
    imageScore: args.imageScoreValue,
    textScore: args.textScoreValue,
    learnedPriceScore: args.learnedPriceScoreValue,
    marketScore: args.marketScoreValue,
    pressurePenalty: args.pressurePenalty,
    rawScore: args.rawScore,
    finalScore: args.finalScore,
    reasons,
  };
}

function alignRotationLearningWithFinalSpeed(args: {
  rotationLearningAnalysis: ReturnType<typeof buildRotationLearningAnalysis>;
  sellSpeed: SellCheckSellSpeed;
  marketType: SellCheckMarketType;
  similarData: SellCheckSimilarData;
}) {
  const base = args.rotationLearningAnalysis;
  const reasons = [...base.reasons];

  if (args.sellSpeed === "slow" || args.sellSpeed === "collector_wait") {
    pushUnique(reasons, "総合診断の売れ行き目安に合わせ、回転表示を安全側に統一しました");

    return {
      ...base,
      rotationLevel: "slow" as const,
      rotationLabel: "回転学習：遅い",
      expectedDaysToSellLabel:
        args.sellSpeed === "collector_wait" || args.marketType === "low_rotation"
          ? "目安：1〜3か月以上"
          : "目安：2〜8週間",
      reasons: reasons.filter((x, i, arr) => arr.indexOf(x) === i),
    };
  }

  if (args.sellSpeed === "normal" && base.rotationLevel === "fast") {
    pushUnique(reasons, "総合診断が通常ペースのため、1〜14日表示を避けて安全側に補正しました");

    return {
      ...base,
      rotationLevel: "normal" as const,
      rotationLabel: "回転学習：通常",
      expectedDaysToSellLabel: "目安：2〜6週間",
      reasons: reasons.filter((x, i, arr) => arr.indexOf(x) === i),
    };
  }

  return base;
}

function buildScoreExplanation(args: {
  score: number;
  rank: "A" | "B" | "C" | "D";
  marketType: SellCheckMarketType;
  confidence: SellCheckConfidenceLevel;
  sellSpeed: SellCheckSellSpeed;
}): string {
  return `${args.score}/100 は「即売確率」ではなく、価格・画像・説明文・類似売却データ・市場価値を合わせた総合診断値です。判定は ${rankLabel(args.rank)}、市場は ${marketTypeLabel(args.marketType)}、売れ行き目安は ${sellSpeedLabel(args.sellSpeed)}、データ信頼度は ${confidenceLabel(args.confidence)} です。`;
}

function applyTheoryProfileToMarketAnalysis(args: {
  marketAnalysis: SellCheckMarketAnalysis;
  theoryProfile: TheoryProfile;
}): SellCheckMarketAnalysis {
  const theory = args.theoryProfile;
  const base = args.marketAnalysis;

  const rarityScore = clampScore(
    base.rarityScore * 0.78 +
      theory.ipStrengthScore * 0.08 +
      theory.collectorCultureScore * 0.1 +
      theory.boxCultureScore * 0.04
  );

  const demandScore = clampScore(
    base.demandScore * 0.82 +
      theory.ipStrengthScore * 0.12 +
      theory.searchSpecificityScore * 0.06
  );

  const collectorScore = clampScore(
    base.collectorScore * 0.68 +
      theory.collectorCultureScore * 0.24 +
      theory.boxCultureScore * 0.08
  );

  const ageValueScore = clampScore(
    base.ageValueScore * 0.85 +
      theory.collectorCultureScore * 0.08 +
      theory.boxCultureScore * 0.07
  );

  const keywordStrength = clampScore(
    base.keywordStrength * 0.72 +
      theory.searchSpecificityScore * 0.28
  );

  const marketSupplyScore = clampScore(
    base.marketSupplyScore * 0.86 +
      theory.shippingSuitabilityScore * 0.08 -
      theory.rotationRiskScore * 0.06
  );

  const rareReasons = [
    ...base.rareReasons,
    ...theory.theoryReasons.map((reason) => `理論DB：${reason}`),
  ].filter((x, i, arr) => arr.indexOf(x) === i);

  return {
    ...base,
    rarityScore,
    demandScore,
    collectorScore,
    ageValueScore,
    marketSupplyScore,
    keywordStrength,
    rareReasons,
  };
}

export function calculateSellCheckResult(args: {
  price: number;
  condition: SellCheckCondition;
  category: SellCheckCategory;
  imageMeta: SellCheckImageMeta;
  learned: LearnedData;
  imageAnalysis?: SellCheckImageAnalysis;
  textAnalysis?: SellCheckTextAnalysis;

  purchasePrice?: number;
  estimatedShippingCost?: number;
  estimatedPackagingCost?: number;
  platformFeeRate?: number;
}): SellCheckResult {
  const price = fallbackPrice(args.price);
  const textAnalysis = normalizeTextAnalysisForScoring(args.textAnalysis);

  const provisionalMarketAnalysis = calcMarketAnalysis(textAnalysis);

  const weightedLogs = getWeightedSimilarLogs({
    logs: args.learned.logs,
    price,
    category: args.category,
    condition: args.condition,
    textAnalysis: textAnalysis,
    imageAnalysis: args.imageAnalysis,
    marketAnalysis: provisionalMarketAnalysis,
  });

  const similarData = buildSimilarData(weightedLogs);
  const theoryProfile = buildTheoryProfile(textAnalysis);

  const marketAnalysis = applyTheoryProfileToMarketAnalysis({
    marketAnalysis: calcMarketAnalysis(textAnalysis, similarData),
    theoryProfile,
  });

  const marketStructureAnalysis = buildMarketStructureAnalysis({
    textAnalysis: textAnalysis,
    similarData,
    theoryProfile,
  });

  const priceDistortionAnalysis = buildPriceDistortionAnalysis({
    similarData,
    inputPrice: price,
  });

  const priceScoreValue = priceBaseScore(price);
  const conditionScoreValue = conditionScore(args.condition);
  const imageScoreValue = imageScore(args.imageMeta, args.imageAnalysis);
  const textScoreValue = textScore(textAnalysis);
  const learnedPriceScoreValue = learnedPriceScore(price, similarData);
  const marketScoreValue = marketScore(marketAnalysis);
  const pressurePenalty = similarData.marketPressure === "high" ? 5 : 0;

  const rawScore = clampScore(
    priceScoreValue * 0.15 +
      conditionScoreValue * 0.12 +
      imageScoreValue * 0.15 +
      textScoreValue * 0.12 +
      learnedPriceScoreValue * 0.21 +
      marketScoreValue * 0.25 -
      pressurePenalty
  );

  const guard = buildConfidenceGuard({
    price,
    learned: args.learned,
    similarData,
  });

  const score = applyLowConfidenceScoreGuard({
    rawScore,
    guard,
    marketAnalysis,
    similarData,
  });

  const rank = rankFromScore(score);

  const range = suggestedPriceRange({
    priceInput: price,
    learned: args.learned,
    category: args.category,
    similarData,
    marketAnalysis,
    guard,
  });

  const mType = marketType({ marketAnalysis, similarData });
  const speed = sellSpeed({ score, marketType: mType, similarData });
  const confidence = confidenceLevel(guard, marketAnalysis);

  const scoreBreakdown = buildScoreBreakdown({
    priceScoreValue,
    conditionScoreValue,
    imageScoreValue,
    textScoreValue,
    learnedPriceScoreValue,
    marketScoreValue,
    pressurePenalty,
    rawScore,
    finalScore: score,
    guard,
  });

  const rotationLearningAnalysis = alignRotationLearningWithFinalSpeed({
    rotationLearningAnalysis: buildRotationLearningAnalysis({
      similarData,
      logs: args.learned.logs,
    }),
    sellSpeed: speed,
    marketType: mType,
    similarData,
  });

  const smallSampleAnalysis = buildSmallSampleAnalysis({
    learned: args.learned,
    weightedLogs,
    similarData,
    textAnalysis: textAnalysis,
  });

  const decisionMode: SellCheckDecisionMode =
    similarData.similarSoldCount >= 5
      ? "statistical"
      : similarData.similarSoldCount >= 1
      ? "similar_inference"
      : "structural_theory";

  const decisionModeLabel =
    decisionMode === "statistical"
      ? "統計判定型：類似売却データを中心に判断"
      : decisionMode === "similar_inference"
      ? "類似推論型：少数データと商品属性から判断"
      : "構造推論型：理論DBと商品特徴から仮説判断";

  const researchGuide = buildResearchGuide({
    textAnalysis: textAnalysis,
    similarData,
  });

  const expectedSalePrice = Math.round((range.min + range.max) / 2);

  const profitAnalysis = calculateProfitAnalysis({
    expectedSalePrice,
    purchasePrice: args.purchasePrice,
    estimatedShippingCost: args.estimatedShippingCost,
    estimatedPackagingCost: args.estimatedPackagingCost,
    platformFeeRate: args.platformFeeRate,
  });

  const acquisitionAnalysis = calculateAcquisitionAnalysis({
    suggestedPriceMin: range.min,
    suggestedPriceMax: range.max,
    profitAnalysis,
    marketAnalysis,
    similarData,
  });

  const actionGuide = buildActionGuide({
    decisionMode,
    researchGuide,
    profitAnalysis,
    acquisitionAnalysis,
    smallSampleAnalysis,
  });

  const improvements: string[] = [];
  const reasons: string[] = [];

  if (!args.imageMeta.hasImage) {
    pushUnique(improvements, "診断対象の画像をアップロードしてください");
  } else {
    pushUnique(reasons, `画像「${args.imageMeta.fileName || "uploaded-image"}」を診断対象として扱っています`);
  }

  if (guard.isLowConfidence) {
    pushUnique(
      reasons,
      "この診断は参考診断です。低信頼時でも売却中央値・希少性・コレクター市場性は残し、価格を破壊的に下げず、レンジを広めに表示しています"
    );
    guard.reasons.forEach((reason) => pushUnique(reasons, `低信頼判定：${reason}`));
    pushUnique(
      improvements,
      "同一ジャンル・同一メーカー・同一作品名・近い価格帯の売却済みデータを追加してください"
    );
  }

  pushUnique(
    reasons,
    `${score}/100 は即売確率ではなく、価格・画像・説明文・市場価値・類似データを合わせた総合診断スコアです`
  );

  scoreBreakdown.reasons.forEach((reason) => {
    pushUnique(reasons, `総合点内訳：${reason}`);
  });

  if (similarData.matchAnalysis) {
    similarData.matchAnalysis.reasons.forEach((reason) => {
      pushUnique(reasons, `一致度詳細：${reason}`);
    });
    similarData.matchAnalysis.warnings.forEach((warning) => {
      pushUnique(reasons, `一致度注意：${warning}`);
    });
  }

  pushUnique(reasons, `ランク意味：${rankLabel(rank)}`);
  pushUnique(reasons, `売れ行き目安：${sellSpeedLabel(speed)}`);
  pushUnique(reasons, `市場タイプ：${marketTypeLabel(mType)}`);
  pushUnique(reasons, `データ信頼度：${confidenceLabel(confidence)}`);

    pushUnique(reasons, `判定モード：${decisionModeLabel}`);

  theoryProfile.theoryReasons.forEach((reason) => {
    pushUnique(reasons, `理論DB：${reason}`);
  });

  pushUnique(reasons, `市場構造OS：${marketStructureAnalysis.structureLabel}`);
  pushUnique(reasons, `市場構造OS：${marketStructureAnalysis.rotationExplanation}`);
  pushUnique(reasons, `市場構造OS：${marketStructureAnalysis.priceJudgementPolicy}`);
  pushUnique(reasons, `市場構造OS：${marketStructureAnalysis.dataRequirementPolicy}`);

  marketStructureAnalysis.reasons.forEach((reason) => {
    pushUnique(reasons, `市場構造OS：${reason}`);
  });

  pushUnique(reasons, `価格歪み検知：${priceDistortionAnalysis.distortionLabel}`);
  pushUnique(reasons, `価格歪み検知：${priceDistortionAnalysis.priceReliabilityLabel}`);
  pushUnique(reasons, `価格歪み検知：${priceDistortionAnalysis.correctedPricePolicy}`);

  priceDistortionAnalysis.warningReasons.forEach((reason) => {
    pushUnique(reasons, `価格歪み検知：${reason}`);
  });

  pushUnique(reasons, `回転学習：${rotationLearningAnalysis.rotationLabel}`);
  pushUnique(reasons, `回転学習：${rotationLearningAnalysis.expectedDaysToSellLabel}`);
  pushUnique(reasons, `回転学習：${rotationLearningAnalysis.viewLikeSignal}`);

  rotationLearningAnalysis.reasons.forEach((reason) => {
    pushUnique(reasons, `回転学習：${reason}`);
  });

  profitAnalysis.riskNotes.forEach((note) => {
    pushUnique(reasons, `利益計算：${note}`);
  });

  acquisitionAnalysis.reasons.forEach((reason) => {
    pushUnique(reasons, `仕入れ判断：${reason}`);
  });

  if (args.imageAnalysis) {
    pushUnique(reasons, `画像評価は ${args.imageAnalysis.overallImageScore}/100 として反映しています`);

    args.imageAnalysis.imageReasons.forEach((reason) => {
      pushUnique(reasons, `画像評価：${reason}`);
    });

    if (args.imageAnalysis.brightnessScore < 55) {
      pushUnique(improvements, "画像を明るくして、商品の細部が見える状態にする");
    }

    if (args.imageAnalysis.compositionScore < 55) {
      pushUnique(improvements, "商品全体が見えるように、構図と余白を調整する");
    }

    if (args.imageAnalysis.backgroundScore < 55) {
      pushUnique(improvements, "背景の生活感や余計な物を減らす");
    }

    if (args.imageAnalysis.damageRiskScore >= 70) {
      pushUnique(improvements, "傷・汚れ・破損箇所を説明文と追加写真で明確にする");
    }
  }

  if (textAnalysis) {
    if (textAnalysis.brandName) {
      pushUnique(reasons, `ブランド名「${textAnalysis.brandName}」を類似判定に使っています`);
    }

    if (textAnalysis.maker) {
      pushUnique(reasons, `メーカー「${textAnalysis.maker}」を類似判定に使っています`);
    }

    if (textAnalysis.characterName) {
      pushUnique(reasons, `作品名・キャラクター「${textAnalysis.characterName}」を類似判定に使っています`);
    }

    if (textAnalysis.seriesName) {
      pushUnique(reasons, `シリーズ「${textAnalysis.seriesName}」を類似判定に使っています`);
    }

    if (textAnalysis.productType) {
      pushUnique(reasons, `商品種別「${textAnalysis.productType}」を類似判定に使っています`);
    }

    if (textAnalysis.era) {
      pushUnique(reasons, `年代「${textAnalysis.era}」を類似判定に使っています`);
    }

    if (textAnalysis.collectorGenre) {
      pushUnique(reasons, `コレクター分類「${textAnalysis.collectorGenre}」を類似判定に使っています`);
    }

    if (textAnalysis.materialType) {
      pushUnique(reasons, `素材分類「${textAnalysis.materialType}」を類似判定に使っています`);
    }

    if (textAnalysis.modelName) {
      pushUnique(reasons, `型番・モデル名「${textAnalysis.modelName}」を類似判定に使っています`);
    }

    if (textAnalysis.material) {
      pushUnique(reasons, `素材「${textAnalysis.material}」を類似判定に使っています`);
    }

    if (textAnalysis.extractedKeywords.length > 0) {
      pushUnique(
        reasons,
        `検索キーワード「${textAnalysis.extractedKeywords.slice(0, 8).join(" / ")}」を類似判定に使っています`
      );
    }

    if (textAnalysis.descriptionQualityScore < 55) {
      pushUnique(improvements, "説明文にブランド・型番・サイズ・状態・付属品を追記する");
    }

    if (textAnalysis.conditionRiskScore >= 70) {
      pushUnique(improvements, "状態リスクが高いため、マイナス点を隠さず明記する");
    }

    textAnalysis.textReasons.forEach((reason) => {
      pushUnique(reasons, `説明文評価：${reason}`);
    });
  }

  if (similarData.similarActiveCount > 0) {
    const sources = similarData.activeSources.map(sourceLabel).join(" / ");
    pushUnique(
      reasons,
      `販売中データ ${similarData.similarActiveCount}件を市場在庫として参照しました${sources ? `（${sources}）` : ""}`
    );
  }

  if (similarData.marketPressure === "high") {
    pushUnique(reasons, "販売中の類似データが多いため、価格上限とスコアをやや安全側に見ています");
    pushUnique(improvements, "販売中の競合が多いため、写真・説明文・価格の納得感を強化する");
  }

  if (similarData.marketPressure === "low") {
    pushUnique(
      reasons,
      "販売中の類似データが少ないため、低在庫市場として扱っています。低回転でも価値が低いとは限りません"
    );
  }

  pushUnique(
    reasons,
    `市場価値推定：希少性 ${marketAnalysis.rarityScore}/100、需要 ${marketAnalysis.demandScore}/100、コレクター価値 ${marketAnalysis.collectorScore}/100、年代価値 ${marketAnalysis.ageValueScore}/100 を反映しています`
  );

  if (marketAnalysis.estimatedByTheory) {
    pushUnique(
      reasons,
      "類似売却データが少ないため、商品名・ブランド・年代語・素材・コレクター語句から理論推定しています"
    );
  } else {
    pushUnique(reasons, `類似データの信頼度は ${marketAnalysis.dataConfidence} として扱っています`);
  }

  marketAnalysis.rareReasons.forEach((reason) => {
    pushUnique(reasons, `市場価値推定：${reason}`);
  });

  if (similarData.similarSoldCount >= 1) {
    pushUnique(
      reasons,
      `類似売却データ ${similarData.similarSoldCount}件を参照しました。一致度は ${similarData.matchLevel} です`
    );

    if (similarData.medianSoldPrice || similarData.averageSoldPrice) {
      pushUnique(
        reasons,
        `類似売却価格は中央値 ${
          similarData.medianSoldPrice
            ? `${similarData.medianSoldPrice.toLocaleString()}円`
            : "—"
        }、平均 ${
          similarData.averageSoldPrice
            ? `${similarData.averageSoldPrice.toLocaleString()}円`
            : "—"
        } として参照しています`
      );
    }
  } else {
    pushUnique(
      reasons,
      "強い類似売却データが少ないため、希少性・ブランド・キーワード・状態・画像を重めに判断しています"
    );
  }

  if (price < range.min || price > range.max) {
    pushUnique(improvements, `価格を ${range.min.toLocaleString()}〜${range.max.toLocaleString()}円 に寄せる`);
  }

  if (args.condition === "fair") {
    pushUnique(improvements, "傷・使用感が伝わる写真を追加する");
  }

  if (args.condition === "poor") {
    pushUnique(improvements, "状態の悪い箇所を隠さず、説明文と写真で明確にする");
    pushUnique(improvements, "価格をやや低めに設定し、納得感を優先する");
  }

  if (score < 52) {
    pushUnique(improvements, "出品前に価格・写真・状態説明を見直す");
  }

  if (improvements.length === 0) {
    pushUnique(improvements, "このまま出品して問題ありません");
  }

  return {
    score,
    rank,
    action: buildAction(score, guard),
    scoreLabel: scoreLabel(score),
    rankLabel: rankLabel(rank),
    sellSpeed: speed,
    sellSpeedLabel: sellSpeedLabel(speed),
    confidenceLevel: confidence,
    confidenceLabel: confidenceLabel(confidence),
    marketType: mType,
    marketTypeLabel: marketTypeLabel(mType),
    scoreExplanation: buildScoreExplanation({
      score,
      rank,
      marketType: mType,
      confidence,
      sellSpeed: speed,
    }),
    suggestedPriceMin: range.min,
    suggestedPriceMax: range.max,
    improvements,
    reasons,
    learnedSampleCount: args.learned.totalCount,
    targetSummary: `${categoryLabel(args.category)} / ${conditionLabel(args.condition)} / ${price.toLocaleString()}円`,
    imageAnalysis: args.imageAnalysis,
    textAnalysis: textAnalysis,
    marketAnalysis,
    similarData,
    scoreBreakdown,
    similarMatchAnalysis: similarData.matchAnalysis,

    decisionMode,
    decisionModeLabel,
    researchGuide,
    profitAnalysis,
    acquisitionAnalysis,
    actionGuide,
    theoryProfile,
    marketStructureAnalysis,
    priceDistortionAnalysis,
    rotationLearningAnalysis,

    smallSampleAnalysis,
  };
}