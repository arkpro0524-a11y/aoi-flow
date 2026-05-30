//lib/sellCheck/marketStructure.ts
import type {
  SellCheckMarketStructureAnalysis,
  SellCheckMarketStructureType,
  SellCheckSimilarData,
  SellCheckTextAnalysis,
  SellCheckTheoryProfile,
} from "@/lib/types/sellCheck";

function pushUnique(list: string[], text: string) {
  const s = String(text || "").trim();
  if (!s) return;
  if (list.includes(s)) return;
  list.push(s);
}

function hasText(text?: SellCheckTextAnalysis): boolean {
  if (!text) return false;

return Boolean(
  text.characterName ||
    text.seriesName ||
    text.maker ||
    text.brandName ||
    text.modelName ||
    text.productType ||
    text.era ||
    text.materialType ||
    text.material ||
    text.collectorGenre ||
    (Array.isArray(text.extractedKeywords) &&
      text.extractedKeywords.length > 0)
);}

function labelFromType(type: SellCheckMarketStructureType): string {
  if (type === "fast_rotation_general") return "一般回転市場";
  if (type === "low_rotation_collector") return "低回転コレクター市場";
  if (type === "ip_collectible") return "IPコレクター市場";
  if (type === "box_condition_sensitive") return "箱・状態差が強い市場";
  if (type === "shipping_risk_market") return "送料リスク市場";
  return "市場構造不明";
}

export function buildMarketStructureAnalysis(args: {
  textAnalysis?: SellCheckTextAnalysis;
  similarData: SellCheckSimilarData;
  theoryProfile: SellCheckTheoryProfile;
}): SellCheckMarketStructureAnalysis {
  const { textAnalysis, similarData, theoryProfile } = args;

  const reasons: string[] = [];

  const soldCount = similarData.similarSoldCount;
  const activeCount = similarData.similarActiveCount;
  const pressure = similarData.marketPressure;

  const hasProductInfo = hasText(textAnalysis);

  const isIpStrong = theoryProfile.ipStrengthScore >= 70;
  const isCollectorStrong = theoryProfile.collectorCultureScore >= 70;
  const isBoxSensitive = theoryProfile.boxCultureScore >= 70;
  const isShippingGood = theoryProfile.shippingSuitabilityScore >= 70;
  const isShippingRisk = theoryProfile.shippingSuitabilityScore <= 45;
  const isRotationRisk = theoryProfile.rotationRiskScore >= 65;

  let structureType: SellCheckMarketStructureType = "unknown_structure";

  if (isShippingRisk) {
    structureType = "shipping_risk_market";
  } else if (isIpStrong && isCollectorStrong) {
    structureType = "ip_collectible";
  } else if (isBoxSensitive) {
    structureType = "box_condition_sensitive";
  } else if (isCollectorStrong || isRotationRisk || (soldCount <= 2 && activeCount <= 2)) {
    structureType = "low_rotation_collector";
  } else if (soldCount >= 5 && pressure !== "high") {
    structureType = "fast_rotation_general";
  }

  if (!hasProductInfo) {
    pushUnique(reasons, "商品情報が少ないため、市場構造は仮判定です");
  }

  if (soldCount < 3) {
    pushUnique(
      reasons,
      "売却済みデータが3件未満のため、価格は確定ではなく仮説として扱います"
    );
  }

  if (activeCount > soldCount * 2 && activeCount >= 3) {
    pushUnique(reasons, "販売中在庫が売却済みより多く、在庫圧があります");
  }

  if (isIpStrong) {
    pushUnique(reasons, "IP・作品名・キャラクター要素が強く、指名検索される可能性があります");
  }

  if (isCollectorStrong) {
    pushUnique(reasons, "コレクター文化があるため、少数データでも価値が残る可能性があります");
  }

  if (isBoxSensitive) {
    pushUnique(reasons, "箱・付属品・未開封などで価格差が出やすい市場です");
  }

  if (isShippingGood) {
    pushUnique(reasons, "小型発送に向きやすく、送料負担が利益を壊しにくい商品群です");
  }

  if (isShippingRisk) {
    pushUnique(reasons, "大型・重量・破損リスクにより、送料と梱包で利益が削られやすい市場です");
  }

  theoryProfile.theoryReasons.forEach((reason) => {
    pushUnique(reasons, reason);
  });

  let rotationExplanation = "市場回転は不明です。追加データで確認してください。";
  let priceJudgementPolicy = "価格は参考値として扱い、売却済みデータを追加してください。";
  let dataRequirementPolicy = "売却済み3件、販売中1〜3件を追加してください。";
  let riskLevel: "low" | "medium" | "high" = "medium";

  if (structureType === "fast_rotation_general") {
    rotationExplanation =
      "売却済みデータが一定数あり、通常の中古相場として比較しやすい市場です。";
    priceJudgementPolicy =
      "売却中央値を主軸にし、販売中価格は上限確認として扱います。";
    dataRequirementPolicy =
      "同一商品または近い商品をあと1〜2件追加すると価格精度が上がります。";
    riskLevel = pressure === "high" ? "medium" : "low";
  }

  if (structureType === "low_rotation_collector") {
    rotationExplanation =
      "売却数が少ないこと自体が異常とは限らない、低回転のコレクター市場です。";
    priceJudgementPolicy =
      "即売狙いなら低め、価値待ちならレンジ上限寄り。ただし資金拘束リスクを見ます。";
    dataRequirementPolicy =
      "同じ作品名・メーカー・商品種別の売却済みを最低3件集めてください。";
    riskLevel = "medium";
  }

  if (structureType === "ip_collectible") {
    rotationExplanation =
      "IP・キャラクター・作品名によって指名検索が発生しやすい市場です。";
    priceJudgementPolicy =
      "カテゴリ平均ではなく、IP名・作品名・商品種別を合わせた比較を優先します。";
    dataRequirementPolicy =
      "IP名＋商品種別＋売却済み、IP名＋メーカー＋売却済みで追加検索してください。";
    riskLevel = soldCount >= 3 ? "medium" : "high";
  }

  if (structureType === "box_condition_sensitive") {
    rotationExplanation =
      "箱・付属品・未開封・状態差で価格が大きく変わる市場です。";
    priceJudgementPolicy =
      "箱あり/箱なし、未開封/開封済み、欠品あり/完品を分けて価格を見ます。";
    dataRequirementPolicy =
      "箱あり・箱なしの売却済みを分けて最低各1件確認してください。";
    riskLevel = "medium";
  }

  if (structureType === "shipping_risk_market") {
    rotationExplanation =
      "売れるか以前に、送料・梱包・破損対応が利益を壊しやすい市場です。";
    priceJudgementPolicy =
      "売値ではなく、送料・梱包費・手数料後の実利益を優先します。";
    dataRequirementPolicy =
      "サイズ、重量、配送方法、破損リスクを先に確認してください。";
    riskLevel = "high";
  }

  return {
    structureType,
    structureLabel: labelFromType(structureType),
    rotationExplanation,
    priceJudgementPolicy,
    dataRequirementPolicy,
    riskLevel,
    reasons,
  };
}