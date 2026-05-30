// /lib/types/sellCheck.ts

export type SellCheckCondition = "excellent" | "good" | "fair" | "poor";

export type SellCheckCategory =
  | "interior"
  | "fashion"
  | "hobby"
  | "kids"
  | "electronics"
  | "other";

export type SellCheckSource =
  | "manual"
  | "draft"
  | "import"
  | "mercari"
  | "yahoo_shopping"
  | "yahoo_auction"
  | "jmty"
  | "other";

export type SellCheckListingStatus = "sold" | "active" | "unknown";

export type SellCheckRank = "A" | "B" | "C" | "D";

export type SellCheckSellSpeed =
  | "fast"
  | "normal"
  | "slow"
  | "collector_wait"
  | "unknown";

export type SellCheckConfidenceLevel = "high" | "medium" | "low";

export type SellCheckMarketType =
  | "normal"
  | "collector"
  | "low_rotation"
  | "competitive"
  | "unknown";

export type SellCheckDecisionMode =
  | "statistical"
  | "similar_inference"
  | "structural_theory";

export type SellCheckResearchGuide = {
  searchKeywords: string[];
  searchQueries: string[];
  requiredDataToImprove: string[];
  nextActions: string[];
  precisionTips: string[];
};

export type SellCheckProfitAnalysis = {
  expectedSalePrice: number;
  purchasePrice: number;
  platformFeeRate: number;
  estimatedPlatformFee: number;
  estimatedShippingCost: number;
  estimatedPackagingCost: number;
  estimatedGrossProfit: number;
  estimatedNetProfit: number;
  profitMarginRate: number;
  breakEvenPrice: number;
  riskNotes: string[];
};

export type SellCheckAcquisitionAnalysis = {
  maxPurchasePrice: number;
  safePurchasePrice: number;
  aggressivePurchasePrice: number;
  shouldBuy: boolean;
  buyDecisionLabel: string;
  acquisitionRiskLevel: "low" | "medium" | "high";
  shippingRiskLevel: "low" | "medium" | "high";
  rotationRiskLevel: "low" | "medium" | "high";
  reasons: string[];
};

export type SellCheckActionGuide = {
  todayActions: string[];
  avoidActions: string[];
  dataToRecord: string[];
  nextSearches: string[];
};

export type SellCheckTheoryProfile = {
  ipStrengthScore: number;
  collectorCultureScore: number;
  boxCultureScore: number;
  shippingSuitabilityScore: number;
  rotationRiskScore: number;
  searchSpecificityScore: number;
  theoryReasons: string[];
};

export type SellCheckMarketStructureType =
  | "fast_rotation_general"
  | "low_rotation_collector"
  | "ip_collectible"
  | "box_condition_sensitive"
  | "shipping_risk_market"
  | "unknown_structure";

export type SellCheckMarketStructureAnalysis = {
  structureType: SellCheckMarketStructureType;
  structureLabel: string;
  rotationExplanation: string;
  priceJudgementPolicy: string;
  dataRequirementPolicy: string;
  riskLevel: "low" | "medium" | "high";
  reasons: string[];
};

export type SellCheckPriceDistortionAnalysis = {
  distortionLevel: "low" | "medium" | "high";
  distortionLabel: string;
  priceReliabilityLabel: string;
  shouldTrustMedian: boolean;
  shouldTrustActivePrice: boolean;
  correctedPricePolicy: string;
  warningReasons: string[];
};

export type SellCheckRotationLearningAnalysis = {
  rotationLevel: "fast" | "normal" | "slow" | "unknown";
  rotationLabel: string;
  expectedDaysToSellLabel: string;
  learningReliability: "low" | "medium" | "high";
  viewLikeSignal: string;
  nextLearningData: string[];
  reasons: string[];
};

export type SellCheckOutcomeStatus =
  | "watching"
  | "purchased"
  | "listed"
  | "sold"
  | "unsold"
  | "stopped";

export type SellCheckOutcomePlatform =
  | "mercari"
  | "yahoo_auction"
  | "jmty"
  | "rakuma"
  | "other";

export type SellCheckOutcomeLog = {
  id?: string;
  uid: string;

  title: string;
  status: SellCheckOutcomeStatus;
  platform: SellCheckOutcomePlatform;

  purchasePrice: number;
  listedPrice: number;
  soldPrice: number;

  shippingCost: number;
  packagingCost: number;
  platformFee: number;
  netProfit: number;

  views: number;
  likes: number;
  daysToSell: number;

  memo: string;
  failureReason: string;

  createdAt?: number;
  updatedAt?: number;
};

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
  marketPressure?: "low" | "normal" | "high";
  activeListingCount?: number;
  estimatedByTheory: boolean;
  dataConfidence: "low" | "medium" | "high";
};

export type SellCheckTextAnalysis = {
  brandName: string;
  modelName: string;
  material: string;

  productType: string;
  characterName: string;
  seriesName: string;
  maker: string;
  era: string;
  collectorGenre: string;
  materialType: string;

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
  similarActiveCount: number;

  averageSoldPrice?: number;
  medianSoldPrice?: number;
  minSoldPrice?: number;
  maxSoldPrice?: number;
  premiumPrice?: number;

  averageActivePrice?: number;
  medianActivePrice?: number;
  minActivePrice?: number;
  maxActivePrice?: number;

  activeToSoldRatio?: number;
  marketPressure: "low" | "normal" | "high";

  matchLevel: "weak" | "category" | "keyword" | "brand" | "model" | "rare";

  activeSources: SellCheckSource[];
};

export type SellCheckSmallSampleAnalysis = {
  isSmallSample: boolean;
  usableSampleCount: number;
  targetSampleCount: number;
  summary: string;
  missingData: string[];
  nextDataToCollect: string[];
  decisionNotes: string[];
};

export type SellCheckResult = {
  score: number;
  rank: SellCheckRank;
  action: string;

  scoreLabel: string;
  rankLabel: string;
  sellSpeed: SellCheckSellSpeed;
  sellSpeedLabel: string;
  confidenceLevel: SellCheckConfidenceLevel;
  confidenceLabel: string;
  marketType: SellCheckMarketType;
  marketTypeLabel: string;
  scoreExplanation: string;

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

  /**
   * 仕入れ判断OS用の追加分析。
   * 既存の売れる診断結果は壊さず、判断モード・検索支援・利益・仕入れ上限を別枠で返す。
   */
  decisionMode?: SellCheckDecisionMode;
  decisionModeLabel?: string;
  researchGuide?: SellCheckResearchGuide;
  profitAnalysis?: SellCheckProfitAnalysis;
  acquisitionAnalysis?: SellCheckAcquisitionAnalysis;
  actionGuide?: SellCheckActionGuide;
  theoryProfile?: SellCheckTheoryProfile;
  marketStructureAnalysis?: SellCheckMarketStructureAnalysis;
  priceDistortionAnalysis?: SellCheckPriceDistortionAnalysis;
  rotationLearningAnalysis?: SellCheckRotationLearningAnalysis;

  /**
   * 少数データでも判断するための補助分析。
   * 既存スコアは壊さず、別枠で「何が足りないか」「次に何を集めるか」を出す。
   */
  smallSampleAnalysis?: SellCheckSmallSampleAnalysis;
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

  productType?: string;
  characterName?: string;
  seriesName?: string;
  maker?: string;
  era?: string;
  collectorGenre?: string;
  materialType?: string;

  extractedKeywords?: string[];

  sold: boolean;
  listingStatus?: SellCheckListingStatus;
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
  source?: SellCheckSource;
};