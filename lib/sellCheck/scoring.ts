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
} from "@/lib/types/sellCheck";
import {
  categoryLabel,
  conditionLabel,
  conditionScore,
  priceBaseScore,
} from "@/lib/sellCheck/rules";

type LearnedData = {
  averageSoldPrice?: number;
  soldCount: number;
  totalCount: number;
  logs?: SellCheckLog[];
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

function pushUnique(list: string[], text: string) {
  const s = String(text || "").trim();
  if (!s) return;
  if (list.includes(s)) return;
  list.push(s);
}

function normalizeKeyword(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function keywordHitScore(target: string[], log: SellCheckLog): number {
  const targetSet = new Set(target.map(normalizeKeyword).filter(Boolean));
  const logWords = [
    log.title,
    log.brandName,
    log.modelName,
    log.material,
    ...(Array.isArray(log.extractedKeywords) ? log.extractedKeywords : []),
  ]
    .map(normalizeKeyword)
    .filter(Boolean);

  if (targetSet.size === 0 || logWords.length === 0) return 0;

  let hit = 0;

  logWords.forEach((word) => {
    if (targetSet.has(word)) hit += 1;
  });

  return hit;
}

function getTargetKeywords(textAnalysis?: SellCheckTextAnalysis): string[] {
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

function getSimilarLogs(args: {
  logs?: SellCheckLog[];
  category: SellCheckCategory;
  condition: SellCheckCondition;
  textAnalysis?: SellCheckTextAnalysis;
  imageAnalysis?: SellCheckImageAnalysis;
}): SellCheckLog[] {
  if (!Array.isArray(args.logs)) return [];

  const targetKeywords = getTargetKeywords(args.textAnalysis);

  return args.logs.filter((log) => {
    if (log.category !== args.category) return false;

    let score = 0;

    if (log.condition === args.condition) score += 2;

    score += keywordHitScore(targetKeywords, log) * 2;

    if (
      typeof args.imageAnalysis?.overallImageScore === "number" &&
      typeof log.overallImageScore === "number"
    ) {
      const diff = Math.abs(args.imageAnalysis.overallImageScore - log.overallImageScore);
      if (diff <= 15) score += 1;
    }

    if (
      typeof args.textAnalysis?.conditionRiskScore === "number" &&
      typeof log.conditionRiskScore === "number"
    ) {
      const diff = Math.abs(args.textAnalysis.conditionRiskScore - log.conditionRiskScore);
      if (diff <= 20) score += 1;
    }

    return score >= 2;
  });
}

function getSoldPricesFromLogs(
  logs: SellCheckLog[] | undefined,
  category: SellCheckCategory
): number[] {
  if (!Array.isArray(logs)) return [];

  return logs
    .filter((log) => log.category === category)
    .filter((log) => log.sold === true)
    .map((log) => safePrice(log.soldPrice) ?? safePrice(log.price))
    .filter((price): price is number => typeof price === "number" && price > 0);
}

function getSoldPricesFromSimilarLogs(logs: SellCheckLog[]): number[] {
  return logs
    .filter((log) => log.sold === true)
    .map((log) => safePrice(log.soldPrice) ?? safePrice(log.price))
    .filter((price): price is number => typeof price === "number" && price > 0);
}

function buildSimilarData(similarLogs: SellCheckLog[]): SellCheckSimilarData {
  const soldPrices = getSoldPricesFromSimilarLogs(similarLogs);

  const averageSoldPrice =
    soldPrices.length > 0
      ? Math.round(soldPrices.reduce((sum, n) => sum + n, 0) / soldPrices.length)
      : undefined;

  return {
    similarCount: similarLogs.length,
    similarSoldCount: soldPrices.length,
    averageSoldPrice,
    medianSoldPrice: median(soldPrices),
    minSoldPrice: soldPrices.length > 0 ? Math.min(...soldPrices) : undefined,
    maxSoldPrice: soldPrices.length > 0 ? Math.max(...soldPrices) : undefined,
  };
}

function resolveLearnedSoldPrices(
  learned: LearnedData,
  category: SellCheckCategory
): number[] {
  return getSoldPricesFromLogs(learned.logs, category);
}

function resolveAverageSoldPrice(
  learned: LearnedData,
  category: SellCheckCategory,
  similarData?: SellCheckSimilarData
): number | undefined {
  if (
    similarData?.similarSoldCount &&
    similarData.similarSoldCount >= 2 &&
    similarData.averageSoldPrice
  ) {
    return similarData.averageSoldPrice;
  }

  const prices = resolveLearnedSoldPrices(learned, category);

  if (prices.length > 0) {
    return Math.round(prices.reduce((sum, n) => sum + n, 0) / prices.length);
  }

  if (learned.averageSoldPrice && learned.averageSoldPrice > 0) {
    return Math.round(learned.averageSoldPrice);
  }

  return undefined;
}

function resolveMedianSoldPrice(
  learned: LearnedData,
  category: SellCheckCategory,
  similarData?: SellCheckSimilarData
): number | undefined {
  if (
    similarData?.similarSoldCount &&
    similarData.similarSoldCount >= 2 &&
    similarData.medianSoldPrice
  ) {
    return similarData.medianSoldPrice;
  }

  return median(resolveLearnedSoldPrices(learned, category));
}

function resolveSoldCount(
  learned: LearnedData,
  category: SellCheckCategory,
  similarData?: SellCheckSimilarData
): number {
  if (similarData?.similarSoldCount && similarData.similarSoldCount >= 2) {
    return similarData.similarSoldCount;
  }

  const prices = resolveLearnedSoldPrices(learned, category);
  if (prices.length > 0) return prices.length;
  return Math.max(0, learned.soldCount || 0);
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

  if (imageMeta.fileSize >= 300_000 && imageMeta.fileSize <= 4_000_000) {
    return 78;
  }

  return 68;
}

function textScore(textAnalysis?: SellCheckTextAnalysis): number {
  if (!textAnalysis) return 55;

  const conditionRisk = safeScore(textAnalysis.conditionRiskScore, 50);
  const descriptionQuality = safeScore(textAnalysis.descriptionQualityScore, 50);

  return clampScore(descriptionQuality * 0.7 + (100 - conditionRisk) * 0.3);
}

function learnedReliabilityBySoldCount(soldCount: number): number {
  if (soldCount >= 20) return 1;
  if (soldCount >= 10) return 0.8;
  if (soldCount >= 5) return 0.6;
  if (soldCount >= 3) return 0.45;
  return 0;
}

function learnedReliability(
  learned: LearnedData,
  category: SellCheckCategory,
  similarData?: SellCheckSimilarData
): number {
  return learnedReliabilityBySoldCount(resolveSoldCount(learned, category, similarData));
}

function learnedPriceScore(
  price: number,
  learned: LearnedData,
  category: SellCheckCategory,
  similarData?: SellCheckSimilarData
): number {
  const avg = resolveAverageSoldPrice(learned, category, similarData);
  const soldCount = resolveSoldCount(learned, category, similarData);

  if (!avg || avg <= 0 || soldCount < 3) return 55;

  const diffRate = Math.abs(price - avg) / avg;

  if (diffRate <= 0.1) return 88;
  if (diffRate <= 0.2) return 78;
  if (diffRate <= 0.35) return 62;
  if (diffRate <= 0.5) return 48;

  return 34;
}

function suggestedPriceRange(
  priceInput: number,
  learned: LearnedData,
  category: SellCheckCategory,
  similarData?: SellCheckSimilarData
): { min: number; max: number } {
  const price = fallbackPrice(priceInput);

  const reliability = learnedReliability(learned, category, similarData);
  const medianSoldPrice = resolveMedianSoldPrice(learned, category, similarData);
  const averageSoldPrice = resolveAverageSoldPrice(learned, category, similarData);

  const base =
    reliability > 0
      ? medianSoldPrice ?? averageSoldPrice ?? price
      : price;

  const minRate = reliability >= 0.6 ? 0.9 : 0.86;
  const maxRate = reliability >= 0.6 ? 1.08 : 1.1;

  const min = Math.max(300, Math.round(base * minRate));
  const max = Math.max(min + 100, Math.round(base * maxRate));

  return { min, max };
}

function pricePositionReason(price: number, min: number, max: number): string {
  if (price < min) {
    return "入力価格は推奨価格帯より低めです。早く売れる可能性はありますが、利益を取り切れていない可能性があります";
  }

  if (price > max) {
    return "入力価格は推奨価格帯より高めです。閲覧は取れても購入判断で止まる可能性があります";
  }

  return "入力価格は推奨価格帯に近いです";
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

  const similarLogs = getSimilarLogs({
    logs: args.learned.logs,
    category: args.category,
    condition: args.condition,
    textAnalysis: args.textAnalysis,
    imageAnalysis: args.imageAnalysis,
  });

  const similarData = buildSimilarData(similarLogs);

  const soldCount = resolveSoldCount(args.learned, args.category, similarData);
  const averageSoldPrice = resolveAverageSoldPrice(args.learned, args.category, similarData);
  const medianSoldPrice = resolveMedianSoldPrice(args.learned, args.category, similarData);

  const priceScore = priceBaseScore(price);
  const stateScore = conditionScore(args.condition);
  const photoScore = imageScore(args.imageMeta, args.imageAnalysis);
  const descriptionScore = textScore(args.textAnalysis);
  const learnedScore = learnedPriceScore(price, args.learned, args.category, similarData);
  const reliability = learnedReliability(args.learned, args.category, similarData);

  const score = clampScore(
    priceScore * 0.28 +
      stateScore * 0.18 +
      photoScore * 0.2 +
      descriptionScore * 0.14 +
      learnedScore * 0.2
  );

  const rank = rankFromScore(score);
  const range = suggestedPriceRange(price, args.learned, args.category, similarData);

  const improvements: string[] = [];
  const reasons: string[] = [];

  if (!args.imageMeta.hasImage) {
    pushUnique(improvements, "診断対象の画像をアップロードしてください");
    pushUnique(reasons, "画像がないため、写真の売れやすさを評価できません");
  } else {
    pushUnique(
      reasons,
      `画像「${args.imageMeta.fileName || "uploaded-image"}」を診断対象として扱っています`
    );
  }

  if (args.imageAnalysis) {
    pushUnique(
      reasons,
      `画像評価は ${args.imageAnalysis.overallImageScore}/100 として反映しています`
    );

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
  } else {
    if (args.imageMeta.hasImage && args.imageMeta.fileSize < 80_000) {
      pushUnique(improvements, "画像が小さい可能性があるため、明るく大きい写真に差し替える");
      pushUnique(reasons, "画像サイズが小さく、細部確認に弱い可能性があります");
    }

    if (args.imageMeta.hasImage && args.imageMeta.fileSize > 8_000_000) {
      pushUnique(improvements, "画像容量が大きすぎる場合は、表示速度を考えて軽量化する");
      pushUnique(
        reasons,
        "画像情報量はありますが、容量が大きいと表示やアップロードで不利になる場合があります"
      );
    }
  }

  if (args.textAnalysis) {
    if (args.textAnalysis.brandName) {
      pushUnique(reasons, `ブランド名「${args.textAnalysis.brandName}」を類似判定に使っています`);
    }

    if (args.textAnalysis.modelName) {
      pushUnique(reasons, `型番・モデル名「${args.textAnalysis.modelName}」を類似判定に使っています`);
    }

    if (args.textAnalysis.material) {
      pushUnique(reasons, `素材「${args.textAnalysis.material}」を類似判定に使っています`);
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

  if (price < range.min || price > range.max) {
    pushUnique(
      improvements,
      `価格を ${range.min.toLocaleString()}〜${range.max.toLocaleString()}円 に寄せる`
    );
  }

  pushUnique(reasons, pricePositionReason(price, range.min, range.max));

  if (args.condition === "fair") {
    pushUnique(improvements, "傷・使用感が伝わる写真を追加する");
    pushUnique(reasons, "使用感ありの商品は、購入前の不安を写真で減らす必要があります");
  }

  if (args.condition === "poor") {
    pushUnique(improvements, "状態の悪い箇所を隠さず、説明文と写真で明確にする");
    pushUnique(improvements, "価格をやや低めに設定し、納得感を優先する");
    pushUnique(reasons, "状態が悪い商品は、価格よりも不安解消の情報量が重要です");
  }

  if (args.condition === "excellent" || args.condition === "good") {
    pushUnique(
      reasons,
      `${conditionLabel(args.condition)}として扱えるため、状態面の大きな減点はありません`
    );
  }

  if (similarData.similarSoldCount >= 2) {
    pushUnique(
      reasons,
      `類似売却データ ${similarData.similarSoldCount}件を価格判断に優先反映しています`
    );
  }

  if (soldCount >= 3 && averageSoldPrice) {
    pushUnique(reasons, `同カテゴリの売却実績 ${soldCount}件を価格判断に反映しています`);

    if (medianSoldPrice) {
      pushUnique(
        reasons,
        `実売価格の中央値 ${medianSoldPrice.toLocaleString()}円 を推奨価格帯の基準にしています`
      );
    }

    if (reliability < 0.6) {
      pushUnique(
        reasons,
        "ただし売却実績数がまだ少ないため、学習データの影響は控えめにしています"
      );
    }
  } else {
    pushUnique(
      reasons,
      "同カテゴリの売却実績がまだ少ないため、価格・状態・画像・説明文の基本ルールを中心に判断しています"
    );
  }

  if (score < 52) {
    pushUnique(improvements, "出品前に価格・写真・状態説明を見直す");
  }

  if (score >= 68 && improvements.length === 0) {
    pushUnique(improvements, "このまま出品して問題ありません");
  }

  if (improvements.length === 0) {
    pushUnique(improvements, "価格と写真を確認したうえで出品してください");
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
    targetSummary: `${categoryLabel(args.category)} / ${conditionLabel(
      args.condition
    )} / ${price.toLocaleString()}円`,
    imageAnalysis: args.imageAnalysis,
    textAnalysis: args.textAnalysis,
    similarData,
  };
}