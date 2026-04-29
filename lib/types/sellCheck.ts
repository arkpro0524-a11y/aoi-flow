// /lib/types/sellCheck.ts

/**
 * 商品状態
 */
export type SellCheckCondition = "excellent" | "good" | "fair" | "poor";

/**
 * カテゴリ
 */
export type SellCheckCategory =
  | "interior"
  | "fashion"
  | "hobby"
  | "kids"
  | "electronics"
  | "other";

/**
 * 画像メタ情報
 */
export type SellCheckImageMeta = {
  hasImage: boolean;
  fileName: string;
  fileSize: number;
};

/**
 * 画像解析スコア
 *
 * 目的：
 * - 画像の中身を数値化するための型
 * - 明るさ、構図、背景、傷リスクなどを保存できるようにする
 */
export type SellCheckImageAnalysis = {
  brightnessScore: number;
  compositionScore: number;
  backgroundScore: number;
  damageRiskScore: number;
  overallImageScore: number;
  imageReasons: string[];
};

/**
 * 商品説明文・商品情報の解析結果
 *
 * 目的：
 * - 商品名や説明文から、ブランド・型番・素材・状態リスクを取り出す
 * - 将来、類似商品検索や機械学習に使える形にする
 */
export type SellCheckTextAnalysis = {
  brandName: string;
  modelName: string;
  material: string;
  extractedKeywords: string[];
  conditionRiskScore: number;
  descriptionQualityScore: number;
  textReasons: string[];
};

/**
 * 類似データ参照結果
 *
 * 目的：
 * - 過去の売却データから、似ている商品をどれだけ参照したかを記録する
 */
export type SellCheckSimilarData = {
  similarCount: number;
  similarSoldCount: number;
  averageSoldPrice?: number;
  medianSoldPrice?: number;
  minSoldPrice?: number;
  maxSoldPrice?: number;
};

/**
 * 診断結果（既存）
 * ※既存項目は絶対に壊さない
 */
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

  /**
   * 追加：
   * 画像・文章・類似データの診断根拠
   *
   * 既存画面を壊さないため optional にする
   */
  imageAnalysis?: SellCheckImageAnalysis;
  textAnalysis?: SellCheckTextAnalysis;
  similarData?: SellCheckSimilarData;
};

/**
 * 学習用データ（売買ログ）
 *
 * Excelで集めるデータ構造と同じにしている。
 * 将来CSVインポートにも対応しやすい形。
 */
export type SellCheckLog = {
  id?: string;

  /**
   * 基本情報
   */
  price: number;
  category: SellCheckCategory;
  condition: SellCheckCondition;

  /**
   * 商品情報
   */
  title?: string;
  brandName?: string;
  modelName?: string;
  material?: string;
  extractedKeywords?: string[];

  /**
   * 売れたかどうか
   */
  sold: boolean;

  /**
   * 実際の売却価格
   * - 売れた商品の実売価格
   * - 価格判断では price より優先して使う
   */
  soldPrice?: number;

  /**
   * 反応データ
   * - メルカリ等で取得できる閲覧数・いいね数
   */
  views?: number;
  likes?: number;

  /**
   * 診断時スコア
   */
  score?: number;

  /**
   * 文章解析スコア
   */
  conditionRiskScore?: number;
  descriptionQualityScore?: number;

  /**
   * 画像解析スコア
   */
  brightnessScore?: number;
  compositionScore?: number;
  backgroundScore?: number;
  damageRiskScore?: number;
  overallImageScore?: number;

  /**
   * 作成日時
   * - Firestore Timestamp は API 側で number に変換して扱う
   */
  createdAt?: number;

  /**
   * 画像情報
   */
  hasImage: boolean;
  imageUrl?: string;
  imageFileName?: string;
  imageFileSize?: number;

  /**
   * メモ
   */
  memo?: string;

  /**
   * 元データ
   */
  source?: "manual" | "draft" | "import";
};