//lib/sellCheck/rotationLearning.ts
import type {
  SellCheckLog,
  SellCheckRotationLearningAnalysis,
  SellCheckSimilarData,
} from "@/lib/types/sellCheck";

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

export function buildRotationLearningAnalysis(args: {
  similarData: SellCheckSimilarData;
  logs?: SellCheckLog[];
}): SellCheckRotationLearningAnalysis {
  const { similarData, logs } = args;

  const reasons: string[] = [];
  const nextLearningData: string[] = [];

  const soldCount = similarData.similarSoldCount;
  const activeCount = similarData.similarActiveCount;
  const pressure = similarData.marketPressure;

  const usableLogs = Array.isArray(logs) ? logs : [];

  const viewValues = usableLogs
    .map((log) => safeNumber(log.views))
    .filter((n): n is number => typeof n === "number");

  const likeValues = usableLogs
    .map((log) => safeNumber(log.likes))
    .filter((n): n is number => typeof n === "number");

  const averageViews =
    viewValues.length > 0
      ? Math.round(viewValues.reduce((sum, n) => sum + n, 0) / viewValues.length)
      : undefined;

  const averageLikes =
    likeValues.length > 0
      ? Math.round(likeValues.reduce((sum, n) => sum + n, 0) / likeValues.length)
      : undefined;

  let rotationLevel: "fast" | "normal" | "slow" | "unknown" = "unknown";

  if (soldCount >= 5 && pressure !== "high") {
    rotationLevel = "fast";
    reasons.push("売却済みデータが一定数あり、回転しやすい市場として扱います");
  } else if (soldCount >= 3) {
    rotationLevel = "normal";
    reasons.push("売却済みデータが最低限あり、通常回転市場として扱います");
  } else if (soldCount >= 1 || activeCount <= 2) {
    rotationLevel = "slow";
    reasons.push("売却済みデータが少なく、低回転市場として扱います");
  }

  if (pressure === "high") {
    rotationLevel = rotationLevel === "fast" ? "normal" : "slow";
    reasons.push("販売中在庫が多いため、売却速度は安全側に補正します");
  }

  let viewLikeSignal = "閲覧数・いいね情報が不足しています。";

  if (averageViews !== undefined || averageLikes !== undefined) {
    viewLikeSignal = `平均閲覧数 ${averageViews ?? 0}、平均いいね ${averageLikes ?? 0} を参考にします。`;
    reasons.push("閲覧数・いいね情報を回転判断の補助材料として扱います");
  }

  if (viewValues.length < 5) {
    nextLearningData.push("閲覧数を最低5件分記録してください");
  }

  if (likeValues.length < 5) {
    nextLearningData.push("いいね数を最低5件分記録してください");
  }

  nextLearningData.push("出品日と売却日を記録してください");
  nextLearningData.push("価格変更回数を記録してください");
  nextLearningData.push("売れなかった商品の停止理由を記録してください");

  const rotationLabel =
    rotationLevel === "fast"
      ? "回転学習：早い"
      : rotationLevel === "normal"
      ? "回転学習：通常"
      : rotationLevel === "slow"
      ? "回転学習：遅い"
      : "回転学習：不明";

  const expectedDaysToSellLabel =
    rotationLevel === "fast"
      ? "目安：1〜14日"
      : rotationLevel === "normal"
      ? "目安：2〜6週間"
      : rotationLevel === "slow"
      ? "目安：1〜3か月以上"
      : "目安：追加データ待ち";

  const learningReliability =
    soldCount >= 5 && viewValues.length >= 5
      ? "high"
      : soldCount >= 2 || viewValues.length >= 3
      ? "medium"
      : "low";

  if (reasons.length === 0) {
    reasons.push("回転判断に使える売却済み・閲覧・いいねデータが不足しています");
  }

  return {
    rotationLevel,
    rotationLabel,
    expectedDaysToSellLabel,
    learningReliability,
    viewLikeSignal,
    nextLearningData: nextLearningData.filter((x, i, arr) => arr.indexOf(x) === i),
    reasons: reasons.filter((x, i, arr) => arr.indexOf(x) === i),
  };
}