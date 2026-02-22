// =========================
// UI Video Size
// =========================

export type UiVideoSize = "720x1280" | "1280x720" | "960x960";

// =========================
// Draft Image
// =========================

export type DraftImage = {
  id: string;
  url: string;
  createdAt?: number;
  role?: string;
};

// =========================
// Engine
// =========================

export type VideoEngine = "runway" | "nonai";

// =========================
// Motion
// =========================

export type MotionCharacter = {
  tempo: "slow" | "normal" | "sharp";
  reveal: "early" | "delayed" | "last";
  intensity: "calm" | "balanced" | "strong";
  attitude: "humble" | "neutral" | "assertive";
  rhythm: "with_pause" | "continuous";
};

// =========================
// Static image
// =========================

export type ImagePurpose = "sales" | "branding" | "trust" | "story";

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
// Text overlay
// =========================

export type TextOverlay = {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  x: number;
  y: number;
  color: string;
  background: {
    enabled: boolean;
    padding: number;
    color: string;
    radius: number;
  };
};

export type TextOverlayBySlot = {
  base?: TextOverlay;
  mood?: TextOverlay;
  composite?: TextOverlay;
};

// =========================
// Non-AI preset
// =========================

export type NonAiVideoPreset = MotionCharacter & {
  id: string;
  major: string;
  middle: string;
  minor: string;
};

// =========================
// DraftImages
// =========================

export type DraftImages = {
  primary: any | null;
  materials: any[];
};

// =========================
// ✅ NEW: 生成元メタ（追跡用）
// =========================

export type ImageOriginKind =
  | "base_upload"
  | "idea_image"
  | "bg_only"
  | "composite"
  | "static_variant_selected";

export type ImageOriginMeta = {
  kind: ImageOriginKind;

  // UIに出す短い説明
  label: string;

  // 任意の補足
  detail?: string;

  // 実際にAPIへ渡したvision
  usedVision?: string;

  // 静止画最適化AI関連
  selectedVariantId?: string;
  selectedVariantTitle?: string;

  // sales / branding など
  purpose?: string;

  // living / studio など
  bgScene?: string;

  // 生成時刻
  at?: number;
};

// =========================
// ✅ NEW: productVideo / cmVideo（A案の本体）
// =========================

export type ProductVideo = {
  source: "nonai";
  url: string | null;
  urls: string[];
  preset: NonAiVideoPreset | null;

  burnedUrl: string | null;
  burnedUrls: string[];
};

export type CmVideoStatus = "idle" | "queued" | "running" | "done" | "error";

export type CmVideoPersona = {
  seconds: 5 | 10;
  quality: "standard" | "high";
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
// DraftDoc
// =========================

export type DraftDoc = {
  userId: string;

  brand: "vento" | "riva";
  phase: "draft" | "ready" | "posted";

  // ✅ 一覧用タイトル
  title?: string;

  // =========================
  // brand/context（recommendation 用）
  // =========================
  vision: string;
  keywordsText: string;
  memo?: string;

  ig: string;
  x: string;
  ig3: string[];

  voice?: string;
  ban?: string;
  must?: string;
  purpose?: string;
  platform?: string;

  // UI選択（動画ボタン）
  videoButtonId?: string;

  // =========================
  // image
  // =========================
  baseImageUrl?: string;
  aiImageUrl?: string;
  compositeImageUrl?: string;
  imageIdeaUrl?: string;
  imageIdeaUrls?: string[];

  imageUrl?: string;
  imageSource?: "upload" | "ai" | "composite";

  imagePurpose?: ImagePurpose;
  staticImageVariants?: StaticImageVariant[];
  staticImageLogs?: StaticImageLog[];

  selectedStaticVariantId?: string;
  selectedStaticPrompt?: string;
  selectedStaticVariantTitle?: string;

  images?: DraftImages;
  textOverlayBySlot?: TextOverlayBySlot;

  bgImageUrl?: string;
  bgImageUrls?: string[];

  originMeta?: {
    idea?: ImageOriginMeta;
    bg?: ImageOriginMeta;
    composite?: ImageOriginMeta;
  };

  // =========================
  // A案：完全分離
  // =========================
  productVideo?: ProductVideo;
  cmVideo?: CmVideo;

  // =========================
  // legacy（互換用）
  // =========================
  videoUrl?: string;
  videoUrls?: string[];
  videoTaskId?: string;
  videoStatus?: "idle" | "queued" | "running" | "done" | "failed" | "succeeded";

  videoSeconds?: 5 | 10;
  videoQuality?: "standard" | "high";
  videoTemplate?: string;
  videoSize?: UiVideoSize;

  videoPersona?: {
    seconds: 5 | 10;
    quality: "standard" | "high";
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

  createdAt?: any;
  updatedAt?: any;

  motion?: MotionCharacter;

  cmApplied?: any;
};