import type {
  SellCheckResearchGuide,
  SellCheckSimilarData,
  SellCheckTextAnalysis,
} from "@/lib/types/sellCheck";

function uniq(list: Array<string | undefined | null>): string[] {
  return list
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .filter((x, i, arr) => arr.indexOf(x) === i)
    .slice(0, 12);
}

export function buildResearchGuide(args: {
  textAnalysis?: SellCheckTextAnalysis;
  similarData?: SellCheckSimilarData;
}): SellCheckResearchGuide {
  const text = args.textAnalysis;
  const similar = args.similarData;

  const coreWords = uniq([
    text?.characterName,
    text?.seriesName,
    text?.maker,
    text?.brandName,
    text?.modelName,
    text?.productType,
    text?.era,
    text?.materialType,
    ...(text?.extractedKeywords ?? []),
  ]);

  const searchKeywords = uniq(coreWords);

  const searchQueries = uniq([
    [text?.characterName, text?.productType, "売却済み"].filter(Boolean).join(" "),
    [text?.maker, text?.productType, "相場"].filter(Boolean).join(" "),
    [text?.seriesName, text?.modelName, "メルカリ 売却済み"].filter(Boolean).join(" "),
    [text?.materialType, text?.era, text?.productType, "ヤフオク 落札"].filter(Boolean).join(" "),
  ]);

  const requiredDataToImprove: string[] = [];

  if (!text?.characterName && !text?.seriesName) {
    requiredDataToImprove.push("作品名・キャラクター名を確認してください");
  }

  if (!text?.maker && !text?.brandName) {
    requiredDataToImprove.push("メーカー名・ブランド名を確認してください");
  }

  if (!text?.productType) {
    requiredDataToImprove.push("商品種別を確認してください");
  }

  if (!text?.materialType && !text?.material) {
    requiredDataToImprove.push("素材を確認してください");
  }

  if (!text?.era) {
    requiredDataToImprove.push("年代・当時物かどうかを確認してください");
  }

  if (!similar || similar.similarSoldCount < 3) {
    requiredDataToImprove.push("売却済みの近い商品を最低3件集めてください");
  }

  if (!similar || similar.similarActiveCount < 1) {
    requiredDataToImprove.push("販売中の競合商品を1〜3件確認してください");
  }

  const nextActions = uniq([
    "売却済み価格を優先して検索する",
    "販売中の高値だけで判断しない",
    "同じ作品名・メーカー・商品種別で比較する",
    "箱付き・欠品あり・動作確認済みなど状態差を分けて見る",
  ]);

  const precisionTips = uniq([
    "商品名だけでなく、メーカー名と商品種別を組み合わせて検索すると精度が上がります",
    "同じキャラクターでも素材や年代が違うと価格帯が変わります",
    "販売中価格は希望価格のため、売却済み価格より弱い根拠として扱ってください",
    "送料が大きい商品は、売値ではなく実利益で判断してください",
  ]);

  return {
    searchKeywords,
    searchQueries,
    requiredDataToImprove: uniq(requiredDataToImprove),
    nextActions,
    precisionTips,
  };
}