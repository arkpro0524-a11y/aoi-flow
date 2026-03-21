//app/flow/drafts/new/hooks/useDraftEditorState.ts
"use client";

import { useMemo, useRef, useState } from "react";
import type {
  DraftDoc,
  TextOverlay,
  ImagePurpose,
  StaticImageVariant,
  UiVideoSize,
  NonAiVideoPreset,
  ProductPhotoMode,
  SizeTemplateType,
} from "@/lib/types/draft";

/**
 * AOI FLOW
 * Editor State Hook
 *
 * 役割
 * - UI状態の一元管理
 * - 副作用なし
 * - API呼び出しなし
 * - controller / actions / persistence から共通利用
 *
 * 今回の重要追加
 * - 商品理解レイヤーの state を追加
 *   1. 商品カテゴリ
 *   2. サイズ感
 *   3. 接地タイプ
 *   4. 売り方向
 *   5. 背景方向
 *
 * - 新仕様の state を追加
 *   ① 商品写真      : 切り抜き + テンプレ背景 + AI背景 + 調整UI
 *   ② 使用シーン    : AI再生成
 *   ③ サイズ        : テンプレ
 *   ④ ディテール    : 元写真
 *   ⑤ ストーリー    : AI再生成
 *
 * 今回の最重要修正
 * - template 背景専用 state を正式追加
 *   - templateBgUrl
 *   - templateBgUrls
 *   - templateBgRecommend
 *   - templateBgRecommendReason
 *
 * これにより、これまで optional 逃げしていた
 * useDraftImageActions / controller / panel 側のテンプレ背景機能を
 * 正式な state として扱えるようにする
 */

// =========================
// 型
// =========================

export type Brand = "vento" | "riva";
export type Phase = "draft" | "ready" | "posted";
export type UiSeconds = 5 | 10;
export type BgScene = "studio" | "lifestyle" | "scale" | "detail";
export type RightTab = "image" | "video";
export type VideoTab = "product" | "cm";
export type ImageSlot = "base" | "mood" | "composite";
export type PreviewMode = "base" | "idea" | "composite";

/**
 * 商品理解レイヤー
 */
export type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
export type ProductSize = "large" | "medium" | "small";
export type GroundingType = "floor" | "table" | "hanging" | "wall";
export type SellDirection = "sales" | "branding" | "trust" | "story";

/**
 * テンプレ背景おすすめ1件分
 *
 * 注意
 * - UIで最低限必要なのは
 *   - url
 *   - reason
 *   - score
 * - API互換で imageUrl が返ることもあるが、
 *   state 側では url を正式とする
 */
export type TemplateBgRecommendItem = {
  url: string;
  reason: string;
  score?: number;
};

export type PricingTable = {
  standard: { 5: number; 10: number };
  high: { 5: number; 10: number };
};

// =========================
// 定数
// =========================

export const FALLBACK_PRICING: PricingTable = {
  standard: { 5: 180, 10: 360 },
  high: { 5: 360, 10: 720 },
};

export const DEFAULT_TEXT_OVERLAY: TextOverlay = {
  lines: [""],
  fontSize: 44,
  lineHeight: 1.15,
  x: 50,
  y: 80,
  color: "#FFFFFF",
  bandOpacity: 0.45,
  background: {
    enabled: true,
    padding: 18,
    color: "rgba(0,0,0,0.45)",
    radius: 16,
  },
};

/**
 * 新仕様の初期値
 *
 * placement
 * - scale: 1 が基準サイズ
 * - x: 0.5 が中央
 * - y: 0.5 が中央
 */
export const DEFAULT_DRAFT: DraftDoc = {
  userId: "",

  brandId: "vento",
  phase: "draft",
  vision: "",
  igCaption: "",
  xCaption: "",
  shortCopies: [],

  // 互換
  brand: "vento",
  keywords: "",
  keywordsText: "",
  memo: "",

  ig: "",
  x: "",
  ig3: [],

  baseImageUrl: undefined,
  bgImageUrl: undefined,
  bgImageUrls: [],

  aiImageUrl: undefined,
  compositeImageUrl: undefined,
  imageIdeaUrl: undefined,
  imageIdeaUrls: [],

  imageUrl: undefined,
  imageSource: "upload",

  images: {
    primary: null,
    materials: [],
  },

  /**
   * ① 商品写真
   */
  activePhotoMode: "ai_bg",
  placement: {
    scale: 1,
    x: 0.5,
    y: 0.5,
  },

  /**
   * テンプレ背景
   */
  templateBgUrl: undefined,
  templateBgUrls: [],
  templateBgSelectedId: undefined,
  templateBgRecommendedIds: [],
  templateBgRecommendations: [],

  /**
   * ② 使用シーン
   */
  useSceneImageUrl: undefined,
  useSceneImageUrls: [],

  /**
   * ③ サイズ
   */
  sizeTemplateType: "simple",
  sizeTemplateImageUrl: undefined,

  /**
   * ④ ディテール
   */
  detailImageUrl: undefined,
  detailImageUrls: [],

  /**
   * ⑤ ストーリー
   */
  storyImageUrl: undefined,
  storyImageUrls: [],

  textOverlayBySlot: {
    base: DEFAULT_TEXT_OVERLAY,
    mood: undefined,
    composite: undefined,
  },

  videoSeconds: 5,
  videoQuality: "standard",
  videoTemplate: "zoom",
  videoSize: "720x1280",

  videoSettings: {
    seconds: 5,
    quality: "standard",
    template: "zoom",
    size: "720x1280",
  },

  videoUrl: undefined,
  videoUrls: [],

  nonAiVideoUrl: undefined,
  nonAiVideoUrls: [],
  nonAiVideoPreset: undefined,

  textEnabled: true,
  textSize: 44,
  textY: 80,
  bandOpacity: 0.45,
};

// =========================
// util
// =========================

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function splitKeywords(text: string) {
  return String(text || "")
    .split(/[\n,、]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function makePrimary(url: string) {
  const u = String(url || "").trim();
  if (!u) return null;

  return {
    id: `primary-${Date.now()}`,
    url: u,
    createdAt: Date.now(),
    role: "product" as const,
  };
}

export function uniqKeepOrder<T>(list: T[], limit = 10): T[] {
  const out: T[] = [];
  const seen = new Set<string>();

  for (const v of list || []) {
    const s =
      typeof v === "string"
        ? v.trim()
        : typeof v === "object" && v !== null && "url" in (v as any)
          ? String((v as any).url || "").trim()
          : String(v ?? "").trim();

    if (!s) continue;
    if (seen.has(s)) continue;

    seen.add(s);
    out.push(v);

    if (out.length >= limit) break;
  }

  return out;
}

export function normalizeVideoSize(s: any): UiVideoSize {
  const v = String(s ?? "");

  if (v === "720x1280") return "720x1280";
  if (v === "1280x720") return "1280x720";
  if (v === "960x960") return "960x960";

  if (v === "1024x1792") return "720x1280";
  if (v === "1792x1024") return "1280x720";
  if (v === "1080x1080") return "960x960";
  if (v === "1024x1024") return "960x960";

  return "720x1280";
}

export function ratioFromVideoSize(size: UiVideoSize): string {
  if (size === "720x1280") return "720:1280";
  if (size === "960x960") return "960:960";
  return "1280:720";
}

export function normalizePricing(raw: any): PricingTable {
  const src = raw?.pricing?.video ?? raw?.videoPricing ?? raw?.pricing ?? raw ?? {};

  const s5 = Number(src?.standard?.[5] ?? src?.standard?.["5"] ?? src?.standard5);
  const s10 = Number(src?.standard?.[10] ?? src?.standard?.["10"] ?? src?.standard10);
  const h5 = Number(src?.high?.[5] ?? src?.high?.["5"] ?? src?.high5);
  const h10 = Number(src?.high?.[10] ?? src?.high?.["10"] ?? src?.high10);

  return {
    standard: {
      5: Number.isFinite(s5) && s5 > 0 ? s5 : FALLBACK_PRICING.standard[5],
      10: Number.isFinite(s10) && s10 > 0 ? s10 : FALLBACK_PRICING.standard[10],
    },
    high: {
      5: Number.isFinite(h5) && h5 > 0 ? h5 : FALLBACK_PRICING.high[5],
      10: Number.isFinite(h10) && h10 > 0 ? h10 : FALLBACK_PRICING.high[10],
    },
  };
}

/**
 * 文字入りプレビュー用の元画像を決める
 *
 * 優先順
 * 1. 元画像
 * 2. 使用シーン
 * 3. 旧互換の idea 画像
 * 4. 合成画像
 * 5. 文字入り保存画像
 */
export function getOverlaySourceUrlForPreview(d: DraftDoc) {
  if (d.baseImageUrl) return d.baseImageUrl;
  if (d.useSceneImageUrl) return d.useSceneImageUrl;
  if (d.imageIdeaUrl) return d.imageIdeaUrl;
  if (d.aiImageUrl) return d.aiImageUrl;
  if (d.compositeImageUrl) return d.compositeImageUrl;
  return "";
}

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const m = String(dataUrl || "").match(/^data:image\/\w+;base64,(.+)$/);
  if (!m) throw new Error("invalid dataUrl");

  const b64 = m[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);

  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }

  return bytes;
}

// =========================
// hook
// =========================

export default function useDraftEditorState(id: string | null) {
  const [uid, setUid] = useState<string | null>(null);
  const [idToken, setIdToken] = useState("");

  const [busy, setBusy] = useState(false);
  const [loadBusy, setLoadBusy] = useState(true);

  const [draftId, setDraftId] = useState<string | null>(id ?? null);
  const [d, setD] = useState<DraftDoc>({ ...DEFAULT_DRAFT });

  const [uiMsg, setUiMsg] = useState("");

  const [cutoutBusy, setCutoutBusy] = useState(false);
  const [cutoutReason, setCutoutReason] = useState("");

  /**
   * 背景キーワード
   */
  const [backgroundKeyword, setBackgroundKeyword] = useState("");

  /**
   * 商品理解レイヤー
   */
  const [productCategory, setProductCategory] = useState<ProductCategory>("other");
  const [productSize, setProductSize] = useState<ProductSize>("medium");
  const [groundingType, setGroundingType] = useState<GroundingType>("floor");
  const [sellDirection, setSellDirection] = useState<SellDirection>("sales");
  const [bgScene, setBgScene] = useState<BgScene>("studio");

  /**
   * ① 商品写真
   */
  const [activePhotoMode, setActivePhotoMode] = useState<ProductPhotoMode>("ai_bg");
  const [placementScale, setPlacementScale] = useState(1);
  const [placementX, setPlacementX] = useState(0.5);
  const [placementY, setPlacementY] = useState(0.5);

  /**
   * テンプレ背景専用 state
   *
   * 今回の最重要追加
   * - これまでは d.templateBgUrl などにしか依存しておらず、
   *   actions 側で optional 逃げしていた
   * - 今回ここで正式な local state を持つ
   */
  const [templateBgUrl, setTemplateBgUrl] = useState<string | null>(null);
  const [templateBgUrls, setTemplateBgUrls] = useState<string[]>([]);
  const [templateBgRecommend, setTemplateBgRecommend] = useState<TemplateBgRecommendItem[]>([]);
  const [templateBgRecommendReason, setTemplateBgRecommendReason] = useState("");

  /**
   * ③ サイズ
   */
  const [sizeTemplateType, setSizeTemplateType] = useState<SizeTemplateType>("simple");

  /**
   * ⑤ ストーリー
   */
  const [storyImageUrl, setStoryImageUrl] = useState<string | null>(null);
  const [storyImageUrls, setStoryImageUrls] = useState<string[]>([]);

  /**
   * ② 使用シーン
   */
  const [useSceneImageUrl, setUseSceneImageUrl] = useState<string | null>(null);
  const [useSceneImageUrls, setUseSceneImageUrls] = useState<string[]>([]);

  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [bgBusy, setBgBusy] = useState(false);

  const [staticPurpose, setStaticPurpose] = useState<ImagePurpose>("sales");
  const [staticRecommendation, setStaticRecommendation] = useState("");
  const [staticVariants, setStaticVariants] = useState<StaticImageVariant[]>([]);
  const [staticBusy, setStaticBusy] = useState(false);

  const [recommendReason, setRecommendReason] = useState("");
  const [videoPickerValue, setVideoPickerValue] = useState<{
    selectedId: string | null;
    motion: any | null;
    recommended: any[];
  }>({
    selectedId: null,
    motion: null,
    recommended: [],
  });
  const [recommendUserLocked, setRecommendUserLocked] = useState(false);
  const [recommendAutoEnabled, setRecommendAutoEnabled] = useState(true);

  const [rightTab, setRightTab] = useState<RightTab>("image");
  const [videoTab, setVideoTab] = useState<VideoTab>("product");

  const [previewMode, setPreviewMode] = useState<PreviewMode>("base");
  const [previewReason, setPreviewReason] = useState("");
  const [overlayPreviewDataUrl, setOverlayPreviewDataUrl] = useState<string | null>(null);

  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoHistory, setVideoHistory] = useState<string[]>([]);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);

  const [nonAiVideoPreviewUrl, setNonAiVideoPreviewUrl] = useState<string | null>(null);
  const [nonAiVideoHistory, setNonAiVideoHistory] = useState<string[]>([]);
  const [nonAiPreset, setNonAiPreset] = useState<NonAiVideoPreset | null>(null);
  const [nonAiReason, setNonAiReason] = useState("");
  const [nonAiBusy, setNonAiBusy] = useState(false);

  const [burnReason, setBurnReason] = useState("");

  const [pricing, setPricing] = useState<PricingTable>(FALLBACK_PRICING);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingUpdatedAt, setPricingUpdatedAt] = useState(0);

  const [compositeFromBaseUrl, setCompositeFromBaseUrl] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inFlightRef = useRef<Record<string, boolean>>({});
  const dRef = useRef<DraftDoc>({ ...DEFAULT_DRAFT });
  const draftIdRef = useRef<string | null>(id ?? null);
  const saveQueueRef = useRef<Promise<any>>(Promise.resolve());

  /**
   * 今見ているプレビュー枠がどの画像スロットか
   */
  const currentSlot: ImageSlot = useMemo(() => {
    if (previewMode === "base") return "base";
    if (previewMode === "idea") return "mood";
    return "composite";
  }, [previewMode]);

  /**
   * 元画像候補
   * - base + materials を一覧化
   */
  const baseCandidates = useMemo(() => {
    const base = String(d.baseImageUrl || "").trim();

    const rawMaterials = Array.isArray((d as any).images?.materials)
      ? ((d as any).images.materials as any[])
      : [];

    const materialUrls = rawMaterials
      .map((item: any) => {
        if (!item) return "";
        if (typeof item === "string") return item.trim();
        if (typeof item === "object") return String(item.url || "").trim();
        return "";
      })
      .filter((v: string) => Boolean(v));

    const list = [...(base ? [base] : []), ...materialUrls];

    return uniqKeepOrder(list, 20);
  }, [d.baseImageUrl, (d as any).images?.materials]);

  /**
   * 合成画像が今の元画像を元に作られたか
   */
  const isCompositeFresh = useMemo(() => {
    const base = String(d.baseImageUrl || "").trim();
    if (!base) return false;
    if (!d.aiImageUrl) return false;

    if (!compositeFromBaseUrl) return true;
    return compositeFromBaseUrl === base;
  }, [d.baseImageUrl, d.aiImageUrl, compositeFromBaseUrl]);

  const brandValue: Brand =
    (String((d as any).brand ?? d.brandId ?? "vento").trim() === "riva" ? "riva" : "vento") as Brand;

  const brandLabel = brandValue === "vento" ? "VENTO" : "RIVA";

  const phaseLabel =
    d.phase === "draft" ? "下書き" : d.phase === "ready" ? "投稿待ち" : "投稿済み";

  const canGenerate = String(d.vision ?? "").trim().length > 0 && !busy;

  /**
   * 背景表示URL
   *
   * 注意
   * - template 選択時は templateBgUrl があっても、
   *   従来の bgDisplayUrl は AI背景枠として使われることがある
   * - そのためここは従来互換のまま bgImageUrl 系を優先
   */
  const bgDisplayUrl =
    bgImageUrl ||
    d.bgImageUrl ||
    (Array.isArray(d.bgImageUrls) ? d.bgImageUrls[0] : "") ||
    "";

  /**
   * 使用シーン表示URL
   */
  const useSceneDisplayUrl =
    useSceneImageUrl ||
    d.useSceneImageUrl ||
    d.imageIdeaUrl ||
    (Array.isArray(d.useSceneImageUrls) && d.useSceneImageUrls.length > 0
      ? d.useSceneImageUrls[0]
      : "") ||
    (Array.isArray(d.imageIdeaUrls) && d.imageIdeaUrls.length > 0
      ? d.imageIdeaUrls[0]
      : "") ||
    "";

  /**
   * ストーリー表示URL
   */
  const storyDisplayUrl =
    storyImageUrl ||
    d.storyImageUrl ||
    (Array.isArray(storyImageUrls) && storyImageUrls.length > 0
      ? storyImageUrls[0]
      : "") ||
    (Array.isArray(d.storyImageUrls) && d.storyImageUrls.length > 0
      ? d.storyImageUrls[0]
      : "") ||
    "";

  const displayVideoUrl = useMemo(() => {
    const nonAiUrls = Array.isArray(d.nonAiVideoUrls) ? d.nonAiVideoUrls : [];

    const u =
      selectedVideoUrl ||
      nonAiVideoPreviewUrl ||
      d.nonAiVideoUrl ||
      (nonAiVideoHistory.length ? nonAiVideoHistory[0] : "") ||
      (nonAiUrls.length > 0 ? nonAiUrls[0] : "");

    const s = String(u ?? "").trim();
    return s ? s : "";
  }, [
    selectedVideoUrl,
    nonAiVideoPreviewUrl,
    d.nonAiVideoUrl,
    d.nonAiVideoUrls,
    nonAiVideoHistory,
  ]);

  const videoCandidates = useMemo(() => {
    const arr: string[] = [];
    const nonAiUrls = Array.isArray(d.nonAiVideoUrls) ? d.nonAiVideoUrls : [];

    if (typeof d.nonAiVideoUrl === "string" && d.nonAiVideoUrl) {
      arr.push(d.nonAiVideoUrl);
    }

    if (typeof selectedVideoUrl === "string" && selectedVideoUrl) {
      arr.push(selectedVideoUrl);
    }

    if (typeof nonAiVideoPreviewUrl === "string" && nonAiVideoPreviewUrl) {
      arr.push(nonAiVideoPreviewUrl);
    }

    if (Array.isArray(nonAiVideoHistory)) {
      arr.push(...nonAiVideoHistory);
    }

    if (nonAiUrls.length) {
      arr.push(...nonAiUrls);
    }

    return uniqKeepOrder(arr, 12);
  }, [
    d.nonAiVideoUrl,
    d.nonAiVideoUrls,
    selectedVideoUrl,
    nonAiVideoPreviewUrl,
    nonAiVideoHistory,
  ]);

  const videoCandidatesTop3 = useMemo(() => {
    return videoCandidates.slice(0, 3);
  }, [videoCandidates]);

  const secondsKey: UiSeconds = (d.videoSeconds ?? 5) === 10 ? 10 : 5;
  const costStandard = pricing.standard[secondsKey];
  const costHigh = pricing.high[secondsKey];

  const pricingMetaText = useMemo(() => {
    const t = pricingUpdatedAt ? new Date(pricingUpdatedAt) : null;
    const hhmm = t
      ? `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`
      : "—";

    return `更新 ${hhmm}${pricingBusy ? "（取得中）" : ""}${pricingError ? "（暫定）" : ""}`;
  }, [pricingUpdatedAt, pricingBusy, pricingError]);

  const OWNER_UID = (process.env.NEXT_PUBLIC_OWNER_UID || "").trim();
  const isOwner = !!uid && !!OWNER_UID && uid === OWNER_UID;

  return {
    DEFAULT_TEXT_OVERLAY,

    uid,
    setUid,

    idToken,
    setIdToken,

    busy,
    setBusy,

    loadBusy,
    setLoadBusy,

    draftId,
    setDraftId,

    d,
    setD,

    uiMsg,
    setUiMsg,

    cutoutBusy,
    setCutoutBusy,

    cutoutReason,
    setCutoutReason,

    backgroundKeyword,
    setBackgroundKeyword,

    /**
     * 商品理解レイヤー
     */
    productCategory,
    setProductCategory,

    productSize,
    setProductSize,

    groundingType,
    setGroundingType,

    sellDirection,
    setSellDirection,

    bgScene,
    setBgScene,

    /**
     * ① 商品写真
     */
    activePhotoMode,
    setActivePhotoMode,

    placementScale,
    setPlacementScale,

    placementX,
    setPlacementX,

    placementY,
    setPlacementY,

    /**
     * テンプレ背景専用
     */
    templateBgUrl,
    setTemplateBgUrl,

    templateBgUrls,
    setTemplateBgUrls,

    templateBgRecommend,
    setTemplateBgRecommend,

    templateBgRecommendReason,
    setTemplateBgRecommendReason,

    /**
     * ② 使用シーン
     */
    useSceneImageUrl,
    setUseSceneImageUrl,

    useSceneImageUrls,
    setUseSceneImageUrls,

    /**
     * ③ サイズ
     */
    sizeTemplateType,
    setSizeTemplateType,

    /**
     * ⑤ ストーリー
     */
    storyImageUrl,
    setStoryImageUrl,

    storyImageUrls,
    setStoryImageUrls,

    staticPurpose,
    setStaticPurpose,

    staticRecommendation,
    setStaticRecommendation,

    staticVariants,
    setStaticVariants,

    staticBusy,
    setStaticBusy,

    recommendReason,
    setRecommendReason,

    videoPickerValue,
    setVideoPickerValue,

    recommendUserLocked,
    setRecommendUserLocked,

    recommendAutoEnabled,
    setRecommendAutoEnabled,

    rightTab,
    setRightTab,

    videoTab,
    setVideoTab,

    previewMode,
    setPreviewMode,

    previewReason,
    setPreviewReason,

    overlayPreviewDataUrl,
    setOverlayPreviewDataUrl,

    videoPreviewUrl,
    setVideoPreviewUrl,

    videoHistory,
    setVideoHistory,

    selectedVideoUrl,
    setSelectedVideoUrl,

    nonAiVideoPreviewUrl,
    setNonAiVideoPreviewUrl,

    nonAiVideoHistory,
    setNonAiVideoHistory,

    nonAiPreset,
    setNonAiPreset,

    nonAiReason,
    setNonAiReason,

    nonAiBusy,
    setNonAiBusy,

    burnReason,
    setBurnReason,

    bgImageUrl,
    setBgImageUrl,

    bgBusy,
    setBgBusy,

    pricing,
    setPricing,

    pricingBusy,
    setPricingBusy,

    pricingError,
    setPricingError,

    pricingUpdatedAt,
    setPricingUpdatedAt,

    compositeFromBaseUrl,
    setCompositeFromBaseUrl,

    canvasRef,
    inFlightRef,
    dRef,
    draftIdRef,
    saveQueueRef,

    currentSlot,
    baseCandidates,
    isCompositeFresh,
    brandLabel,
    phaseLabel,
    canGenerate,
    bgDisplayUrl,
    useSceneDisplayUrl,
    storyDisplayUrl,
    displayVideoUrl,
    videoCandidates,
    videoCandidatesTop3,
    costStandard,
    costHigh,
    pricingMetaText,
    isOwner,
  };
}