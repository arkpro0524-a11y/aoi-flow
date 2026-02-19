// /lib/types/draft.ts

export type UiVideoSize = "720x1280" | "1280x720" | "960x960";

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
// ✅ NEW: productVideo / cmVideo（A案の本体）
// =========================

export type ProductVideo = {
  source: "nonai";
  url: string | null; // 代表
  urls: string[]; // 履歴
  preset: NonAiVideoPreset | null; // 人格（non-aiのみ）

  burnedUrl: string | null; // 焼き込み 代表
  burnedUrls: string[]; // 焼き込み履歴
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
  url: string | null; // 代表
  urls: string[]; // 履歴
  persona: CmVideoPersona | null;
};

// =========================
// DraftDoc
// =========================

export type DraftDoc = {
  userId: string;

  brand: "vento" | "riva";
  phase: "draft" | "ready" | "posted";

  vision: string;
  keywordsText: string;
  memo?: string;

  ig: string;
  x: string;
  ig3: string[];

  // 🔥 recommendation
  voice?: string;
  ban?: string;
  must?: string;
  purpose?: string;
  platform?: string;

  // 🔥 video button
  videoButtonId?: string;

  // ---------- image ----------
  baseImageUrl?: string;
  aiImageUrl?: string;
  compositeImageUrl?: string;
  imageIdeaUrl?: string;

  imageUrl?: string;
  imageSource?: "upload" | "ai" | "composite";

  imagePurpose?: ImagePurpose;
  staticImageVariants?: StaticImageVariant[];
  staticImageLogs?: StaticImageLog[];
  selectedStaticVariantId?: string;
  selectedStaticPrompt?: string;

  images?: DraftImages;
  textOverlayBySlot?: TextOverlayBySlot;

  bgImageUrl?: string;
  bgImageUrls?: string[];

  // =========================
  // ✅ A案：完全分離
  // =========================
  productVideo?: ProductVideo; // non-ai 専用
  cmVideo?: CmVideo; // runway 専用

  // =========================
  // ⚠️ 旧フィールド（互換用 / 近いうち削除）
  // ※ STEP F で完全削除する
  // =========================

  // ---------- runway (legacy) ----------
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

  // ---------- non-ai (legacy) ----------
  videoSource?: VideoEngine;
  nonAiVideoUrl?: string;
  nonAiVideoUrls?: string[];
  nonAiVideoPreset?: NonAiVideoPreset;

  // ---------- burn (legacy) ----------
  videoBurnedUrl?: string;
  videoBurnedAt?: any;
  videoTextOverlay?: any;

  // ---------- misc ----------
  createdAt?: any;
  updatedAt?: any;

  motion?: MotionCharacter;

  // ---------- legacy: CM panel old key ----------
  // 以前は cmApplied に保存していた名残（読むだけ用）
  cmApplied?: any;
};