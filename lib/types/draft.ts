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
 * - ただし、今後の主軸は placement / placement.background に寄せる
 * - root の backgroundScale / backgroundX / backgroundY は後方互換として残す
 * - 今回は次工程で必要になる step / undo / redo 用の型も追加する
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
  /**
   * 新UIで使う本体
   */
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

  /**
   * 旧簡易UIで使う本体
   */
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

/**
 * テンプレ背景おすすめ
 *
 * 重要
 * - 既存の id / score / reason は残す
 * - UI 側の都合で url / imageUrl の両方を受けられるようにする
 * - 実運用では url を主に使う
 */
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
// 新仕様: 商品配置調整
// =========================

/**
 * 商品配置編集ステップ
 *
 * 今回追加
 * - 背景 → 商品 → 影 の順番固定UI用
 */
export type ProductPlacementStep = "background" | "product" | "shadow";

/**
 * 影設定
 *
 * 重要
 * - 影は商品従属
 * - offset は将来的に微調整域へ統一する
 */
export type ProductPlacementShadow = {
  opacity: number;
  blur: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};

/**
 * 背景設定
 *
 * 重要
 * - 背景は別空間
 * - preview / recomposite の共通基準
 */
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

/**
 * undo / redo 用のスナップショット
 *
 * 重要
 * - 画面側の履歴管理で使う
 * - 保存値の意味をそのまま持つ
 */
export type ProductPlacementSnapshot = {
  placement: ProductPlacement;
  activePhotoMode: ProductPhotoMode;
  step: ProductPlacementStep;
};

/**
 * step 保存用の partial 型
 *
 * 重要
 * - 背景だけ保存
 * - 商品だけ保存
 * - 影だけ保存
 * のような分割保存に使う
 */
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

  /**
   * 正式系
   */
  brandId: BrandId;
  phase: Phase;

  /**
   * 画面互換系
   */
  brand?: BrandId;

  // =================
  // inputs
  // =================

  title?: string;
  vision: string;

  /**
   * 正式保存系
   */
  keywords?: string;

  /**
   * 画面互換系
   */
  keywordsText?: string;

  memo?: string;
  voice?: string;
  ban?: string;
  must?: string;
  purpose?: string;
  platform?: string;
  videoButtonId?: string;

  // =================
  // captions（正式）
  // =================

  igCaption: string;
  xCaption: string;
  shortCopies: ShortCopy[];
  selectedShortCopy?: string;

  // =================
  // captions（画面互換）
  // =================

  ig?: string;
  x?: string;
  ig3?: string[];

  // =================
  // EC販売用文章
  // =================

  instagramSales?: string;
  xSales?: string;
  ecTitle?: string;
  ecDescription?: string;
  ecBullets?: string[];

  // =================
  // images（正式）
  // =================

  baseImageUrl?: string;
  bgImageUrl?: string;
  stageImageUrl?: string;
  compositeImageUrl?: string;
  foregroundImageUrl?: string;

  // =================
  // images（画面互換）
  // =================

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

  // =================
  // 新仕様: ① 商品写真
  // =================

  activePhotoMode?: ProductPhotoMode;

  /**
   * 今後の正式な保存先
   * - 商品位置
   * - 商品影
   * - 背景位置
   * をここへ集約する
   */
  placement?: ProductPlacement;

  /**
   * 旧 root 値（後方互換）
   *
   * 注意
   * - 既存読込互換のため残す
   * - 今後の主保存先は placement.shadow
   */
  shadowOpacity?: number;
  shadowBlur?: number;
  shadowScale?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;

  /**
   * 旧 root 背景値（後方互換）
   *
   * 注意
   * - 既存読込互換のため残す
   * - 今後の主保存先は placement.background
   */
  backgroundScale?: number;
  backgroundX?: number;
  backgroundY?: number;

  /**
   * 順番固定UI用
   *
   * 注意
   * - Draft に保存されていても壊れないよう optional
   * - 未保存運用でも使える
   */
  placementStep?: ProductPlacementStep;

  backgroundSourceTab?: BackgroundSourceTab;
  templateBgUrl?: string;
  templateBgUrls?: string[];
  templateBgSelectedId?: string;
  templateBgRecommendedIds?: string[];
  templateBgRecommendations?: TemplateBgRecommendation[];
  templateBgRecommendReason?: string;

  // =================
  // 新仕様: ② 使用シーン
  // =================

  useSceneImageUrl?: string;
  useSceneImageUrls?: string[];

  // =================
  // 新仕様: ③ サイズ
  // =================

  sizeTemplateType?: SizeTemplateType;
  sizeTemplateImageUrl?: string;

  // =================
  // 新仕様: ④ ディテール
  // =================

  detailImageUrl?: string;
  detailImageUrls?: string[];

  // =================
  // 新仕様: ⑤ ストーリー
  // =================

  storyImageUrl?: string;
  storyImageUrls?: string[];

  // =================
  // text overlay（正式）
  // =================

  textEnabled?: boolean;
  textSize?: number;
  textY?: number;
  bandOpacity?: number;

  // =================
  // text overlay（画面互換）
  // =================

  textOverlayBySlot?: TextOverlayBySlot;

  // =================
  // video（正式）
  // =================

  videoUrl?: string;
  videoSettings?: VideoSettings;

  // =================
  // video（画面互換）
  // =================

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

  // =================
  // timestamps
  // =================

  createdAt?: any;
  updatedAt?: any;
};