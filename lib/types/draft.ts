//lib/types/draft.ts
/**
 * AOI FLOW 用の型定義（統合版）
 *
 * このファイルの目的
 * - 現在の page.tsx / hooks / API が参照している意味を1つにそろえる
 * - 旧名と新名が混在していても、まずは型崩壊を止める
 * - Firestore保存の正式意味と、画面内部で使う補助フィールドの両方を持てるようにする
 *
 * 重要
 * - 既存機能は削除しない
 * - 互換項目は残す
 * - 今後の主軸は placement / placement.background に寄せる
 * - 今回追加：売れる判断OS用の成果データ型
 */

// =========================
// 共通
// =========================

export type Phase = "draft" | "ready" | "posted";

export type BrandId = "vento" | "riva";

export type UiVideoSize = "720x1280" | "1280x720" | "960x960";

export type VideoQuality = "standard" | "high";

export type VideoSeconds = 5 | 10;

export type VideoEngine = "runway" | "nonai";

// =========================
// 画像の売り方向
// =========================

export type ImagePurpose = "sales" | "branding" | "trust" | "story";

// =========================
// 商品画像
// =========================

export type DraftImageRole =
  | "product"
  | "material"
  | "detail"
  | "context"
  | "other"
  | string;

export type DraftImage = {
  id: string;
  url: string;
  createdAt?: number;
  role?: DraftImageRole;
};

export type DraftImages = {
  primary: DraftImage | null;
  materials: DraftImage[];
};

// =========================
// short copy
// =========================

export type ShortCopy = {
  id: string;
  text: string;
};

// =========================
// overlay
// =========================

export type TextOverlay = {
  lines?: string[];
  lineHeight?: number;
  x?: number;
  color?: string;
  background?: {
    enabled: boolean;
    padding: number;
    color: string;
    radius: number;
  };

  text?: string;
  enabled?: boolean;
  fontSize: number;
  y: number;
  bandOpacity?: number;
};

export type TextOverlayBySlot = {
  base?: TextOverlay;
  mood?: TextOverlay;
  composite?: TextOverlay;
};

// =========================
// モーション
// =========================

export type MotionCharacter = {
  tempo: "slow" | "normal" | "sharp";
  reveal: "early" | "delayed" | "last";
  intensity: "calm" | "balanced" | "strong";
  attitude: "humble" | "neutral" | "assertive";
  rhythm: "with_pause" | "continuous";
};

// =========================
// 非AI動画プリセット
// =========================

export type NonAiVideoPreset = MotionCharacter & {
  id: string;
  major: string;
  middle: string;
  minor: string;
};

// =========================
// 動画設定
// =========================

export type VideoSettings = {
  seconds: VideoSeconds;
  quality: VideoQuality;
  template: string;
  size: UiVideoSize;
};

// =========================
// 静止画最適化
// =========================

export type StaticImageVariant = {
  id: string;
  prompt: string;
  title: string;
  rationale: string;
  strategyType: string;
  description?: string;
};

export type StaticImageLog = {
  purpose: ImagePurpose;
  selectedVariantId: string;
  timestamp: number;
};

// =========================
// 背景
// =========================

export type BgScene = "studio" | "lifestyle" | "scale" | "detail";

export type BgCandidate = {
  id: string;
  url: string;
  keyword: string;
  scene: BgScene;
  bgPrompt: string;
  hardConstraints: string[];
  why: string;
};

export type BgPickLog = {
  pickedId: string;
  reason: string;
  at: number;
  refined?: boolean;
};

// =========================
// テンプレ背景
// =========================

export type BackgroundSourceTab = "template_bg" | "ai_bg";

export type TemplateBgRecommendation = {
  id?: string;
  url?: string;
  imageUrl?: string;
  score?: number;
  reason: string;
};

// =========================
// 生成元メタ
// =========================

export type ImageOriginKind =
  | "base_upload"
  | "idea_image"
  | "bg_only"
  | "composite"
  | "static_variant_selected"
  | "bg_refined"
  | "usage_scene_regeneration"
  | "story_regeneration"
  | "template_bg";

export type ImageOriginMeta = {
  kind: ImageOriginKind | string;
  label: string;
  detail?: string;
  usedVision?: string;
  selectedVariantId?: string;
  selectedVariantTitle?: string;
  purpose?: string;
  bgScene?: string;
  referenceImageUrl?: string;
  at?: number;
};

// =========================
// Product Video
// =========================

export type ProductVideo = {
  source: "nonai";
  url: string | null;
  urls: string[];
  preset: NonAiVideoPreset | null;
  burnedUrl: string | null;
  burnedUrls: string[];
};

// =========================
// CM Video
// =========================

export type CmVideoStatus = "idle" | "queued" | "running" | "done" | "error";

export type CmVideoPersona = {
  seconds: VideoSeconds;
  quality: VideoQuality;
  template: string;
  size: UiVideoSize;
};

export type CmVideo = {
  provider: "runway";
  taskId: string | null;
  status: CmVideoStatus;
  url: string | null;
  urls: string[];
  persona: CmVideoPersona | null;
};

// =========================
// 売れる判断OS：成果データ
// =========================

export type SellOutcomeStatus =
  | "unknown"
  | "listed"
  | "sold"
  | "unsold"
  | "stopped";

export type SellCheckRank = "A" | "B" | "C" | "D";

export type DraftSellCheckSnapshot = {
  score: number;
  rank: SellCheckRank;
  action: string;
  suggestedPriceMin: number;
  suggestedPriceMax: number;
  improvements: string[];
  reasons: string[];
  learnedSampleCount: number;
  checkedAt: number;
};

export type DraftOutcome = {
  status: SellOutcomeStatus;

  listedPrice?: number;
  soldPrice?: number;

  views?: number;
  likes?: number;

  listedAt?: number;
  soldAt?: number;

  platform?: string;
  memo?: string;

  sellCheck?: DraftSellCheckSnapshot;

  updatedAt?: number;
};

// =========================
// 新仕様: 商品配置調整
// =========================

export type ProductPlacementStep = "background" | "product" | "shadow";

export type ProductPlacementShadow = {
  opacity: number;
  blur: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type ProductPlacementBackground = {
  scale: number;
  x: number;
  y: number;
};

export type ProductPlacement = {
  scale: number;
  x: number;
  y: number;
  shadow?: ProductPlacementShadow;
  background?: ProductPlacementBackground;
};

export type ProductPlacementSnapshot = {
  placement: ProductPlacement;
  activePhotoMode: ProductPhotoMode;
  step: ProductPlacementStep;
};

export type ProductPlacementPartial = {
  scale?: number;
  x?: number;
  y?: number;
  shadowOpacity?: number;
  shadowBlur?: number;
  shadowScale?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  backgroundScale?: number;
  backgroundX?: number;
  backgroundY?: number;
  activePhotoMode?: ProductPhotoMode;
  step?: ProductPlacementStep;
  autoRecompose?: boolean;
};

// =========================
// 新仕様: 写真モード
// =========================

export type ProductPhotoMode = "template" | "ai_bg";

// =========================
// 新仕様: サイズテンプレ
// =========================

export type SizeTemplateType =
  | "simple"
  | "compare"
  | "measure"
  | "with_label"
  | "square_note"
  | string;

// =========================
// EC販売用文章
// =========================

export type EcSalesTextSet = {
  instagramSales?: string;
  xSales?: string;
  ecTitle?: string;
  ecDescription?: string;
  ecBullets?: string[];
};

// =========================
// DraftDoc
// =========================

export type DraftDoc = {
  id?: string;

  userId: string;

  brandId: BrandId;
  phase: Phase;

  brand?: BrandId;

  title?: string;
  vision: string;

  keywords?: string;
  keywordsText?: string;

  memo?: string;
  voice?: string;
  ban?: string;
  must?: string;
  purpose?: string;
  platform?: string;
  videoButtonId?: string;

  igCaption: string;
  xCaption: string;
  shortCopies: ShortCopy[];
  selectedShortCopy?: string;

  ig?: string;
  x?: string;
  ig3?: string[];

  instagramSales?: string;
  xSales?: string;
  ecTitle?: string;
  ecDescription?: string;
  ecBullets?: string[];

  baseImageUrl?: string;
  bgImageUrl?: string;
  stageImageUrl?: string;
  compositeImageUrl?: string;
  foregroundImageUrl?: string;

  aiImageUrl?: string;
  imageIdeaUrl?: string;
  imageIdeaUrls?: string[];
  bgImageUrls?: string[];

  imageUrl?: string;
  imageSource?: "upload" | "ai" | "composite";

  images?: DraftImages;

  imagePurpose?: ImagePurpose;
  staticImageVariants?: StaticImageVariant[];
  staticImageLogs?: StaticImageLog[];

  selectedStaticVariantId?: string;
  selectedStaticPrompt?: string;
  selectedStaticVariantTitle?: string;

  bgCandidates?: BgCandidate[];
  selectedBgCandidateId?: string;
  bgPickLogs?: BgPickLog[];

  bgRefinedPrompt?: string;
  bgRefinedUrl?: string;
  bgRefineEnabled?: boolean;

  originMeta?: {
    idea?: ImageOriginMeta;
    bg?: ImageOriginMeta;
    composite?: ImageOriginMeta;
    story?: ImageOriginMeta;
    templateBg?: ImageOriginMeta;
  };

  activePhotoMode?: ProductPhotoMode;
  placement?: ProductPlacement;

  shadowOpacity?: number;
  shadowBlur?: number;
  shadowScale?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;

  backgroundScale?: number;
  backgroundX?: number;
  backgroundY?: number;

  placementStep?: ProductPlacementStep;

  backgroundSourceTab?: BackgroundSourceTab;
  templateBgUrl?: string;
  templateBgUrls?: string[];
  templateBgSelectedId?: string;
  templateBgRecommendedIds?: string[];
  templateBgRecommendations?: TemplateBgRecommendation[];
  templateBgRecommendReason?: string;

  useSceneImageUrl?: string;
  useSceneImageUrls?: string[];

  sizeTemplateType?: SizeTemplateType;
  sizeTemplateImageUrl?: string;

  detailImageUrl?: string;
  detailImageUrls?: string[];

  storyImageUrl?: string;
  storyImageUrls?: string[];

  textEnabled?: boolean;
  textSize?: number;
  textY?: number;
  bandOpacity?: number;

  textOverlayBySlot?: TextOverlayBySlot;

  videoUrl?: string;
  videoSettings?: VideoSettings;

  videoUrls?: string[];
  videoTaskId?: string;
  videoStatus?: "idle" | "queued" | "running" | "done" | "failed" | "succeeded";

  videoSeconds?: VideoSeconds;
  videoQuality?: VideoQuality;
  videoTemplate?: string;
  videoSize?: UiVideoSize;

  videoPersona?: {
    seconds: VideoSeconds;
    quality: VideoQuality;
    template: string;
    size: UiVideoSize;
  };

  videoEngine?: VideoEngine;
  videoSource?: VideoEngine;

  nonAiVideoUrl?: string;
  nonAiVideoUrls?: string[];
  nonAiVideoPreset?: NonAiVideoPreset;

  videoBurnedUrl?: string;
  videoBurnedAt?: any;
  videoTextOverlay?: any;

  productVideo?: ProductVideo;
  cmVideo?: CmVideo;
  motion?: MotionCharacter;
  cmApplied?: any;

  outcome?: DraftOutcome;

  createdAt?: any;
  updatedAt?: any;
};