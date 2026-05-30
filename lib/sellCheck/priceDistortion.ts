//lib/sellCheck/priceDistortion.ts
import type {
  SellCheckPriceDistortionAnalysis,
  SellCheckSimilarData,
} from "@/lib/types/sellCheck";

function formatYen(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "不明";
  return `${Math.round(n).toLocaleString()}円`;
}

export function buildPriceDistortionAnalysis(args: {
  similarData: SellCheckSimilarData;
  inputPrice: number;
}): SellCheckPriceDistortionAnalysis {
  const { similarData, inputPrice } = args;

  const warningReasons: string[] = [];

  const soldMedian = similarData.medianSoldPrice;
  const soldMin = similarData.minSoldPrice;
  const soldMax = similarData.maxSoldPrice;
  const activeMedian = similarData.medianActivePrice;

  let distortionLevel: "low" | "medium" | "high" = "low";
  let shouldTrustMedian = true;
  let shouldTrustActivePrice = false;

  if (similarData.similarSoldCount < 3) {
    distortionLevel = "medium";
    shouldTrustMedian = false;
    warningReasons.push("売却済みデータが3件未満のため、中央値の信頼性は限定的です");
  }

  if (soldMin && soldMax && soldMin > 0 && soldMax / soldMin >= 3) {
    distortionLevel = "high";
    shouldTrustMedian = false;
    warningReasons.push("売却済み価格の上下差が大きく、別商品・状態違いが混在している可能性があります");
  }

  if (soldMedian && inputPrice >= soldMedian * 2.5) {
    distortionLevel = "high";
    warningReasons.push("入力価格が売却中央値より大きく高いため、強気価格または比較対象違いの可能性があります");
  }

  if (soldMedian && inputPrice <= soldMedian * 0.35) {
    distortionLevel = "medium";
    warningReasons.push("入力価格が売却中央値より大きく低いため、状態不良・欠品・急ぎ売りの可能性があります");
  }

  if (activeMedian && soldMedian && activeMedian >= soldMedian * 1.8) {
    distortionLevel = "high";
    shouldTrustActivePrice = false;
    warningReasons.push("販売中価格が売却済み価格より高く、売れていない希望価格が混ざっている可能性があります");
  }

  if (similarData.marketPressure === "high") {
    distortionLevel = distortionLevel === "low" ? "medium" : distortionLevel;
    warningReasons.push("販売中在庫が多いため、高値出品は価格根拠として弱く扱います");
  }

  if (warningReasons.length === 0) {
    warningReasons.push("価格の大きな歪みは検出していません");
  }

  const distortionLabel =
    distortionLevel === "high"
      ? "価格歪み：高"
      : distortionLevel === "medium"
      ? "価格歪み：中"
      : "価格歪み：低";

  const priceReliabilityLabel =
    distortionLevel === "high"
      ? "価格根拠は弱いです"
      : distortionLevel === "medium"
      ? "参考価格として扱います"
      : "価格根拠として比較的使えます";

  const correctedPricePolicy =
    distortionLevel === "high"
      ? `売却中央値 ${formatYen(soldMedian)} をそのまま信じず、同一IP・同一商品種別・状態別に再検索してください。`
      : distortionLevel === "medium"
      ? `売却中央値 ${formatYen(soldMedian)} を参考にしつつ、追加データで補正してください。`
      : `売却中央値 ${formatYen(soldMedian)} を価格判断の主軸にできます。`;

  return {
    distortionLevel,
    distortionLabel,
    priceReliabilityLabel,
    shouldTrustMedian,
    shouldTrustActivePrice,
    correctedPricePolicy,
    warningReasons,
  };
}