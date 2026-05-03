// /lib/types/sellCheck.ts

export type SellCheckCondition = "excellent" | "good" | "fair" | "poor";

export type SellCheckCategory =
  | "interior"
  | "fashion"
  | "hobby"
  | "kids"
  | "electronics"
  | "other";

export type SellCheckImageMeta = {
  hasImage: boolean;
  fileName: string;
  fileSize: number;
};

export type SellCheckImageAnalysis = {
  brightnessScore: number;
  compositionScore: number;
  backgroundScore: number;
  damageRiskScore: number;
  overallImageScore: number;
  imageReasons: string[];
};

export type SellCheckMarketAnalysis = {
  rarityScore: number;
  demandScore: number;
  brandPowerScore: number;
  collectorScore: number;
  ageValueScore: number;
  trendScore: number;
  marketSupplyScore: number;
  keywordStrength: number;
  rareReasons: string[];

  // 市場データが十分でない場合でも、商品名・説明文・画像・キーワードから近似判定したかどうか
  estimatedByTheory: boolean;

  // 実際の類似売却データをどれくらい使えたか
  dataConfidence: "low" | "medium" | "high";
};

export type SellCheckTextAnalysis = {
  brandName: string;
  modelName: string;
  material: string;
  extractedKeywords: string[];
  conditionRiskScore: number;
  descriptionQualityScore: number;
  textReasons: string[];

  rarityScore?: number;
  demandScore?: number;
  brandPowerScore?: number;
  collectorScore?: number;
  ageValueScore?: number;
  trendScore?: number;
  marketSupplyScore?: number;
  keywordStrength?: number;
  rareReasons?: string[];
};

export type SellCheckSimilarData = {
  similarCount: number;
  similarSoldCount: number;
  averageSoldPrice?: number;
  medianSoldPrice?: number;
  minSoldPrice?: number;
  maxSoldPrice?: number;
  premiumPrice?: number;
  matchLevel: "weak" | "category" | "keyword" | "brand" | "model" | "rare";
};

export type SellCheckResult = {
  score: number;
  rank: "A" | "B" | "C" | "D";
  action: string;
  suggestedPriceMin: number;
  suggestedPriceMax: number;
  improvements: string[];
  reasons: string[];
  learnedSampleCount: number;
  targetSummary: string;

  imageAnalysis?: SellCheckImageAnalysis;
  textAnalysis?: SellCheckTextAnalysis;
  marketAnalysis?: SellCheckMarketAnalysis;
  similarData?: SellCheckSimilarData;
};

export type SellCheckLog = {
  id?: string;

  price: number;
  category: SellCheckCategory;
  condition: SellCheckCondition;

  title?: string;
  brandName?: string;
  modelName?: string;
  material?: string;
  extractedKeywords?: string[];

  sold: boolean;
  soldPrice?: number;

  views?: number;
  likes?: number;
  score?: number;

  conditionRiskScore?: number;
  descriptionQualityScore?: number;

  brightnessScore?: number;
  compositionScore?: number;
  backgroundScore?: number;
  damageRiskScore?: number;
  overallImageScore?: number;

  rarityScore?: number;
  demandScore?: number;
  brandPowerScore?: number;
  collectorScore?: number;
  ageValueScore?: number;
  trendScore?: number;
  marketSupplyScore?: number;
  keywordStrength?: number;
  rareReasons?: string[];

  createdAt?: number;

  hasImage: boolean;
  imageUrl?: string;
  imageFileName?: string;
  imageFileSize?: number;

  memo?: string;
  source?: "manual" | "draft" | "import";
};