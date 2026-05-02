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
} from "@/lib/types/sellCheck";
import {
  categoryLabel,
  conditionLabel,
  conditionScore,
  priceBaseScore,
  countRareKeywordHits,
  normalizeSearchText,
} from "@/lib/sellCheck/rules";

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

  const index = Math.min(list.length - 1, Math.max(0, Math.floor(list.length * rate)));
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

function calcMarketAnalysis(textAnalysis?: SellCheckTextAnalysis): SellCheckMarketAnalysis {
  const targetWords = wordsFromTarget(textAnalysis);
  const rareHit = countRareKeywordHits(targetWords);
  const keywordCount = targetWords.length;

  const rarityScore = safeScore(
    textAnalysis?.rarityScore,
    clampScore(35 + rareHit * 12)
  );

  const collectorScore = safeScore(
    textAnalysis?.collectorScore,
    clampScore(30 + rareHit * 10)
  );

  const ageValueScore = safeScore(
    textAnalysis?.ageValueScore,
    targetWords.some((x) => normalizeSearchText(x).includes("昭和"))
      ? 80
      : clampScore(35 + rareHit * 8)
  );

  const brandPowerScore = safeScore(
    textAnalysis?.brandPowerScore,
    textAnalysis?.brandName ? 65 : 45
  );

  const demandScore = safeScore(
    textAnalysis?.demandScore,
    clampScore(45 + rareHit * 5 + keywordCount * 2)
  );

  const trendScore = safeScore(textAnalysis?.trendScore, 50);

  const marketSupplyScore = safeScore(
    textAnalysis?.marketSupplyScore,
    clampScore(40 + rareHit * 8)
  );

  const keywordStrength = safeScore(
    textAnalysis?.keywordStrength,
    clampScore(35 + keywordCount * 5 + rareHit * 6)
  );

  const rareReasons = Array.isArray(textAnalysis?.rareReasons)
    ? textAnalysis!.rareReasons!.filter(Boolean).slice(0, 10)
    : [];

  if (rareHit > 0 && rareReasons.length === 0) {
    rareReasons.push("希少性・年代価値・コレクター需要につながるキーワードを検出しました");
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
  };
}

function weightedSimilarity(args: {
  log: SellCheckLog;
  category: SellCheckCategory;
  condition: SellCheckCondition;
  textAnalysis?: SellCheckTextAnalysis;
  imageAnalysis?: SellCheckImageAnalysis;
  marketAnalysis: SellCheckMarketAnalysis;
}): number {
  const targetWords = wordsFromTarget(args.textAnalysis);
  const log = args.log;

  let weight = 0;

  if (log.category === args.category) weight += 8;
  if (log.condition === args.condition) weight += 3;

  if (args.textAnalysis?.brandName && log.brandName) {
    if (includesNormalized(args.textAnalysis.brandName, log.brandName)) {
      weight += 18;
    }
  }

  if (args.textAnalysis?.modelName && log.modelName) {
    if (includesNormalized(args.textAnalysis.modelName, log.modelName)) {
      weight += 24;
    }
  }

  weight += keywordHitCount(targetWords, log) * 5;

  const targetRareHits = countRareKeywordHits(targetWords);
  const logRareHits = countRareKeywordHits(wordsFromLog(log));

  if (targetRareHits > 0 && logRareHits > 0) {
    weight += Math.min(20, Math.min(targetRareHits, logRareHits) * 7);
  }

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

  return weight;
}

function getWeightedSimilarLogs(args: {
  logs?: SellCheckLog[];
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
        category: args.category,
        condition: args.condition,
        textAnalysis: args.textAnalysis,
        imageAnalysis: args.imageAnalysis,
        marketAnalysis: args.marketAnalysis,
      }),
    }))
    .filter((x) => x.weight >= 8)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 80);
}

function soldPriceFromLog(log: SellCheckLog): number | undefined {
  return safePrice(log.soldPrice) ?? safePrice(log.price);
}

function buildSimilarData(weightedLogs: WeightedLog[]): SellCheckSimilarData {
  const soldWeighted = weightedLogs.filter((x) => x.log.sold === true);
  const soldPrices = soldWeighted
    .map((x) => soldPriceFromLog(x.log))
    .filter((price): price is number => typeof price === "number" && price > 0);

  const averageSoldPrice =
    soldPrices.length > 0
      ? Math.round(soldPrices.reduce((sum, n) => sum + n, 0) / soldPrices.length)
      : undefined;

  const maxWeight = weightedLogs[0]?.weight ?? 0;

  const matchLevel: SellCheckSimilarData["matchLevel"] =
    maxWeight >= 50
      ? "rare"
      : maxWeight >= 38
      ? "model"
      : maxWeight >= 26
      ? "brand"
      : maxWeight >= 16
      ? "keyword"
      : maxWeight >= 8
      ? "category"
      : "weak";

  return {
    similarCount: weightedLogs.length,
    similarSoldCount: soldPrices.length,
    averageSoldPrice,
    medianSoldPrice: median(soldPrices),
    minSoldPrice: soldPrices.length > 0 ? Math.min(...soldPrices) : undefined,
    maxSoldPrice: soldPrices.length > 0 ? Math.max(...soldPrices) : undefined,
    premiumPrice: percentile(soldPrices, 0.8),
    matchLevel,
  };
}

function categorySoldPrices(logs: SellCheckLog[] | undefined, category: SellCheckCategory): number[] {
  if (!Array.isArray(logs)) return [];

  return logs
    .filter((log) => log.category === category && log.sold === true)
    .map(soldPriceFromLog)
    .filter((price): price is number => typeof price === "number" && price > 0);
}

function imageScore(imageMeta: SellCheckImageMeta, imageAnalysis?: SellCheckImageAnalysis): number {
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

function textScore(textAnalysis?: SellCheckTextAnalysis): number {
  if (!textAnalysis) return 55;

  const conditionRisk = safeScore(textAnalysis.conditionRiskScore, 50);
  const descriptionQuality = safeScore(textAnalysis.descriptionQualityScore, 50);

  return clampScore(descriptionQuality * 0.7 + (100 - conditionRisk) * 0.3);
}

function marketScore(marketAnalysis: SellCheckMarketAnalysis): number {
  return clampScore(
    marketAnalysis.rarityScore * 0.18 +
      marketAnalysis.demandScore * 0.18 +
      marketAnalysis.brandPowerScore * 0.14 +
      marketAnalysis.collectorScore * 0.16 +
      marketAnalysis.ageValueScore * 0.12 +
      marketAnalysis.trendScore * 0.08 +
      marketAnalysis.marketSupplyScore * 0.08 +
      marketAnalysis.keywordStrength * 0.06
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
  const rare = marketAnalysis.rarityScore;
  const collector = marketAnalysis.collectorScore;
  const age = marketAnalysis.ageValueScore;
  const brand = marketAnalysis.brandPowerScore;
  const supply = marketAnalysis.marketSupplyScore;

  const total = rare * 0.32 + collector * 0.24 + age * 0.18 + brand * 0.16 + supply * 0.1;

  if (total >= 85) return 1.45;
  if (total >= 75) return 1.3;
  if (total >= 65) return 1.18;
  if (total >= 55) return 1.08;
  return 1;
}

function suggestedPriceRange(args: {
  priceInput: number;
  learned: LearnedData;
  category: SellCheckCategory;
  similarData: SellCheckSimilarData;
  marketAnalysis: SellCheckMarketAnalysis;
}): { min: number; max: number } {
  const price = fallbackPrice(args.priceInput);
  const reliability = learnedReliability(args.similarData);
  const categoryPrices = categorySoldPrices(args.learned.logs, args.category);

  const categoryMedian = median(categoryPrices);
  const base =
    reliability >= 0.3
      ? args.similarData.medianSoldPrice ??
        args.similarData.averageSoldPrice ??
        categoryMedian ??
        price
      : categoryMedian ?? price;

  const premium = premiumRate(args.marketAnalysis);
  const premiumBase =
    args.similarData.matchLevel === "rare" && args.similarData.premiumPrice
      ? Math.max(base, args.similarData.premiumPrice)
      : base;

  const correctedBase = Math.round(premiumBase * premium);

  const minRate = reliability >= 0.6 ? 0.88 : 0.82;
  const maxRate = premium >= 1.18 ? 1.25 : reliability >= 0.6 ? 1.12 : 1.16;

  const min = Math.max(300, Math.round(correctedBase * minRate));
  const max = Math.max(min + 100, Math.round(correctedBase * maxRate));

  return { min, max };
}

function buildAction(score: number): string {
  if (score >= 82) return "強く出品OK";
  if (score >= 68) return "出品OK";
  if (score >= 52) return "改善して出品";
  return "出品前に修正推奨";
}

export function calculateSellCheckResult(args: {
  price: number;
  condition: SellCheckCondition;
  category: SellCheckCategory;
  imageMeta: SellCheckImageMeta;
  learned: LearnedData;
  imageAnalysis?: SellCheckImageAnalysis;
  textAnalysis?: SellCheckTextAnalysis;
}): SellCheckResult {
  const price = fallbackPrice(args.price);
  const marketAnalysis = calcMarketAnalysis(args.textAnalysis);

  const weightedLogs = getWeightedSimilarLogs({
    logs: args.learned.logs,
    category: args.category,
    condition: args.condition,
    textAnalysis: args.textAnalysis,
    imageAnalysis: args.imageAnalysis,
    marketAnalysis,
  });

  const similarData = buildSimilarData(weightedLogs);

  const priceScore = priceBaseScore(price);
  const stateScore = conditionScore(args.condition);
  const photoScore = imageScore(args.imageMeta, args.imageAnalysis);
  const descriptionScore = textScore(args.textAnalysis);
  const mScore = marketScore(marketAnalysis);
  const learnedScore = learnedPriceScore(price, similarData);

  const score = clampScore(
    priceScore * 0.16 +
      stateScore * 0.13 +
      photoScore * 0.15 +
      descriptionScore * 0.12 +
      learnedScore * 0.2 +
      mScore * 0.24
  );

  const rank = rankFromScore(score);
  const range = suggestedPriceRange({
    priceInput: price,
    learned: args.learned,
    category: args.category,
    similarData,
    marketAnalysis,
  });

  const improvements: string[] = [];
  const reasons: string[] = [];

  if (!args.imageMeta.hasImage) {
    pushUnique(improvements, "診断対象の画像をアップロードしてください");
  } else {
    pushUnique(reasons, `画像「${args.imageMeta.fileName || "uploaded-image"}」を診断対象として扱っています`);
  }

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

  if (args.textAnalysis) {
    if (args.textAnalysis.brandName) {
      pushUnique(reasons, `ブランド名「${args.textAnalysis.brandName}」を類似判定に使っています`);
    }

    if (args.textAnalysis.modelName) {
      pushUnique(reasons, `型番・モデル名「${args.textAnalysis.modelName}」を類似判定に使っています`);
    }

    if (args.textAnalysis.descriptionQualityScore < 55) {
      pushUnique(improvements, "説明文にブランド・型番・サイズ・状態・付属品を追記する");
    }

    if (args.textAnalysis.conditionRiskScore >= 70) {
      pushUnique(improvements, "状態リスクが高いため、マイナス点を隠さず明記する");
    }

    args.textAnalysis.textReasons.forEach((reason) => {
      pushUnique(reasons, `説明文評価：${reason}`);
    });
  }

  if (marketAnalysis.rarityScore >= 70) {
    pushUnique(reasons, `希少性スコア ${marketAnalysis.rarityScore}/100 を価格補正に反映しています`);
  }

  if (marketAnalysis.collectorScore >= 70) {
    pushUnique(reasons, `コレクター価値 ${marketAnalysis.collectorScore}/100 を反映しています`);
  }

  if (marketAnalysis.ageValueScore >= 70) {
    pushUnique(reasons, `年代価値 ${marketAnalysis.ageValueScore}/100 を反映しています`);
  }

  marketAnalysis.rareReasons.forEach((reason) => {
    pushUnique(reasons, `希少性評価：${reason}`);
  });

  if (similarData.similarSoldCount >= 1) {
    pushUnique(
      reasons,
      `類似売却データ ${similarData.similarSoldCount}件を参照しました。一致度は ${similarData.matchLevel} です`
    );
  } else {
    pushUnique(
      reasons,
      "強い類似売却データが少ないため、希少性・ブランド・キーワード・状態・画像を重めに判断しています"
    );
  }

  if (price < range.min || price > range.max) {
    pushUnique(
      improvements,
      `価格を ${range.min.toLocaleString()}〜${range.max.toLocaleString()}円 に寄せる`
    );
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
    action: buildAction(score),
    suggestedPriceMin: range.min,
    suggestedPriceMax: range.max,
    improvements,
    reasons,
    learnedSampleCount: args.learned.totalCount,
    targetSummary: `${categoryLabel(args.category)} / ${conditionLabel(args.condition)} / ${price.toLocaleString()}円`,
    imageAnalysis: args.imageAnalysis,
    textAnalysis: args.textAnalysis,
    marketAnalysis,
    similarData,
  };
}