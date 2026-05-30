import type { SellCheckProfitAnalysis } from "@/lib/types/sellCheck";

function safeNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

function clampRate(v: unknown, fallback = 0.1): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  if (n > 1) return n / 100;
  return n;
}

export function calculateProfitAnalysis(args: {
  expectedSalePrice: number;
  purchasePrice?: number;
  estimatedShippingCost?: number;
  estimatedPackagingCost?: number;
  platformFeeRate?: number;
}): SellCheckProfitAnalysis {
  const expectedSalePrice = safeNumber(args.expectedSalePrice, 0);
  const purchasePrice = safeNumber(args.purchasePrice, 0);
  const estimatedShippingCost = safeNumber(args.estimatedShippingCost, 0);
  const estimatedPackagingCost = safeNumber(args.estimatedPackagingCost, 0);
  const platformFeeRate = clampRate(args.platformFeeRate, 0.1);

  const estimatedPlatformFee = Math.round(expectedSalePrice * platformFeeRate);
  const estimatedGrossProfit = expectedSalePrice - purchasePrice;
  const estimatedNetProfit =
    expectedSalePrice -
    purchasePrice -
    estimatedPlatformFee -
    estimatedShippingCost -
    estimatedPackagingCost;

  const profitMarginRate =
    expectedSalePrice > 0
      ? Math.round((estimatedNetProfit / expectedSalePrice) * 100)
      : 0;

  const breakEvenPrice =
    purchasePrice + estimatedShippingCost + estimatedPackagingCost;

  const riskNotes: string[] = [];

  if (estimatedNetProfit <= 0) {
    riskNotes.push("手数料・送料・梱包費を引くと利益が残りません");
  }

  if (profitMarginRate < 20) {
    riskNotes.push("利益率が低く、値下げや送料増で赤字化しやすいです");
  }

  if (estimatedShippingCost >= expectedSalePrice * 0.25) {
    riskNotes.push("送料比率が高いため、仕入れ判断は慎重にしてください");
  }

  if (purchasePrice === 0) {
    riskNotes.push("無料仕入れ前提のため、回収手間と保管リスクも確認してください");
  }

  return {
    expectedSalePrice,
    purchasePrice,
    platformFeeRate,
    estimatedPlatformFee,
    estimatedShippingCost,
    estimatedPackagingCost,
    estimatedGrossProfit,
    estimatedNetProfit,
    profitMarginRate,
    breakEvenPrice,
    riskNotes,
  };
}