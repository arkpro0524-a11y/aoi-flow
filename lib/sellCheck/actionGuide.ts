import type {
  SellCheckActionGuide,
  SellCheckAcquisitionAnalysis,
  SellCheckDecisionMode,
  SellCheckProfitAnalysis,
  SellCheckResearchGuide,
  SellCheckSmallSampleAnalysis,
} from "@/lib/types/sellCheck";

function uniq(list: string[]): string[] {
  return list
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .filter((x, i, arr) => arr.indexOf(x) === i)
    .slice(0, 12);
}

export function buildActionGuide(args: {
  decisionMode: SellCheckDecisionMode;
  researchGuide?: SellCheckResearchGuide;
  profitAnalysis?: SellCheckProfitAnalysis;
  acquisitionAnalysis?: SellCheckAcquisitionAnalysis;
  smallSampleAnalysis?: SellCheckSmallSampleAnalysis;
}): SellCheckActionGuide {
  const todayActions: string[] = [];
  const avoidActions: string[] = [];
  const dataToRecord: string[] = [];
  const nextSearches: string[] = [];

  if (args.decisionMode === "statistical") {
    todayActions.push("類似売却データの中央値と入力価格の差を確認する");
  }

  if (args.decisionMode === "similar_inference") {
    todayActions.push("同じ作品名・メーカー・商品種別の売却済みを追加で確認する");
  }

  if (args.decisionMode === "structural_theory") {
    todayActions.push("まず売却済みデータを3件集めて、仮説判定を補強する");
  }

  if (args.acquisitionAnalysis) {
    todayActions.push(
      `${args.acquisitionAnalysis.safePurchasePrice.toLocaleString()}円以内なら安全寄りで検討する`
    );

    if (!args.acquisitionAnalysis.shouldBuy) {
      avoidActions.push("現条件では仕入れを急がない");
    }

    if (args.acquisitionAnalysis.shippingRiskLevel === "high") {
      avoidActions.push("送料が高い商品は無料仕入れでも慎重に扱う");
    }

    if (args.acquisitionAnalysis.rotationRiskLevel === "high") {
      avoidActions.push("低回転商品として、資金拘束を前提に判断する");
    }
  }

  if (args.profitAnalysis) {
    if (args.profitAnalysis.estimatedNetProfit <= 0) {
      avoidActions.push("実利益が残らないため、仕入れ価格か送料を下げる");
    }

    dataToRecord.push("実際の仕入れ価格");
    dataToRecord.push("実際の送料");
    dataToRecord.push("販売手数料");
    dataToRecord.push("最終売却価格");
  }

  if (args.smallSampleAnalysis?.nextDataToCollect?.length) {
    nextSearches.push(...args.smallSampleAnalysis.nextDataToCollect);
  }

  if (args.researchGuide?.searchQueries?.length) {
    nextSearches.push(...args.researchGuide.searchQueries);
  }

  dataToRecord.push("売れるまでの日数");
  dataToRecord.push("閲覧数");
  dataToRecord.push("いいね数");
  dataToRecord.push("赤字・売れ残り理由");

  return {
    todayActions: uniq(todayActions),
    avoidActions: uniq(avoidActions),
    dataToRecord: uniq(dataToRecord),
    nextSearches: uniq(nextSearches),
  };
}