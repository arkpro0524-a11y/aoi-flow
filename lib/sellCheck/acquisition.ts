import type {
  SellCheckAcquisitionAnalysis,
  SellCheckMarketAnalysis,
  SellCheckProfitAnalysis,
  SellCheckSimilarData,
} from "@/lib/types/sellCheck";

function level(score: number): "low" | "medium" | "high" {
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function calculateAcquisitionAnalysis(args: {
  suggestedPriceMin: number;
  suggestedPriceMax: number;
  profitAnalysis: SellCheckProfitAnalysis;
  marketAnalysis?: SellCheckMarketAnalysis;
  similarData?: SellCheckSimilarData;
}): SellCheckAcquisitionAnalysis {
  const expected = Math.max(300, Math.round(args.suggestedPriceMin || 0));
  const market = args.marketAnalysis;
  const similar = args.similarData;
  const profit = args.profitAnalysis;

  const safePurchasePrice = Math.max(
    0,
    Math.round(expected * 0.28 - profit.estimatedShippingCost - profit.estimatedPackagingCost)
  );

  const aggressivePurchasePrice = Math.max(
    safePurchasePrice,
    Math.round(expected * 0.42 - profit.estimatedShippingCost - profit.estimatedPackagingCost)
  );

  const maxPurchasePrice = Math.max(
    aggressivePurchasePrice,
    Math.round(expected * 0.5 - profit.estimatedShippingCost - profit.estimatedPackagingCost)
  );

  const shippingRiskLevel =
    profit.estimatedShippingCost >= expected * 0.3
      ? "high"
      : profit.estimatedShippingCost >= expected * 0.15
      ? "medium"
      : "low";

  const rotationRiskLevel = level(market?.trendScore ?? 50);

  const acquisitionRiskLevel =
    profit.estimatedNetProfit <= 0 || shippingRiskLevel === "high"
      ? "high"
      : profit.profitMarginRate < 25 || similar?.marketPressure === "high"
      ? "medium"
      : "low";

  const shouldBuy =
    profit.estimatedNetProfit > 0 &&
    profit.purchasePrice <= maxPurchasePrice &&
    acquisitionRiskLevel !== "high";

  const reasons: string[] = [];

  reasons.push(`安全仕入れ目安は ${safePurchasePrice.toLocaleString()}円 以内です`);
  reasons.push(`攻める場合でも ${aggressivePurchasePrice.toLocaleString()}円 前後までが目安です`);
  reasons.push(`上限は ${maxPurchasePrice.toLocaleString()}円 です`);

  if (similar?.marketPressure === "high") {
    reasons.push("販売中の類似在庫が多いため、仕入れ価格は抑えるべきです");
  }

  if (market?.collectorScore && market.collectorScore >= 70) {
    reasons.push("コレクター性があるため、即売より待ち販売の可能性があります");
  }

  if (shippingRiskLevel === "high") {
    reasons.push("送料負担が大きく、利益を圧迫する可能性があります");
  }

  if (profit.estimatedNetProfit <= 0) {
    reasons.push("想定条件では実利益が残りません");
  }

  return {
    maxPurchasePrice,
    safePurchasePrice,
    aggressivePurchasePrice,
    shouldBuy,
    buyDecisionLabel: shouldBuy ? "仕入れ候補" : "仕入れ慎重",
    acquisitionRiskLevel,
    shippingRiskLevel,
    rotationRiskLevel,
    reasons,
  };
}