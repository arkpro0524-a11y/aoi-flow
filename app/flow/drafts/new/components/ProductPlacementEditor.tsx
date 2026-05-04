//app/flow/drafts/new/components/ProductPlacementEditor.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Btn } from "../ui";
import type { ProductPhotoMode, TextOverlay } from "@/lib/types/draft";

/**
 * ① 商品写真の配置調整UI
 *
 * 役割
 * - 背景選択
 * - 精密プレビュー
 * - 構図プリセット
 * - 配置保存
 * - 再合成
 *
 * 重要
 * - 旧 BackgroundPanel.tsx にあった精密ロジックを消さずに移植
 * - テンプレ背景だけでなく AI背景もこの画面で選択・反映・編集できる
 * - AI背景で bgImageUrl が存在する時は「背景のみ + 商品重ね」の編集プレビュー
 * - AI背景で bgImageUrl が無く aiImageUrl しか無い時だけ、保存済み完成画像をそのまま表示
 *
 * 今回の追加
 * - 既存機能は削除せず維持
 * - ④の編集プレビュー上に、任意で文字オーバーレイを重ねられるようにする
 * - ただし親から文字情報がまだ渡ってこなくても壊れないように optional props にする
 * - 保存済み完成画像タブは「保存済み画像をそのまま見る」役割を維持するため、文字は重ねない
 *
 * 今回の本質修正
 * - 文字が見えない主因だった fontSize の計算を修正
 *   - 以前の % は「親の font-size 基準」になってしまい極小表示になる
 *   - 今回は cqw を使って、プレビュー幅に対して正しく拡大縮小する
 * - x / y が旧データで 0〜1 でも、新データで 0〜100 でも両対応にする
 * - composite 以外から来た overlay でも、そのまま安全に表示できるようにする
 *
 * 今回の追加修正
 * - 商品位置・影位置などの可動域を大きく拡張する
 * - 背景側も編集プレビュー上でズーム・左右位置・上下位置を調整できるようにする
 *
 * 今回の重要修正
 * - 合成後に foregroundImageUrl の実画像サイズが変わると、
 *   同じ slider 値でも動きの感じが変わって見える問題があった
 * - そこで「配置計算専用の基準サイズ」を追加し、
 *   baseImageUrl が同じ間はその基準を維持するようにした
 * - これにより、再合成後でもバーの動きの感じが急に変わりにくくなる
 *
 * 注意
 * - 背景ズーム/背景位置は、今回の4ファイル範囲では「編集プレビュー反映」まで
 * - 完全保存まで行うには controller / hook 側にも追加配線が必要
 */

type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type BgScene = "studio" | "lifestyle" | "scale" | "detail";

type TemplateRecommendItem = {
  url: string;
  reason: string;
  score?: number;
};

const TEMPLATE_MODE: ProductPhotoMode = "template";
const AI_BG_MODE: ProductPhotoMode = "ai_bg";
const PREVIEW_CANVAS = 1024;

/**
 * 今回の可動域定数
 *
 * 商品配置
 * - scale: 旧 0.4〜2.2 → 新 0.2〜4.4
 * - x/y  : 旧 0〜1     → 新 -0.75〜1.75
 *
 * UIスライダー
 * - scale: 旧 20〜95   → 新 10〜180
 * - x/y  : 旧 0〜100   → 新 0〜200（100が中央）
 *
 * 影
 * - blur: 旧 0〜100    → 新 0〜200
 * - scale:旧 0.5〜2    → 新 0.25〜4
 * - offset:
 *   内部の互換レンジは残すが、
 *   UIでは「微調整」専用としてかなり狭く扱う
 *
 * 背景（編集プレビューのみ）
 * - zoom: 40〜220
 * - x/y : 0〜200（100が中央）
 */
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

/**
 * 影は「商品の補助」なので、
 * UIでは自由移動ではなく微調整だけ許可する
 */
const SHADOW_FINE_UI_MIN = 90;
const SHADOW_FINE_UI_MAX = 110;

/**
 * 大きく動かす用
 * - 保存値は -4〜4
 * - UI は 0〜200
 */
const SHADOW_OFFSET_COARSE_MIN = -8;
const SHADOW_OFFSET_COARSE_MAX = 8;

/**
 * 微調整用
 * - 保存値は -0.25〜0.25
 * - UI は 90〜110
 */
// ★修正
// 微調整をやめて、通常操作だけでしっかり動かす
const SHADOW_OFFSET_X_EFFECTIVE_MIN = -8;
const SHADOW_OFFSET_X_EFFECTIVE_MAX = 8;

const SHADOW_OFFSET_Y_EFFECTIVE_MIN = -8;
const SHADOW_OFFSET_Y_EFFECTIVE_MAX = 8;

const BG_SCALE_UI_MIN = 40;
const BG_SCALE_UI_MAX = 220;
const BG_POS_UI_MIN = 0;
const BG_POS_UI_MAX = 200;

type Props = {
    /**
   * 重要
   * - 再合成後にAPIが返した本番配置結果
   * - これを次回編集プレビューの基準に使う
   */
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
    }
  ) => void | Promise<void>;

  busy?: boolean;
  showMsg?: (msg: string) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * 保存値 → UI表示値
 * 保存値 scale は 0.2〜4.4
 * UI は 10〜180
 */
function savedScaleToUi(saved: number) {
  const safe = clamp(saved, PRODUCT_SCALE_SAVED_MIN, PRODUCT_SCALE_SAVED_MAX);
  const ratio =
    (safe - PRODUCT_SCALE_SAVED_MIN) /
    (PRODUCT_SCALE_SAVED_MAX - PRODUCT_SCALE_SAVED_MIN);

  return PRODUCT_SCALE_UI_MIN + ratio * (PRODUCT_SCALE_UI_MAX - PRODUCT_SCALE_UI_MIN);
}

/**
 * 保存値 x/y は -0.75〜1.75
 * UI は 0〜200
 * 100 が中央
 */
function savedPosToUi(saved: number) {
  const safe = clamp(saved, PRODUCT_POS_SAVED_MIN, PRODUCT_POS_SAVED_MAX);
  const ratio =
    (safe - PRODUCT_POS_SAVED_MIN) /
    (PRODUCT_POS_SAVED_MAX - PRODUCT_POS_SAVED_MIN);

  return PRODUCT_POS_UI_MIN + ratio * (PRODUCT_POS_UI_MAX - PRODUCT_POS_UI_MIN);
}

/**
 * UI表示値 → 保存値
 */
function uiScaleToSaved(ui: number) {
  const safe = clamp(ui, PRODUCT_SCALE_UI_MIN, PRODUCT_SCALE_UI_MAX);
  const ratio =
    (safe - PRODUCT_SCALE_UI_MIN) /
    (PRODUCT_SCALE_UI_MAX - PRODUCT_SCALE_UI_MIN);

  return PRODUCT_SCALE_SAVED_MIN + ratio * (PRODUCT_SCALE_SAVED_MAX - PRODUCT_SCALE_SAVED_MIN);
}

function uiPosToSaved(ui: number) {
  const safe = clamp(ui, PRODUCT_POS_UI_MIN, PRODUCT_POS_UI_MAX);
  const ratio =
    (safe - PRODUCT_POS_UI_MIN) /
    (PRODUCT_POS_UI_MAX - PRODUCT_POS_UI_MIN);

  return PRODUCT_POS_SAVED_MIN + ratio * (PRODUCT_POS_SAVED_MAX - PRODUCT_POS_SAVED_MIN);
}

/**
 * 影 offset の UI 0〜200 ↔ 保存 -2〜2
 */
function savedShadowOffsetToUi(saved: number) {
  const safe = clamp(saved, SHADOW_OFFSET_MIN, SHADOW_OFFSET_MAX);
  const ratio =
    (safe - SHADOW_OFFSET_MIN) /
    (SHADOW_OFFSET_MAX - SHADOW_OFFSET_MIN);

  return SHADOW_OFFSET_UI_MIN + ratio * (SHADOW_OFFSET_UI_MAX - SHADOW_OFFSET_UI_MIN);
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
    SHADOW_OFFSET_X_EFFECTIVE_MAX
  );
  const ratio =
    (safe - SHADOW_OFFSET_X_EFFECTIVE_MIN) /
    (SHADOW_OFFSET_X_EFFECTIVE_MAX - SHADOW_OFFSET_X_EFFECTIVE_MIN);

  return SHADOW_FINE_UI_MIN + ratio * (SHADOW_FINE_UI_MAX - SHADOW_FINE_UI_MIN);
}

function uiShadowFineXToSaved(ui: number) {
  const safe = clamp(ui, SHADOW_FINE_UI_MIN, SHADOW_FINE_UI_MAX);
  const ratio =
    (safe - SHADOW_FINE_UI_MIN) /
    (SHADOW_FINE_UI_MAX - SHADOW_FINE_UI_MIN);

  return (
    SHADOW_OFFSET_X_EFFECTIVE_MIN +
    ratio * (SHADOW_OFFSET_X_EFFECTIVE_MAX - SHADOW_OFFSET_X_EFFECTIVE_MIN)
  );
}

function savedShadowFineYToUi(saved: number) {
  const safe = clamp(
    saved,
    SHADOW_OFFSET_Y_EFFECTIVE_MIN,
    SHADOW_OFFSET_Y_EFFECTIVE_MAX
  );
  const ratio =
    (safe - SHADOW_OFFSET_Y_EFFECTIVE_MIN) /
    (SHADOW_OFFSET_Y_EFFECTIVE_MAX - SHADOW_OFFSET_Y_EFFECTIVE_MIN);

  return SHADOW_FINE_UI_MIN + ratio * (SHADOW_FINE_UI_MAX - SHADOW_FINE_UI_MIN);
}

function uiShadowFineYToSaved(ui: number) {
  const safe = clamp(ui, SHADOW_FINE_UI_MIN, SHADOW_FINE_UI_MAX);
  const ratio =
    (safe - SHADOW_FINE_UI_MIN) /
    (SHADOW_FINE_UI_MAX - SHADOW_FINE_UI_MIN);

  return (
    SHADOW_OFFSET_Y_EFFECTIVE_MIN +
    ratio * (SHADOW_OFFSET_Y_EFFECTIVE_MAX - SHADOW_OFFSET_Y_EFFECTIVE_MIN)
  );
}
/**
 * 背景位置UI → transform用値
 * 100 が中央
 *
 * 注意
 * - 既存機能維持のため残す
 * - 現在このファイルでは未使用
 */
function uiBgOffsetPercent(ui: number) {
  const safe = clamp(ui, BG_POS_UI_MIN, BG_POS_UI_MAX);
  return ((safe - 100) / 100) * 100;
}

/**
 * ★追加
 * 背景保存値(-1〜1中心=0) ↔ UI(0〜200中心=100)
 */
function savedBgPosToUi(saved: number) {
  const safe = clamp(saved, -1, 1);
  return clamp(100 + safe * 100, BG_POS_UI_MIN, BG_POS_UI_MAX);
}

function uiBgPosToSaved(ui: number) {
  const safe = clamp(ui, BG_POS_UI_MIN, BG_POS_UI_MAX);
  return clamp((safe - 100) / 100, -1, 1);
}

function savedBgScaleToUi(saved: number) {
  const safe = clamp(saved, 0.5, 3);
  return safe * 100;
}

function uiBgScaleToSaved(ui: number) {
  const safe = clamp(ui, BG_SCALE_UI_MIN, BG_SCALE_UI_MAX);
  return clamp(safe / 100, 0.5, 3);
}

function softenShadowScale(input: number) {
  const safe = clamp(input, 0.25, 4);

  if (safe <= 1) {
    return safe;
  }

  return 1 + (safe - 1) * 0.7;
}


/**
 * overlay.lines を安全に整形する
 */
function getSafeOverlayLines(overlay?: TextOverlay | null): string[] {
  if (!overlay) return [];

  if (Array.isArray(overlay.lines) && overlay.lines.length > 0) {
    return overlay.lines
      .map((line) => String(line ?? "").trim())
      .filter(Boolean);
  }

  if (typeof (overlay as any).text === "string" && String((overlay as any).text).trim()) {
    return String((overlay as any).text)
      .split("\n")
      .map((line) => String(line ?? "").trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * rgba(0,0,0,0.45) などから opacity を取り出す
 * 取れなければ fallback を使う
 */
function parseAlphaFromRgba(color: string | undefined, fallback: number) {
  const value = String(color ?? "").trim();
  const match = /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/i.exec(value);
  if (!match) return fallback;

  const alpha = Number(match[1]);
  if (!Number.isFinite(alpha)) return fallback;

  return clamp(alpha, 0, 1);
}

/**
 * x / y の旧値(0〜1)と新値(0〜100)を吸収する
 */
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

/**
 * backend の tuneForeground() と同じ考え方で preview 用サイズを決める
 */
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
    productSize === "large" ? 840 :
    productSize === "small" ? 680 :
    780;

  const scale = Math.min(
    targetWidth / safeNaturalWidth,
    maxHeight / safeNaturalHeight,
    1
  );

  const width = Math.max(1, Math.round(safeNaturalWidth * scale));
  const height = Math.max(1, Math.round(safeNaturalHeight * scale));

  return {
    width,
    height,
  };
}

/**
 * backend の resolveBottomMargin() と同じ
 */
function resolveBottomMargin(
  groundingType: GroundingType,
  productCategory: ProductCategory,
  productSize: ProductSize,
  bgScene: BgScene
) {
  if (groundingType === "table") return 208;
  if (groundingType === "hanging") return 220;
  if (groundingType === "wall") return 165;

  const base =
    productCategory === "furniture" ? 118 :
    productSize === "large" ? 122 :
    productSize === "small" ? 136 :
    130;

  return bgScene === "studio" ? base - 4 : base;
}

/**
 * backend の resolvePlacementRect() と同じ
 * 今回は可動域拡張のため、画面外へ少し出せる余白も許可する
 */
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
    bgScene
  );

  const defaultLeft = Math.round((canvas - fgWidth) / 2);
  const defaultTop = Math.max(30, canvas - fgHeight - baseBottomMargin);

  let left = Math.round(placement.x * canvas - fgWidth / 2);
let top = Math.round(placement.y * canvas - fgHeight / 2);

  /**
   * 今回の拡張
   * - 旧: 完全に画面内へクランプ
   * - 新: 画像サイズの 75% ぶんは外へ逃がせる
   */
  const overflowX = Math.round(fgWidth * 0.75);
  const overflowY = Math.round(fgHeight * 0.75);

  left = clamp(left, -overflowX, Math.max(-overflowX, canvas - fgWidth + overflowX));

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
    left = clamp(defaultLeft, -overflowX, Math.max(-overflowX, canvas - fgWidth + overflowX));
  }

  if (isNearDefaultY) {
    top = clamp(defaultTop, -overflowY, Math.max(-overflowY, maxTop + overflowY));
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

/**
 * backend の makeGroundShadow() とできるだけ合わせた preview 用影矩形
 *
 * 重要
 * - 影は商品の補助扱い
 * - UIでも内部計算でも暴れないように、
 *   offset は微調整レンジへ制限する
 */
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
    groundingType === "wall" ? 0.35 :
    groundingType === "table" ? 0.5 :
    0.6;

const safeOffsetX = clamp(
  shadowOffsetX,
  SHADOW_OFFSET_COARSE_MIN,
  SHADOW_OFFSET_COARSE_MAX
);

const safeOffsetY = clamp(
  shadowOffsetY,
  SHADOW_OFFSET_COARSE_MIN,
  SHADOW_OFFSET_COARSE_MAX
);

const scale = softenShadowScale(shadowScale);

const w = Math.max(60, Math.round(shadowWidth * baseScale * scale));
const h = Math.max(8, Math.round(w * 0.08));

const cx = clamp(
  Math.round(centerX + safeOffsetX * 24),
  -Math.round(w),
  canvas + Math.round(w)
);

/**
 * API側 makeGroundShadow() と完全一致させる
 * - 以前は * 80 だったため、編集プレビューだけ影が大きく上下に動いていた
 * - API側は SHADOW_OFFSET_Y_PIXELS = 24
 */
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

/**
 * 背景 cover 計算
 */
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

  /**
   * object-fit: cover と同じ基準サイズ
   */
  const coverScale = Math.max(canvas / safeW, canvas / safeH);
  const baseW = safeW * coverScale;
  const baseH = safeH * coverScale;

  /**
   * 保存値 scale をそのまま追加倍率として使う
   */
  const drawW = baseW * scale;
  const drawH = baseH * scale;

  /**
   * x / y は -1〜1
   * 0 が中央
   * はみ出し余白の半分を最大移動量として使う
   */
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

/**
 * 前景画像の「透明余白を除いた見た目サイズ」を測る
 *
 * 重要
 * - 本番側は trim 後のサイズ感で配置計算される
 * - preview 側も同じ思想にそろえるため、
 *   alpha > 0 の範囲だけを bounding box として使う
 */
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

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("前景画像の読み込みに失敗しました"));
    el.src = url;
  });

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
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
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

  /**
   * 全透明だった場合は natural をそのまま返す
   */
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
        onMouseUp={() => onCommit?.()}
        onTouchEnd={() => onCommit?.()}
        onPointerUp={() => onCommit?.()}
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

function SmallBadge({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
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

  templateRecommended = [],
  templateRecommendTopReason = "",
  isCompositeFresh = false,
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
  busy = false,
  showMsg,
}: Props) {
  /**
   * 今回は UI からだけ外す
   * - props 契約は壊さない
   * - 上流の既存機能は削除しない
   */
  void canUndo;
  void canRedo;
  void onUndo;
  void onRedo;

  /**
   * 現在表示している前景画像の実サイズ
   * - 既存機能維持のため残す
   * - 直接の配置計算基準には使わない
   */
/**
 * 前景画像サイズ
 *
 * 重要
 * - natural は元画像全体サイズ
 * - trimmed は透明余白を除いた実見た目サイズ
 * - 今回のズレ対策では trimmed を最優先で使う
 */
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

/**
 * 追加
 * - 今どの前景URLを計測済みか
 * - その計測が完了しているか
 *
 * 重要
 * - foregroundImageUrl が更新された直後は、
 *   まだ新しい trimmed 計測が終わっていない可能性がある
 * - その状態で再合成すると「古い座標基準」で再合成してしまう
 */
const [measuredForegroundUrl, setMeasuredForegroundUrl] = useState("");
const [isForegroundMeasureReady, setIsForegroundMeasureReady] = useState(false);

/**
 * 背景画像サイズ（←これが不足していた）
 * - 背景ズームや位置計算で使用
 * - onLoadでセットされる
 */
const [backgroundNaturalSize, setBackgroundNaturalSize] = useState({
  width: 0,
  height: 0,
});

/**
 * プレビュータブ状態
 * - edit：編集プレビュー
 * - final：保存済み画像
 */
const [activePreviewTab, setActivePreviewTab] = useState<"edit" | "final">("edit");

/**
 * 背景座標を固定したかどうか
 *
 * 重要
 * - false の間は ②商品 / ③影 に進めない
 * - 背景を選び直したら false に戻す
 */
const [isBackgroundLocked, setIsBackgroundLocked] = useState(false);

/**
 * 追加
 * - Storage上の画像URLが同じまま上書きされると、
 *   ブラウザが古い画像を表示することがある
 * - 表示専用に query を付けて、最新画像を再読み込みさせる
 */
const [compositeImageRefreshKey, setCompositeImageRefreshKey] = useState(0);
const [compositeTextImageRefreshKey, setCompositeTextImageRefreshKey] = useState(0);


  /**
   * ★修正
   * 背景UI値は local state ではなく、保存値から直接作る
   * これで preview / save / recomposite の意味を一致させる
   */
  const backgroundScaleUi = useMemo(() => {
    return savedBgScaleToUi(typeof backgroundScale === "number" ? backgroundScale : 1);
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
    PRODUCT_SCALE_SAVED_MAX
  );

  const safePlacementXSaved = clamp(
    Number.isFinite(Number(placementX)) ? Number(placementX) : 0.5,
    PRODUCT_POS_SAVED_MIN,
    PRODUCT_POS_SAVED_MAX
  );

  const safePlacementYSaved = clamp(
    Number.isFinite(Number(placementY)) ? Number(placementY) : 0.5,
    PRODUCT_POS_SAVED_MIN,
    PRODUCT_POS_SAVED_MAX
  );

  const safeScale = clamp(
    savedScaleToUi(safePlacementScaleSaved),
    PRODUCT_SCALE_UI_MIN,
    PRODUCT_SCALE_UI_MAX
  );

  const safeX = clamp(
    savedPosToUi(safePlacementXSaved),
    PRODUCT_POS_UI_MIN,
    PRODUCT_POS_UI_MAX
  );

  const safeY = clamp(
    savedPosToUi(safePlacementYSaved),
    PRODUCT_POS_UI_MIN,
    PRODUCT_POS_UI_MAX
  );

  const safeShadowOpacity = clamp(shadowOpacity || 0.12, 0, 1);
  const safeShadowBlur = clamp(shadowBlur || 12, SHADOW_BLUR_MIN, SHADOW_BLUR_MAX);
  const safeShadowScale = clamp(shadowScale || 1, SHADOW_SCALE_MIN, SHADOW_SCALE_MAX);

// ★serverと一致させる（微調整レンジ）
const safeShadowOffsetX = clamp(
  Number.isFinite(Number(shadowOffsetX)) ? Number(shadowOffsetX) : 0,
  SHADOW_OFFSET_COARSE_MIN,
  SHADOW_OFFSET_COARSE_MAX
);

const safeShadowOffsetY = clamp(
  Number.isFinite(Number(shadowOffsetY)) ? Number(shadowOffsetY) : 0.02,
  SHADOW_OFFSET_COARSE_MIN,
  SHADOW_OFFSET_COARSE_MAX
);

  /**
   * 文字オーバーレイの安全な表示値を作る
   * - 親からまだ何も来ていなくても壊れない
   */
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

    if (typeof textOverlay?.bandOpacity === "number" && textOverlay.bandOpacity > 0) {
      return true;
    }

    return true;
  }, [hasOverlayText, textOverlay?.background?.enabled, textOverlay?.bandOpacity]);

  const overlayBackgroundColor = useMemo(() => {
    const color = String(textOverlay?.background?.color ?? "rgba(0,0,0,0.45)").trim();
    return color || "rgba(0,0,0,0.45)";
  }, [textOverlay?.background?.color]);

  const normalizedSavedScaleForPreview = useMemo(() => {
    return safePlacementScaleSaved;
  }, [safePlacementScaleSaved]);

  /**
   * 配置計算に使うサイズ
   *
   * 優先順位
   * 1. 固定基準サイズ（合成後も維持したい）
   * 2. まだ基準が無い時だけ現在の表示画像サイズ
   * 3. 最後は targetWidth fallback
   */
/**
 * 商品の配置計算は trimmed 後の実見た目寸法を最優先で使う
 *
 * 重要
 * - 透明余白込み natural ではなく、
 *   alpha から測った trimmed を使う
 * - これで本番の trim 後配置に寄せる
 */
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

    /**
     * 重要
     * - 再合成後にAPIが返した本番配置結果があるなら、
     *   それを編集プレビューの基準に使う
     * - これにより「再合成後だけ急にズレる」を減らす
     * - 無い時だけ従来ロジックへフォールバックする
     */
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
      /**
       * 本番で確定した矩形
       */
      const baseLeft = Number(serverPlacement!.left ?? 0);
      const baseTop = Number(serverPlacement!.top ?? 0);
      const baseWidth = Math.max(1, Number(serverPlacement!.width ?? 1));
      const baseHeight = Math.max(1, Number(serverPlacement!.height ?? 1));

      /**
       * その本番矩形を作った時の入力値
       */
const baseInputScale = clamp(
  Number(serverPlacementInput?.scale ?? 1),
        PRODUCT_SCALE_SAVED_MIN,
        PRODUCT_SCALE_SAVED_MAX
      );
const baseInputX = clamp(
  Number(serverPlacementInput?.x ?? 0.5),
        PRODUCT_POS_SAVED_MIN,
        PRODUCT_POS_SAVED_MAX
      );
const baseInputY = clamp(
  Number(serverPlacementInput?.y ?? 0.5),
        PRODUCT_POS_SAVED_MIN,
        PRODUCT_POS_SAVED_MAX
      );

      /**
       * 重要
       * - 幅高さは「本番確定矩形」に対して scale 差分だけ反映
       * - 位置は「本番確定中心点」に対して x/y 差分だけ反映
       */
      const scaleRatio = safePlacementScaleSaved / Math.max(0.0001, baseInputScale);

      fgWidth = Math.max(1, Math.round(baseWidth * scaleRatio));
      fgHeight = Math.max(1, Math.round(baseHeight * scaleRatio));

      const baseCenterX =
        Number(serverPlacement!.centerX ?? baseLeft + baseWidth / 2);
      const baseCenterY =
        Number(serverPlacement!.centerY ?? baseTop + baseHeight / 2);

      const nextCenterX = baseCenterX + (safePlacementXSaved - baseInputX) * canvas;
      const nextCenterY = baseCenterY + (safePlacementYSaved - baseInputY) * canvas;

      let nextLeft = Math.round(nextCenterX - fgWidth / 2);
      let nextTop = Math.round(nextCenterY - fgHeight / 2);

      /**
       * 既存の可動域思想は維持
       */
      const overflowX = Math.round(fgWidth * 0.75);
      const overflowY = Math.round(fgHeight * 0.75);

      nextLeft = clamp(
        nextLeft,
        -overflowX,
        Math.max(-overflowX, canvas - fgWidth + overflowX)
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
        Math.max(-overflowY, maxTop + overflowY)
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
          bgScene
        ),
        usedDefaultLeft: false,
        usedDefaultTop: false,
      };
    } else {
      /**
       * 従来フォールバック
       * - 本番metaが無い時は今までの計算を使う
       * - 既存機能は削除しない
       */
      const baseProductWidthRatio = 0.42;
      const effectiveProductWidthRatio = clamp(
        baseProductWidthRatio * normalizedSavedScaleForPreview,
        0.18,
        0.82
      );

      const productTargetWidth = Math.round(canvas * effectiveProductWidthRatio);

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

  /**
   * 文字プレビュー用ブロック
   * - ④編集プレビューの上に重ねる
   * - 実際の保存処理は別ファイル側の責務なので、ここでは表示だけ
   */
  const overlayPreviewStyle = useMemo<React.CSSProperties>(() => {
    const lineCount = Math.max(1, overlayLines.length);
    const blockHeightPx = Math.round(overlayFontSizePx * overlayLineHeight * lineCount);
    const topPx = Math.round((PREVIEW_CANVAS - blockHeightPx) * (overlayYPercent / 100));
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
  }, [overlayLines.length, overlayFontSizePx, overlayLineHeight, overlayYPercent]);

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

  /**
   * 以前は % を使っていたため、親の font-size 基準となり文字が極小化していた。
   * ここでは cqw を使って、プレビューコンテナ幅に対して正しく拡大縮小する。
   */
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

  /**
   * 表示用前景
   * - 見た目は切り抜き済み foreground を優先
   * - 無ければ元画像を使う
   */
const displayForegroundUrl = useMemo(() => {
  return String(foregroundImageUrl || baseImageUrl || "").trim();
}, [foregroundImageUrl, baseImageUrl]);

/**
 * 配置計算用前景
 *
 * 重要
 * - 合成前プレビューを「合成後と同じ前景基準」に寄せるため、
 *   foregroundImageUrl を最優先にする
 * - foregroundImageUrl がまだ無い時だけ baseImageUrl にフォールバックする
 */
const measurementForegroundUrl = useMemo(() => {
  return String(foregroundImageUrl || baseImageUrl || "").trim();
}, [foregroundImageUrl, baseImageUrl]);

useEffect(() => {
  let cancelled = false;

  async function run() {
    const src = String(measurementForegroundUrl || "").trim();

    /**
     * 新しい前景URLへ切り替わった直後は、
     * まだそのURLの trimmed 計測が終わっていないので false に戻す
     */
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

      /**
       * ここまで来て初めて、
       * 「今の measurementForegroundUrl の計測が完了した」とみなす
       */
      setMeasuredForegroundUrl(src);
      setIsForegroundMeasureReady(true);
    } catch (error) {
      console.error(error);

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

  /**
   * テンプレ背景
   */
  const templatePreviewBackgroundUrl = useMemo(() => {
    return String(templateBgUrl || "").trim();
  }, [templateBgUrl]);

  /**
   * AI背景の編集用ベース
   * - 編集プレビューでは「背景のみ」を優先
   * - 完成画像は別枠で aiImageUrl を表示する
   */
  const aiEditorBackgroundUrl = useMemo(() => {
    return String(bgImageUrl || "").trim();
  }, [bgImageUrl]);

  /**
   * 今表示すべき編集用ベース背景
   */
  const previewBaseUrl = useMemo(() => {
    if (activePhotoMode === TEMPLATE_MODE) {
      return templatePreviewBackgroundUrl;
    }

    if (activePhotoMode === AI_BG_MODE) {
      return aiEditorBackgroundUrl;
    }

    return "";
  }, [activePhotoMode, templatePreviewBackgroundUrl, aiEditorBackgroundUrl]);

  /**
   * 保存済み完成画像
   */
  const savedCompositeUrl = useMemo(() => {
    return String(aiImageUrl || "").trim();
  }, [aiImageUrl]);

const savedCompositeTextUrl = useMemo(() => {
  return String(compositeTextImageUrl || "").trim();
}, [compositeTextImageUrl]);

/**
 * 追加
 * - 実データURLは壊さない
 * - 画面表示だけ cache bust する
 */
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

  /**
   * 商品オーバーレイを乗せて良いか
   *
   * template:
   * - 常に背景 + 商品 + 影 でライブ確認
   *
   * ai_bg:
   * - bgImageUrl がある時だけ「背景のみ + 商品」で編集可能
   * - 完成画像は別枠表示にするため、ここでは aiImageUrl を編集ベースに使わない
   */
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

  /**
   * スライダーを有効にできるか
   * - 編集用の背景が存在する時だけ true
   */
  const canLiveEdit = shouldShowProductOverlay;

  const currentTemplateRecommendIndex = useMemo(() => {
    const current = String(templateBgUrl || "").trim();
    if (!current) return -1;
    return templateRecommended.findIndex((item) => item.url === current);
  }, [templateBgUrl, templateRecommended]);

  const currentAiBgUrl = useMemo(() => {
    return String(bgImageUrl || "").trim();
  }, [bgImageUrl]);

  const previewBackgroundRect = useMemo(() => {
    return resolveBackgroundCoverRect({
      canvas: PREVIEW_CANVAS,
      naturalWidth: backgroundNaturalSize.width || PREVIEW_CANVAS,
      naturalHeight: backgroundNaturalSize.height || PREVIEW_CANVAS,
      scale: clamp(typeof backgroundScale === "number" ? backgroundScale : 1, 0.5, 3),
      x: clamp(typeof backgroundX === "number" ? backgroundX : 0, -1, 1),
      y: clamp(typeof backgroundY === "number" ? backgroundY : 0, -1, 1),
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

  /**
   * 背景のズーム / 位置（編集プレビュー専用）
   */
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

async function handleSavePlacement(step: "background" | "product" | "shadow") {
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
        ? clamp(backgroundScale, 0.5, 3)
        : 1,
    backgroundX:
      typeof backgroundX === "number"
        ? clamp(backgroundX, -1, 1)
        : 0,
    backgroundY:
      typeof backgroundY === "number"
        ? clamp(backgroundY, -1, 1)
        : 0,
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

  /**
   * 重要
   * - 「今使うべき前景URL」と
   *   「計測が終わった前景URL」が一致している時だけ true
   */
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

/**
 * 追加
 * - 同じURLで画像が上書きされた場合でも、
 *   保存済み完成画像タブで最新を表示する
 */
setCompositeImageRefreshKey(Date.now());

setActivePreviewTab("final");
}

/**
 * 背景座標を固定する
 *
 * 重要
 * - 実体は background step の保存
 * - ただし UI 上は「座標固定」という意味で見せる
 * - 固定後にだけ ②商品 / ③影 を触れる
 */
async function handleLockBackgroundCoordinates() {
  if (!previewBaseUrl) {
    showMsg?.("先に背景を選択してください");
    return;
  }

  await onSavePlacement("background", {
    backgroundScale:
      typeof backgroundScale === "number"
        ? clamp(backgroundScale, 0.5, 3)
        : 1,
    backgroundX:
      typeof backgroundX === "number"
        ? clamp(backgroundX, -1, 1)
        : 0,
    backgroundY:
      typeof backgroundY === "number"
        ? clamp(backgroundY, -1, 1)
        : 0,
    activePhotoMode,
  });
  await onRecompose?.();

  setIsBackgroundLocked(true);
  setEditingStep("product");
  showMsg?.("背景座標を固定しました。②商品へ進めます");
}

/**
 * 今回追加
 * - 配置保存ボタンをやめる代わりに、
 *   すべての調整値を初期値へ戻して①からやり直せるようにする
 * - 背景そのものの選択URLは消さない
 * - あくまで「座標・影・背景ズーム位置」の調整だけを初期化する
 */
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
  setIsBackgroundLocked(false);

  await onSavePlacement("background", {
    scale: resetScale,
    x: resetX,
    y: resetY,
    shadowOpacity: resetShadowOpacity,
    shadowBlur: resetShadowBlur,
    shadowScale: resetShadowScale,
    shadowOffsetX: resetShadowOffsetX,
    shadowOffsetY: resetShadowOffsetY,
    backgroundScale: resetBackgroundScale,
    backgroundX: resetBackgroundX,
    backgroundY: resetBackgroundY,
    activePhotoMode,
  });

  showMsg?.("調整をリセットして①からやり直せる状態に戻しました");
}
return (
  <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
    <style jsx>{`
      .placementPreviewFixed {
        position: sticky;
        top: 0;
        z-index: 8;
        background: rgba(0, 0, 0, 0.22);
        backdrop-filter: blur(10px);
        padding-bottom: 10px;
      }

      .placementControlScroll {
        max-height: clamp(320px, 46vh, 680px);
        overflow-y: auto;
        overscroll-behavior: contain;
        padding-right: 6px;
      }

      .placementControlScroll::-webkit-scrollbar {
        width: 6px;
      }

      .placementControlScroll::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.25);
        border-radius: 9999px;
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
  ① 背景 → 座標固定 → ② 商品 → ③ 影 の順で調整し、④合成で最終画像を更新します。
</div>
    </div>


<div className="mt-3 flex flex-wrap gap-2">
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

    /**
     * 追加
     * - 文字焼き込み保存画像も同じURLで上書きされる可能性があるため、
     *   表示だけ強制的に最新へ更新する
     */
    setCompositeTextImageRefreshKey(Date.now());
    setActivePreviewTab("final");
  }}
>
  ④-2 文字焼き込み保存
</Btn>
</div>

<div className="mt-3 flex gap-2">
  <PreviewTabButton
    active={activePreviewTab === "edit"}
    label="編集プレビュー"
    onClick={() => setActivePreviewTab("edit")}
  />
  <PreviewTabButton
    active={activePreviewTab === "final"}
    label="保存済み完成画像"
    onClick={() => setActivePreviewTab("final")}
  />
</div>


<div className="mt-3 flex gap-2 flex-wrap items-center">
  <ModeButton
    active={editingStep === "background"}
    label="① 背景"
    onClick={() => setEditingStep("background")}
  />

  <Btn
    variant="secondary"
    disabled={busy || !previewBaseUrl}
    onClick={() => {
      void handleLockBackgroundCoordinates();
    }}
  >
    座標固定
  </Btn>

  <ModeButton
    active={editingStep === "product"}
    label="② 商品"
    disabled={!isBackgroundLocked}
    onClick={() => {
      if (!isBackgroundLocked) return;
      setEditingStep("product");
    }}
  />
  <ModeButton
    active={editingStep === "shadow"}
    label="③ 影"
    disabled={!isBackgroundLocked}
    onClick={() => {
      if (!isBackgroundLocked) return;
      setEditingStep("shadow");
    }}
  />
</div>

<div className="mt-2">
  <Btn
    variant="secondary"
    disabled={
      busy ||
      editingStep === "shadow" ||
      (editingStep === "background" && !isBackgroundLocked)
    }
    onClick={() => {
      if (editingStep === "background") {
        if (!isBackgroundLocked) return;
        setEditingStep("product");
      } else if (editingStep === "product") {
        setEditingStep("shadow");
      }
    }}
  >
    次へ
  </Btn>
</div>

      <div className="placementPreviewFixed">
        {activePreviewTab === "edit" && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/25">
          <div
            className="border-b border-white/10 px-3 py-2 text-white/72"
            style={{ fontSize: 12 }}
          >
            編集プレビュー
          </div>

          <div
            className="px-3 py-2 text-white/52"
            style={{ fontSize: 11, lineHeight: 1.6 }}
          >
            ここは配置調整専用です。保存済みの完成画像はタブで切り替えて確認します。
          </div>

          <div
            className="relative w-full"
            style={{
              aspectRatio: "1 / 1",
              background: "rgba(255,255,255,0.03)",
              containerType: "inline-size",
            }}
          >
            {previewBaseUrl ? (
              <img
                src={previewBaseUrl}
                alt="preview base"
                style={backgroundPreviewStyle}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  const naturalWidth = Number(img.naturalWidth || 0);
                  const naturalHeight = Number(img.naturalHeight || 0);

                  if (naturalWidth > 0 && naturalHeight > 0) {
                    setBackgroundNaturalSize((prev) => {
                      if (prev.width === naturalWidth && prev.height === naturalHeight) {
                        return prev;
                      }

                      return {
                        width: naturalWidth,
                        height: naturalHeight,
                      };
                    });
                  }
                }}
              />
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center text-white/40"
                style={{ fontSize: 12 }}
              >
                背景がありません
              </div>
            )}

            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(255,255,255,0.03), rgba(0,0,0,0.06))",
              }}
            />

{shouldShowProductOverlay ? (
  <>
    {previewGeometry.shadowRect.opacity > 0 ? (
      <svg
        viewBox={`0 0 ${previewGeometry.canvas} ${previewGeometry.canvas}`}
        preserveAspectRatio="none"
        style={shadowSvgStyle}
      >
        <defs>
          <filter id="preview-ground-shadow-blur">
            <feGaussianBlur stdDeviation={previewGeometry.shadowRect.blurPx} />
          </filter>
        </defs>

        <ellipse
          cx={
            previewGeometry.shadowRect.leftPx +
            previewGeometry.shadowRect.widthPx / 2
          }
          cy={
            previewGeometry.shadowRect.topPx +
            previewGeometry.shadowRect.heightPx / 2
          }
          rx={previewGeometry.shadowRect.widthPx / 2}
          ry={previewGeometry.shadowRect.heightPx / 2}
          fill={`rgba(0,0,0,${previewGeometry.shadowRect.opacity})`}
          filter="url(#preview-ground-shadow-blur)"
        />
      </svg>
    ) : null}

    <img
      src={displayForegroundUrl}
      alt="product preview"
      style={productStyle}
    />
  </>
) : null}

            {hasOverlayText ? (
              <div style={overlayPreviewStyle}>
                <div className="relative w-full">
                  {overlayBackgroundEnabled ? <div style={overlayBandStyle} /> : null}

                  <div style={overlayTextWrapStyle}>
                    {overlayLines.map((line, index) => (
                      <div
                        key={`overlay-line-${index}-${line}`}
                        style={overlayLineStyle}
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {!shouldShowProductOverlay && !displayForegroundUrl ? (
              <div
                className="absolute inset-0 flex items-center justify-center text-white/50"
                style={{ fontSize: 12 }}
              >
                前景画像がありません
              </div>
            ) : null}

            {!shouldShowProductOverlay &&
            !!displayForegroundUrl &&
            activePhotoMode === AI_BG_MODE &&
            !!savedCompositeUrl &&
            !String(bgImageUrl || "").trim() ? (
              <div
                className="absolute left-3 top-3 rounded-lg border border-white/10 bg-black/45 px-2 py-1 text-white/65"
                style={{ fontSize: 11 }}
              >
                背景のみが無いため、編集はできません。完成画像は保存済み完成画像タブで確認できます。
              </div>
            ) : null}

            <div className="pointer-events-none absolute inset-0 border border-white/10" />
            <div
              className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-white/10"
              style={{ transform: "translateX(-0.5px)" }}
            />
            <div
              className="pointer-events-none absolute left-0 top-1/2 h-px w-full bg-white/10"
              style={{ transform: "translateY(-0.5px)" }}
            />
          </div>
        </div>
        )}
      </div>

      <div className="placementControlScroll">
        {activePreviewTab === "final" && (
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 overflow-hidden">
          <div
            className="border-b border-white/10 px-3 py-2 text-white/72"
            style={{ fontSize: 12 }}
          >
            保存済み完成画像
          </div>

          <div
            className="px-3 py-2 text-white/52"
            style={{ fontSize: 11, lineHeight: 1.6 }}
          >
            通常の合成画像と、文字焼き込み保存画像を分けて表示します。
          </div>

          <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
              <div
                className="border-b border-white/10 px-3 py-2 text-white/75"
                style={{ fontSize: 12 }}
              >
                通常合成画像
              </div>

              <div
                className="relative w-full"
                style={{
                  aspectRatio: "1 / 1",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                {savedCompositeUrl ? (
<img
  src={savedCompositeDisplayUrl}
  alt="saved composite"
  className="absolute inset-0 h-full w-full object-contain"
/>
                ) : (
                  <div
                    className="absolute inset-0 flex items-center justify-center text-white/40"
                    style={{ fontSize: 12 }}
                  >
                    まだ通常合成画像はありません
                  </div>
                )}

                <div className="pointer-events-none absolute inset-0 border border-white/10" />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
              <div
                className="border-b border-white/10 px-3 py-2 text-white/75"
                style={{ fontSize: 12 }}
              >
                文字焼き込み保存画像
              </div>

              <div
                className="relative w-full"
                style={{
                  aspectRatio: "1 / 1",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                {savedCompositeTextUrl ? (
<img
  src={savedCompositeTextDisplayUrl}
  alt="saved composite text"
  className="absolute inset-0 h-full w-full object-contain"
/>
                ) : (
                  <div
                    className="absolute inset-0 flex items-center justify-center text-white/40"
                    style={{ fontSize: 12 }}
                  >
                    まだ文字焼き込み保存画像はありません
                  </div>
                )}

                <div className="pointer-events-none absolute inset-0 border border-white/10" />
              </div>
            </div>
          </div>
        </div>
      )}


            <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-white/72" style={{ fontSize: 12 }}>
            背景選択
          </div>

          <div className="flex items-center gap-2">
            <SmallBadge
              active={activePhotoMode === TEMPLATE_MODE}
              label={activePhotoMode === TEMPLATE_MODE ? "現在：テンプレ背景" : "テンプレ背景"}
            />
            <SmallBadge
              active={activePhotoMode === AI_BG_MODE}
              label={activePhotoMode === AI_BG_MODE ? "現在：AI背景" : "AI背景"}
            />
          </div>
        </div>

        <div className="mt-2 text-white/50" style={{ fontSize: 11, lineHeight: 1.6 }}>
          背景をクリックすると、その背景が編集対象になり、編集プレビューへ即反映されます。
        </div>

        <div className="mt-3 flex flex-col gap-3">
          <div>
            <div className="mb-2 text-white/60" style={{ fontSize: 11 }}>
              テンプレ背景
            </div>

            {(templateBgUrls || []).length > 0 ? (
              <div className="flex max-h-[180px] flex-col gap-2 overflow-auto pr-1">
                {(templateBgUrls || []).slice(0, 8).map((u, i) => {
                  const isCurrent = String(templateBgUrl || "").trim() === String(u || "").trim();
                  const recommendedItem = templateRecommended.find((item) => item.url === u);

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
                      }}
                      className="rounded-xl border px-3 py-3 text-left transition hover:bg-white/5"
                      style={{
                        borderColor: isCurrent
                          ? "rgba(255,255,255,0.34)"
                          : "rgba(255,255,255,0.10)",
                        background: isCurrent
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.15)",
                        color: "rgba(255,255,255,0.82)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold" style={{ fontSize: 12 }}>
                          テンプレ背景 {i + 1}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {recommendedItem ? (
                            <SmallBadge active={false} label="おすすめ候補" />
                          ) : null}
                          <SmallBadge
                            active={isCurrent}
                            label={isCurrent ? "選択中" : "未選択"}
                          />
                        </div>
                      </div>

                      {recommendedItem?.reason ? (
                        <div
                          className="mt-2 rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-white/60"
                          style={{ fontSize: 11, lineHeight: 1.5 }}
                        >
                          理由：{recommendedItem.reason}
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
              <div className="flex max-h-[180px] flex-col gap-2 overflow-auto pr-1">
                {(aiBgUrls || []).slice(0, 8).map((u, i) => {
                  const isCurrent = currentAiBgUrl === String(u || "").trim();

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
                      }}
                      className="rounded-xl border px-3 py-3 text-left transition hover:bg-white/5"
                      style={{
                        borderColor: isCurrent
                          ? "rgba(255,255,255,0.34)"
                          : "rgba(255,255,255,0.10)",
                        background: isCurrent
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.15)",
                        color: "rgba(255,255,255,0.82)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold" style={{ fontSize: 12 }}>
                          AI背景 {i + 1}
                        </div>

                        <SmallBadge
                          active={isCurrent}
                          label={isCurrent ? "選択中" : "未選択"}
                        />
                      </div>
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

        <div className="mt-2 text-white/50" style={{ fontSize: 11, lineHeight: 1.6 }}>
          ワンクリックで売れやすい配置に自動調整されます。
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
    const next = clamp(uiBgScaleToSaved(n), 0.5, 3);
    setBackgroundScale(next);
  }}
  onCommit={() => {
    const next = clamp(backgroundScale, 0.5, 3);
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
    const next = clamp(uiBgPosToSaved(n), -1, 1);
    setBackgroundX(next);
  }}
  onCommit={() => {
    const next = clamp(backgroundX, -1, 1);
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
    const next = clamp(uiBgPosToSaved(n), -1, 1);
    setBackgroundY(next);
  }}
  onCommit={() => {
    const next = clamp(backgroundY, -1, 1);
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
disabled={busy || !canLiveEdit || !isBackgroundLocked || editingStep !== "product"}
  help={
    canLiveEdit
      ? "旧より大きく拡張しています。かなり大きく/小さくできます。"
      : "背景または前景が無いため、今は編集プレビューできません。"
  }
  onChange={(n) => {
    const next = uiScaleToSaved(clamp(n, PRODUCT_SCALE_UI_MIN, PRODUCT_SCALE_UI_MAX));
    setPlacementScale(next);
  }}
  onCommit={() => {
    const next = clamp(placementScale, PRODUCT_SCALE_SAVED_MIN, PRODUCT_SCALE_SAVED_MAX);
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
disabled={busy || !canLiveEdit || !isBackgroundLocked || editingStep !== "product"}
  help={
    canLiveEdit
      ? "100 が中央です。旧より大きく外側まで動かせます。"
      : "背景または前景が無いため、今は編集プレビューできません。"
  }
  onChange={(n) => {
    const next = uiPosToSaved(clamp(n, PRODUCT_POS_UI_MIN, PRODUCT_POS_UI_MAX));
    setPlacementX(next);
  }}
  onCommit={() => {
    const next = clamp(placementX, PRODUCT_POS_SAVED_MIN, PRODUCT_POS_SAVED_MAX);
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
disabled={busy || !canLiveEdit || !isBackgroundLocked || editingStep !== "product"}
  help={
    canLiveEdit
      ? "100 が中央です。旧より大きく上下へ動かせます。"
      : "背景または前景が無いため、今は編集プレビューできません。"
  }
  onChange={(n) => {
    const next = uiPosToSaved(clamp(n, PRODUCT_POS_UI_MIN, PRODUCT_POS_UI_MAX));
    setPlacementY(next);
  }}
  onCommit={() => {
    const next = clamp(placementY, PRODUCT_POS_SAVED_MIN, PRODUCT_POS_SAVED_MAX);
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
disabled={busy || !canLiveEdit || !isBackgroundLocked || editingStep !== "shadow"}
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
disabled={busy || !canLiveEdit || !isBackgroundLocked || editingStep !== "shadow"}
  help="旧より大きく広げています。数字が大きいほど影が柔らかく広がります。"
  onChange={(n) => {
    const next = clamp(n, SHADOW_BLUR_MIN, SHADOW_BLUR_MAX);
    setShadowBlur(next);
  }}
  onCommit={() => {
    const next = clamp(shadowBlur, SHADOW_BLUR_MIN, SHADOW_BLUR_MAX);
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
disabled={busy || !canLiveEdit || !isBackgroundLocked || editingStep !== "shadow"}
  help="旧より大きく広げています。数字が大きいほど影の横幅が広がります。"
  onChange={(n) => {
    const next = clamp(n / 100, SHADOW_SCALE_MIN, SHADOW_SCALE_MAX);
    setShadowScale(next);
  }}
  onCommit={() => {
    const next = clamp(shadowScale, SHADOW_SCALE_MIN, SHADOW_SCALE_MAX);
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

{/* =========================================
 影の位置 → 微調整UIへ変更
 ・可動域を縮小
 ・「自由移動」ではなく「補正」にする
========================================= */}

<SliderRow
  label="影の左右位置（大きく移動）"
  value={savedShadowOffsetToUi(safeShadowOffsetX)}
  min={SHADOW_OFFSET_UI_MIN}
  max={SHADOW_OFFSET_UI_MAX}
  step={1}
disabled={busy || !canLiveEdit || !isBackgroundLocked || editingStep !== "shadow"}
  help="接地面から大きく外れた時に使います。まずはこのバーで大きく戻してください。"
  onChange={(n) => {
    const next = clamp(
      uiShadowOffsetToSaved(n),
      SHADOW_OFFSET_COARSE_MIN,
      SHADOW_OFFSET_COARSE_MAX
    );
    setShadowOffsetX(next);
  }}
  onCommit={() => {
    const next = clamp(
      shadowOffsetX,
      SHADOW_OFFSET_COARSE_MIN,
      SHADOW_OFFSET_COARSE_MAX
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
disabled={busy || !canLiveEdit || !isBackgroundLocked || editingStep !== "shadow"}
  help="接地位置が大きくずれた時に使います。まずはこのバーで大きく戻してください。"
  onChange={(n) => {
    const next = clamp(
      uiShadowOffsetToSaved(n),
      SHADOW_OFFSET_COARSE_MIN,
      SHADOW_OFFSET_COARSE_MAX
    );
    setShadowOffsetY(next);
  }}
  onCommit={() => {
    const next = clamp(
      shadowOffsetY,
      SHADOW_OFFSET_COARSE_MIN,
      SHADOW_OFFSET_COARSE_MAX
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
          {savedCompositeUrl ? ` / ${isCompositeFresh ? "最新" : "保存済み"}` : ""}
        </div>

        <div className="mt-2">
          テンプレ背景も AI背景も、この画面で背景を切り替えながら配置調整できます。
        </div>

<div className="mt-1">
  まず①背景で位置を決めて「座標固定」を押してください。その後に②商品、③影を調整し、最後に「④合成」で更新します。
</div>
      </div>
      </div>
    </div>
  );
}