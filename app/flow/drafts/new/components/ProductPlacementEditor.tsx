// app/flow/drafts/new/components/ProductPlacementEditor.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Btn } from "../ui";
import type {
  ProductPhotoMode,
  SizeTemplateType,
  TextOverlay,
} from "@/lib/types/draft";

/**
 * ① 商品写真の配置調整UI
 *
 * 今回の追加
 * - サイズテンプレUIを「構図プリセット（売れる配置）」内へ統合
 * - 既存の配置・背景・影・合成・文字焼き込み機能は削除しない
 * - 親から sizeTemplateType / setSizeTemplateType が渡っていない場合でも壊れない
 */

type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type BgScene = "studio" | "lifestyle" | "scale" | "detail";
type CompositePreviewMode = "edit" | "final";

type TemplateRecommendItem = {
  url: string;
  reason: string;
  score?: number;
};

const TEMPLATE_MODE: ProductPhotoMode = "template";
const AI_BG_MODE: ProductPhotoMode = "ai_bg";
const PREVIEW_CANVAS = 1024;

const PRODUCT_SCALE_SAVED_MIN = 0.2;
const PRODUCT_SCALE_SAVED_MAX = 4.4;
const PRODUCT_SCALE_UI_MIN = 10;
const PRODUCT_SCALE_UI_MAX = 180;

const PRODUCT_POS_SAVED_MIN = -0.75;
const PRODUCT_POS_SAVED_MAX = 1.75;
const PRODUCT_POS_UI_MIN = 0;
const PRODUCT_POS_UI_MAX = 200;

const SHADOW_BLUR_MIN = 0;
const SHADOW_BLUR_MAX = 200;
const SHADOW_SCALE_MIN = 0.25;
const SHADOW_SCALE_MAX = 4;
const SHADOW_OFFSET_MIN = -8;
const SHADOW_OFFSET_MAX = 8;
const SHADOW_OFFSET_UI_MIN = 0;
const SHADOW_OFFSET_UI_MAX = 200;

const SHADOW_FINE_UI_MIN = 90;
const SHADOW_FINE_UI_MAX = 110;

const SHADOW_OFFSET_COARSE_MIN = -8;
const SHADOW_OFFSET_COARSE_MAX = 8;

const SHADOW_OFFSET_X_EFFECTIVE_MIN = -8;
const SHADOW_OFFSET_X_EFFECTIVE_MAX = 8;

const SHADOW_OFFSET_Y_EFFECTIVE_MIN = -8;
const SHADOW_OFFSET_Y_EFFECTIVE_MAX = 8;

const BG_SCALE_UI_MIN = 40;
const BG_SCALE_UI_MAX = 440;
const BG_POS_UI_MIN = 0;
const BG_POS_UI_MAX = 200;


type LibraryBackgroundItem = {
  url: string;
  name: string;
  source: "template" | "bg-stock" | "uploaded";
};
type Props = {
  compositePreviewMode?: CompositePreviewMode;
  setCompositePreviewMode?: React.Dispatch<React.SetStateAction<CompositePreviewMode>>;

  serverPlacementMeta?: {
    canvas?: number;
    placementInput?: {
      scale?: number;
      x?: number;
      y?: number;
      shadow?: {
        opacity?: number;
        blur?: number;
        scale?: number;
        offsetX?: number;
        offsetY?: number;
      };
      background?: {
        scale?: number;
        x?: number;
        y?: number;
      };
    } | null;
    placement?: {
      left?: number;
      top?: number;
      width?: number;
      height?: number;
      centerX?: number;
      centerY?: number;
      contactY?: number;
      bottomMarginBase?: number;
      usedDefaultLeft?: boolean;
      usedDefaultTop?: boolean;
    } | null;
    updatedAt?: number;
  } | null;

  baseImageUrl?: string;
  foregroundImageUrl?: string;
  bgImageUrl?: string;
  aiImageUrl?: string;
  compositeTextImageUrl?: string;
  onSaveCompositeTextImageFromCompositeSlot?: () => void | Promise<void>;
  templateBgUrl?: string;

  templateBgUrls?: string[];
  aiBgUrls?: string[];
  libraryBackgrounds?: LibraryBackgroundItem[];

  templateRecommended?: TemplateRecommendItem[];
  templateRecommendTopReason?: string;
  isCompositeFresh?: boolean;

  productCategory?: ProductCategory;
  productSize?: ProductSize;
  groundingType?: GroundingType;
  bgScene?: BgScene;

  textOverlay?: TextOverlay | null;

  activePhotoMode: ProductPhotoMode;
  onChangePhotoMode: (next: ProductPhotoMode) => void | Promise<void>;

  onSelectTemplateBg?: (url: string) => void | Promise<void>;
  onSelectAiBg?: (url: string) => void | Promise<void>;
  onRecompose?: () => void | Promise<void>;

  placementScale: number;
  placementX: number;
  placementY: number;
  shadowOpacity: number;
  shadowBlur: number;
  shadowScale: number;
  shadowOffsetX: number;
  shadowOffsetY: number;

  backgroundScale: number;
  backgroundX: number;
  backgroundY: number;

  setPlacementScale: React.Dispatch<React.SetStateAction<number>>;
  setPlacementX: React.Dispatch<React.SetStateAction<number>>;
  setPlacementY: React.Dispatch<React.SetStateAction<number>>;
  setShadowOpacity: React.Dispatch<React.SetStateAction<number>>;
  setShadowBlur: React.Dispatch<React.SetStateAction<number>>;
  setShadowScale: React.Dispatch<React.SetStateAction<number>>;
  setShadowOffsetX: React.Dispatch<React.SetStateAction<number>>;
  setShadowOffsetY: React.Dispatch<React.SetStateAction<number>>;

  setBackgroundScale: React.Dispatch<React.SetStateAction<number>>;
  setBackgroundX: React.Dispatch<React.SetStateAction<number>>;
  setBackgroundY: React.Dispatch<React.SetStateAction<number>>;

  editingStep: "background" | "product" | "shadow";
  setEditingStep: React.Dispatch<
    React.SetStateAction<"background" | "product" | "shadow">
  >;

  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void | Promise<void>;
  onRedo: () => void | Promise<void>;

  onSavePlacement: (
    step: "background" | "product" | "shadow",
    partial?: {
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
    },
  ) => void | Promise<void>;

  /**
   * サイズテンプレ
   *
   * 重要
   * - 親がまだ未接続でも、このファイル単体で壊れないよう optional にする
   * - 親から渡された場合は、選択状態が保存側へ流れる
   */
  sizeTemplateType?: SizeTemplateType;
  setSizeTemplateType?: React.Dispatch<React.SetStateAction<SizeTemplateType>>;

  busy?: boolean;
  showMsg?: (msg: string) => void;

  /**
   * 上部 EDIT PREVIEW にプレビューを集約する場合、
   * 下部の大きなメインプレビューだけを非表示にするためのフラグです。
   * 操作ボタン・座標固定・合成前/合成後切替は残します。
   */
  hideMainPreview?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function savedScaleToUi(saved: number) {
  const safe = clamp(saved, PRODUCT_SCALE_SAVED_MIN, PRODUCT_SCALE_SAVED_MAX);
  const ratio =
    (safe - PRODUCT_SCALE_SAVED_MIN) /
    (PRODUCT_SCALE_SAVED_MAX - PRODUCT_SCALE_SAVED_MIN);

  return (
    PRODUCT_SCALE_UI_MIN + ratio * (PRODUCT_SCALE_UI_MAX - PRODUCT_SCALE_UI_MIN)
  );
}

function savedPosToUi(saved: number) {
  const safe = clamp(saved, PRODUCT_POS_SAVED_MIN, PRODUCT_POS_SAVED_MAX);
  const ratio =
    (safe - PRODUCT_POS_SAVED_MIN) /
    (PRODUCT_POS_SAVED_MAX - PRODUCT_POS_SAVED_MIN);

  return PRODUCT_POS_UI_MIN + ratio * (PRODUCT_POS_UI_MAX - PRODUCT_POS_UI_MIN);
}

function uiScaleToSaved(ui: number) {
  const safe = clamp(ui, PRODUCT_SCALE_UI_MIN, PRODUCT_SCALE_UI_MAX);
  const ratio =
    (safe - PRODUCT_SCALE_UI_MIN) /
    (PRODUCT_SCALE_UI_MAX - PRODUCT_SCALE_UI_MIN);

  return (
    PRODUCT_SCALE_SAVED_MIN +
    ratio * (PRODUCT_SCALE_SAVED_MAX - PRODUCT_SCALE_SAVED_MIN)
  );
}

function uiPosToSaved(ui: number) {
  const safe = clamp(ui, PRODUCT_POS_UI_MIN, PRODUCT_POS_UI_MAX);
  const ratio =
    (safe - PRODUCT_POS_UI_MIN) / (PRODUCT_POS_UI_MAX - PRODUCT_POS_UI_MIN);

  return (
    PRODUCT_POS_SAVED_MIN +
    ratio * (PRODUCT_POS_SAVED_MAX - PRODUCT_POS_SAVED_MIN)
  );
}

function savedShadowOffsetToUi(saved: number) {
  const safe = clamp(saved, SHADOW_OFFSET_MIN, SHADOW_OFFSET_MAX);
  const ratio =
    (safe - SHADOW_OFFSET_MIN) / (SHADOW_OFFSET_MAX - SHADOW_OFFSET_MIN);

  return (
    SHADOW_OFFSET_UI_MIN + ratio * (SHADOW_OFFSET_UI_MAX - SHADOW_OFFSET_UI_MIN)
  );
}

function uiShadowOffsetToSaved(ui: number) {
  const safe = clamp(ui, SHADOW_OFFSET_UI_MIN, SHADOW_OFFSET_UI_MAX);
  const ratio =
    (safe - SHADOW_OFFSET_UI_MIN) /
    (SHADOW_OFFSET_UI_MAX - SHADOW_OFFSET_UI_MIN);

  return SHADOW_OFFSET_MIN + ratio * (SHADOW_OFFSET_MAX - SHADOW_OFFSET_MIN);
}

function savedShadowFineXToUi(saved: number) {
  const safe = clamp(
    saved,
    SHADOW_OFFSET_X_EFFECTIVE_MIN,
    SHADOW_OFFSET_X_EFFECTIVE_MAX,
  );
  const ratio =
    (safe - SHADOW_OFFSET_X_EFFECTIVE_MIN) /
    (SHADOW_OFFSET_X_EFFECTIVE_MAX - SHADOW_OFFSET_X_EFFECTIVE_MIN);

  return SHADOW_FINE_UI_MIN + ratio * (SHADOW_FINE_UI_MAX - SHADOW_FINE_UI_MIN);
}

function uiShadowFineXToSaved(ui: number) {
  const safe = clamp(ui, SHADOW_FINE_UI_MIN, SHADOW_FINE_UI_MAX);
  const ratio =
    (safe - SHADOW_FINE_UI_MIN) / (SHADOW_FINE_UI_MAX - SHADOW_FINE_UI_MIN);

  return (
    SHADOW_OFFSET_X_EFFECTIVE_MIN +
    ratio * (SHADOW_OFFSET_X_EFFECTIVE_MAX - SHADOW_OFFSET_X_EFFECTIVE_MIN)
  );
}

function savedShadowFineYToUi(saved: number) {
  const safe = clamp(
    saved,
    SHADOW_OFFSET_Y_EFFECTIVE_MIN,
    SHADOW_OFFSET_Y_EFFECTIVE_MAX,
  );
  const ratio =
    (safe - SHADOW_OFFSET_Y_EFFECTIVE_MIN) /
    (SHADOW_OFFSET_Y_EFFECTIVE_MAX - SHADOW_OFFSET_Y_EFFECTIVE_MIN);

  return SHADOW_FINE_UI_MIN + ratio * (SHADOW_FINE_UI_MAX - SHADOW_FINE_UI_MIN);
}

function uiShadowFineYToSaved(ui: number) {
  const safe = clamp(ui, SHADOW_FINE_UI_MIN, SHADOW_FINE_UI_MAX);
  const ratio =
    (safe - SHADOW_FINE_UI_MIN) / (SHADOW_FINE_UI_MAX - SHADOW_FINE_UI_MIN);

  return (
    SHADOW_OFFSET_Y_EFFECTIVE_MIN +
    ratio * (SHADOW_OFFSET_Y_EFFECTIVE_MAX - SHADOW_OFFSET_Y_EFFECTIVE_MIN)
  );
}

function uiBgOffsetPercent(ui: number) {
  const safe = clamp(ui, BG_POS_UI_MIN, BG_POS_UI_MAX);
  return ((safe - 100) / 100) * 100;
}

function savedBgPosToUi(saved: number) {
  const safe = clamp(saved, -2, 2);
  return clamp(100 + safe * 50, BG_POS_UI_MIN, BG_POS_UI_MAX);
}

function uiBgPosToSaved(ui: number) {
  const safe = clamp(ui, BG_POS_UI_MIN, BG_POS_UI_MAX);
  return clamp((safe - 100) / 50, -2, 2);
}
function savedBgScaleToUi(saved: number) {
  const safe = clamp(saved, 0.5, 4.4);
  return safe * 100;
}

function uiBgScaleToSaved(ui: number) {
  const safe = clamp(ui, BG_SCALE_UI_MIN, BG_SCALE_UI_MAX);
  return clamp(safe / 100, 0.5, 4.4);
}

function softenShadowScale(input: number) {
  const safe = clamp(input, 0.25, 4);

  if (safe <= 1) {
    return safe;
  }

  return 1 + (safe - 1) * 0.7;
}

function getSafeOverlayLines(overlay?: TextOverlay | null): string[] {
  if (!overlay) return [];

  if (Array.isArray(overlay.lines) && overlay.lines.length > 0) {
    return overlay.lines
      .map((line) => String(line ?? "").trim())
      .filter(Boolean);
  }

  if (
    typeof (overlay as any).text === "string" &&
    String((overlay as any).text).trim()
  ) {
    return String((overlay as any).text)
      .split("\n")
      .map((line) => String(line ?? "").trim())
      .filter(Boolean);
  }

  return [];
}

function parseAlphaFromRgba(color: string | undefined, fallback: number) {
  const value = String(color ?? "").trim();
  const match = /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/i.exec(
    value,
  );
  if (!match) return fallback;

  const alpha = Number(match[1]);
  if (!Number.isFinite(alpha)) return fallback;

  return clamp(alpha, 0, 1);
}

function normalizeOverlayPercent(raw: unknown, fallback: number) {
  const n = Number(raw);

  if (!Number.isFinite(n)) {
    return clamp(fallback, 0, 100);
  }

  if (n >= 0 && n <= 1) {
    return clamp(n * 100, 0, 100);
  }

  return clamp(n, 0, 100);
}

function resolvePreviewForegroundSize(args: {
  naturalWidth: number;
  naturalHeight: number;
  targetWidth: number;
  productSize: ProductSize;
}) {
  const { naturalWidth, naturalHeight, targetWidth, productSize } = args;

  const safeNaturalWidth = Math.max(1, naturalWidth || targetWidth || 1);
  const safeNaturalHeight = Math.max(1, naturalHeight || targetWidth || 1);

  const maxHeight =
    productSize === "large" ? 840 : productSize === "small" ? 680 : 780;

  const scale = Math.min(
    targetWidth / safeNaturalWidth,
    maxHeight / safeNaturalHeight,
    1,
  );

  const width = Math.max(1, Math.round(safeNaturalWidth * scale));
  const height = Math.max(1, Math.round(safeNaturalHeight * scale));

  return {
    width,
    height,
  };
}

function resolveBottomMargin(
  groundingType: GroundingType,
  productCategory: ProductCategory,
  productSize: ProductSize,
  bgScene: BgScene,
) {
  if (groundingType === "table") return 208;
  if (groundingType === "hanging") return 220;
  if (groundingType === "wall") return 165;

  const base =
    productCategory === "furniture"
      ? 118
      : productSize === "large"
        ? 122
        : productSize === "small"
          ? 136
          : 130;

  return bgScene === "studio" ? base - 4 : base;
}

function resolvePlacementRect(args: {
  canvas: number;
  fgWidth: number;
  fgHeight: number;
  placement: {
    scale: number;
    x: number;
    y: number;
  };
  groundingType: GroundingType;
  productCategory: ProductCategory;
  productSize: ProductSize;
  bgScene: BgScene;
}) {
  const {
    canvas,
    fgWidth,
    fgHeight,
    placement,
    groundingType,
    productCategory,
    productSize,
    bgScene,
  } = args;

  const baseBottomMargin = resolveBottomMargin(
    groundingType,
    productCategory,
    productSize,
    bgScene,
  );

  const defaultLeft = Math.round((canvas - fgWidth) / 2);
  const defaultTop = Math.max(30, canvas - fgHeight - baseBottomMargin);

  let left = Math.round(placement.x * canvas - fgWidth / 2);
  let top = Math.round(placement.y * canvas - fgHeight / 2);

  const overflowX = Math.round(fgWidth * 0.75);
  const overflowY = Math.round(fgHeight * 0.75);

  left = clamp(
    left,
    -overflowX,
    Math.max(-overflowX, canvas - fgWidth + overflowX),
  );

  const maxTop =
    groundingType === "hanging"
      ? canvas - fgHeight - 20
      : groundingType === "wall"
        ? canvas - fgHeight - 40
        : canvas - fgHeight - 10;

  top = clamp(top, -overflowY, Math.max(-overflowY, maxTop + overflowY));

  const isNearDefaultX = Math.abs(placement.x - 0.5) <= 0.03;
  const isNearDefaultY = Math.abs(placement.y - 0.5) <= 0.03;

  if (isNearDefaultX) {
    left = clamp(
      defaultLeft,
      -overflowX,
      Math.max(-overflowX, canvas - fgWidth + overflowX),
    );
  }

  if (isNearDefaultY) {
    top = clamp(
      defaultTop,
      -overflowY,
      Math.max(-overflowY, maxTop + overflowY),
    );
  }

  const centerX = left + fgWidth / 2;
  const centerY = top + fgHeight / 2;
  const contactY = top + fgHeight;

  return {
    left,
    top,
    centerX,
    centerY,
    contactY,
    bottomMarginBase: baseBottomMargin,
    usedDefaultLeft: isNearDefaultX,
    usedDefaultTop: isNearDefaultY,
  };
}

function resolvePreviewShadowRect(args: {
  canvas: number;
  fgWidth: number;
  centerX: number;
  contactY: number;
  groundingType: GroundingType;
  shadowOpacity: number;
  shadowBlur: number;
  shadowScale: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}) {
  const {
    canvas,
    fgWidth,
    centerX,
    contactY,
    groundingType,
    shadowOpacity,
    shadowBlur,
    shadowScale,
    shadowOffsetX,
    shadowOffsetY,
  } = args;

  if (groundingType === "hanging") {
    return {
      leftPx: 0,
      topPx: 0,
      widthPx: 0,
      heightPx: 0,
      opacity: 0,
      blurPx: 0,
    };
  }

  const shadowWidth = fgWidth * 0.82;

  const baseScale =
    groundingType === "wall" ? 0.35 : groundingType === "table" ? 0.5 : 0.6;

  const safeOffsetX = clamp(
    shadowOffsetX,
    SHADOW_OFFSET_COARSE_MIN,
    SHADOW_OFFSET_COARSE_MAX,
  );

  const safeOffsetY = clamp(
    shadowOffsetY,
    SHADOW_OFFSET_COARSE_MIN,
    SHADOW_OFFSET_COARSE_MAX,
  );

  const scale = softenShadowScale(shadowScale);

  const w = Math.max(60, Math.round(shadowWidth * baseScale * scale));
  const h = Math.max(8, Math.round(w * 0.08));

  const cx = clamp(
    Math.round(centerX + safeOffsetX * 24),
    -Math.round(w),
    canvas + Math.round(w),
  );

  const cy = Math.round(contactY + 2 + safeOffsetY * 24);

  const opacity = clamp(0.12 + shadowOpacity * 0.5, 0, 0.5);
  const blurPx = Math.max(1, shadowBlur * 0.8);

  return {
    leftPx: cx - w / 2,
    topPx: cy - h / 2,
    widthPx: w,
    heightPx: h,
    opacity,
    blurPx,
  };
}

function resolveBackgroundCoverRect(args: {
  canvas: number;
  naturalWidth: number;
  naturalHeight: number;
  scale: number;
  x: number;
  y: number;
}) {
  const { canvas, naturalWidth, naturalHeight, scale, x, y } = args;

  const safeW = Math.max(1, naturalWidth || canvas);
  const safeH = Math.max(1, naturalHeight || canvas);

  const coverScale = Math.max(canvas / safeW, canvas / safeH);
  const baseW = safeW * coverScale;
  const baseH = safeH * coverScale;

  const drawW = baseW * scale;
  const drawH = baseH * scale;

  const overflowX = Math.max(0, drawW - canvas);
  const overflowY = Math.max(0, drawH - canvas);

  const left = -overflowX / 2 - x * (overflowX / 2);
  const top = -overflowY / 2 - y * (overflowY / 2);

  return {
    left,
    top,
    width: drawW,
    height: drawH,
  };
}

async function measureTrimmedImageBounds(src: string): Promise<{
  width: number;
  height: number;
  trimmedWidth: number;
  trimmedHeight: number;
}> {
  const url = String(src || "").trim();

  if (!url) {
    return {
      width: 0,
      height: 0,
      trimmedWidth: 0,
      trimmedHeight: 0,
    };
  }

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => {
      // 画像URLが期限切れ・削除済み・CORS不可でも、編集画面全体は落とさない。
      // AOI FLOWでは draft / Storage / blob / data URL が混在するため、
      // 読み込み失敗は「測定不可」として安全に扱う。
      console.warn("[ProductPlacementEditor] 前景画像の読み込みに失敗しました", url);
      resolve(null);
    };
    el.src = url;
  });

  if (!img) {
    return {
      width: 0,
      height: 0,
      trimmedWidth: 0,
      trimmedHeight: 0,
    };
  }

  const width = Math.max(1, Number(img.naturalWidth || 0));
  const height = Math.max(1, Number(img.naturalHeight || 0));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      width,
      height,
      trimmedWidth: width,
      trimmedHeight: height,
    };
  }

  ctx.clearRect(0, 0, width, height);

  try {
    ctx.drawImage(img, 0, 0, width, height);
  } catch (error) {
    console.warn("[ProductPlacementEditor] 前景画像の描画に失敗しました", error);
    return {
      width,
      height,
      trimmedWidth: width,
      trimmedHeight: height,
    };
  }

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch (error) {
    // CORSでCanvasがtaintされた場合も編集画面を止めない。
    console.warn("[ProductPlacementEditor] 前景画像の透明領域測定に失敗しました", error);
    return {
      width,
      height,
      trimmedWidth: width,
      trimmedHeight: height,
    };
  }

  const data = imageData.data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];

      if (alpha >= 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      width,
      height,
      trimmedWidth: width,
      trimmedHeight: height,
    };
  }

  return {
    width,
    height,
    trimmedWidth: Math.max(1, maxX - minX + 1),
    trimmedHeight: Math.max(1, maxY - minY + 1),
  };
}

function ModeButton({
  active,
  label,
  onClick,
  disabled,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded-xl border px-3 py-2 text-xs transition",
        active
          ? "border-white/60 bg-white/10 text-white"
          : "border-white/10 bg-black/20 text-white/70 hover:bg-white/5",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function PreviewTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-2 text-xs rounded-lg border transition",
        active
          ? "bg-white/10 border-white/40 text-white"
          : "bg-black/20 border-white/10 text-white/60 hover:bg-white/5",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
  disabled,
  help,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  onCommit?: () => void;
  disabled?: boolean;
  help?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-white/82 font-semibold" style={{ fontSize: 12 }}>
          {label}
        </div>
        <div className="text-white/60" style={{ fontSize: 12 }}>
          {Math.round(value)}
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={() => {
          onCommit?.();
        }}
        onTouchEnd={() => {
          onCommit?.();
        }}
        className="mt-3 w-full"
      />
      {help ? (
        <div
          className="mt-2 text-white/50"
          style={{ fontSize: 11, lineHeight: 1.5 }}
        >
          {help}
        </div>
      ) : null}
    </div>
  );
}

function SmallBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <div
      className={[
        "inline-flex items-center rounded-full border px-2 py-1",
        active
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
          : "border-white/10 bg-black/20 text-white/55",
      ].join(" ")}
      style={{ fontSize: 11 }}
    >
      {label}
    </div>
  );
}


function shortAssetName(name: string, fallback: string) {
  const raw = String(name || "").trim() || fallback;
  const withoutQuery = raw.split("?")[0] || raw;
  const fileName = withoutQuery.split("/").filter(Boolean).pop() || withoutQuery;

  if (fileName.length <= 18) {
    return fileName;
  }

  return `${fileName.slice(0, 8)}…${fileName.slice(-7)}`;
}

function ThumbImage({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="h-full w-full rounded-xl object-cover"
      draggable={false}
      style={{
        background: "rgba(255,255,255,0.04)",
        display: "block",
      }}
    />
  );
}

function LibraryBackgroundSection({
  title,
  emptyText,
  assets,
  busy,
  currentUrl,
  onSelect,
  labelForSource,
}: {
  title: string;
  emptyText: string;
  assets: LibraryBackgroundItem[];
  busy?: boolean;
  currentUrl?: string;
  onSelect: (url: string) => void | Promise<void>;
  labelForSource: (source: LibraryBackgroundItem["source"]) => string;
}) {
  const safeCurrentUrl = String(currentUrl || "").trim();
  const safeAssets = (assets || [])
    .map((asset) => ({
      ...asset,
      url: String(asset.url || "").trim(),
    }))
    .filter((asset) => asset.url)
    .slice(0, 18);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-white/60" style={{ fontSize: 11 }}>
          {title}
        </div>
        {safeAssets.length > 0 ? (
          <div className="text-white/35" style={{ fontSize: 10 }}>
            {safeAssets.length}件
          </div>
        ) : null}
      </div>

      {safeAssets.length > 0 ? (
        <div className="flex max-h-[200px] flex-wrap gap-2 overflow-auto pr-1">
          {safeAssets.map((asset, i) => {
            const isCurrent = safeCurrentUrl === asset.url;
            const titleText = shortAssetName(asset.name, `${title} ${i + 1}`);

            return (
              <button
                key={`${title}-${asset.url}-${i}`}
                type="button"
                disabled={busy}
                onClick={async () => {
                  await onSelect(asset.url);
                }}
                className={[
                  "group relative w-[84px] overflow-hidden rounded-xl border p-1 text-left transition",
                  "hover:-translate-y-0.5 hover:bg-white/10",
                  isCurrent
                    ? "border-cyan-300/70 bg-cyan-300/10 shadow-[0_0_22px_rgba(80,220,255,0.22)]"
                    : "border-white/10 bg-black/18",
                  busy ? "cursor-wait opacity-60" : "cursor-pointer",
                ].join(" ")}
                title={asset.name || titleText}
                aria-label={`${titleText}を選択`}
              >
                <div className="h-[64px] w-full overflow-hidden rounded-lg border border-white/10 bg-black/25">
                  <ThumbImage src={asset.url} alt={asset.name || titleText} />
                </div>

                <div className="mt-1 flex items-center justify-between gap-1 px-1">
                  <div className="min-w-0">
                    <div
                      className="truncate font-semibold text-white/78"
                      style={{ fontSize: 10, lineHeight: 1.25 }}
                    >
                      {titleText}
                    </div>
                    <div className="truncate text-white/42" style={{ fontSize: 9 }}>
                      {labelForSource(asset.source)}
                    </div>
                  </div>
                </div>

                {isCurrent ? (
                  <div className="absolute right-2 top-2 rounded-full border border-cyan-200/50 bg-cyan-300/90 px-2 py-0.5 text-[9px] font-bold text-slate-950">
                    選択中
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white/55"
          style={{ fontSize: 12, lineHeight: 1.6 }}
        >
          {emptyText}
        </div>
      )}
    </div>
  );
}

function SizeTemplateButton({
  active,
  label,
  description,
  disabled,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded-xl border px-3 py-3 text-left transition",
        active
          ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
          : "border-white/10 bg-black/20 text-white/70 hover:bg-white/5",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <div className="font-black" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div
        className="mt-1 text-white/50"
        style={{ fontSize: 11, lineHeight: 1.5 }}
      >
        {description}
      </div>
    </button>
  );
}

export default function ProductPlacementEditor({
  baseImageUrl,
  foregroundImageUrl,
  bgImageUrl,
  aiImageUrl,
  compositeTextImageUrl = "",
  onSaveCompositeTextImageFromCompositeSlot,
  templateBgUrl,

  templateBgUrls = [],
  aiBgUrls = [],
  libraryBackgrounds = [],

  templateRecommended = [],
  templateRecommendTopReason = "",
  isCompositeFresh = false,
  compositePreviewMode = "edit",
  setCompositePreviewMode,
  serverPlacementMeta = null,

  productCategory = "other",
  productSize = "medium",
  groundingType = "floor",
  bgScene = "studio",

  textOverlay = null,

  activePhotoMode,
  onChangePhotoMode,
  onSelectTemplateBg,
  onSelectAiBg,
  onRecompose,

  placementScale,
  placementX,
  placementY,
  shadowOpacity,
  shadowBlur,
  shadowScale,
  shadowOffsetX,
  shadowOffsetY,

  backgroundScale,
  backgroundX,
  backgroundY,

  setPlacementScale,
  setPlacementX,
  setPlacementY,
  setShadowOpacity,
  setShadowBlur,
  setShadowScale,
  setShadowOffsetX,
  setShadowOffsetY,

  setBackgroundScale,
  setBackgroundX,
  setBackgroundY,

  editingStep,
  setEditingStep,
  canUndo,
  canRedo,
  onUndo,
  onRedo,

  onSavePlacement,

  sizeTemplateType = "simple",
  setSizeTemplateType,

  busy = false,
  showMsg,
}: Props) {
  void canUndo;
  void canRedo;
  void onUndo;
  void onRedo;
  void templateRecommendTopReason;
  void savedShadowFineXToUi;
  void uiShadowFineXToSaved;
  void savedShadowFineYToUi;
  void uiShadowFineYToSaved;
  void uiBgOffsetPercent;
  void resolvePreviewForegroundSize;

  const [foregroundNaturalSize, setForegroundNaturalSize] = useState({
    width: 0,
    height: 0,
    trimmedWidth: 0,
    trimmedHeight: 0,
  });

  const [foregroundTrimmedSize, setForegroundTrimmedSize] = useState({
    width: 0,
    height: 0,
  });

  const [measuredForegroundUrl, setMeasuredForegroundUrl] = useState("");
  const [isForegroundMeasureReady, setIsForegroundMeasureReady] =
    useState(false);

  const [backgroundNaturalSize, setBackgroundNaturalSize] = useState({
    width: 0,
    height: 0,
  });

  const [activePreviewTab, setActivePreviewTab] = useState<"edit" | "final">(
    "edit",
  );
  const [isBackgroundLocked, setIsBackgroundLocked] = useState(false);
  const [compositeImageRefreshKey, setCompositeImageRefreshKey] = useState(0);
  const [compositeTextImageRefreshKey, setCompositeTextImageRefreshKey] =
    useState(0);


  const templateLibraryBackgrounds = useMemo(() => {
    return (libraryBackgrounds || []).filter((asset) => asset.source === "template");
  }, [libraryBackgrounds]);

  const aiLibraryBackgrounds = useMemo(() => {
    return (libraryBackgrounds || []).filter((asset) => asset.source === "bg-stock");
  }, [libraryBackgrounds]);

  const uploadedLibraryBackgrounds = useMemo(() => {
    return (libraryBackgrounds || []).filter((asset) => asset.source === "uploaded");
  }, [libraryBackgrounds]);

  const safeSizeTemplateType: SizeTemplateType =
    sizeTemplateType === "compare" || sizeTemplateType === "detail"
      ? sizeTemplateType
      : "simple";

  const backgroundScaleUi = useMemo(() => {
    return savedBgScaleToUi(
      typeof backgroundScale === "number" ? backgroundScale : 1,
    );
  }, [backgroundScale]);

  const backgroundXUi = useMemo(() => {
    return savedBgPosToUi(typeof backgroundX === "number" ? backgroundX : 0);
  }, [backgroundX]);

  const backgroundYUi = useMemo(() => {
    return savedBgPosToUi(typeof backgroundY === "number" ? backgroundY : 0);
  }, [backgroundY]);

  const safePlacementScaleSaved = clamp(
    Number.isFinite(Number(placementScale)) ? Number(placementScale) : 1,
    PRODUCT_SCALE_SAVED_MIN,
    PRODUCT_SCALE_SAVED_MAX,
  );

  const safePlacementXSaved = clamp(
    Number.isFinite(Number(placementX)) ? Number(placementX) : 0.5,
    PRODUCT_POS_SAVED_MIN,
    PRODUCT_POS_SAVED_MAX,
  );

  const safePlacementYSaved = clamp(
    Number.isFinite(Number(placementY)) ? Number(placementY) : 0.5,
    PRODUCT_POS_SAVED_MIN,
    PRODUCT_POS_SAVED_MAX,
  );

  const safeScale = clamp(
    savedScaleToUi(safePlacementScaleSaved),
    PRODUCT_SCALE_UI_MIN,
    PRODUCT_SCALE_UI_MAX,
  );

  const safeX = clamp(
    savedPosToUi(safePlacementXSaved),
    PRODUCT_POS_UI_MIN,
    PRODUCT_POS_UI_MAX,
  );

  const safeY = clamp(
    savedPosToUi(safePlacementYSaved),
    PRODUCT_POS_UI_MIN,
    PRODUCT_POS_UI_MAX,
  );

  const safeShadowOpacity = clamp(shadowOpacity || 0.12, 0, 1);
  const safeShadowBlur = clamp(
    shadowBlur || 12,
    SHADOW_BLUR_MIN,
    SHADOW_BLUR_MAX,
  );
  const safeShadowScale = clamp(
    shadowScale || 1,
    SHADOW_SCALE_MIN,
    SHADOW_SCALE_MAX,
  );

  const safeShadowOffsetX = clamp(
    Number.isFinite(Number(shadowOffsetX)) ? Number(shadowOffsetX) : 0,
    SHADOW_OFFSET_COARSE_MIN,
    SHADOW_OFFSET_COARSE_MAX,
  );

  const safeShadowOffsetY = clamp(
    Number.isFinite(Number(shadowOffsetY)) ? Number(shadowOffsetY) : 0.02,
    SHADOW_OFFSET_COARSE_MIN,
    SHADOW_OFFSET_COARSE_MAX,
  );

  const overlayLines = useMemo(() => {
    return getSafeOverlayLines(textOverlay);
  }, [textOverlay]);

  const hasOverlayText = overlayLines.length > 0;

  const overlayFontSizePx = useMemo(() => {
    const raw = Number(textOverlay?.fontSize ?? 44);
    return clamp(raw, 12, 120);
  }, [textOverlay?.fontSize]);

  const overlayLineHeight = useMemo(() => {
    const raw = Number(textOverlay?.lineHeight ?? 1.15);
    return clamp(raw, 0.8, 2.2);
  }, [textOverlay?.lineHeight]);

  const overlayXPercent = useMemo(() => {
    return normalizeOverlayPercent(textOverlay?.x, 50);
  }, [textOverlay?.x]);

  const overlayYPercent = useMemo(() => {
    return normalizeOverlayPercent(textOverlay?.y, 80);
  }, [textOverlay?.y]);

  const overlayTextColor = useMemo(() => {
    const color = String(textOverlay?.color ?? "#FFFFFF").trim();
    return color || "#FFFFFF";
  }, [textOverlay?.color]);

  const overlayBackgroundEnabled = useMemo(() => {
    if (!hasOverlayText) return false;

    if (typeof textOverlay?.background?.enabled === "boolean") {
      return textOverlay.background.enabled;
    }

    if (
      typeof textOverlay?.bandOpacity === "number" &&
      textOverlay.bandOpacity > 0
    ) {
      return true;
    }

    return true;
  }, [
    hasOverlayText,
    textOverlay?.background?.enabled,
    textOverlay?.bandOpacity,
  ]);

  const overlayBackgroundColor = useMemo(() => {
    const color = String(
      textOverlay?.background?.color ?? "rgba(0,0,0,0.45)",
    ).trim();
    return color || "rgba(0,0,0,0.45)";
  }, [textOverlay?.background?.color]);

  const normalizedSavedScaleForPreview = useMemo(() => {
    return safePlacementScaleSaved;
  }, [safePlacementScaleSaved]);

  const placementNaturalWidthForPreview =
    foregroundNaturalSize.trimmedWidth || foregroundNaturalSize.width;

  const placementNaturalHeightForPreview =
    foregroundNaturalSize.trimmedHeight || foregroundNaturalSize.height;

  const previewGeometry = useMemo(() => {
    const canvas = PREVIEW_CANVAS;

    const placement = {
      scale: safePlacementScaleSaved,
      x: safePlacementXSaved,
      y: safePlacementYSaved,
    };

    const serverPlacement =
      serverPlacementMeta &&
      typeof serverPlacementMeta === "object" &&
      serverPlacementMeta.placement &&
      typeof serverPlacementMeta.placement === "object"
        ? serverPlacementMeta.placement
        : null;

    const serverPlacementInput =
      serverPlacementMeta &&
      typeof serverPlacementMeta === "object" &&
      serverPlacementMeta.placementInput &&
      typeof serverPlacementMeta.placementInput === "object"
        ? serverPlacementMeta.placementInput
        : null;

    const canUseServerPlacementBasis =
      !!serverPlacement &&
      Number.isFinite(Number(serverPlacement.left)) &&
      Number.isFinite(Number(serverPlacement.top)) &&
      Number.isFinite(Number(serverPlacement.width)) &&
      Number.isFinite(Number(serverPlacement.height));

    let fgWidth = 0;
    let fgHeight = 0;
    let rect: {
      left: number;
      top: number;
      centerX: number;
      centerY: number;
      contactY: number;
      bottomMarginBase: number;
      usedDefaultLeft: boolean;
      usedDefaultTop: boolean;
    };

    if (canUseServerPlacementBasis) {
      const baseLeft = Number(serverPlacement!.left ?? 0);
      const baseTop = Number(serverPlacement!.top ?? 0);
      const baseWidth = Math.max(1, Number(serverPlacement!.width ?? 1));
      const baseHeight = Math.max(1, Number(serverPlacement!.height ?? 1));

      const baseInputScale = clamp(
        Number(serverPlacementInput?.scale ?? 1),
        PRODUCT_SCALE_SAVED_MIN,
        PRODUCT_SCALE_SAVED_MAX,
      );
      const baseInputX = clamp(
        Number(serverPlacementInput?.x ?? 0.5),
        PRODUCT_POS_SAVED_MIN,
        PRODUCT_POS_SAVED_MAX,
      );
      const baseInputY = clamp(
        Number(serverPlacementInput?.y ?? 0.5),
        PRODUCT_POS_SAVED_MIN,
        PRODUCT_POS_SAVED_MAX,
      );

      const scaleRatio =
        safePlacementScaleSaved / Math.max(0.0001, baseInputScale);

      fgWidth = Math.max(1, Math.round(baseWidth * scaleRatio));
      fgHeight = Math.max(1, Math.round(baseHeight * scaleRatio));

      const baseCenterX = Number(
        serverPlacement!.centerX ?? baseLeft + baseWidth / 2,
      );
      const baseCenterY = Number(
        serverPlacement!.centerY ?? baseTop + baseHeight / 2,
      );

      const nextCenterX =
        baseCenterX + (safePlacementXSaved - baseInputX) * canvas;
      const nextCenterY =
        baseCenterY + (safePlacementYSaved - baseInputY) * canvas;

      let nextLeft = Math.round(nextCenterX - fgWidth / 2);
      let nextTop = Math.round(nextCenterY - fgHeight / 2);

      const overflowX = Math.round(fgWidth * 0.75);
      const overflowY = Math.round(fgHeight * 0.75);

      nextLeft = clamp(
        nextLeft,
        -overflowX,
        Math.max(-overflowX, canvas - fgWidth + overflowX),
      );

      const maxTop =
        groundingType === "hanging"
          ? canvas - fgHeight - 20
          : groundingType === "wall"
            ? canvas - fgHeight - 40
            : canvas - fgHeight - 10;

      nextTop = clamp(
        nextTop,
        -overflowY,
        Math.max(-overflowY, maxTop + overflowY),
      );

      rect = {
        left: nextLeft,
        top: nextTop,
        centerX: nextLeft + fgWidth / 2,
        centerY: nextTop + fgHeight / 2,
        contactY: nextTop + fgHeight,
        bottomMarginBase: resolveBottomMargin(
          groundingType,
          productCategory,
          productSize,
          bgScene,
        ),
        usedDefaultLeft: false,
        usedDefaultTop: false,
      };
    } else {
      const baseProductWidthRatio = 0.42;
      const effectiveProductWidthRatio = clamp(
        baseProductWidthRatio * normalizedSavedScaleForPreview,
        0.18,
        0.82,
      );

      const productTargetWidth = Math.round(
        canvas * effectiveProductWidthRatio,
      );

      const previewFgSize = (() => {
        const baseW = placementNaturalWidthForPreview || productTargetWidth;
        const baseH = placementNaturalHeightForPreview || productTargetWidth;

        const scale = normalizedSavedScaleForPreview;

        return {
          width: Math.max(1, Math.round(baseW * scale)),
          height: Math.max(1, Math.round(baseH * scale)),
        };
      })();

      fgWidth = previewFgSize.width;
      fgHeight = previewFgSize.height;

      rect = resolvePlacementRect({
        canvas,
        fgWidth,
        fgHeight,
        placement,
        groundingType,
        productCategory,
        productSize,
        bgScene,
      });
    }

    const shadowRect = resolvePreviewShadowRect({
      canvas,
      fgWidth,
      centerX: rect.centerX,
      contactY: rect.contactY,
      groundingType,
      shadowOpacity: safeShadowOpacity,
      shadowBlur: safeShadowBlur,
      shadowScale: safeShadowScale,
      shadowOffsetX: safeShadowOffsetX,
      shadowOffsetY: safeShadowOffsetY,
    });

    return {
      canvas,
      fgWidth,
      fgHeight,
      rect,
      shadowRect,
    };
  }, [
    serverPlacementMeta,
    normalizedSavedScaleForPreview,
    safePlacementScaleSaved,
    safePlacementXSaved,
    safePlacementYSaved,
    safeShadowOpacity,
    safeShadowBlur,
    safeShadowScale,
    safeShadowOffsetX,
    safeShadowOffsetY,
    placementNaturalWidthForPreview,
    placementNaturalHeightForPreview,
    productCategory,
    productSize,
    groundingType,
    bgScene,
  ]);

  const overlayPreviewStyle = useMemo<React.CSSProperties>(() => {
    const lineCount = Math.max(1, overlayLines.length);
    const blockHeightPx = Math.round(
      overlayFontSizePx * overlayLineHeight * lineCount,
    );
    const topPx = Math.round(
      (PREVIEW_CANVAS - blockHeightPx) * (overlayYPercent / 100),
    );
    const topPercent = clamp((topPx / PREVIEW_CANVAS) * 100, 0, 100);

    return {
      position: "absolute",
      left: 0,
      right: 0,
      top: `${topPercent}%`,
      zIndex: 4,
      pointerEvents: "none",
      userSelect: "none",
    };
  }, [
    overlayLines.length,
    overlayFontSizePx,
    overlayLineHeight,
    overlayYPercent,
  ]);

  const overlayBandStyle = useMemo<React.CSSProperties>(() => {
    const alpha = parseAlphaFromRgba(overlayBackgroundColor, 0.45);

    return {
      position: "absolute",
      inset: 0,
      background: overlayBackgroundColor || `rgba(0,0,0,${alpha})`,
      opacity: 1,
      zIndex: 0,
      pointerEvents: "none",
      userSelect: "none",
    };
  }, [overlayBackgroundColor]);

  const overlayTextWrapStyle = useMemo<React.CSSProperties>(() => {
    return {
      position: "relative",
      zIndex: 1,
      width: "100%",
      paddingLeft: "4.5%",
      paddingRight: "4.5%",
      paddingTop: "1.2%",
      paddingBottom: "1.2%",
      display: "flex",
      flexDirection: "column",
      gap: `${Math.max(2, Math.round(overlayFontSizePx * (overlayLineHeight - 1)))}px`,
      boxSizing: "border-box",
    };
  }, [overlayFontSizePx, overlayLineHeight]);

  const overlayLineStyle = useMemo<React.CSSProperties>(() => {
    const sizeByContainerWidth = (overlayFontSizePx / PREVIEW_CANVAS) * 100;

    return {
      color: overlayTextColor,
      fontWeight: 900,
      fontSize: `${sizeByContainerWidth}cqw`,
      lineHeight: overlayLineHeight,
      textAlign: "left",
      textShadow: "0 1px 2px rgba(0,0,0,0.18)",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
      marginLeft: `${overlayXPercent * 0.35}%`,
      maxWidth: `${Math.max(30, 100 - overlayXPercent * 0.35)}%`,
    };
  }, [overlayTextColor, overlayFontSizePx, overlayLineHeight, overlayXPercent]);

  const displayForegroundUrl = useMemo(() => {
    return String(foregroundImageUrl || baseImageUrl || "").trim();
  }, [foregroundImageUrl, baseImageUrl]);

  const measurementForegroundUrl = useMemo(() => {
    return String(foregroundImageUrl || baseImageUrl || "").trim();
  }, [foregroundImageUrl, baseImageUrl]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const src = String(measurementForegroundUrl || "").trim();

      if (!cancelled) {
        setIsForegroundMeasureReady(false);
      }

      if (!src) {
        if (!cancelled) {
          setForegroundNaturalSize({
            width: 0,
            height: 0,
            trimmedWidth: 0,
            trimmedHeight: 0,
          });
          setMeasuredForegroundUrl("");
          setIsForegroundMeasureReady(false);
        }
        return;
      }

      try {
        const measured = await measureTrimmedImageBounds(src);

        if (cancelled) return;

        setForegroundNaturalSize((prev) => {
          if (
            prev.width === measured.width &&
            prev.height === measured.height &&
            prev.trimmedWidth === measured.trimmedWidth &&
            prev.trimmedHeight === measured.trimmedHeight
          ) {
            return prev;
          }

          return measured;
        });

        setForegroundTrimmedSize({
          width: measured.trimmedWidth,
          height: measured.trimmedHeight,
        });

        setMeasuredForegroundUrl(src);
        setIsForegroundMeasureReady(true);
      } catch (error) {
        console.warn("[AOI FLOW handled]", error);

        if (cancelled) return;

        setForegroundNaturalSize({
          width: 0,
          height: 0,
          trimmedWidth: 0,
          trimmedHeight: 0,
        });

        setForegroundTrimmedSize({
          width: 0,
          height: 0,
        });

        setMeasuredForegroundUrl("");
        setIsForegroundMeasureReady(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [measurementForegroundUrl]);

  const templatePreviewBackgroundUrl = useMemo(() => {
    return String(templateBgUrl || "").trim();
  }, [templateBgUrl]);

  const aiEditorBackgroundUrl = useMemo(() => {
    return String(bgImageUrl || "").trim();
  }, [bgImageUrl]);

  const previewBaseUrl = useMemo(() => {
    if (activePhotoMode === TEMPLATE_MODE) {
      return templatePreviewBackgroundUrl;
    }

    if (activePhotoMode === AI_BG_MODE) {
      return aiEditorBackgroundUrl;
    }

    return "";
  }, [activePhotoMode, templatePreviewBackgroundUrl, aiEditorBackgroundUrl]);

  const savedCompositeUrl = useMemo(() => {
    // 親コンポーネントから渡される aiImageUrl には、互換性維持のため名前が残っています。
    // 実際には ImageTabPanel 側で compositeImageUrl を最優先にして渡します。
    // ここでは受け取ったURLを「保存済み完成画像」として表示します。
    return String(aiImageUrl || "").trim();
  }, [aiImageUrl]);

  const savedCompositeTextUrl = useMemo(() => {
    return String(compositeTextImageUrl || "").trim();
  }, [compositeTextImageUrl]);

  const savedCompositeDisplayUrl = useMemo(() => {
    if (!savedCompositeUrl) return "";
    const separator = savedCompositeUrl.includes("?") ? "&" : "?";
    return `${savedCompositeUrl}${separator}preview=${compositeImageRefreshKey}`;
  }, [savedCompositeUrl, compositeImageRefreshKey]);

  const savedCompositeTextDisplayUrl = useMemo(() => {
    if (!savedCompositeTextUrl) return "";
    const separator = savedCompositeTextUrl.includes("?") ? "&" : "?";
    return `${savedCompositeTextUrl}${separator}preview=${compositeTextImageRefreshKey}`;
  }, [savedCompositeTextUrl, compositeTextImageRefreshKey]);

  const shouldShowProductOverlay = useMemo(() => {
    if (!displayForegroundUrl) return false;

    if (activePhotoMode === TEMPLATE_MODE) {
      return !!templatePreviewBackgroundUrl;
    }

    if (activePhotoMode === AI_BG_MODE) {
      return !!aiEditorBackgroundUrl;
    }

    return false;
  }, [
    displayForegroundUrl,
    activePhotoMode,
    templatePreviewBackgroundUrl,
    aiEditorBackgroundUrl,
  ]);

  const canLiveEdit = shouldShowProductOverlay;

  const currentTemplateRecommendIndex = useMemo(() => {
    const current = String(templateBgUrl || "").trim();
    if (!current) return -1;
    return templateRecommended.findIndex((item) => item.url === current);
  }, [templateBgUrl, templateRecommended]);

  const currentTemplateBgUrl = useMemo(() => {
    return String(templateBgUrl || "").trim();
  }, [templateBgUrl]);

  const currentAiBgUrl = useMemo(() => {
    return String(bgImageUrl || "").trim();
  }, [bgImageUrl]);

  const previewBackgroundRect = useMemo(() => {
    return resolveBackgroundCoverRect({
      canvas: PREVIEW_CANVAS,
      naturalWidth: backgroundNaturalSize.width || PREVIEW_CANVAS,
      naturalHeight: backgroundNaturalSize.height || PREVIEW_CANVAS,
      scale: clamp(
        typeof backgroundScale === "number" ? backgroundScale : 1,
        0.5,
        4.4,
      ),
      x: clamp(typeof backgroundX === "number" ? backgroundX : 0, -2, 2),
      y: clamp(typeof backgroundY === "number" ? backgroundY : 0, -2, 2),
    });
  }, [
    backgroundNaturalSize.width,
    backgroundNaturalSize.height,
    backgroundScale,
    backgroundX,
    backgroundY,
  ]);

  const productStyle: React.CSSProperties = {
    position: "absolute",
    width: `${(previewGeometry.fgWidth / previewGeometry.canvas) * 100}%`,
    height: `${(previewGeometry.fgHeight / previewGeometry.canvas) * 100}%`,
    left: `${(previewGeometry.rect.left / previewGeometry.canvas) * 100}%`,
    top: `${(previewGeometry.rect.top / previewGeometry.canvas) * 100}%`,
    objectFit: "contain",
    filter: "none",
    pointerEvents: "none",
    userSelect: "none",
    zIndex: 2,
  };

  const shadowSvgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    userSelect: "none",
    zIndex: 1,
    mixBlendMode: "multiply",
  };

  const backgroundPreviewStyle = useMemo<React.CSSProperties>(() => {
    return {
      position: "absolute",
      width: `${(previewBackgroundRect.width / PREVIEW_CANVAS) * 100}%`,
      height: `${(previewBackgroundRect.height / PREVIEW_CANVAS) * 100}%`,
      left: `${(previewBackgroundRect.left / PREVIEW_CANVAS) * 100}%`,
      top: `${(previewBackgroundRect.top / PREVIEW_CANVAS) * 100}%`,
      objectFit: "fill",
      pointerEvents: "none",
      userSelect: "none",
    };
  }, [previewBackgroundRect]);

  async function handleSavePlacement(
    step: "background" | "product" | "shadow",
  ) {
    await onSavePlacement(step, {
      scale: uiScaleToSaved(safeScale),
      x: uiPosToSaved(safeX),
      y: uiPosToSaved(safeY),
      shadowOpacity: safeShadowOpacity,
      shadowBlur: safeShadowBlur,
      shadowScale: safeShadowScale,
      shadowOffsetX: safeShadowOffsetX,
      shadowOffsetY: safeShadowOffsetY,
      backgroundScale:
        typeof backgroundScale === "number"
          ? clamp(backgroundScale, 0.5, 4.4)
          : 1,
      backgroundX:
        typeof backgroundX === "number" ? clamp(backgroundX, -2, 2) : 0,
      backgroundY:
        typeof backgroundY === "number" ? clamp(backgroundY, -2, 2) : 0,
      activePhotoMode,
    });

    showMsg?.(`${step} を保存しました`);
  }

  const canRecomposeWithMeasuredForeground = useMemo(() => {
    const currentMeasurementUrl = String(measurementForegroundUrl || "").trim();
    const currentMeasuredUrl = String(measuredForegroundUrl || "").trim();

    if (!previewBaseUrl) return false;
    if (!currentMeasurementUrl) return false;
    if (!isForegroundMeasureReady) return false;

    return currentMeasurementUrl === currentMeasuredUrl;
  }, [
    previewBaseUrl,
    measurementForegroundUrl,
    measuredForegroundUrl,
    isForegroundMeasureReady,
  ]);

  async function handleRecompose() {
    if (!canRecomposeWithMeasuredForeground) {
      showMsg?.("前景サイズの反映中です。少し待ってから再合成してください。");
      return;
    }

    await handleSavePlacement(editingStep);
    await onRecompose?.();

    setCompositeImageRefreshKey(Date.now());
    setActivePreviewTab("final");
    setCompositePreviewMode?.("final");
  }

  async function handleLockBackgroundCoordinates() {
    if (!previewBaseUrl) {
      showMsg?.("先に背景を選択してください");
      return;
    }

    await onSavePlacement("background", {
      backgroundScale:
        typeof backgroundScale === "number"
          ? clamp(backgroundScale, 0.5, 4.4)
          : 1,
      backgroundX:
        typeof backgroundX === "number" ? clamp(backgroundX, -2, 2) : 0,
      backgroundY:
        typeof backgroundY === "number" ? clamp(backgroundY, -2, 2) : 0,
      activePhotoMode,
    });

    setIsBackgroundLocked(true);
    setEditingStep("product");
    showMsg?.(
      "背景座標を固定しました。②商品へ進めます。合成は④合成で実行します",
    );
  }


  function handleSelectEditStep(next: "background" | "product" | "shadow") {
    if (next !== "background" && !isBackgroundLocked) {
      showMsg?.("先に①背景を調整して、座標固定を押してください");
      return;
    }

    setEditingStep(next);
    setActivePreviewTab("edit");
                            setCompositePreviewMode?.("edit");
    setCompositePreviewMode?.("edit");
  }

  function handleSelectCompositePreview(next: CompositePreviewMode) {
    setActivePreviewTab(next);
    setCompositePreviewMode?.(next);

    if (next === "edit") {
      showMsg?.("上部プレビューを合成前の編集画面に切り替えました");
      return;
    }

    if (!savedCompositeUrl) {
      showMsg?.("合成後画像はまだありません。④合成で作成してください");
      return;
    }

    showMsg?.("上部プレビューを合成後の完成画像に切り替えました");
  }

  async function handleResetAdjustments() {
    const resetScale = 1;
    const resetX = 0.5;
    const resetY = 0.5;

    const resetShadowOpacity = 0.12;
    const resetShadowBlur = 12;
    const resetShadowScale = 1;
    const resetShadowOffsetX = 0;
    const resetShadowOffsetY = 0.02;

    const resetBackgroundScale = 1;
    const resetBackgroundX = 0;
    const resetBackgroundY = 0;

    setPlacementScale(resetScale);
    setPlacementX(resetX);
    setPlacementY(resetY);

    setShadowOpacity(resetShadowOpacity);
    setShadowBlur(resetShadowBlur);
    setShadowScale(resetShadowScale);
    setShadowOffsetX(resetShadowOffsetX);
    setShadowOffsetY(resetShadowOffsetY);

    setBackgroundScale(resetBackgroundScale);
    setBackgroundX(resetBackgroundX);
    setBackgroundY(resetBackgroundY);

    setEditingStep("background");
    setActivePreviewTab("edit");
                            setCompositePreviewMode?.("edit");
    setCompositePreviewMode?.("edit");
    setIsBackgroundLocked(false);

    showMsg?.("調整をリセットしました。保存・合成は④合成で実行します");
  }

  function handleSelectSizeTemplate(next: SizeTemplateType) {
    if (busy) return;

    if (typeof setSizeTemplateType === "function") {
      setSizeTemplateType(next);
      showMsg?.(
        `サイズ表示を「${next === "simple" ? "シンプル" : next === "compare" ? "比較" : "詳細"}」にしました`,
      );
      return;
    }

    showMsg?.(
      "サイズテンプレは表示されていますが、親コンポーネントから保存処理が未接続です",
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
      <style jsx>{`
        .placementPreviewFixed {
          position: sticky;

          /*
    上部UIとの重なり防止
  */
          top: 8px;

          z-index: 8;

          background: rgba(0, 0, 0, 0.22);

          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);

          padding-bottom: 10px;

          /*
    sticky境界を自然化
  */
          border-radius: 16px;
        }

        .placementControlScroll {
          display: flex;
          flex-direction: column;

          /*
    既存余白維持
  */
          gap: 12px;

          /*
    編集プレビューとは別に、背景選択・構図プリセット・スライダー側だけをスクロール可能にします。
    これにより、プレビューを見ながら下の調整項目を動かせます。
  */
          max-height: min(78vh, 860px);
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;

          /*
    スクロールバー分の余白です。
  */
          padding-right: 8px;
        }
      `}</style>

      <div>
        <div className="text-white/86 font-bold" style={{ fontSize: 13 }}>
          ④ 合成画像の調整
        </div>

        <div
          className="mt-1 text-white/55"
          style={{ fontSize: 12, lineHeight: 1.5 }}
        >
          ① 背景 → 座標固定 → ② 商品 → ③ 影
          の順で調整し、④合成で最終画像を更新します。
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Btn
          variant={editingStep === "background" ? "primary" : "secondary"}
          disabled={busy}
          onClick={() => handleSelectEditStep("background")}
        >
          ①背景
        </Btn>

        <Btn
          variant={isBackgroundLocked ? "primary" : "secondary"}
          disabled={busy || !previewBaseUrl}
          onClick={() => {
            void handleLockBackgroundCoordinates();
          }}
        >
          座標固定
        </Btn>

        <Btn
          variant={editingStep === "product" ? "primary" : "secondary"}
          disabled={busy || !isBackgroundLocked}
          onClick={() => handleSelectEditStep("product")}
        >
          ②商品
        </Btn>

        <Btn
          variant={editingStep === "shadow" ? "primary" : "secondary"}
          disabled={busy || !isBackgroundLocked}
          onClick={() => handleSelectEditStep("shadow")}
        >
          ③影
        </Btn>

        <Btn
          variant="secondary"
          disabled={!canRecomposeWithMeasuredForeground || busy}
          onClick={handleRecompose}
        >
          ④合成
        </Btn>

        <Btn
          variant="secondary"
          disabled={busy}
          onClick={() => {
            void handleResetAdjustments();
          }}
        >
          リセット
        </Btn>

        <Btn
          variant="secondary"
          disabled={!savedCompositeUrl || !hasOverlayText || busy}
          onClick={async () => {
            await onSaveCompositeTextImageFromCompositeSlot?.();
            setCompositeTextImageRefreshKey(Date.now());
            setActivePreviewTab("final");
            setCompositePreviewMode?.("final");
          }}
        >
          ④-2 文字焼き込み保存
        </Btn>
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-white/80 font-bold" style={{ fontSize: 12 }}>
              上部プレビュー切替
            </div>
            <div className="mt-1 text-white/50" style={{ fontSize: 11, lineHeight: 1.6 }}>
              合成前で調整し、④合成後に合成後プレビューで確認します。
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Btn
              variant={compositePreviewMode === "edit" ? "primary" : "secondary"}
              disabled={busy}
              onClick={() => handleSelectCompositePreview("edit")}
            >
              合成前プレビュー
            </Btn>

            <Btn
              variant={compositePreviewMode === "final" ? "primary" : "secondary"}
              disabled={busy || !savedCompositeUrl}
              onClick={() => handleSelectCompositePreview("final")}
            >
              合成後プレビュー
            </Btn>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <SmallBadge
            active={editingStep === "background"}
            label={editingStep === "background" ? "調整中：背景" : "背景"}
          />
          <SmallBadge
            active={isBackgroundLocked}
            label={isBackgroundLocked ? "座標固定済み" : "座標未固定"}
          />
          <SmallBadge
            active={editingStep === "product"}
            label={editingStep === "product" ? "調整中：商品" : "商品"}
          />
          <SmallBadge
            active={editingStep === "shadow"}
            label={editingStep === "shadow" ? "調整中：影" : "影"}
          />
          <SmallBadge
            active={Boolean(savedCompositeUrl)}
            label={savedCompositeUrl ? "合成後あり" : "合成後未作成"}
          />
        </div>
      </div>

      <div
        className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/5 px-3 py-2 text-cyan-50/75"
        style={{ fontSize: 12, lineHeight: 1.7 }}
      >
        プレビューは上部の EDIT PREVIEW に統合しました。ここでは背景選択・位置・サイズ・影・座標固定・合成保存だけを操作します。
      </div>

      <div className="placementControlScroll">
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-white/72" style={{ fontSize: 12 }}>
                背景選択
              </div>

              <div className="flex items-center gap-2">
                <SmallBadge
                  active={activePhotoMode === TEMPLATE_MODE}
                  label={
                    activePhotoMode === TEMPLATE_MODE
                      ? "現在：テンプレ背景"
                      : "テンプレ背景"
                  }
                />
                <SmallBadge
                  active={activePhotoMode === AI_BG_MODE}
                  label={
                    activePhotoMode === AI_BG_MODE ? "現在：AI背景" : "AI背景"
                  }
                />
              </div>
            </div>

            <div
              className="mt-2 text-white/50"
              style={{ fontSize: 11, lineHeight: 1.6 }}
            >
              背景をクリックすると、その背景が編集対象になり、編集プレビューへ即反映されます。
            </div>

            <div className="mt-3 flex flex-col gap-3">
              <div>
                <div className="mb-2 text-white/60" style={{ fontSize: 11 }}>
                  テンプレ背景
                </div>

                {(templateBgUrls || []).length > 0 ? (
                  <div className="flex max-h-[190px] flex-wrap gap-2 overflow-auto pr-1">
                    {(templateBgUrls || [])
                      .map((url) => String(url || "").trim())
                      .filter(Boolean)
                      .slice(0, 18)
                      .map((u, i) => {
                      const isCurrent =
                        String(templateBgUrl || "").trim() ===
                        String(u || "").trim();
                      const recommendedItem = templateRecommended.find(
                        (item) => item.url === u,
                      );
                      const titleText = `テンプレ背景 ${i + 1}`;

                      return (
                        <button
                          key={`${u}-${i}`}
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            await onSelectTemplateBg?.(u);
                            await onChangePhotoMode(TEMPLATE_MODE);
                            setIsBackgroundLocked(false);
                            setEditingStep("background");
                            setActivePreviewTab("edit");
                            setCompositePreviewMode?.("edit");
                          }}
                          className={[
                            "group relative w-[84px] overflow-hidden rounded-xl border p-1 text-left transition",
                            "hover:-translate-y-0.5 hover:bg-white/10",
                            isCurrent
                              ? "border-cyan-300/70 bg-cyan-300/10 shadow-[0_0_18px_rgba(80,220,255,0.22)]"
                              : "border-white/10 bg-black/18",
                            busy ? "cursor-wait opacity-60" : "cursor-pointer",
                          ].join(" ")}
                          title={recommendedItem?.reason ? `${titleText} / ${recommendedItem.reason}` : titleText}
                          aria-label={`${titleText}を選択`}
                        >
                          <div className="h-[64px] w-full overflow-hidden rounded-lg border border-white/10 bg-black/25">
                            <ThumbImage src={u} alt={titleText} />
                          </div>
                          <div className="mt-1 truncate px-0.5 text-[10px] font-semibold leading-4 text-white/78">
                            {titleText}
                          </div>
                          {recommendedItem ? (
                            <div className="truncate px-0.5 text-[9px] leading-3 text-white/42">
                              おすすめ
                            </div>
                          ) : null}
                          {isCurrent ? (
                            <div className="absolute right-1 top-1 rounded-full border border-cyan-200/50 bg-cyan-300/90 px-1.5 py-0.5 text-[9px] font-bold text-slate-950">
                              選択中
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white/55"
                    style={{ fontSize: 12, lineHeight: 1.6 }}
                  >
                    テンプレ背景がありません
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 text-white/60" style={{ fontSize: 11 }}>
                  AI背景
                </div>

                {(aiBgUrls || []).length > 0 ? (
                  <div className="flex max-h-[190px] flex-wrap gap-2 overflow-auto pr-1">
                    {(aiBgUrls || [])
                      .map((url) => String(url || "").trim())
                      .filter(Boolean)
                      .slice(0, 15)
                      .map((u, i) => {
                        const isCurrent = currentAiBgUrl === u;
                        const titleText = `AI背景 ${i + 1}`;

                        return (
                          <button
                            key={`${u}-${i}`}
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                              await onSelectAiBg?.(u);
                              await onChangePhotoMode(AI_BG_MODE);
                              setIsBackgroundLocked(false);
                              setEditingStep("background");
                              setActivePreviewTab("edit");
                              setCompositePreviewMode?.("edit");
                            }}
                            className={[
                              "group relative w-[84px] overflow-hidden rounded-xl border p-1 text-left transition",
                              "hover:-translate-y-0.5 hover:bg-white/10",
                              isCurrent
                                ? "border-cyan-300/70 bg-cyan-300/10 shadow-[0_0_22px_rgba(80,220,255,0.22)]"
                                : "border-white/10 bg-black/18",
                              busy ? "cursor-wait opacity-60" : "cursor-pointer",
                            ].join(" ")}
                            title={titleText}
                            aria-label={`${titleText}を選択`}
                          >
                            <div className="h-[64px] w-full overflow-hidden rounded-lg border border-white/10 bg-black/25">
                              <ThumbImage src={u} alt={titleText} />
                            </div>
                            <div className="mt-1 truncate px-1 text-white/78" style={{ fontSize: 10 }}>
                              {titleText}
                            </div>
                            {isCurrent ? (
                              <div className="absolute right-2 top-2 rounded-full border border-cyan-200/50 bg-cyan-300/90 px-2 py-0.5 text-[9px] font-bold text-slate-950">
                                選択中
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                  </div>
                ) : (
                  <div
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white/55"
                    style={{ fontSize: 12, lineHeight: 1.6 }}
                  >
                    AI背景がありません
                  </div>
                )}
              </div>

              <LibraryBackgroundSection
                title="テンプレ背景ライブラリ"
                emptyText="テンプレ背景がありません。背景生成タブでテンプレ背景を生成するか、画像ライブラリへ保存してください。"
                assets={templateLibraryBackgrounds}
                busy={busy}
                currentUrl={currentTemplateBgUrl || templateBgUrl || bgImageUrl}
                onSelect={async (u) => {
                  await onSelectTemplateBg?.(u);
                  await onChangePhotoMode(TEMPLATE_MODE);
                  setIsBackgroundLocked(false);
                  setEditingStep("background");
                  setActivePreviewTab("edit");
                            setCompositePreviewMode?.("edit");
                }}
                labelForSource={() => "テンプレ背景"}
              />

              <LibraryBackgroundSection
                title="AI生成背景ライブラリ"
                emptyText="AI生成背景がありません。背景生成タブでAI背景を生成・同期してください。"
                assets={aiLibraryBackgrounds}
                busy={busy}
                currentUrl={currentAiBgUrl || bgImageUrl}
                onSelect={async (u) => {
                  await onSelectAiBg?.(u);
                  await onChangePhotoMode(AI_BG_MODE);
                  setIsBackgroundLocked(false);
                  setEditingStep("background");
                  setActivePreviewTab("edit");
                            setCompositePreviewMode?.("edit");
                }}
                labelForSource={() => "AI生成背景"}
              />

              <LibraryBackgroundSection
                title="手動アップロード背景"
                emptyText="手動アップロード背景がありません。画像ライブラリから保存してください。"
                assets={uploadedLibraryBackgrounds}
                busy={busy}
                currentUrl={currentAiBgUrl || bgImageUrl}
                onSelect={async (u) => {
                  await onSelectAiBg?.(u);
                  await onChangePhotoMode(AI_BG_MODE);
                  setIsBackgroundLocked(false);
                  setEditingStep("background");
                  setActivePreviewTab("edit");
                            setCompositePreviewMode?.("edit");
                }}
                labelForSource={() => "手動アップロード"}
              />
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
            <div className="text-white/72 mb-2" style={{ fontSize: 12 }}>
              構図プリセット（売れる配置）
            </div>

            <div className="flex flex-wrap gap-2">
              <ModeButton
                active={false}
                label="SELL（売る）"
                disabled={busy}
                onClick={() => {
                  setPlacementScale(uiScaleToSaved(110));
                  setPlacementX(uiPosToSaved(100));
                  setPlacementY(uiPosToSaved(126));
                }}
              />

              <ModeButton
                active={false}
                label="BRAND（世界観）"
                disabled={busy}
                onClick={() => {
                  setPlacementScale(uiScaleToSaved(82));
                  setPlacementX(uiPosToSaved(100));
                  setPlacementY(uiPosToSaved(110));
                }}
              />

              <ModeButton
                active={false}
                label="SMALL（余白）"
                disabled={busy}
                onClick={() => {
                  setPlacementScale(uiScaleToSaved(58));
                  setPlacementX(uiPosToSaved(100));
                  setPlacementY(uiPosToSaved(102));
                }}
              />
            </div>

            <div
              className="mt-2 text-white/50"
              style={{ fontSize: 11, lineHeight: 1.6 }}
            >
              ワンクリックで売れやすい配置に自動調整されます。
            </div>

            <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div
                    className="text-cyan-100 font-black"
                    style={{ fontSize: 12 }}
                  >
                    サイズ表示テンプレ
                  </div>
                  <div
                    className="mt-1 text-white/50"
                    style={{ fontSize: 11, lineHeight: 1.6 }}
                  >
                    完成画像にサイズ情報をどう見せるかの型です。配置調整と同じ場所で選びます。
                  </div>
                </div>

                <SmallBadge
                  active={true}
                  label={
                    safeSizeTemplateType === "simple"
                      ? "現在：シンプル"
                      : safeSizeTemplateType === "compare"
                        ? "現在：比較"
                        : "現在：詳細"
                  }
                />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                <SizeTemplateButton
                  active={safeSizeTemplateType === "simple"}
                  label="シンプル"
                  description="サイズ表記を少なめにして、商品をすっきり見せます。"
                  disabled={busy}
                  onClick={() => handleSelectSizeTemplate("simple")}
                />

                <SizeTemplateButton
                  active={safeSizeTemplateType === "compare"}
                  label="比較"
                  description="サイズ感を伝える見せ方に寄せます。大きめ商品向きです。"
                  disabled={busy}
                  onClick={() => handleSelectSizeTemplate("compare")}
                />

                <SizeTemplateButton
                  active={safeSizeTemplateType === "detail"}
                  label="詳細"
                  description="寸法情報をしっかり見せる型です。説明重視の商品向きです。"
                  disabled={busy}
                  onClick={() => handleSelectSizeTemplate("detail")}
                />
              </div>

              <div
                className="mt-3 text-white/45"
                style={{ fontSize: 11, lineHeight: 1.6 }}
              >
                ※
                このボタンは「サイズ表示の型」を選ぶためのものです。実際の寸法数値は商品ごとに別途入力・反映する前提です。
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3">
            <SliderRow
              label="背景ズーム（編集プレビュー）"
              value={backgroundScaleUi}
              min={BG_SCALE_UI_MIN}
              max={BG_SCALE_UI_MAX}
              step={1}
              disabled={busy || !previewBaseUrl || editingStep !== "background"}
              help="背景だけを拡大・縮小します。保存値と同じ意味で反映されます。"
              onChange={(n) => {
                const next = clamp(uiBgScaleToSaved(n), 0.5, 4.4);
                setBackgroundScale(next);
              }}
              onCommit={() => {
                const next = clamp(backgroundScale, 0.5, 4.4);
                void onSavePlacement("background", {
                  backgroundScale: next,
                  backgroundX,
                  backgroundY,
                  activePhotoMode,
                });
              }}
            />

            <SliderRow
              label="背景の左右位置（編集プレビュー）"
              value={backgroundXUi}
              min={BG_POS_UI_MIN}
              max={BG_POS_UI_MAX}
              step={1}
              disabled={busy || !previewBaseUrl || editingStep !== "background"}
              help="100 が中央です。保存値と同じ意味で左右移動します。"
              onChange={(n) => {
                const next = clamp(uiBgPosToSaved(n), -2, 2);
                setBackgroundX(next);
              }}
              onCommit={() => {
                const next = clamp(backgroundX, -2, 2);
                void onSavePlacement("background", {
                  backgroundScale,
                  backgroundX: next,
                  backgroundY,
                  activePhotoMode,
                });
              }}
            />

            <SliderRow
              label="背景の上下位置（編集プレビュー）"
              value={backgroundYUi}
              min={BG_POS_UI_MIN}
              max={BG_POS_UI_MAX}
              step={1}
              disabled={busy || !previewBaseUrl || editingStep !== "background"}
              help="100 が中央です。保存値と同じ意味で上下移動します。"
              onChange={(n) => {
                const next = clamp(uiBgPosToSaved(n), -2, 2);
                setBackgroundY(next);
              }}
              onCommit={() => {
                const next = clamp(backgroundY, -2, 2);
                void onSavePlacement("background", {
                  backgroundScale,
                  backgroundX,
                  backgroundY: next,
                  activePhotoMode,
                });
              }}
            />

            <SliderRow
              label="商品の大きさ"
              value={safeScale}
              min={PRODUCT_SCALE_UI_MIN}
              max={PRODUCT_SCALE_UI_MAX}
              step={1}
              disabled={
                busy ||
                !canLiveEdit ||
                !isBackgroundLocked ||
                editingStep !== "product"
              }
              help={
                canLiveEdit
                  ? "旧より大きく拡張しています。かなり大きく/小さくできます。"
                  : "背景または前景が無いため、今は編集プレビューできません。"
              }
              onChange={(n) => {
                const next = uiScaleToSaved(
                  clamp(n, PRODUCT_SCALE_UI_MIN, PRODUCT_SCALE_UI_MAX),
                );
                setPlacementScale(next);
              }}
              onCommit={() => {
                const next = clamp(
                  placementScale,
                  PRODUCT_SCALE_SAVED_MIN,
                  PRODUCT_SCALE_SAVED_MAX,
                );
                void onSavePlacement("product", {
                  scale: next,
                  x: placementX,
                  y: placementY,
                  activePhotoMode,
                });
              }}
            />

            <SliderRow
              label="切り抜き画像の左右位置"
              value={safeX}
              min={PRODUCT_POS_UI_MIN}
              max={PRODUCT_POS_UI_MAX}
              step={1}
              disabled={
                busy ||
                !canLiveEdit ||
                !isBackgroundLocked ||
                editingStep !== "product"
              }
              help={
                canLiveEdit
                  ? "100 が中央です。旧より大きく外側まで動かせます。"
                  : "背景または前景が無いため、今は編集プレビューできません。"
              }
              onChange={(n) => {
                const next = uiPosToSaved(
                  clamp(n, PRODUCT_POS_UI_MIN, PRODUCT_POS_UI_MAX),
                );
                setPlacementX(next);
              }}
              onCommit={() => {
                const next = clamp(
                  placementX,
                  PRODUCT_POS_SAVED_MIN,
                  PRODUCT_POS_SAVED_MAX,
                );
                void onSavePlacement("product", {
                  scale: placementScale,
                  x: next,
                  y: placementY,
                  activePhotoMode,
                });
              }}
            />

            <SliderRow
              label="切り抜き画像の上下位置"
              value={safeY}
              min={PRODUCT_POS_UI_MIN}
              max={PRODUCT_POS_UI_MAX}
              step={1}
              disabled={
                busy ||
                !canLiveEdit ||
                !isBackgroundLocked ||
                editingStep !== "product"
              }
              help={
                canLiveEdit
                  ? "100 が中央です。旧より大きく上下へ動かせます。"
                  : "背景または前景が無いため、今は編集プレビューできません。"
              }
              onChange={(n) => {
                const next = uiPosToSaved(
                  clamp(n, PRODUCT_POS_UI_MIN, PRODUCT_POS_UI_MAX),
                );
                setPlacementY(next);
              }}
              onCommit={() => {
                const next = clamp(
                  placementY,
                  PRODUCT_POS_SAVED_MIN,
                  PRODUCT_POS_SAVED_MAX,
                );
                void onSavePlacement("product", {
                  scale: placementScale,
                  x: placementX,
                  y: next,
                  activePhotoMode,
                });
              }}
            />

            <SliderRow
              label="影の濃さ"
              value={Math.round(safeShadowOpacity * 100)}
              min={0}
              max={100}
              step={1}
              disabled={
                busy ||
                !canLiveEdit ||
                !isBackgroundLocked ||
                editingStep !== "shadow"
              }
              help={
                canLiveEdit
                  ? "精密ロジックの影計算で、その場で反映されます。"
                  : "背景または前景が無いため、今は編集プレビューできません。"
              }
              onChange={(n) => {
                const next = clamp(n / 100, 0, 1);
                setShadowOpacity(next);
              }}
              onCommit={() => {
                const next = clamp(shadowOpacity, 0, 1);
                void onSavePlacement("shadow", {
                  shadowOpacity: next,
                  shadowBlur,
                  shadowScale,
                  shadowOffsetX,
                  shadowOffsetY,
                  activePhotoMode,
                });
              }}
            />

            <SliderRow
              label="影のぼかし"
              value={safeShadowBlur}
              min={SHADOW_BLUR_MIN}
              max={SHADOW_BLUR_MAX}
              step={1}
              disabled={
                busy ||
                !canLiveEdit ||
                !isBackgroundLocked ||
                editingStep !== "shadow"
              }
              help="旧より大きく広げています。数字が大きいほど影が柔らかく広がります。"
              onChange={(n) => {
                const next = clamp(n, SHADOW_BLUR_MIN, SHADOW_BLUR_MAX);
                setShadowBlur(next);
              }}
              onCommit={() => {
                const next = clamp(
                  shadowBlur,
                  SHADOW_BLUR_MIN,
                  SHADOW_BLUR_MAX,
                );
                void onSavePlacement("shadow", {
                  shadowOpacity,
                  shadowBlur: next,
                  shadowScale,
                  shadowOffsetX,
                  shadowOffsetY,
                  activePhotoMode,
                });
              }}
            />

            <SliderRow
              label="影の広がり"
              value={Math.round(safeShadowScale * 100)}
              min={Math.round(SHADOW_SCALE_MIN * 100)}
              max={Math.round(SHADOW_SCALE_MAX * 100)}
              step={1}
              disabled={
                busy ||
                !canLiveEdit ||
                !isBackgroundLocked ||
                editingStep !== "shadow"
              }
              help="旧より大きく広げています。数字が大きいほど影の横幅が広がります。"
              onChange={(n) => {
                const next = clamp(n / 100, SHADOW_SCALE_MIN, SHADOW_SCALE_MAX);
                setShadowScale(next);
              }}
              onCommit={() => {
                const next = clamp(
                  shadowScale,
                  SHADOW_SCALE_MIN,
                  SHADOW_SCALE_MAX,
                );
                void onSavePlacement("shadow", {
                  shadowOpacity,
                  shadowBlur,
                  shadowScale: next,
                  shadowOffsetX,
                  shadowOffsetY,
                  activePhotoMode,
                });
              }}
            />

            <SliderRow
              label="影の左右位置（大きく移動）"
              value={savedShadowOffsetToUi(safeShadowOffsetX)}
              min={SHADOW_OFFSET_UI_MIN}
              max={SHADOW_OFFSET_UI_MAX}
              step={1}
              disabled={
                busy ||
                !canLiveEdit ||
                !isBackgroundLocked ||
                editingStep !== "shadow"
              }
              help="接地面から大きく外れた時に使います。まずはこのバーで大きく戻してください。"
              onChange={(n) => {
                const next = clamp(
                  uiShadowOffsetToSaved(n),
                  SHADOW_OFFSET_COARSE_MIN,
                  SHADOW_OFFSET_COARSE_MAX,
                );
                setShadowOffsetX(next);
              }}
              onCommit={() => {
                const next = clamp(
                  shadowOffsetX,
                  SHADOW_OFFSET_COARSE_MIN,
                  SHADOW_OFFSET_COARSE_MAX,
                );
                void onSavePlacement("shadow", {
                  shadowOpacity,
                  shadowBlur,
                  shadowScale,
                  shadowOffsetX: next,
                  shadowOffsetY,
                  activePhotoMode,
                });
              }}
            />

            <SliderRow
              label="影の上下位置（大きく移動）"
              value={savedShadowOffsetToUi(safeShadowOffsetY)}
              min={SHADOW_OFFSET_UI_MIN}
              max={SHADOW_OFFSET_UI_MAX}
              step={1}
              disabled={
                busy ||
                !canLiveEdit ||
                !isBackgroundLocked ||
                editingStep !== "shadow"
              }
              help="接地位置が大きくずれた時に使います。まずはこのバーで大きく戻してください。"
              onChange={(n) => {
                const next = clamp(
                  uiShadowOffsetToSaved(n),
                  SHADOW_OFFSET_COARSE_MIN,
                  SHADOW_OFFSET_COARSE_MAX,
                );
                setShadowOffsetY(next);
              }}
              onCommit={() => {
                const next = clamp(
                  shadowOffsetY,
                  SHADOW_OFFSET_COARSE_MIN,
                  SHADOW_OFFSET_COARSE_MAX,
                );
                void onSavePlacement("shadow", {
                  shadowOpacity,
                  shadowBlur,
                  shadowScale,
                  shadowOffsetX,
                  shadowOffsetY: next,
                  activePhotoMode,
                });
              }}
            />
          </div>

          <div
            className="mt-3 rounded-xl border border-white/10 bg-black/15 px-3 py-3 text-white/70"
            style={{ fontSize: 12, lineHeight: 1.7 }}
          >
            <div className="text-white/85 font-bold" style={{ fontSize: 12 }}>
              ④ 合成画像
            </div>

            <div className="mt-2">背景と商品を合成した最終画像です。</div>

            <div className="mt-2">
              状態：{savedCompositeUrl ? "あり" : "まだ未作成"}
              {savedCompositeUrl
                ? ` / ${isCompositeFresh ? "最新" : "保存済み"}`
                : ""}
            </div>

            <div className="mt-2">
              テンプレ背景も
              AI背景も、この画面で背景を切り替えながら配置調整できます。
            </div>

            <div className="mt-1">
              まず①背景で位置を決めて「座標固定」を押してください。その後に②商品、③影を調整し、最後に「④合成」で更新します。
            </div>
          </div>
        </div>
    </div>
  );
}
