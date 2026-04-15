// /app/flow/drafts/new/hooks/useDraftImageActions.ts
"use client";

import React from "react";
import { auth, storage } from "@/firebase";
import { ref, listAll, getDownloadURL, getMetadata, uploadBytes } from "firebase/storage";
import type {
  DraftDoc,
  TextOverlay,
  DraftImage,
  ProductPhotoMode,
  SizeTemplateType,
} from "@/lib/types/draft";
import {
  clamp,
  splitKeywords,
  makePrimary,
  uniqKeepOrder,
  getOverlaySourceUrlForPreview,
  dataUrlToUint8Array,
} from "./useDraftEditorState";

/**
 * 画像関連専用 hook
 *
 * 今回の責務整理
 * - テンプレ背景:
 *   商品を際立たせるための販売背景
 *   → templateBgUrl / templateBgUrls で管理する
 *   → bgImageUrl に橋渡ししない
 *
 * - AI背景:
 *   使用イメージを想起しやすくする背景
 *   → bgImageUrl / bgImageUrls で管理する
 *
 * 重要
 * - templateBgUrl と bgImageUrl を混ぜない
 * - 合成時だけ activePhotoMode を見てどちらを使うか決める
 */

type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";
type BgScene = "studio" | "lifestyle" | "scale" | "detail";

type TemplateBgCategory = "light" | "white" | "dark" | "wood" | "studio";

type TemplateRecommendItem = {
  id: string;
  imageUrl: string;
  category: TemplateBgCategory;
  score: number;
  reason: string;
  reasons: string[];
  tags: string[];
};

type Params = {
  uid: string | null;
  draftId: string | null;
  d: DraftDoc;
  dRef: React.MutableRefObject<DraftDoc>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  inFlightRef: React.MutableRefObject<Record<string, boolean>>;

  currentSlot: "base" | "mood" | "composite";

  staticPurpose: any;
  bgScene: BgScene;
  backgroundKeyword: string;
  bgBusy: boolean;
  bgImageUrl: string | null;
  bgDisplayUrl: string;

  productCategory: ProductCategory;
  productSize: ProductSize;
  groundingType: GroundingType;
  sellDirection: SellDirection;

  activePhotoMode: ProductPhotoMode;
  placementScale: number;
  placementX: number;
  placementY: number;
  shadowOpacity: number;
  shadowBlur: number;
  shadowScale: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  setActivePhotoMode: React.Dispatch<React.SetStateAction<ProductPhotoMode>>;
  setPlacementScale: React.Dispatch<React.SetStateAction<number>>;
  setPlacementX: React.Dispatch<React.SetStateAction<number>>;
  setPlacementY: React.Dispatch<React.SetStateAction<number>>;
  setShadowOpacity: React.Dispatch<React.SetStateAction<number>>;
  setShadowBlur: React.Dispatch<React.SetStateAction<number>>;
  setShadowScale: React.Dispatch<React.SetStateAction<number>>;
  setShadowOffsetX: React.Dispatch<React.SetStateAction<number>>;
  setShadowOffsetY: React.Dispatch<React.SetStateAction<number>>;

  sizeTemplateType: SizeTemplateType;
  setSizeTemplateType: React.Dispatch<React.SetStateAction<SizeTemplateType>>;

  useSceneImageUrl: string | null;
  useSceneImageUrls: string[];
  setUseSceneImageUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setUseSceneImageUrls: React.Dispatch<React.SetStateAction<string[]>>;

  storyImageUrl: string | null;
  storyImageUrls: string[];
  setStoryImageUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setStoryImageUrls: React.Dispatch<React.SetStateAction<string[]>>;

  templateBgUrl?: string | null;
  templateBgUrls?: string[];
  setTemplateBgUrl?: React.Dispatch<React.SetStateAction<string | null>>;
  setTemplateBgUrls?: React.Dispatch<React.SetStateAction<string[]>>;
  templateBgRecommend?: TemplateRecommendItem[];
  setTemplateBgRecommend?: React.Dispatch<React.SetStateAction<TemplateRecommendItem[]>>;
  templateBgRecommendReason?: string;
  setTemplateBgRecommendReason?: React.Dispatch<React.SetStateAction<string>>;

  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setCutoutBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setCutoutReason: React.Dispatch<React.SetStateAction<string>>;
  setBgBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setBgImageUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setPreviewMode: React.Dispatch<React.SetStateAction<"base" | "idea" | "composite">>;
  setPreviewReason: React.Dispatch<React.SetStateAction<string>>;
  setRightTab: React.Dispatch<React.SetStateAction<"image" | "video">>;
  setCompositeFromBaseUrl: React.Dispatch<React.SetStateAction<string>>;

  saveDraft: (partial?: Partial<DraftDoc>) => Promise<string | null>;
  showMsg: (s: string) => void;
};

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeTemplateBgCategory(input: unknown): TemplateBgCategory {
  const v = String(input ?? "").trim();
  if (v === "light") return "light";
  if (v === "white") return "white";
  if (v === "dark") return "dark";
  if (v === "wood") return "wood";
  return "studio";
}

function inferTemplateCategoryFromProduct(input: {
  productCategory: ProductCategory;
  productSize: ProductSize;
  groundingType: GroundingType;
  sellDirection: SellDirection;
}): TemplateBgCategory {
  const { productCategory, groundingType, sellDirection, productSize } = input;

  if (sellDirection === "trust") return "white";
  if (sellDirection === "branding" && productCategory === "furniture") return "dark";
  if (groundingType === "table") return "wood";
  if (groundingType === "floor" && productCategory === "furniture") return "wood";
  if (productCategory === "small") return "white";
  if (productCategory === "apparel") return "white";
  if (productCategory === "goods" && productSize === "small") return "white";
  if (sellDirection === "sales") return "light";

  return "studio";
}

async function uploadDataUrlToStorage(_uid: string, draftId: string, dataUrl: string) {
  if (!draftId) {
    throw new Error("下書きIDがありません（先に保存してください）");
  }

  const m = String(dataUrl || "").match(/^data:(.+?);base64,(.+)$/);
  if (!m) {
    throw new Error("画像データの形が変です");
  }

  const mime = m[1] || "image/png";
  const b64 = m[2] || "";
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const blob = new Blob([bin], { type: mime });

  const fd = new FormData();
  fd.append("draftId", draftId);
  fd.append("file", new File([blob], `dataurl_${Date.now()}.png`, { type: mime }));

  const token = await auth.currentUser?.getIdToken(true);
  if (!token) {
    throw new Error("ログイン情報が取得できません");
  }

  const res = await fetch("/api/upload/image", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: fd,
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error ?? `upload failed (status ${res.status})`);
  }

  const url = String(json.url || "").trim();
  if (!url) {
    throw new Error("アップロードは成功したのにURLが空です");
  }

  return url;
}

async function uploadImageFileAsJpegToStorage(_uid: string, draftId: string, file: File) {
  if (!draftId) {
    throw new Error("下書きIDがありません（先に保存してください）");
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    throw new Error("画像が読めません（HEIC/HEIFの可能性）");
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("画像を作る場所が作れません");
  }

  ctx.drawImage(bitmap, 0, 0);

  const jpg: Blob | null = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
  });

  if (!jpg) {
    throw new Error("JPEG変換に失敗しました");
  }

  const fd = new FormData();
  fd.append("draftId", draftId);
  fd.append("file", new File([jpg], `upload_${Date.now()}.jpg`, { type: "image/jpeg" }));

  const token = await auth.currentUser?.getIdToken(true);
  if (!token) {
    throw new Error("ログイン情報が取得できません");
  }

  const res = await fetch("/api/upload/image", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: fd,
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error ?? `upload failed (status ${res.status})`);
  }

  const url = String(json.url || "").trim();
  if (!url) {
    throw new Error("アップロードは成功したのにURLが空です");
  }

  return url;
}

async function cutoutToPngBlob(file: File): Promise<Blob> {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch("/api/cutout", {
    method: "POST",
    body: fd,
  });

  if (!res.ok) {
    throw new Error(`透過失敗 (status ${res.status})`);
  }

  return await res.blob();
}

async function uploadPngBlobToStorage(_uid: string, draftId: string, blob: Blob) {
  if (!draftId) {
    throw new Error("下書きIDがありません（先に保存してください）");
  }

  const fd = new FormData();
  fd.append("draftId", draftId);
  fd.append("file", new File([blob], `cutout_${Date.now()}.png`, { type: "image/png" }));

  const token = await auth.currentUser?.getIdToken(true);
  if (!token) {
    throw new Error("ログイン情報が取得できません");
  }

  const res = await fetch("/api/upload/image", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: fd,
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error ?? `upload failed (status ${res.status})`);
  }

  const url = String(json.url || "").trim();
  if (!url) {
    throw new Error("アップロードは成功したのにURLが空です");
  }

  return url;
}

async function fetchUrlAsFile(url: string, filename = "base.jpg"): Promise<File> {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error("元画像の取得に失敗しました");
  }

  const blob = await res.blob();
  const type = blob.type || "image/jpeg";
  const ext = type.includes("png") ? "png" : "jpg";

  return new File([blob], `${filename}.${ext}`, { type });
}

async function loadImageAsObjectUrl(src: string) {
  try {
    const res = await fetch(src, { method: "GET" });
    if (!res.ok) return null;

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    return {
      blob,
      objectUrl,
      revoke: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    return null;
  }
}

function normalizeMaterialImages(input: unknown): DraftImage[] {
  const list = Array.isArray(input) ? input : [];
  const out: DraftImage[] = [];

  for (let index = 0; index < list.length; index++) {
    const item = list[index];

    if (typeof item === "string") {
      const url = item.trim();
      if (!url) continue;

      out.push({
        id: `legacy-material-${index}-${Date.now()}`,
        url,
        createdAt: Date.now(),
        role: "product",
      });
      continue;
    }

    if (item && typeof item === "object") {
      const raw = item as Partial<DraftImage>;
      const url = typeof raw.url === "string" ? raw.url.trim() : "";
      if (!url) continue;

      out.push({
        id:
          typeof raw.id === "string" && raw.id.trim()
            ? raw.id.trim()
            : `material-${index}-${Date.now()}`,
        url,
        createdAt:
          typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
            ? raw.createdAt
            : Date.now(),
        role: raw.role === "product" ? "product" : "product",
      });
    }
  }

  return out;
}

function buildMaterialImagesFromUrls(urls: string[], current: DraftImage[]): DraftImage[] {
  const mergedUrls = uniqKeepOrder(
    [
      ...urls.map((u) => String(u || "").trim()).filter(Boolean),
      ...current.map((x) => String(x.url || "").trim()).filter(Boolean),
    ],
    20
  );

  return mergedUrls.map((url, index) => {
    const existing = current.find((x) => String(x.url || "").trim() === url);

    if (existing) {
      return {
        id: existing.id,
        url: existing.url,
        createdAt:
          typeof existing.createdAt === "number" && Number.isFinite(existing.createdAt)
            ? existing.createdAt
            : Date.now(),
        role: existing.role === "product" ? "product" : "product",
      };
    }

    return {
      id: `material-${index}-${Date.now()}`,
      url,
      createdAt: Date.now(),
      role: "product",
    };
  });
}

function resolveProductUnderstanding(input: {
  productCategory: ProductCategory;
  productSize: ProductSize;
  groundingType: GroundingType;
  sellDirection: SellDirection;
  bgScene: BgScene;
  staticPurpose: unknown;
}) {
  const {
    productCategory,
    productSize,
    groundingType,
    sellDirection,
    bgScene,
    staticPurpose,
  } = input;

  const safeCategory: ProductCategory =
    productCategory === "furniture" ||
    productCategory === "goods" ||
    productCategory === "apparel" ||
    productCategory === "small"
      ? productCategory
      : "other";

  const safeSize: ProductSize =
    productSize === "large" || productSize === "small" ? productSize : "medium";

  const safeGrounding: GroundingType =
    groundingType === "table" ||
    groundingType === "hanging" ||
    groundingType === "wall"
      ? groundingType
      : "floor";

  const safeSellDirection: SellDirection =
    sellDirection === "branding" ||
    sellDirection === "trust" ||
    sellDirection === "story"
      ? sellDirection
      : staticPurpose === "branding"
        ? "branding"
        : staticPurpose === "trust"
          ? "trust"
          : staticPurpose === "story"
            ? "story"
            : "sales";

  const safeBgScene: BgScene =
    bgScene === "lifestyle" ||
    bgScene === "scale" ||
    bgScene === "detail"
      ? bgScene
      : "studio";

  return {
    productCategory: safeCategory,
    productSize: safeSize,
    groundingType: safeGrounding,
    sellDirection: safeSellDirection,
    bgScene: safeBgScene,
  };
}

function resolveSizeTemplatePreview(type: SizeTemplateType, baseUrl: string): string {
  if (!baseUrl) return "";

  if (type === "measure") return baseUrl;
  if (type === "compare") return baseUrl;
  if (type === "simple") return baseUrl;

  return baseUrl;
}

/**
 * 文字合成時に、どの画像を土台に使うかを安全に決める関数
 *
 * 重要:
 * - 既存の getOverlaySourceUrlForPreview() は残す
 * - ただし currentSlot が composite の時だけ、
 *   ④で見ている合成画像を優先する
 * - これにより既存の ① / ② / ⑤ 系の挙動を壊さない
 */
function resolveOverlayRenderSourceUrl(
  cur: DraftDoc,
  currentSlot: "base" | "mood" | "composite"
): string {
  if (currentSlot === "composite") {
const compositeCandidates = [
  cur.aiImageUrl,
  cur.compositeImageUrl,
  cur.imageUrl,
  cur.stageImageUrl,
]            .map((v) => String(v || "").trim())
      .filter(Boolean);

    if (compositeCandidates.length > 0) {
      return compositeCandidates[0];
    }
  }

  return String(getOverlaySourceUrlForPreview(cur) || "").trim();
}

export default function useDraftImageActions(params: Params) {
  const {
    uid,
    draftId,
    d,
    dRef,
    canvasRef,
    inFlightRef,

    currentSlot,

    staticPurpose,
    bgScene,
    backgroundKeyword,
    bgBusy,
    bgImageUrl,
    bgDisplayUrl,

    productCategory,
    productSize,
    groundingType,
    sellDirection,

    activePhotoMode,
    placementScale,
    placementX,
    placementY,
    shadowOpacity,
    shadowBlur,
    shadowScale,
    shadowOffsetX,
    shadowOffsetY,
    setActivePhotoMode,
    setPlacementScale,
    setPlacementX,
    setPlacementY,
    setShadowOpacity,
    setShadowBlur,
    setShadowScale,
    setShadowOffsetX,
    setShadowOffsetY,

    sizeTemplateType,
    setSizeTemplateType,

    useSceneImageUrl,
    useSceneImageUrls,
    setUseSceneImageUrl,
    setUseSceneImageUrls,

    storyImageUrl,
    storyImageUrls,
    setStoryImageUrl,
    setStoryImageUrls,

    templateBgUrl = null,
    templateBgUrls = [],
    setTemplateBgUrl,
    setTemplateBgUrls,
    templateBgRecommend = [],
    setTemplateBgRecommend,
    templateBgRecommendReason,
    setTemplateBgRecommendReason,

    setD,
    setBusy,
    setCutoutBusy,
    setCutoutReason,
    setBgBusy,
    setBgImageUrl,
    setPreviewMode,
    setPreviewReason,
    setRightTab,
    setCompositeFromBaseUrl,

    saveDraft,
    showMsg,
  } = params;

  void useSceneImageUrl;
  void useSceneImageUrls;
  void storyImageUrl;
  void templateBgRecommendReason;

  function commitDraftPatch(patch: Partial<DraftDoc>) {
    const next = { ...dRef.current, ...patch } as DraftDoc;
    dRef.current = next;
    setD(next);
    return next;
  }

  async function saveProductPlacement(partial?: {
    scale?: number;
    x?: number;
    y?: number;
    shadowOpacity?: number;
    shadowBlur?: number;
    shadowScale?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    activePhotoMode?: ProductPhotoMode;
  }) {
    const nextScale = clamp(Number(partial?.scale ?? placementScale ?? 1), 0.4, 2.2);
    const nextX = clamp(Number(partial?.x ?? placementX ?? 0.5), 0, 1);
    const nextY = clamp(Number(partial?.y ?? placementY ?? 0.5), 0, 1);
    const nextShadowOpacity = clamp(Number(partial?.shadowOpacity ?? shadowOpacity ?? 0.12), 0, 1);
    const nextShadowBlur = clamp(Number(partial?.shadowBlur ?? shadowBlur ?? 12), 0, 100);
    const nextShadowScale = clamp(Number(partial?.shadowScale ?? shadowScale ?? 1), 0.5, 2);
    const nextShadowOffsetX = clamp(Number(partial?.shadowOffsetX ?? shadowOffsetX ?? 0), -1, 1);
    const nextShadowOffsetY = clamp(
      Number(partial?.shadowOffsetY ?? shadowOffsetY ?? 0.02),
      -1,
      1
    );
    const nextMode = (partial?.activePhotoMode ?? activePhotoMode ?? "ai_bg") as ProductPhotoMode;

    setPlacementScale(nextScale);
    setPlacementX(nextX);
    setPlacementY(nextY);
    setShadowOpacity(nextShadowOpacity);
    setShadowBlur(nextShadowBlur);
    setShadowScale(nextShadowScale);
    setShadowOffsetX(nextShadowOffsetX);
    setShadowOffsetY(nextShadowOffsetY);
    setActivePhotoMode(nextMode);

    commitDraftPatch({
      activePhotoMode: nextMode,
      placement: {
        scale: nextScale,
        x: nextX,
        y: nextY,
        shadow: {
          opacity: nextShadowOpacity,
          blur: nextShadowBlur,
          scale: nextShadowScale,
          offsetX: nextShadowOffsetX,
          offsetY: nextShadowOffsetY,
        },
      },
      shadowOpacity: nextShadowOpacity,
      shadowBlur: nextShadowBlur,
      shadowScale: nextShadowScale,
      shadowOffsetX: nextShadowOffsetX,
      shadowOffsetY: nextShadowOffsetY,
    });

    await saveDraft({
      activePhotoMode: nextMode,
      placement: {
        scale: nextScale,
        x: nextX,
        y: nextY,
        shadow: {
          opacity: nextShadowOpacity,
          blur: nextShadowBlur,
          scale: nextShadowScale,
          offsetX: nextShadowOffsetX,
          offsetY: nextShadowOffsetY,
        },
      },
      shadowOpacity: nextShadowOpacity,
      shadowBlur: nextShadowBlur,
      shadowScale: nextShadowScale,
      shadowOffsetX: nextShadowOffsetX,
      shadowOffsetY: nextShadowOffsetY,
    } as any);

    showMsg("① 商品写真の位置・大きさ・影を保存しました");
  }

  async function applySizeTemplate(type: SizeTemplateType) {
    const safeType: SizeTemplateType = type === "measure" || type === "compare" ? type : "simple";

    const baseUrl = String(dRef.current.baseImageUrl || "").trim();
    const previewUrl = resolveSizeTemplatePreview(safeType, baseUrl) || undefined;

    setSizeTemplateType(safeType);

    commitDraftPatch({
      sizeTemplateType: safeType,
      sizeTemplateImageUrl: previewUrl,
    });

    await saveDraft({
      sizeTemplateType: safeType,
      sizeTemplateImageUrl: previewUrl,
    } as any);

    showMsg("③ サイズテンプレを保存しました");
  }

  /**
   * テンプレ背景選択
   *
   * 重要
   * - templateBgUrl にだけ保存する
   * - bgImageUrl へ橋渡ししない
   * - activePhotoMode だけ template に寄せる
   */
  async function selectTemplateBackground(url: string) {
    const nextUrl = String(url || "").trim();
    if (!nextUrl) {
      showMsg("テンプレ背景URLが空です");
      return;
    }

    const nextUrls = uniqKeepOrder(
      [
        nextUrl,
        ...(Array.isArray(dRef.current.templateBgUrls) ? dRef.current.templateBgUrls : []),
        ...(Array.isArray(templateBgUrls) ? templateBgUrls : []),
      ],
      20
    );

    if (typeof setTemplateBgUrl === "function") {
      setTemplateBgUrl(nextUrl);
    }

    if (typeof setTemplateBgUrls === "function") {
      setTemplateBgUrls(nextUrls);
    }

    setActivePhotoMode("template");

    commitDraftPatch({
      templateBgUrl: nextUrl,
      templateBgUrls: nextUrls,
      activePhotoMode: "template",
    });

    await saveDraft({
      templateBgUrl: nextUrl,
      templateBgUrls: nextUrls,
      activePhotoMode: "template",
    } as any);

    showMsg("✅ テンプレ背景を選択しました");
  }

  async function fetchTemplateRecommendations() {
    if (!uid) {
      showMsg("ログインしてください");
      return [];
    }

    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) {
      showMsg("下書きIDの確定に失敗しました");
      return [];
    }

    const urls = uniqKeepOrder(
      [
        ...(Array.isArray(dRef.current.templateBgUrls) ? dRef.current.templateBgUrls : []),
        ...(Array.isArray(templateBgUrls) ? templateBgUrls : []),
      ],
      30
    );

    if (urls.length === 0) {
      showMsg("先にテンプレ背景を生成してください");
      return [];
    }

    const key = "recommendTemplateBg";
    if (inFlightRef.current[key]) {
      return Array.isArray(templateBgRecommend) ? templateBgRecommend : [];
    }

    inFlightRef.current[key] = true;
    setBusy(true);

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        throw new Error("no token");
      }

      const res = await fetch("/api/template-backgrounds/recommend", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          draftId: ensuredDraftId,
          productCategory,
          productSize,
          groundingType,
          sellDirection,
          templateBgUrls: urls,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "template recommend error");
      }

      const rawRecommended = Array.isArray(json?.recommended) ? json.recommended : [];

      const recommended = rawRecommended
        .map((item: any, index: number) => ({
          id: String(item?.id || `rec-${index}-${Date.now()}`),
          imageUrl: String(item?.url || item?.imageUrl || "").trim(),
          category: normalizeTemplateBgCategory(item?.category),
          score: Number(item?.score || 0),
          reason: String(item?.reason || "").trim(),
          reasons: Array.isArray(item?.reasons) ? item.reasons : [],
          tags: Array.isArray(item?.tags) ? item.tags : [],
        }))
        .filter((item: { imageUrl: string }) => item.imageUrl);

      const topReason =
        typeof json?.picked?.reason === "string" && json.picked.reason.trim()
          ? json.picked.reason.trim()
          : recommended.length > 0
            ? String(recommended[0]?.reason || "").trim()
            : "";

      if (typeof setTemplateBgRecommend === "function") {
        setTemplateBgRecommend(recommended as any);
      }

      if (typeof setTemplateBgRecommendReason === "function") {
        setTemplateBgRecommendReason(topReason);
      }

      if (recommended.length > 0) {
        showMsg("✅ テンプレ背景のおすすめを更新しました");
      } else {
        showMsg("テンプレ背景のおすすめ候補がありませんでした");
      }

      return {
        recommended,
        topReason,
      };
    } catch (e: any) {
      console.error(e);
      showMsg(`テンプレ背景おすすめ取得に失敗：${e?.message || "不明"}`);
      return [];
    } finally {
      setBusy(false);
      inFlightRef.current[key] = false;
    }
  }

  /**
   * テンプレ背景生成
   *
   * 重要
   * - baseImageUrl は送るが、サーバ側では画像参照生成には使わない設計へ変更済み
   * - templateBgUrl 系だけ更新する
   * - bgImageUrl へ橋渡ししない
   */
  async function generateTemplateBackground(category?: TemplateBgCategory): Promise<string> {
    if (!uid) {
      throw new Error("no uid");
    }

    const key = "generateTemplateBg";
    if (inFlightRef.current[key]) {
      throw new Error("テンプレ背景生成中です");
    }

    const baseImageUrl = String(dRef.current.baseImageUrl || "").trim();
    if (!baseImageUrl) {
      throw new Error("元画像がありません。先に商品画像を用意してください。");
    }

    const effectiveVision = (((dRef.current as any).selectedStaticPrompt ?? dRef.current.vision) || "").trim();

    if (!effectiveVision) {
      throw new Error("Vision（必須）が空です");
    }

    inFlightRef.current[key] = true;
    setBusy(true);

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        throw new Error("no token");
      }

      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) {
        throw new Error("failed to create draft");
      }

      const brandId =
        (String((dRef.current as any).brand ?? "").trim() ||
          String(dRef.current.brandId ?? "").trim() ||
          "vento") as "vento" | "riva";

      const keywordsText = String((dRef.current as any).keywordsText ?? dRef.current.keywords ?? "");

      const resolvedCategory = normalizeTemplateBgCategory(
        category ??
          inferTemplateCategoryFromProduct({
            productCategory,
            productSize,
            groundingType,
            sellDirection,
          })
      );

      const res = await fetch("/api/template-backgrounds/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          draftId: ensuredDraftId,
          brandId,
          vision: effectiveVision,
          keywords: splitKeywords(keywordsText),
          referenceImageUrl: baseImageUrl,
          templateCategory: resolvedCategory,
          productCategory,
          productSize,
          groundingType,
          sellDirection,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "template background generate error");
      }

      const outUrl = asTrimmedString(json?.url);
      if (!outUrl) {
        throw new Error("テンプレ背景URLが返りませんでした");
      }

      const nextUrls = uniqKeepOrder(
        [
          outUrl,
          ...(Array.isArray(dRef.current.templateBgUrls) ? dRef.current.templateBgUrls : []),
          ...(Array.isArray(templateBgUrls) ? templateBgUrls : []),
        ],
        20
      );

      if (typeof setTemplateBgUrl === "function") {
        setTemplateBgUrl(outUrl);
      }

      if (typeof setTemplateBgUrls === "function") {
        setTemplateBgUrls(nextUrls);
      }

      setActivePhotoMode("template");

      commitDraftPatch({
        templateBgUrl: outUrl,
        templateBgUrls: nextUrls,
        activePhotoMode: "template",
      });

      await saveDraft({
        templateBgUrl: outUrl,
        templateBgUrls: nextUrls,
        activePhotoMode: "template",
      } as any);

      showMsg("✅ テンプレ背景を生成しました");
      return outUrl;
    } finally {
      setBusy(false);
      inFlightRef.current[key] = false;
    }
  }

  async function clearTemplateBgHistory() {
    if (!uid) return;

    if (!draftId) {
      showMsg("この下書きはまだ作成されていません");
      return;
    }

    if (typeof setTemplateBgUrl === "function") {
      setTemplateBgUrl(null);
    }

    if (typeof setTemplateBgUrls === "function") {
      setTemplateBgUrls([]);
    }

    if (typeof setTemplateBgRecommend === "function") {
      setTemplateBgRecommend([]);
    }

    if (typeof setTemplateBgRecommendReason === "function") {
      setTemplateBgRecommendReason("");
    }

    setD((prev) => ({
      ...prev,
      templateBgUrl: undefined,
      templateBgUrls: [],
    }) as any);

    await saveDraft({
      templateBgUrl: undefined,
      templateBgUrls: [],
    } as any);

    showMsg("テンプレ背景履歴をクリアしました");
  }

  async function syncTemplateBgImagesFromStorage() {
    if (!uid) return;

    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) {
      showMsg("下書きIDの確定に失敗しました");
      return;
    }

    const key = "syncTemplateBgs";
    if (inFlightRef.current[key]) return;
    inFlightRef.current[key] = true;

    setBusy(true);

    try {
      const folderPath = `users/${uid}/drafts/${ensuredDraftId}/template-bg`;
      const found: { url: string; t: number }[] = [];

      async function scanFolder(path: string): Promise<void> {
        const folderRef = ref(storage, path);
        const listed = await listAll(folderRef);

        for (const itemRef of listed.items) {
          const name = String(itemRef.name || "").toLowerCase();

          if (
            !(
              name.endsWith(".png") ||
              name.endsWith(".jpg") ||
              name.endsWith(".jpeg") ||
              name.endsWith(".webp")
            )
          ) {
            continue;
          }

          try {
            const meta = await getMetadata(itemRef);
            const t = meta?.timeCreated ? new Date(meta.timeCreated).getTime() : 0;
            const url = await getDownloadURL(itemRef);

            if (typeof url === "string" && url.trim()) {
              found.push({ url, t });
            }
          } catch {
            //
          }
        }

        for (const p of listed.prefixes) {
          await scanFolder(p.fullPath);
        }
      }

      await scanFolder(folderPath);

      if (found.length === 0) {
        showMsg("この下書きのテンプレ背景が見つかりませんでした");
        return;
      }

      const seen = new Set<string>();
      const nextUrls = found
        .slice()
        .sort((a, b) => (b.t ?? 0) - (a.t ?? 0))
        .map((x) => x.url)
        .filter((u) => typeof u === "string" && u.trim())
        .filter((u) => {
          if (seen.has(u)) return false;
          seen.add(u);
          return true;
        })
        .slice(0, 20);

      const head = nextUrls[0] ?? undefined;

      if (typeof setTemplateBgUrl === "function") {
        setTemplateBgUrl(head ?? null);
      }

      if (typeof setTemplateBgUrls === "function") {
        setTemplateBgUrls(nextUrls);
      }

      setD((prev) => ({
        ...prev,
        templateBgUrl: head,
        templateBgUrls: nextUrls,
      }) as any);

      await saveDraft({
        templateBgUrl: head,
        templateBgUrls: nextUrls,
      } as any);

      showMsg(`テンプレ背景を同期しました：${nextUrls.length}件`);
    } catch (e: any) {
      console.error(e);
      showMsg(`テンプレ背景同期に失敗しました：${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current[key] = false;
    }
  }

async function renderOverlayToCanvasAndGetDataUrlBySlot(
  slot: "base" | "mood" | "composite"
): Promise<string | null> {
  const cur = dRef.current;

  /**
   * 重要
   * - 画面上の既存 canvasRef に依存すると、
   *   その時点で未マウントなら null になって失敗する
   * - ④文字焼き込み保存は非表示でも確実に動いてほしいので、
   *   ここで毎回ローカル canvas を新規作成する
   */
  const canvas = document.createElement("canvas");

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const SIZE = 1024;
  canvas.width = SIZE;
  canvas.height = SIZE;

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = "#0b0f18";
  ctx.fillRect(0, 0, SIZE, SIZE);

const src = resolveOverlayRenderSourceUrl(cur, slot);
if (!src) {
  throw new Error(`overlay source が空です: slot=${slot}`);
}

const loaded = await loadImageAsObjectUrl(src);
if (!loaded) {
  throw new Error(`overlay source の読込に失敗しました: slot=${slot}`);
}

  try {
    const img = new Image();
    img.src = loaded.objectUrl;

    const ok = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    });

    if (!ok) return null;

    const iw = img.naturalWidth || SIZE;
    const ih = img.naturalHeight || SIZE;
    const scale = Math.min(SIZE / iw, SIZE / ih);
    const w = iw * scale;
    const h = ih * scale;
    const x = (SIZE - w) / 2;
    const y = (SIZE - h) / 2;

    ctx.drawImage(img, x, y, w, h);
  } finally {
    loaded.revoke();
  }

  const slotOverlay = (cur.textOverlayBySlot?.[slot] ?? null) as TextOverlay | null;

  const overlayText = Array.isArray(slotOverlay?.lines)
    ? slotOverlay.lines.join("\n").trim()
    : typeof slotOverlay?.text === "string"
      ? slotOverlay.text.trim()
      : "";

  if (overlayText) {
    const fontPx = Math.max(10, Math.round(slotOverlay?.fontSize ?? 64));
    const lineH = Math.max(10, Math.round((slotOverlay?.lineHeight ?? 1.25) * fontPx));

    ctx.font = `900 ${fontPx}px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
    ctx.textBaseline = "top";

    const maxWidth = Math.floor(SIZE * 0.86);

    const rawLines =
      Array.isArray(slotOverlay?.lines) && slotOverlay.lines.length
        ? slotOverlay.lines.map((s: string) => String(s ?? ""))
        : overlayText.split("\n");

    const fixedLines: string[] = [];

    for (const ln0 of rawLines) {
      let buf = "";

      for (const ch of ln0) {
        const t = buf + ch;

        if (ctx.measureText(t).width <= maxWidth) {
          buf = t;
        } else {
          if (buf) fixedLines.push(buf);
          buf = ch;
        }
      }

      if (buf) fixedLines.push(buf);
    }

    const blockH = fixedLines.length * lineH;
    const yRaw = typeof slotOverlay?.y === "number" ? slotOverlay.y : 0;
    const y01 = yRaw > 1 ? clamp(yRaw / 100, 0, 1) : clamp(yRaw, 0, 1);
    const topY = Math.round((SIZE - blockH) * y01);
    const pad = Math.round(SIZE * 0.035);

    const bg = slotOverlay?.background;

    if (bg?.enabled) {
      ctx.fillStyle = bg.color || "rgba(0,0,0,0.45)";
      const rectY = Math.max(0, topY - Math.round(pad * 0.6));
      const rectH = Math.min(SIZE - rectY, blockH + Math.round(pad * 1.2));
      ctx.fillRect(0, rectY, SIZE, rectH);
    }

    ctx.fillStyle = slotOverlay?.color || "rgba(255,255,255,0.95)";

    for (let i = 0; i < fixedLines.length; i++) {
      const ln = fixedLines[i];
      const textW = ctx.measureText(ln).width;

      const xRaw = typeof slotOverlay?.x === "number" ? slotOverlay.x : 0.5;
      const x01 = xRaw > 1 ? clamp(xRaw / 100, 0, 1) : clamp(xRaw, 0, 1);
      const tx = Math.round((SIZE - textW) * x01);

      const ty = topY + i * lineH;
      ctx.fillText(ln, tx, ty);
    }
  }

  return canvas.toDataURL("image/png");
}

async function renderToCanvasAndGetDataUrlSilent(): Promise<string | null> {
  return await renderOverlayToCanvasAndGetDataUrlBySlot(currentSlot);
}
  async function cutoutCurrentBaseToReplace() {
    if (!uid) {
      showMsg("❌ ログインしてください");
      return;
    }

    const base = String(dRef.current.baseImageUrl || "").trim();
    if (!base) {
      showMsg("❌ 元画像がありません");
      return;
    }

    const key = "cutoutBase";
    if (inFlightRef.current[key]) {
      setCutoutReason("透過はすでに実行中です");
      return;
    }

    inFlightRef.current[key] = true;
    setCutoutBusy(true);
    setCutoutReason("");

    try {
      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) {
        throw new Error("下書きIDが作れませんでした");
      }

      const file = await fetchUrlAsFile(base, "base_before_cutout");
      const pngBlob = await cutoutToPngBlob(file);
      const newBaseUrl = await uploadPngBlobToStorage(uid, ensuredDraftId, pngBlob);

      commitDraftPatch({
        baseImageUrl: newBaseUrl,
        foregroundImageUrl: undefined,
        imageSource: "upload",
        phase: "draft",
        images: {
          ...(dRef.current.images ?? { primary: null, materials: [] }),
          primary: makePrimary(newBaseUrl),
        },
      });

      await saveDraft({
        baseImageUrl: newBaseUrl,
        foregroundImageUrl: undefined,
        imageSource: "upload",
        phase: "draft",
        images: {
          ...(dRef.current.images ?? { primary: null, materials: [] }),
          primary: makePrimary(newBaseUrl),
        },
      });

      showMsg("✅ 元画像を透過して置き換えました");
    } catch (e: any) {
      console.error(e);
      showMsg(`❌ 透過に失敗：${e?.message || "不明"}`);
    } finally {
      setCutoutBusy(false);
      inFlightRef.current[key] = false;
    }
  }

  async function onUploadImageFilesNew(files: File[]) {
    if (!uid) return;
    if (!files || files.length === 0) return;

    if (inFlightRef.current["upload"]) return;
    inFlightRef.current["upload"] = true;

    setBusy(true);

    try {
      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) {
        throw new Error("下書きIDが作れませんでした");
      }

      const list = Array.from(files);
      const hasBase = !!String(dRef.current.baseImageUrl || "").trim();

      let baseUrl = hasBase ? String(dRef.current.baseImageUrl || "").trim() : "";
      const uploadedMaterialUrls: string[] = [];

      if (!hasBase) {
        const first = list[0];
        if (!first) {
          throw new Error("画像がありません");
        }

        const firstType = String(first.type || "").toLowerCase();
        const firstName = String(first.name || "").toLowerCase();
        const isHeic =
          firstType.includes("image/heic") ||
          firstType.includes("image/heif") ||
          firstName.endsWith(".heic") ||
          firstName.endsWith(".heif");

        if (isHeic) {
          baseUrl = await uploadImageFileAsJpegToStorage(uid, ensuredDraftId, first);
        } else {
          const pngBlob = await cutoutToPngBlob(first);
          baseUrl = await uploadPngBlobToStorage(uid, ensuredDraftId, pngBlob);
        }

        if (!baseUrl) {
          throw new Error("元画像アップロード結果が空です");
        }

        const rest = list.slice(1);

        for (const f of rest) {
          const url = await uploadImageFileAsJpegToStorage(uid, ensuredDraftId, f);
          uploadedMaterialUrls.push(url);
        }
      } else {
        for (const f of list) {
          const url = await uploadImageFileAsJpegToStorage(uid, ensuredDraftId, f);
          uploadedMaterialUrls.push(url);
        }
      }

      const curMaterials = normalizeMaterialImages(dRef.current.images?.materials);
      const nextMaterials = buildMaterialImagesFromUrls(uploadedMaterialUrls, curMaterials);

      commitDraftPatch({
        baseImageUrl: baseUrl,
        foregroundImageUrl: undefined,
        imageSource: "upload",
        phase: "draft",
        images: {
          ...(dRef.current.images ?? { primary: null, materials: [] }),
          primary: makePrimary(baseUrl),
          materials: nextMaterials,
        },
        detailImageUrl: baseUrl || dRef.current.detailImageUrl,
      });

      await saveDraft({
        baseImageUrl: baseUrl,
        foregroundImageUrl: undefined,
        imageSource: "upload",
        phase: "draft",
        images: {
          ...(dRef.current.images ?? { primary: null, materials: [] }),
          primary: makePrimary(baseUrl),
          materials: nextMaterials,
        },
        detailImageUrl: baseUrl || dRef.current.detailImageUrl,
      });

      if (!hasBase) {
        showMsg(`✅ 元画像を透過してセットしました（＋素材 ${uploadedMaterialUrls.length}枚）`);
      } else {
        showMsg(`✅ 素材を追加しました：${uploadedMaterialUrls.length}枚`);
      }
    } catch (e: any) {
      console.error(e);
      showMsg(`❌ アップロード失敗：${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["upload"] = false;
    }
  }

  async function promoteMaterialToBase(url: string) {
    if (!uid) return;

    const u = String(url || "").trim();
    if (!u) return;

    const currentBase = String(dRef.current.baseImageUrl || "").trim();
    if (currentBase === u) {
      showMsg("この画像が現在の元画像です");
      return;
    }

    const curMaterials = normalizeMaterialImages(dRef.current.images?.materials);

    const nextMaterialUrls = uniqKeepOrder(
      [
        ...(currentBase ? [currentBase] : []),
        ...curMaterials.map((x) => String(x.url || "").trim()).filter((x) => x && x !== u),
      ],
      20
    );

    const nextMaterials: DraftImage[] = nextMaterialUrls.map((materialUrl, index) => {
      const existing = curMaterials.find((x) => String(x.url || "").trim() === materialUrl);

      if (existing) {
        return {
          id: existing.id,
          url: existing.url,
          createdAt:
            typeof existing.createdAt === "number" && Number.isFinite(existing.createdAt)
              ? existing.createdAt
              : Date.now(),
          role: existing.role === "product" ? "product" : "product",
        };
      }

      return {
        id: `material-promoted-${index}-${Date.now()}`,
        url: materialUrl,
        createdAt: Date.now(),
        role: "product",
      };
    });

    commitDraftPatch({
      baseImageUrl: u,
      foregroundImageUrl: undefined,
      imageSource: "upload",
      phase: "draft",
      images: {
        ...(dRef.current.images ?? { primary: null, materials: [] }),
        primary: makePrimary(u),
        materials: nextMaterials,
      },
      detailImageUrl: u,
    });

    await saveDraft({
      baseImageUrl: u,
      foregroundImageUrl: undefined,
      imageSource: "upload",
      phase: "draft",
      images: {
        ...(dRef.current.images ?? { primary: null, materials: [] }),
        primary: makePrimary(u),
        materials: nextMaterials,
      },
      detailImageUrl: u,
    });

    showMsg("✅ 元画像を入れ替えました（①に反映）");
  }

  async function generateAiImage() {
    if (!uid) return;

    const baseImageUrl = String(dRef.current.baseImageUrl || "").trim();
    if (!baseImageUrl) {
      showMsg("先に元画像を入れてください");
      return;
    }

    const effectiveVision = (((dRef.current as any).selectedStaticPrompt ?? dRef.current.vision) || "").trim();

    if (!effectiveVision) {
      showMsg("Vision（必須）を入力してください");
      return;
    }

    if (inFlightRef.current["image"]) return;
    inFlightRef.current["image"] = true;

    setBusy(true);

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        throw new Error("no token");
      }

      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) {
        throw new Error("failed to create draft");
      }

      const brandId =
        (String((dRef.current as any).brand ?? "").trim() ||
          String(dRef.current.brandId ?? "").trim() ||
          "vento") as "vento" | "riva";

      const keywordsText = String((dRef.current as any).keywordsText ?? dRef.current.keywords ?? "");

      const understanding = resolveProductUnderstanding({
        productCategory,
        productSize,
        groundingType,
        sellDirection,
        bgScene,
        staticPurpose,
      });

      const body = {
        brandId,
        vision: effectiveVision,
        keywords: splitKeywords(keywordsText),
        tone: "",
        prompt: "",
        referenceImageUrl: baseImageUrl,
        generationMode: "usage_scene_regeneration",
        productCategory: understanding.productCategory,
        productSize: understanding.productSize,
        groundingType: understanding.groundingType,
        sellDirection: understanding.sellDirection,
        bgScene: understanding.bgScene,
        imageSize: "1024x1024",
        draftId: ensuredDraftId,
      };

      const r = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(j?.error || "image error");
      }

      let outUrl = "";

      const urlLike =
        (typeof j?.imageUrl === "string" && j.imageUrl) ||
        (typeof j?.url === "string" && j.url) ||
        (typeof j?.outputUrl === "string" && j.outputUrl) ||
        "";

      if (urlLike && /^https?:\/\//.test(urlLike)) {
        outUrl = urlLike;
      } else if (typeof j?.dataUrl === "string" && j.dataUrl.startsWith("data:image/")) {
        outUrl = await uploadDataUrlToStorage(uid, ensuredDraftId, j.dataUrl);
      } else if (typeof j?.b64 === "string" && j.b64) {
        outUrl = await uploadDataUrlToStorage(uid, ensuredDraftId, `data:image/png;base64,${j.b64}`);
      } else {
        throw new Error("生成結果が取得できません（url/imageUrl/outputUrl/dataUrl/b64 が無い）");
      }

      const currentSceneUrlsA = Array.isArray(dRef.current.useSceneImageUrls)
        ? dRef.current.useSceneImageUrls.map((u) => String(u ?? "").trim()).filter(Boolean)
        : [];
      const currentSceneUrlsB = Array.isArray((dRef.current as any).imageIdeaUrls)
        ? (dRef.current as any).imageIdeaUrls.map((u: unknown) => String(u ?? "").trim()).filter(Boolean)
        : [];
      const nextSceneUrls = uniqKeepOrder([outUrl, ...currentSceneUrlsA, ...currentSceneUrlsB], 10);

      const meta = {
        kind: "usage_scene_regeneration",
        label: "② 使用シーン：元画像からAI再生成",
        detail: `scene=${understanding.bgScene} / direction=${understanding.sellDirection}`,
        usedVision: effectiveVision,
        selectedVariantId: (dRef.current as any).selectedStaticVariantId,
        selectedVariantTitle: (dRef.current as any).selectedStaticVariantTitle,
        purpose: String(staticPurpose ?? ""),
        bgScene: String(understanding.bgScene ?? ""),
        referenceImageUrl: baseImageUrl,
        at: Date.now(),
      } as const;

      setUseSceneImageUrl(outUrl);
      setUseSceneImageUrls(nextSceneUrls);

      setD((prev) => ({
        ...prev,
        useSceneImageUrl: outUrl,
        useSceneImageUrls: nextSceneUrls,
        imageIdeaUrl: outUrl,
        imageIdeaUrls: nextSceneUrls,
        originMeta: { ...((prev as any).originMeta ?? {}), idea: meta },
      }) as any);

      await saveDraft({
        useSceneImageUrl: outUrl,
        useSceneImageUrls: nextSceneUrls,
        imageIdeaUrl: outUrl,
        imageIdeaUrls: nextSceneUrls,
        phase: "draft",
        originMeta: { ...((dRef.current as any).originMeta ?? {}), idea: meta },
      } as any);

      setRightTab("image");
      setPreviewMode("idea");
      setPreviewReason("使用シーン画像を生成しました（②に表示）");
      showMsg("使用シーン画像を保存しました（②に表示）");
    } catch (e: any) {
      console.error(e);
      showMsg(`使用シーン生成に失敗しました\n\n原因: ${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["image"] = false;
    }
  }

  async function generateStoryImage() {
    if (!uid) return;

    const baseImageUrl = String(dRef.current.baseImageUrl || "").trim();
    if (!baseImageUrl) {
      showMsg("先に元画像を入れてください");
      return;
    }

    const effectiveVision = (((dRef.current as any).selectedStaticPrompt ?? dRef.current.vision) || "").trim();

    if (!effectiveVision) {
      showMsg("Vision（必須）を入力してください");
      return;
    }

    if (inFlightRef.current["storyImage"]) return;
    inFlightRef.current["storyImage"] = true;

    setBusy(true);

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        throw new Error("no token");
      }

      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) {
        throw new Error("failed to create draft");
      }

      const brandId =
        (String((dRef.current as any).brand ?? "").trim() ||
          String(dRef.current.brandId ?? "").trim() ||
          "vento") as "vento" | "riva";

      const keywordsText = String((dRef.current as any).keywordsText ?? dRef.current.keywords ?? "");

      const understanding = resolveProductUnderstanding({
        productCategory,
        productSize,
        groundingType,
        sellDirection: "story",
        bgScene,
        staticPurpose: "story",
      });

      const body = {
        brandId,
        vision: effectiveVision,
        keywords: splitKeywords(keywordsText),
        tone: "",
        prompt: "",
        referenceImageUrl: baseImageUrl,
        generationMode: "story_regeneration",
        productCategory: understanding.productCategory,
        productSize: understanding.productSize,
        groundingType: understanding.groundingType,
        sellDirection: understanding.sellDirection,
        bgScene: understanding.bgScene,
        imageSize: "1024x1024",
        draftId: ensuredDraftId,
      };

      const r = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(j?.error || "story image error");
      }

      let outUrl = "";

      const urlLike =
        (typeof j?.imageUrl === "string" && j.imageUrl) ||
        (typeof j?.url === "string" && j.url) ||
        (typeof j?.outputUrl === "string" && j.outputUrl) ||
        "";

      if (urlLike && /^https?:\/\//.test(urlLike)) {
        outUrl = urlLike;
      } else if (typeof j?.dataUrl === "string" && j.dataUrl.startsWith("data:image/")) {
        outUrl = await uploadDataUrlToStorage(uid, ensuredDraftId, j.dataUrl);
      } else if (typeof j?.b64 === "string" && j.b64) {
        outUrl = await uploadDataUrlToStorage(uid, ensuredDraftId, `data:image/png;base64,${j.b64}`);
      } else {
        throw new Error("生成結果が取得できません（url/imageUrl/outputUrl/dataUrl/b64 が無い）");
      }

      const currentStoryUrlsA = Array.isArray(dRef.current.storyImageUrls)
        ? dRef.current.storyImageUrls.map((u) => String(u ?? "").trim()).filter(Boolean)
        : [];
      const currentStoryUrlsB = Array.isArray(storyImageUrls)
        ? storyImageUrls.map((u) => String(u ?? "").trim()).filter(Boolean)
        : [];
      const nextStoryUrls = uniqKeepOrder([outUrl, ...currentStoryUrlsA, ...currentStoryUrlsB], 10);

      const meta = {
        kind: "story_regeneration",
        label: "⑤ ストーリー：元画像からAI再生成",
        detail: `scene=${understanding.bgScene} / direction=story`,
        usedVision: effectiveVision,
        selectedVariantId: (dRef.current as any).selectedStaticVariantId,
        selectedVariantTitle: (dRef.current as any).selectedStaticVariantTitle,
        purpose: "story",
        bgScene: String(understanding.bgScene ?? ""),
        referenceImageUrl: baseImageUrl,
        at: Date.now(),
      } as const;

      setStoryImageUrl(outUrl);
      setStoryImageUrls(nextStoryUrls);

      setD((prev) => ({
        ...prev,
        storyImageUrl: outUrl,
        storyImageUrls: nextStoryUrls,
        originMeta: { ...((prev as any).originMeta ?? {}), story: meta },
      }) as any);

      await saveDraft({
        storyImageUrl: outUrl,
        storyImageUrls: nextStoryUrls,
        phase: "draft",
        originMeta: { ...((dRef.current as any).originMeta ?? {}), story: meta },
      } as any);

      showMsg("ストーリー画像を保存しました（⑤に表示）");
    } catch (e: any) {
      console.error(e);
      showMsg(`ストーリー生成に失敗しました\n\n原因: ${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["storyImage"] = false;
    }
  }

async function saveCompositeAsImageUrl() {
  if (!uid) return;

  if (inFlightRef.current["composite"]) return;
  inFlightRef.current["composite"] = true;

  setBusy(true);

  try {
    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) {
      throw new Error("failed to create draft");
    }

    const compositeBaseUrl = String(
      dRef.current.aiImageUrl ||
        dRef.current.imageUrl ||
        dRef.current.stageImageUrl ||
        ""
    ).trim();

    if (!compositeBaseUrl) {
      throw new Error("先に④の合成画像を作成してください");
    }

    const out = await renderToCanvasAndGetDataUrlSilent();
    if (!out) {
      throw new Error("文字焼き込み画像の作成に失敗しました");
    }

    const url = await uploadDataUrlToStorage(uid, ensuredDraftId, out);

    const nextCompositeTextUrls = uniqKeepOrder(
      [
        url,
        ...(Array.isArray((dRef.current as any).compositeTextImageUrls)
          ? (dRef.current as any).compositeTextImageUrls
          : []),
      ],
      10
    );

    commitDraftPatch({
      compositeTextImageUrl: url as any,
      compositeTextImageUrls: nextCompositeTextUrls as any,
      imageSource: "composite",
    } as any);

    await saveDraft({
      compositeTextImageUrl: url as any,
      compositeTextImageUrls: nextCompositeTextUrls as any,
      imageSource: "composite",
    } as any);

    showMsg("文字焼き込み保存画像を保存しました");
  } catch (e: any) {
    console.error(e);
    showMsg(`❌ 保存に失敗：${e?.message || "不明"}`);
  } finally {
    setBusy(false);
    inFlightRef.current["composite"] = false;
  }
}

async function saveCompositeTextImageFromCompositeSlot() {
  if (!uid) return;

  if (inFlightRef.current["compositeText"]) return;
  inFlightRef.current["compositeText"] = true;

  setBusy(true);

  try {
    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) {
      throw new Error("failed to create draft");
    }

    const compositeBaseUrl = String(
      dRef.current.aiImageUrl ||
        dRef.current.compositeImageUrl ||
        dRef.current.imageUrl ||
        dRef.current.stageImageUrl ||
        ""
    ).trim();

    if (!compositeBaseUrl) {
      throw new Error("先に④の通常合成画像を作成してください");
    }

    const compositeOverlay = dRef.current.textOverlayBySlot?.composite;
    const compositeText = Array.isArray(compositeOverlay?.lines)
      ? compositeOverlay.lines.join("\n").trim()
      : typeof compositeOverlay?.text === "string"
        ? compositeOverlay.text.trim()
        : "";

    if (!compositeText) {
      throw new Error("④用の文字がありません");
    }

    const out = await renderOverlayToCanvasAndGetDataUrlBySlot("composite");
    if (!out) {
      throw new Error("④の文字焼き込み画像作成に失敗しました");
    }

    const url = await uploadDataUrlToStorage(uid, ensuredDraftId, out);

    const nextCompositeTextUrls = uniqKeepOrder(
      [
        url,
        ...(Array.isArray((dRef.current as any).compositeTextImageUrls)
          ? (dRef.current as any).compositeTextImageUrls
          : []),
      ],
      10
    );

    commitDraftPatch({
      compositeTextImageUrl: url as any,
      compositeTextImageUrls: nextCompositeTextUrls as any,
    } as any);

    await saveDraft({
      compositeTextImageUrl: url as any,
      compositeTextImageUrls: nextCompositeTextUrls as any,
    } as any);

    showMsg("④の文字焼き込み保存画像を保存しました");
  } catch (e: any) {
    console.error(e);
    showMsg(`❌ ④文字焼き込み保存に失敗：${e?.message || "不明"}`);
  } finally {
    setBusy(false);
    inFlightRef.current["compositeText"] = false;
  }
}
  /**
   * AI背景生成
   *
   * 重要
   * - 使用イメージ寄り背景
   * - bgImageUrl 系を更新する
   * - templateBgUrl とは混ぜない
   */
  async function generateBackgroundImage(keyword: string): Promise<string> {
    if (!uid) {
      throw new Error("no uid");
    }

    if (bgBusy) {
      throw new Error("背景生成中です");
    }

    setBgBusy(true);

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        throw new Error("no token");
      }

      const vision = (((dRef.current as any).selectedStaticPrompt ?? dRef.current.vision) || "").trim();

      if (!vision) {
        throw new Error("Vision（必須）が空です");
      }

      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) {
        throw new Error("failed to create draft");
      }

      const k = String(keyword || "").trim();
      if (!k) {
        throw new Error("背景キーワードが空です");
      }

      const base = String(dRef.current.baseImageUrl || "").trim();
      if (!base) {
        throw new Error("元画像がありません。先に商品画像を用意してください。");
      }

      const stockFolder = `users/${uid}/bg-stock`;
      const stockRef = ref(storage, stockFolder);
      const listed = await listAll(stockRef).catch(() => ({ items: [] as any[] }));

      for (const item of listed.items) {
        const name = item.name.toLowerCase();
        if (name.includes(k.toLowerCase())) {
          const url = await getDownloadURL(item);

          setD((prev) => ({ ...prev, bgImageUrl: url }));
          setBgImageUrl(url);

          await saveDraft({ bgImageUrl: url } as any);

          return url;
        }
      }

      const hardConstraints = [
        "人物・手・指・腕は絶対に入れない",
        "文字・透かし・ロゴは禁止",
        "ブランド名・看板・説明テキスト禁止",
        "過度な装飾や主張の強い小物は禁止",
        "中央に商品を置くための空きスペースを十分に確保",
        "接地タイプに応じた自然な平面を用意する",
        "背景は商品使用時を想起しやすくするためのもの",
        "商品そのものは絶対に描かない",
        "元画像の背景は再現しない",
      ];

      const brandId =
        (String((dRef.current as any).brand ?? "").trim() ||
          String(dRef.current.brandId ?? "").trim() ||
          "vento") as "vento" | "riva";

      const keywordsText = String((dRef.current as any).keywordsText ?? dRef.current.keywords ?? "");

      const understanding = resolveProductUnderstanding({
        productCategory,
        productSize,
        groundingType,
        sellDirection,
        bgScene,
        staticPurpose,
      });

      const body = {
        brandId,
        vision,
        keywords: splitKeywords(keywordsText),
        draftId: ensuredDraftId,
        keyword: k,
        scene: understanding.bgScene,
        hardConstraints,
        referenceImageUrl: base,
        productCategory: understanding.productCategory,
        productSize: understanding.productSize,
        groundingType: understanding.groundingType,
        sellDirection: understanding.sellDirection,
      };

      const r = await fetch("/api/generate-bg", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));

      if (r.status === 202 || j?.running) {
        throw new Error("背景がすでに生成中です。少し待ってください。");
      }

      if (!r.ok) {
        throw new Error(j?.error || "bg error");
      }

      const url = typeof j?.url === "string" ? j.url : "";
      if (!url) {
        throw new Error("no bg url");
      }

      try {
        const response = await fetch(url);
        const blob = await response.blob();

        const stockFileName = `${k}_${Date.now()}.png`;
        const stockPath = `users/${uid}/bg-stock/${stockFileName}`;
        const stockRef2 = ref(storage, stockPath);

        await uploadBytes(stockRef2, blob);
      } catch (e) {
        console.error("bg stock save failed", e);
      }

      const meta = {
        kind: "bg_only",
        label: "② 背景のみ：右の「背景を生成」",
        detail: `keyword=${k}`,
        usedVision: vision,
        purpose: String(staticPurpose ?? ""),
        bgScene: String(understanding.bgScene ?? ""),
        at: Date.now(),
      } as const;

      setD((prev) => ({
        ...prev,
        bgImageUrl: url,
        originMeta: { ...((prev as any).originMeta ?? {}), bg: meta },
      }) as any);

      setBgImageUrl(url);

      await saveDraft({
        bgImageUrl: url,
        originMeta: { ...((dRef.current as any).originMeta ?? {}), bg: meta },
      } as any);

      await syncBgImagesFromStorage();

      return url;
    } finally {
      setBgBusy(false);
    }
  }

  async function replaceBackgroundAndSaveToAiImage() {
    const bk = String(backgroundKeyword || "").trim();
    const hasBg = !!(dRef.current.bgImageUrl || bgImageUrl || bgDisplayUrl);
    const hasTemplateBg = !!String(templateBgUrl || d.templateBgUrl || "").trim();

    if (activePhotoMode === "template") {
      if (!hasTemplateBg) {
        showMsg("テンプレ背景が未設定です");
        return;
      }
    } else {
      if (!hasBg && !bk) {
        showMsg("②で背景キーワードを入力してください（背景が未設定です）");
        return;
      }
    }

    if (!uid) return;

    if (inFlightRef.current["replaceBg"]) return;
    inFlightRef.current["replaceBg"] = true;

    setBusy(true);

    try {
      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) {
        throw new Error("failed to create draft");
      }

      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        throw new Error("no token");
      }

      const base = String(d.baseImageUrl || "").trim();
      if (!base) {
        showMsg("先に元画像（アップロード→保存）を作ってください（前景は元画像のみ）");
        return;
      }

      setCompositeFromBaseUrl(base);

      const brandId =
        (String((d as any).brand ?? "").trim() ||
          String(d.brandId ?? "").trim() ||
          "vento") as "vento" | "riva";

      const fgRes = await fetch("/api/extract-foreground", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          brandId,
          referenceImageUrl: base,
        }),
      });

      const fgJson = await fgRes.json().catch(() => ({}));

      if (!fgRes.ok) {
        throw new Error(fgJson?.error || "extract-foreground error");
      }

      const fg =
        (typeof fgJson?.url === "string" && fgJson.url) ||
        (typeof fgJson?.foregroundUrl === "string" && fgJson.foregroundUrl) ||
        (typeof fgJson?.fgUrl === "string" && fgJson.fgUrl) ||
        "";

      if (!fg) {
        throw new Error("foreground url が取得できませんでした（サーバ返り値を確認）");
      }

      let bg = "";

      if (activePhotoMode === "template") {
        bg = String(templateBgUrl || d.templateBgUrl || "").trim();
        if (!bg) {
          throw new Error("テンプレ背景が未選択です");
        }
      } else {
        const aiBg = String(bgImageUrl || d.bgImageUrl || "").trim();
        bg = aiBg ? aiBg : await generateBackgroundImage(backgroundKeyword);
      }

      const understanding = resolveProductUnderstanding({
        productCategory,
        productSize,
        groundingType,
        sellDirection,
        bgScene,
        staticPurpose,
      });

      const savedPlacement = (dRef.current.placement ?? {}) as any;
      const savedShadow = (savedPlacement.shadow ?? {}) as any;

      const placement = {
        scale: clamp(Number(savedPlacement.scale ?? placementScale ?? 1), 0.4, 2.2),
        x: clamp(Number(savedPlacement.x ?? placementX ?? 0.5), 0, 1),
        y: clamp(Number(savedPlacement.y ?? placementY ?? 0.5), 0, 1),
        shadow: {
          opacity: clamp(Number(savedShadow.opacity ?? shadowOpacity ?? 0.12), 0, 1),
          blur: clamp(Number(savedShadow.blur ?? shadowBlur ?? 12), 0, 100),
          scale: clamp(Number(savedShadow.scale ?? shadowScale ?? 1), 0.5, 2),
          offsetX: clamp(Number(savedShadow.offsetX ?? shadowOffsetX ?? 0), -1, 1),
          offsetY: clamp(Number(savedShadow.offsetY ?? shadowOffsetY ?? 0.02), -1, 1),
        },
      };

      const r = await fetch("/api/compose-product-stage", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          foregroundUrl: fg,
          backgroundUrl: bg,
          light: "center",
          productWidthRatio: 0.42,
          productCategory: understanding.productCategory,
          productSize: understanding.productSize,
          groundingType: understanding.groundingType,
          sellDirection: understanding.sellDirection,
          bgScene: understanding.bgScene,
          activePhotoMode,
          placement: {
            scale: placement.scale,
            x: placement.x,
            y: placement.y,
            shadow: {
              opacity: placement.shadow.opacity,
              blur: placement.shadow.blur,
              scale: placement.shadow.scale,
              offsetX: placement.shadow.offsetX,
              offsetY: placement.shadow.offsetY,
            },
          },
        }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        throw new Error(j?.error || "replace-background error");
      }

      let outUrl = "";

      const urlLike =
        (typeof j?.imageUrl === "string" && j.imageUrl) ||
        (typeof j?.url === "string" && j.url) ||
        (typeof j?.outputUrl === "string" && j.outputUrl) ||
        "";

      if (urlLike && /^https?:\/\//.test(urlLike)) {
        outUrl = urlLike;
      } else {
        const dataUrl =
          (typeof j?.dataUrl === "string" && j.dataUrl.startsWith("data:image/") && j.dataUrl) ||
          (typeof j?.b64 === "string" && j.b64 && `data:image/png;base64,${j.b64}`) ||
          "";

        if (!dataUrl) {
          throw new Error("合成結果が取得できません（url/imageUrl/outputUrl/dataUrl/b64 が無い）");
        }

        const bytes = dataUrlToUint8Array(dataUrl);
        const fileName = String(j?.suggestedFileName || `composite_${Date.now()}.png`);
        const path = `users/${uid}/drafts/${ensuredDraftId}/composites/${fileName}`;

        const sref = ref(storage, path);
        await uploadBytes(sref, bytes, { contentType: "image/png" });
        outUrl = await getDownloadURL(sref);
      }

      const meta = {
        kind: "composite",
        label: "④ 合成：右の「製品画像＋背景を合成（保存）」",
        detail: `背景=${String(bg || "").slice(0, 40)}… / mode=${activePhotoMode}`,
        usedVision: (dRef.current as any).selectedStaticPrompt
          ? (dRef.current as any).selectedStaticPrompt
          : dRef.current.vision,
        selectedVariantId: (dRef.current as any).selectedStaticVariantId,
        selectedVariantTitle: (dRef.current as any).selectedStaticVariantTitle,
        purpose: String(staticPurpose ?? ""),
        bgScene: String(understanding.bgScene ?? ""),
        at: Date.now(),
      } as const;

      setRightTab("image");

      /**
       * 重要
       * - ここでは activePhotoMode に応じて使った背景URLを d.bgImageUrl に上書きしない
       * - AI背景の主保存先は bgImageUrl
       * - テンプレ背景の主保存先は templateBgUrl
       * - 合成結果 aiImageUrl だけを更新する
       */
      setD((prev) => ({
        ...prev,
        foregroundImageUrl: fg,
        aiImageUrl: outUrl,
        imageUrl: outUrl,
        compositeImageUrl: outUrl,
        imageSource: "ai",
        activePhotoMode,
        placement,
        originMeta: { ...((prev as any).originMeta ?? {}), composite: meta },
      }));

      setPreviewMode("composite");
      setPreviewReason("");

      await saveDraft({
        foregroundImageUrl: fg,
        aiImageUrl: outUrl,
        imageUrl: outUrl,
        compositeImageUrl: outUrl,
        imageSource: "ai",
        phase: "draft",
        activePhotoMode,
        placement,
        originMeta: { ...((dRef.current as any).originMeta ?? {}), composite: meta },
      });

      showMsg("✅ 切り抜き＋背景合成 完了（④に表示）");
    } catch (e: any) {
      console.error(e);
      showMsg(`背景合成に失敗：${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["replaceBg"] = false;
    }
  }

  async function clearBgHistory() {
    if (!uid) return;

    if (!draftId) {
      showMsg("この下書きはまだ作成されていません");
      return;
    }

    setD((prev) => ({
      ...prev,
      bgImageUrls: [],
    }));

    await saveDraft({
      bgImageUrls: [],
    } as any);

    showMsg("背景履歴をクリアしました（候補のみ）");
  }

  async function syncBgImagesFromStorage() {
    if (!uid) return;

    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) {
      showMsg("下書きIDの確定に失敗しました");
      return;
    }

    if (inFlightRef.current["syncBgs"]) return;
    inFlightRef.current["syncBgs"] = true;

    setBusy(true);

    try {
      const draftBgFolder = `users/${uid}/drafts/${ensuredDraftId}/bg`;
      const found: { url: string; t: number }[] = [];

      async function scanFolder(path: string): Promise<void> {
        const folderRef = ref(storage, path);
        const listed = await listAll(folderRef);

        for (const itemRef of listed.items) {
          const name = String(itemRef.name || "").toLowerCase();

          if (
            !(
              name.endsWith(".png") ||
              name.endsWith(".jpg") ||
              name.endsWith(".jpeg") ||
              name.endsWith(".webp")
            )
          ) {
            continue;
          }

          try {
            const meta = await getMetadata(itemRef);
            const t = meta?.timeCreated ? new Date(meta.timeCreated).getTime() : 0;
            const url = await getDownloadURL(itemRef);

            if (typeof url === "string" && url.trim().length > 0) {
              found.push({ url, t });
            }
          } catch {
            //
          }
        }

        for (const p of listed.prefixes) {
          await scanFolder(p.fullPath);
        }
      }

      await scanFolder(draftBgFolder);

      if (found.length === 0) {
        showMsg("この下書きの背景が見つかりませんでした（背景生成の保存先が draft/bg になっているか確認）");
        return;
      }

      const seen = new Set<string>();

      const nextBgUrls: string[] = found
        .slice()
        .sort((a, b) => (b.t ?? 0) - (a.t ?? 0))
        .map((x) => x.url)
        .filter((u) => typeof u === "string" && u.trim().length > 0)
        .filter((u) => {
          if (seen.has(u)) return false;
          seen.add(u);
          return true;
        })
        .slice(0, 10);

      const nextBgHead: string | undefined = nextBgUrls[0] || undefined;

      setBgImageUrl(nextBgHead ?? null);

      setD((prev) => ({
        ...prev,
        bgImageUrl: nextBgHead,
        bgImageUrls: nextBgUrls,
      }));

      await saveDraft({
        bgImageUrl: nextBgHead,
        bgImageUrls: nextBgUrls,
      } as any);

      showMsg(`背景を同期しました：${nextBgUrls.length}件（この下書きのみ）`);
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "不明";
      showMsg(`背景同期に失敗しました\n\n原因: ${msg}`);
    } finally {
      setBusy(false);
      inFlightRef.current["syncBgs"] = false;
    }
  }

  async function syncIdeaImagesFromStorage() {
    if (!uid) return;

    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) {
      showMsg("下書きIDの確定に失敗しました");
      return;
    }

    if (inFlightRef.current["syncIdeas"]) return;
    inFlightRef.current["syncIdeas"] = true;

    setBusy(true);

    try {
      const ideaFolder = `users/${uid}/drafts/${ensuredDraftId}/idea`;
      const folderRef = ref(storage, ideaFolder);
      const listed = await listAll(folderRef).catch(() => ({ items: [] as any[] }));

      const found: { url: string; t: number }[] = [];

      for (const itemRef of listed.items || []) {
        const name = String(itemRef.name || "").toLowerCase();

        if (
          !(
            name.endsWith(".png") ||
            name.endsWith(".jpg") ||
            name.endsWith(".jpeg") ||
            name.endsWith(".webp")
          )
        ) {
          continue;
        }

        try {
          const meta = await getMetadata(itemRef);
          const t = meta?.timeCreated ? new Date(meta.timeCreated).getTime() : 0;
          const url = await getDownloadURL(itemRef);
          found.push({ url, t });
        } catch {
          //
        }
      }

      if (found.length === 0) {
        showMsg("使用シーン画像が見つかりませんでした");
        return;
      }

      const next = found
        .slice()
        .sort((a, b) => (b.t ?? 0) - (a.t ?? 0))
        .map((x) => x.url)
        .slice(0, 10);

      const head = next[0] ?? undefined;

      setUseSceneImageUrl(head ?? null);
      setUseSceneImageUrls(next);

      setD((prev) => ({
        ...prev,
        useSceneImageUrl: head,
        useSceneImageUrls: next,
        imageIdeaUrl: head,
        imageIdeaUrls: next,
      }) as any);

      await saveDraft({
        useSceneImageUrl: head,
        useSceneImageUrls: next,
        imageIdeaUrl: head,
        imageIdeaUrls: next,
      } as any);

      showMsg(`使用シーンを同期しました：${next.length}件`);
    } catch (e: any) {
      console.error(e);
      showMsg(`同期失敗: ${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["syncIdeas"] = false;
    }
  }

  async function syncStoryImagesFromStorage() {
    if (!uid) return;

    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) {
      showMsg("下書きIDの確定に失敗しました");
      return;
    }

    if (inFlightRef.current["syncStories"]) return;
    inFlightRef.current["syncStories"] = true;

    setBusy(true);

    try {
      const storyFolder = `users/${uid}/drafts/${ensuredDraftId}/story`;
      const folderRef = ref(storage, storyFolder);
      const listed = await listAll(folderRef).catch(() => ({ items: [] as any[] }));

      const found: { url: string; t: number }[] = [];

      for (const itemRef of listed.items || []) {
        const name = String(itemRef.name || "").toLowerCase();

        if (
          !(
            name.endsWith(".png") ||
            name.endsWith(".jpg") ||
            name.endsWith(".jpeg") ||
            name.endsWith(".webp")
          )
        ) {
          continue;
        }

        try {
          const meta = await getMetadata(itemRef);
          const t = meta?.timeCreated ? new Date(meta.timeCreated).getTime() : 0;
          const url = await getDownloadURL(itemRef);
          found.push({ url, t });
        } catch {
          //
        }
      }

      if (found.length === 0) {
        showMsg("ストーリー画像が見つかりませんでした");
        return;
      }

      const next = found
        .slice()
        .sort((a, b) => (b.t ?? 0) - (a.t ?? 0))
        .map((x) => x.url)
        .slice(0, 10);

      const head = next[0] ?? undefined;

      setStoryImageUrl(head ?? null);
      setStoryImageUrls(next);

      setD((prev) => ({
        ...prev,
        storyImageUrl: head,
        storyImageUrls: next,
      }) as any);

      await saveDraft({
        storyImageUrl: head,
        storyImageUrls: next,
      } as any);

      showMsg(`ストーリーを同期しました：${next.length}件`);
    } catch (e: any) {
      console.error(e);
      showMsg(`同期失敗: ${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["syncStories"] = false;
    }
  }

  function clearIdeaHistory() {
    setUseSceneImageUrl(null);
    setUseSceneImageUrls([]);

    setD((prev) => ({
      ...prev,
      useSceneImageUrl: undefined,
      useSceneImageUrls: [],
      imageIdeaUrl: undefined,
      imageIdeaUrls: [],
    }) as any);

    void saveDraft({
      useSceneImageUrl: undefined,
      useSceneImageUrls: [],
      imageIdeaUrl: undefined,
      imageIdeaUrls: [],
    } as any);

    showMsg("使用シーン履歴をクリアしました");
  }

  function clearStoryHistory() {
    setStoryImageUrl(null);
    setStoryImageUrls([]);

    setD((prev) => ({
      ...prev,
      storyImageUrl: undefined,
      storyImageUrls: [],
    }) as any);

    void saveDraft({
      storyImageUrl: undefined,
      storyImageUrls: [],
    } as any);

    showMsg("ストーリー履歴をクリアしました");
  }

  return {
    commitDraftPatch,
    renderToCanvasAndGetDataUrlSilent,
    cutoutCurrentBaseToReplace,
    onUploadImageFilesNew,
    promoteMaterialToBase,
    generateAiImage,
    generateBackgroundImage,
    replaceBackgroundAndSaveToAiImage,
    saveCompositeAsImageUrl,
    saveCompositeTextImageFromCompositeSlot,
    clearBgHistory,
    syncBgImagesFromStorage,
    syncIdeaImagesFromStorage,
    clearIdeaHistory,
    saveProductPlacement,
    applySizeTemplate,
    generateStoryImage,
    syncStoryImagesFromStorage,
    clearStoryHistory,
    generateTemplateBackground,
    fetchTemplateRecommendations,
    selectTemplateBackground,
    syncTemplateBgImagesFromStorage,
    clearTemplateBgHistory,
  };
}