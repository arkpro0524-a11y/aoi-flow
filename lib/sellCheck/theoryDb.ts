//lib/sellCheck/theoryDb.ts
import type {
  SellCheckTextAnalysis,
  SellCheckTheoryProfile,
} from "@/lib/types/sellCheck";
import { normalizeSearchText } from "@/lib/sellCheck/rules";

export type TheoryProfile = SellCheckTheoryProfile;

type TheoryPattern = {
  label: string;
  patterns: string[];
  score: number;
  reason: string;
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeWords(text?: SellCheckTextAnalysis): string[] {
  return [
    text?.brandName,
    text?.modelName,
    text?.material,
    text?.productType,
    text?.characterName,
    text?.seriesName,
    text?.maker,
    text?.era,
    text?.collectorGenre,
    text?.materialType,
    ...(text?.extractedKeywords ?? []),
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
}

function normalizedText(words: string[]): string {
  return normalizeSearchText(words.join(" "));
}

function hasAny(words: string[], patterns: string[]): boolean {
  const text = normalizedText(words);
  return patterns.some((p) => text.includes(normalizeSearchText(p)));
}

function scorePatterns(words: string[], patterns: TheoryPattern[]): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  patterns.forEach((item) => {
    if (hasAny(words, item.patterns)) {
      score += item.score;
      reasons.push(item.reason);
    }
  });

  return {
    score,
    reasons,
  };
}

const IP_PATTERNS: TheoryPattern[] = [
  {
    label: "ghibli",
    patterns: ["ジブリ", "となりのトトロ", "トトロ", "魔女の宅急便", "ラピュタ", "ナウシカ"],
    score: 28,
    reason: "ジブリ系IPを検出しました。中古市場で検索需要が残りやすい商品群です",
  },
  {
    label: "disney",
    patterns: ["ディズニー", "ミッキー", "ミニー", "ドナルド", "プーさん"],
    score: 24,
    reason: "ディズニー系IPを検出しました。幅広い認知があり、検索母数を作りやすい商品群です",
  },
  {
    label: "pokemon",
    patterns: ["ポケモン", "ピカチュウ", "任天堂", "Nintendo"],
    score: 26,
    reason: "ポケモン・任天堂系IPを検出しました。型番・世代・状態差で価格が動きやすい商品群です",
  },
  {
    label: "sanrio",
    patterns: ["サンリオ", "キティ", "ハローキティ", "マイメロ", "シナモロール"],
    score: 22,
    reason: "サンリオ系IPを検出しました。キャラクター指名検索が期待できます",
  },
  {
    label: "tokusatsu",
    patterns: ["ウルトラマン", "仮面ライダー", "ゴジラ", "怪獣", "円谷", "東映", "特撮"],
    score: 26,
    reason: "特撮・怪獣系IPを検出しました。コレクター市場で比較対象を作りやすい商品群です",
  },
];

const COLLECTOR_PATTERNS: TheoryPattern[] = [
  {
    label: "sofubi",
    patterns: ["ソフビ", "ブルマァク", "マルサン", "ポピー", "怪獣"],
    score: 30,
    reason: "ソフビ・怪獣系の収集文化を検出しました。少数データでも理論推定の価値があります",
  },
  {
    label: "tin",
    patterns: ["ブリキ", "ゼンマイ", "当時物", "昭和"],
    score: 26,
    reason: "ブリキ・ゼンマイ・昭和当時物の収集文化を検出しました",
  },
  {
    label: "music_box",
    patterns: ["オルゴール", "陶器", "置物", "からくり"],
    score: 16,
    reason: "オルゴール・置物系を検出しました。デザイン性と状態差で価格が分かれやすい商品群です",
  },
  {
    label: "mini_car",
    patterns: ["ミニカー", "トミカ", "ホットウィール", "チョロQ"],
    score: 24,
    reason: "ミニカー系の型番・シリーズ収集文化を検出しました",
  },
  {
    label: "card",
    patterns: ["カード", "トレカ", "ポケカ", "遊戯王"],
    score: 24,
    reason: "カード系の型番・状態ランク文化を検出しました",
  },
];

const BOX_PATTERNS: TheoryPattern[] = [
  {
    label: "box",
    patterns: ["箱付き", "外箱", "元箱", "箱あり"],
    score: 28,
    reason: "箱付き文化を検出しました。箱の有無で価格差が出やすい商品です",
  },
  {
    label: "manual",
    patterns: ["説明書", "保証書", "付属品", "タグ付き"],
    score: 18,
    reason: "説明書・付属品・タグの価値が出やすい商品です",
  },
  {
    label: "sealed",
    patterns: ["未開封", "デッドストック", "新品未使用"],
    score: 28,
    reason: "未開封・デッドストック要素を検出しました。状態プレミアが乗る可能性があります",
  },
];

const SMALL_SHIPPING_PATTERNS = [
  "カード",
  "ミニカー",
  "ソフビ",
  "フィギュア",
  "ブリキ",
  "オルゴール",
  "小物",
  "雑貨",
  "置物",
  "ぬいぐるみ",
];

const LARGE_RISK_PATTERNS = [
  "家具",
  "椅子",
  "机",
  "ソファ",
  "大型",
  "重量",
  "家電",
  "ガラスケース",
  "照明",
];

export function buildTheoryProfile(text?: SellCheckTextAnalysis): TheoryProfile {
  const words = normalizeWords(text);
  const reasons: string[] = [];

  const hasIp = Boolean(text?.characterName || text?.seriesName);
  const hasMaker = Boolean(text?.maker || text?.brandName);
  const hasModel = Boolean(text?.modelName);
  const hasProductType = Boolean(text?.productType);
  const hasEra = Boolean(text?.era);
  const hasMaterial = Boolean(text?.material || text?.materialType);

  const ip = scorePatterns(words, IP_PATTERNS);
  const collector = scorePatterns(words, COLLECTOR_PATTERNS);
  const box = scorePatterns(words, BOX_PATTERNS);

  const hasSmallItem = hasAny(words, SMALL_SHIPPING_PATTERNS);
  const hasLargeRisk = hasAny(words, LARGE_RISK_PATTERNS);

  const ipStrengthScore = clamp(
    28 +
      ip.score +
      (hasIp ? 16 : 0) +
      (hasMaker ? 8 : 0) +
      (hasModel ? 8 : 0)
  );

  const collectorCultureScore = clamp(
    24 +
      collector.score +
      box.score * 0.25 +
      (hasIp ? 8 : 0) +
      (hasEra ? 8 : 0)
  );

  const boxCultureScore = clamp(
    25 +
      box.score +
      (collector.score >= 24 ? 10 : 0)
  );

  const shippingSuitabilityScore = clamp(
    55 +
      (hasSmallItem ? 25 : 0) +
      (collector.score >= 20 ? 8 : 0) -
      (hasLargeRisk ? 38 : 0)
  );

  const rotationRiskScore = clamp(
    42 +
      (collectorCultureScore >= 72 ? 18 : 0) +
      (boxCultureScore >= 70 ? 8 : 0) +
      (hasLargeRisk ? 20 : 0) -
      (ipStrengthScore >= 75 ? 8 : 0)
  );

  const searchSpecificityScore = clamp(
    28 +
      (hasIp ? 18 : 0) +
      (hasMaker ? 14 : 0) +
      (hasModel ? 22 : 0) +
      (hasProductType ? 12 : 0) +
      (hasEra ? 8 : 0) +
      (hasMaterial ? 6 : 0)
  );

  ip.reasons.forEach((reason) => reasons.push(reason));
  collector.reasons.forEach((reason) => reasons.push(reason));
  box.reasons.forEach((reason) => reasons.push(reason));

  if (hasIp) reasons.push("作品名・キャラクターがあるため、検索対象を絞りやすいです");
  if (hasMaker) reasons.push("メーカー・ブランド情報があるため、類似比較の軸になります");
  if (hasModel) reasons.push("型番・モデル情報があるため、同一商品比較に近づけます");
  if (hasProductType) reasons.push("商品種別があるため、別ジャンル混入を抑えやすいです");
  if (hasEra) reasons.push("年代情報があるため、当時物・復刻品の切り分けに使えます");
  if (hasMaterial) reasons.push("素材情報があるため、価格差の説明材料になります");
  if (hasSmallItem) reasons.push("小型発送に向きやすい商品群です");
  if (hasLargeRisk) reasons.push("大型・送料リスクの可能性があります");

  if (reasons.length === 0) {
    reasons.push("理論DBで強い特徴を検出できませんでした。作品名・メーカー・商品種別・年代・素材の追加が必要です");
  }

  return {
    ipStrengthScore,
    collectorCultureScore,
    boxCultureScore,
    shippingSuitabilityScore,
    rotationRiskScore,
    searchSpecificityScore,
    theoryReasons: reasons.filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 12),
  };
}