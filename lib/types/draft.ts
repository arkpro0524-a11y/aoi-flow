// /lib/types/draft.ts
/**
 * AOI FLOW 用の型定義（統合版）
 *
 * このファイルの目的
 * - 現在の page.tsx / hooks / API が参照している意味を1つにそろえる
 * - 旧名と新名が混在していても、まずは型崩壊を止める
 * - Firestore保存の正式意味と、画面内部で使う補助フィールドの両方を持てるようにする
 *
 * 重要
 * - brandId / igCaption / xCaption / shortCopies は正式系
 * - brand / ig / x / ig3 などは画面互換のために残す
 * - baseImageUrl / bgImageUrl / aiImageUrl / compositeImageUrl / videoUrl を中心に統一する
 * - 今回追加した新仕様
 *   ① 商品写真      : 切り抜き + テンプレ背景 + AI背景 + 調整UI
 *   ② 使用シーン    : AI再生成
 *   ③ サイズ        : テンプレ
 *   ④ ディテール    : 元写真
 *   ⑤ ストーリー    : AI再生成
 *
 * 今回の STEP 1 追加
 * - テンプレ背景を「AI背景」と分けて扱うための型を追加
 * - まだ API / save / get は未対応
 * - まずは型だけ安全に追加して、次の STEP で保存読込を通す
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

export type DraftImage = {
  id: string;
  url: string;
  createdAt?: number;
  role?: "product" | "material" | "detail" | "other" | string;
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

/**
 * 旧シンプル型と、新 overlay 型の両対応
 *
 * 今の hook 群では
 * - lines
 * - lineHeight
 * - x
 * - color
 * - background
 * を使っている
 *
 * 一方、保存の正式意味としては
 * - textEnabled
 * - textSize
 * - textY
 * - bandOpacity
 * も使う
 */
export type TextOverlay = {
  // 新UIで使う本体
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

  // 旧簡易UIで使う本体
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

/**
 * 背景選択UIで今どちらを触っているか
 *
 * - template_bg : EC向けテンプレ背景
 * - ai_bg       : キーワードから作るAI背景
 *
 * 注意
 * - これは UI の選択状態
 * - 既存の activePhotoMode（template / ai_bg）とは役割が少し違う
 * - activePhotoMode は「合成プレビューで何を使うか」
 * - backgroundSourceTab は「背景選択UIで何を編集しているか」
 */
export type BackgroundSourceTab = "template_bg" | "ai_bg";

/**
 * テンプレ背景のおすすめ結果1件分
 *
 * 今回は最小構成
 * - id
 * - score
 * - reason
 *
 * 将来必要なら category / tags / matchedRules などを追加可能
 */
export type TemplateBgRecommendation = {
  id: string;
  score: number;
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
 * ① 商品写真の最終調整UIで使う
 * - scale : 商品の大きさ
 * - x     : 左右位置（0.5 が中央）
 * - y     : 上下位置（0.5 が中央）
 */
export type ProductPlacement = {
  scale: number;
  x: number;
  y: number;
};

// =========================
// 新仕様: 写真モード
// =========================

/**
 * ① 商品写真で何を使うかの選択
 * - template : テンプレ背景
 * - ai_bg    : AI背景
 */
export type ProductPhotoMode = "template" | "ai_bg";

// =========================
// 新仕様: サイズテンプレ
// =========================

/**
 * ③ サイズで使うテンプレ種別
 * まずは最小構成だけ持つ
 */
export type SizeTemplateType =
  | "simple"
  | "compare"
  | "with_label"
  | "square_note"
  | string;

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
   * - 既存 hook / page.tsx が brand を直接使っているため残す
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

  /**
   * ① 商品写真の背景選択モード
   * - template : テンプレ背景
   * - ai_bg    : AI背景
   */
  activePhotoMode?: ProductPhotoMode;

  /**
   * ① 商品写真の最終配置
   */
  placement?: ProductPlacement;

  /**
   * 背景選択UIで今どちらを編集しているか
   * - template_bg : テンプレ背景
   * - ai_bg       : AI背景
   */
  backgroundSourceTab?: BackgroundSourceTab;

  /**
   * ① テンプレ背景URL
   * - 現在選択中のテンプレ背景
   */
  templateBgUrl?: string;

  /**
   * ① テンプレ背景候補
   * - この下書き内で保持するテンプレ背景候補一覧
   */
  templateBgUrls?: string[];

  /**
   * ① 現在選択中のテンプレ背景ID
   * - URLだけでは後でおすすめや理由と紐づけにくいのでIDも持つ
   */
  templateBgSelectedId?: string;

  /**
   * ① おすすめ結果のID並び
   * - UIで「上からおすすめ順」に出したい時に使う
   */
  templateBgRecommendedIds?: string[];

  /**
   * ① おすすめ結果の詳細
   * - reason を保存しておくと「根拠付きおすすめ」を再表示できる
   */
  templateBgRecommendations?: TemplateBgRecommendation[];

  // =================
  // 新仕様: ② 使用シーン
  // =================

  /**
   * 元画像からAIで再生成した「使用シーン」
   * 今回は既存の imageIdeaUrl / imageIdeaUrls も互換として残すが、
   * 正式名も追加しておく
   */
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