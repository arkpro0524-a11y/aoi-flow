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
 * 今回の可動域拡張定数
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
 * - offset: 旧 -1〜1   → 新 -2〜2
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
const SHADOW_OFFSET_MIN = -2;
const SHADOW_OFFSET_MAX = 2;
const SHADOW_OFFSET_UI_MIN = 0;
const SHADOW_OFFSET_UI_MAX = 200;

const BG_SCALE_UI_MIN = 40;
const BG_SCALE_UI_MAX = 220;
const BG_POS_UI_MIN = 0;
const BG_POS_UI_MAX = 200;

type Props = {
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

  /**
   * 文字オーバーレイ
   *
   * 重要:
   * - 今は optional にしておく
   * - 親がまだ渡していなくても既存機能を壊さない
   * - 受け取れた時だけ ④編集プレビューに反映する
   */
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

  /**
   * ★追加
   * 背景編集値（保存値）
   * - scale は 0.5〜3
   * - x / y は -1〜1（0 が中央）
   */
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

  /**
   * ★追加
   */
  setBackgroundScale: React.Dispatch<React.SetStateAction<number>>;
  setBackgroundX: React.Dispatch<React.SetStateAction<number>>;
  setBackgroundY: React.Dispatch<React.SetStateAction<number>>;

  onSavePlacement: (partial?: {
    scale?: number;
    x?: number;
    y?: number;
    shadowOpacity?: number;
    shadowBlur?: number;
    shadowScale?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;

    /**
     * ★追加
     * 0〜1 基準で保存する
     */
    backgroundScale?: number;
    backgroundX?: number;
    backgroundY?: number;

    activePhotoMode?: ProductPhotoMode;
  }) => void | Promise<void>;

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
 * 今回は offset 可動域も拡張
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

  const w = Math.max(60, Math.round(shadowWidth * baseScale * shadowScale));
  const h = Math.max(8, Math.round(w * 0.08));

  /**
   * 今回の拡張
   * - 旧: * 40
   * - 新: * 80
   */
  const cx = clamp(
    Math.round(centerX + shadowOffsetX * 80),
    -Math.round(w),
    canvas + Math.round(w)
  );

  const cy = clamp(
    Math.round(contactY + 2 + shadowOffsetY * 80),
    -Math.round(h),
    canvas + Math.round(h)
  );

  const opacity = clamp(0.12 + shadowOpacity * 0.6, 0, 0.5);
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
  disabled,
  help,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
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

  /**
   * ★追加
   */
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

  /**
   * ★追加
   */
  setBackgroundScale,
  setBackgroundX,
  setBackgroundY,

  onSavePlacement,
  busy = false,
  showMsg,
}: Props) {
  /**
   * 現在表示している前景画像の実サイズ
   * - 既存機能維持のため残す
   * - 直接の配置計算基準には使わない
   */
  const [foregroundNaturalSize, setForegroundNaturalSize] = useState({
    width: 0,
    height: 0,
  });

  /**
   * 配置計算専用の固定基準サイズ
   *
   * 重要
   * - 再合成後に foregroundImageUrl が変わっても、
   *   baseImageUrl が同じ間はこの基準を維持する
   * - これで「合成後だけ動きの幅が変わる」違和感を減らす
   */
  const [placementBasisSize, setPlacementBasisSize] = useState({
    width: 0,
    height: 0,
  });

  /**
   * どの baseImageUrl を基準に basisSize を取ったか
   */
  const [placementBasisBaseKey, setPlacementBasisBaseKey] = useState("");

  const [backgroundNaturalSize, setBackgroundNaturalSize] = useState({
    width: 0,
    height: 0,
  });

  const [activePreviewTab, setActivePreviewTab] = useState<"edit" | "final">("edit");

  /**
   * baseImageUrl が変わった時だけ、
   * 配置計算用の基準サイズを取り直せるようにリセットする
   */
  useEffect(() => {
    const nextBaseKey = String(baseImageUrl || "").trim();

    setPlacementBasisBaseKey((prev) => {
      if (prev === nextBaseKey) return prev;
      return nextBaseKey;
    });

    setPlacementBasisSize((prev) => {
      if (
        placementBasisBaseKey === nextBaseKey &&
        (prev.width > 0 || prev.height > 0)
      ) {
        return prev;
      }

      return {
        width: 0,
        height: 0,
      };
    });
  }, [baseImageUrl, placementBasisBaseKey]);

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

  const safeShadowOffsetX = clamp(
    shadowOffsetX >= SHADOW_OFFSET_MIN && shadowOffsetX <= SHADOW_OFFSET_MAX
      ? shadowOffsetX
      : 0,
    SHADOW_OFFSET_MIN,
    SHADOW_OFFSET_MAX
  );

  const safeShadowOffsetY = clamp(
    shadowOffsetY >= SHADOW_OFFSET_MIN && shadowOffsetY <= SHADOW_OFFSET_MAX
      ? shadowOffsetY
      : 0.02,
    SHADOW_OFFSET_MIN,
    SHADOW_OFFSET_MAX
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
  const placementNaturalWidthForPreview =
    placementBasisSize.width > 0
      ? placementBasisSize.width
      : foregroundNaturalSize.width;

  const placementNaturalHeightForPreview =
    placementBasisSize.height > 0
      ? placementBasisSize.height
      : foregroundNaturalSize.height;

  const previewGeometry = useMemo(() => {
    const canvas = PREVIEW_CANVAS;

    const placement = {
      scale: safePlacementScaleSaved,
      x: safePlacementXSaved,
      y: safePlacementYSaved,
    };

    const baseProductWidthRatio = 0.42;
    const effectiveProductWidthRatio = clamp(
      baseProductWidthRatio * normalizedSavedScaleForPreview,
      0.18,
      0.82
    );

    const productTargetWidth = Math.round(canvas * effectiveProductWidthRatio);

    const previewFgSize = resolvePreviewForegroundSize({
      naturalWidth: placementNaturalWidthForPreview || productTargetWidth,
      naturalHeight: placementNaturalHeightForPreview || productTargetWidth,
      targetWidth: productTargetWidth,
      productSize,
    });

    const rect = resolvePlacementRect({
      canvas,
      fgWidth: previewFgSize.width,
      fgHeight: previewFgSize.height,
      placement,
      groundingType,
      productCategory,
      productSize,
      bgScene,
    });

    const shadowRect = resolvePreviewShadowRect({
      canvas,
      fgWidth: previewFgSize.width,
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
      fgWidth: previewFgSize.width,
      fgHeight: previewFgSize.height,
      rect,
      shadowRect,
    };
  }, [
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
   * 前景は切り抜き済み foreground を最優先し、
   * 無ければ元画像を使う
   */
  const unifiedForegroundUrl = useMemo(() => {
    return String(foregroundImageUrl || baseImageUrl || "").trim();
  }, [foregroundImageUrl, baseImageUrl]);

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
    if (!unifiedForegroundUrl) return false;

    if (activePhotoMode === TEMPLATE_MODE) {
      return !!templatePreviewBackgroundUrl;
    }

    if (activePhotoMode === AI_BG_MODE) {
      return !!aiEditorBackgroundUrl;
    }

    return false;
  }, [
    unifiedForegroundUrl,
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

  const shadowStyle: React.CSSProperties = {
    position: "absolute",
    width: `${(previewGeometry.shadowRect.widthPx / previewGeometry.canvas) * 100}%`,
    height: `${(previewGeometry.shadowRect.heightPx / previewGeometry.canvas) * 100}%`,
    left: `${(previewGeometry.shadowRect.leftPx / previewGeometry.canvas) * 100}%`,
    top: `${(previewGeometry.shadowRect.topPx / previewGeometry.canvas) * 100}%`,
    borderRadius: "9999px",
    background: `rgba(0,0,0,${previewGeometry.shadowRect.opacity})`,
    filter: `blur(${previewGeometry.shadowRect.blurPx}px)`,
    opacity: 1,
    mixBlendMode: "multiply",
    pointerEvents: "none",
    userSelect: "none",
    zIndex: 1,
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

  async function handleSavePlacement() {
    await onSavePlacement({
      scale: uiScaleToSaved(safeScale),
      x: uiPosToSaved(safeX),
      y: uiPosToSaved(safeY),
      shadowOpacity: safeShadowOpacity,
      shadowBlur: safeShadowBlur,
      shadowScale: safeShadowScale,
      shadowOffsetX: safeShadowOffsetX,
      shadowOffsetY: safeShadowOffsetY,

      /**
       * ★追加
       * 背景も保存対象にする
       */
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

    showMsg?.("配置を保存しました");
  }

  async function handleRecompose() {
    await handleSavePlacement();
    await onRecompose?.();
    setActivePreviewTab("final");
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
      <div>
        <div className="text-white/86 font-bold" style={{ fontSize: 13 }}>
          ④ 合成画像の配置調整
        </div>
        <div
          className="mt-1 text-white/55"
          style={{ fontSize: 12, lineHeight: 1.5 }}
        >
          背景を選びながら、その場で商品の大きさ・位置・影を調整します。
        </div>
      </div>

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

      {templateRecommendTopReason || templateRecommended.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-white/85 font-bold" style={{ fontSize: 12 }}>
              テンプレ背景おすすめ
            </div>

            {currentTemplateRecommendIndex >= 0 ? (
              <SmallBadge
                active
                label={`おすすめ ${currentTemplateRecommendIndex + 1}位`}
              />
            ) : (
              <SmallBadge active={false} label="候補比較中" />
            )}
          </div>

          {templateRecommendTopReason ? (
            <div
              className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/72"
              style={{ fontSize: 12, lineHeight: 1.6 }}
            >
              {templateRecommendTopReason}
            </div>
          ) : null}

          {currentTemplateRecommendIndex >= 0 &&
          templateRecommended[currentTemplateRecommendIndex] ? (
            <div
              className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/68"
              style={{ fontSize: 12, lineHeight: 1.6 }}
            >
              現在の背景：
              おすすめ {currentTemplateRecommendIndex + 1}
              {typeof templateRecommended[currentTemplateRecommendIndex]?.score === "number"
                ? ` / score ${templateRecommended[currentTemplateRecommendIndex]?.score}`
                : ""}
              {" / "}
              {templateRecommended[currentTemplateRecommendIndex]?.reason || "相性が高い背景です"}
            </div>
          ) : null}

          {templateRecommended.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {templateRecommended.slice(0, 3).map((item, index) => {
                const isCurrent = String(templateBgUrl || "").trim() === item.url;

                return (
                  <button
                    key={`${item.url}-placement-${index}`}
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      await onSelectTemplateBg?.(item.url);
                      await onChangePhotoMode(TEMPLATE_MODE);
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
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold" style={{ fontSize: 12 }}>
                        候補 {index + 1}
                        {typeof item.score === "number" ? ` / score ${item.score}` : ""}
                      </div>

                      <SmallBadge
                        active={isCurrent}
                        label={isCurrent ? "選択中" : "切替可能"}
                      />
                    </div>

                    <div
                      className="mt-2 text-white/62"
                      style={{ fontSize: 12, lineHeight: 1.6 }}
                    >
                      {item.reason || "商品との相性が高い背景です"}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Btn
          variant="secondary"
          disabled={busy}
          onClick={handleSavePlacement}
        >
          配置を保存
        </Btn>

        <Btn
          variant="secondary"
          disabled={!previewBaseUrl || busy}
          onClick={handleRecompose}
        >
          再合成
        </Btn>

        <Btn
          variant="secondary"
          disabled={!savedCompositeUrl || !hasOverlayText || busy}
          onClick={() => {
            void onSaveCompositeTextImageFromCompositeSlot?.();
          }}
        >
          文字焼き込み保存
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
                <div style={shadowStyle} />
                <img
                  src={unifiedForegroundUrl}
                  alt="product preview"
                  style={productStyle}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    const naturalWidth = Number(img.naturalWidth || 0);
                    const naturalHeight = Number(img.naturalHeight || 0);

                    /**
                     * 現在表示画像の実サイズは常に更新する
                     * - 既存機能維持
                     */
                    if (naturalWidth > 0 && naturalHeight > 0) {
                      setForegroundNaturalSize((prev) => {
                        if (prev.width === naturalWidth && prev.height === naturalHeight) {
                          return prev;
                        }

                        return {
                          width: naturalWidth,
                          height: naturalHeight,
                        };
                      });
                    }

                    /**
                     * 配置計算用の基準サイズは、
                     * 同じ baseImageUrl の間は最初の1回だけ固定する
                     *
                     * これで再合成後に foregroundImageUrl が変わっても、
                     * バーの動きの感じが急に変わりにくくなる
                     */
                    const currentBaseKey = String(baseImageUrl || "").trim();

                    if (naturalWidth > 0 && naturalHeight > 0) {
                      setPlacementBasisSize((prev) => {
                        const shouldReplace =
                          placementBasisBaseKey !== currentBaseKey ||
                          prev.width <= 0 ||
                          prev.height <= 0;

                        if (!shouldReplace) {
                          return prev;
                        }

                        return {
                          width: naturalWidth,
                          height: naturalHeight,
                        };
                      });

                      setPlacementBasisBaseKey((prev) => {
                        if (prev === currentBaseKey) return prev;
                        return currentBaseKey;
                      });
                    }
                  }}
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

            {!shouldShowProductOverlay && !unifiedForegroundUrl ? (
              <div
                className="absolute inset-0 flex items-center justify-center text-white/50"
                style={{ fontSize: 12 }}
              >
                前景画像がありません
              </div>
            ) : null}

            {!shouldShowProductOverlay &&
            !!unifiedForegroundUrl &&
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
                    src={savedCompositeUrl}
                    alt="saved composite"
                    className="absolute inset-0 h-full w-full object-cover"
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
                    src={savedCompositeTextUrl}
                    alt="saved composite text"
                    className="absolute inset-0 h-full w-full object-cover"
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
          disabled={busy || !previewBaseUrl}
          help="背景だけを拡大・縮小します。保存値と同じ意味で反映されます。"
          onChange={(n) =>
            setBackgroundScale(clamp(uiBgScaleToSaved(n), 0.5, 3))
          }
        />

        <SliderRow
          label="背景の左右位置（編集プレビュー）"
          value={backgroundXUi}
          min={BG_POS_UI_MIN}
          max={BG_POS_UI_MAX}
          step={1}
          disabled={busy || !previewBaseUrl}
          help="100 が中央です。保存値と同じ意味で左右移動します。"
          onChange={(n) =>
            setBackgroundX(clamp(uiBgPosToSaved(n), -1, 1))
          }
        />

        <SliderRow
          label="背景の上下位置（編集プレビュー）"
          value={backgroundYUi}
          min={BG_POS_UI_MIN}
          max={BG_POS_UI_MAX}
          step={1}
          disabled={busy || !previewBaseUrl}
          help="100 が中央です。保存値と同じ意味で上下移動します。"
          onChange={(n) =>
            setBackgroundY(clamp(uiBgPosToSaved(n), -1, 1))
          }
        />

        <SliderRow
          label="商品の大きさ"
          value={safeScale}
          min={PRODUCT_SCALE_UI_MIN}
          max={PRODUCT_SCALE_UI_MAX}
          step={1}
          disabled={busy || !canLiveEdit}
          help={
            canLiveEdit
              ? "旧より大きく拡張しています。かなり大きく/小さくできます。"
              : "背景または前景が無いため、今は編集プレビューできません。"
          }
          onChange={(n) =>
            setPlacementScale(
              uiScaleToSaved(clamp(n, PRODUCT_SCALE_UI_MIN, PRODUCT_SCALE_UI_MAX))
            )
          }
        />

        <SliderRow
          label="切り抜き画像の左右位置"
          value={safeX}
          min={PRODUCT_POS_UI_MIN}
          max={PRODUCT_POS_UI_MAX}
          step={1}
          disabled={busy || !canLiveEdit}
          help={
            canLiveEdit
              ? "100 が中央です。旧より大きく外側まで動かせます。"
              : "背景または前景が無いため、今は編集プレビューできません。"
          }
          onChange={(n) =>
            setPlacementX(
              uiPosToSaved(clamp(n, PRODUCT_POS_UI_MIN, PRODUCT_POS_UI_MAX))
            )
          }
        />

        <SliderRow
          label="切り抜き画像の上下位置"
          value={safeY}
          min={PRODUCT_POS_UI_MIN}
          max={PRODUCT_POS_UI_MAX}
          step={1}
          disabled={busy || !canLiveEdit}
          help={
            canLiveEdit
              ? "100 が中央です。旧より大きく上下へ動かせます。"
              : "背景または前景が無いため、今は編集プレビューできません。"
          }
          onChange={(n) =>
            setPlacementY(
              uiPosToSaved(clamp(n, PRODUCT_POS_UI_MIN, PRODUCT_POS_UI_MAX))
            )
          }
        />

        <SliderRow
          label="影の濃さ"
          value={Math.round(safeShadowOpacity * 100)}
          min={0}
          max={100}
          step={1}
          disabled={busy || !canLiveEdit}
          help={
            canLiveEdit
              ? "精密ロジックの影計算で、その場で反映されます。"
              : "背景または前景が無いため、今は編集プレビューできません。"
          }
          onChange={(n) => setShadowOpacity(clamp(n / 100, 0, 1))}
        />

        <SliderRow
          label="影のぼかし"
          value={safeShadowBlur}
          min={SHADOW_BLUR_MIN}
          max={SHADOW_BLUR_MAX}
          step={1}
          disabled={busy || !canLiveEdit}
          help="旧より大きく広げています。数字が大きいほど影が柔らかく広がります。"
          onChange={(n) => setShadowBlur(clamp(n, SHADOW_BLUR_MIN, SHADOW_BLUR_MAX))}
        />

        <SliderRow
          label="影の広がり"
          value={Math.round(safeShadowScale * 100)}
          min={Math.round(SHADOW_SCALE_MIN * 100)}
          max={Math.round(SHADOW_SCALE_MAX * 100)}
          step={1}
          disabled={busy || !canLiveEdit}
          help="旧より大きく広げています。数字が大きいほど影の横幅が広がります。"
          onChange={(n) =>
            setShadowScale(clamp(n / 100, SHADOW_SCALE_MIN, SHADOW_SCALE_MAX))
          }
        />

        <SliderRow
          label="影の左右位置"
          value={savedShadowOffsetToUi(safeShadowOffsetX)}
          min={SHADOW_OFFSET_UI_MIN}
          max={SHADOW_OFFSET_UI_MAX}
          step={1}
          disabled={busy || !canLiveEdit}
          help="100 が基準です。旧より大きく左右へずらせます。"
          onChange={(n) =>
            setShadowOffsetX(
              clamp(uiShadowOffsetToSaved(n), SHADOW_OFFSET_MIN, SHADOW_OFFSET_MAX)
            )
          }
        />

        <SliderRow
          label="影の上下位置"
          value={savedShadowOffsetToUi(safeShadowOffsetY)}
          min={SHADOW_OFFSET_UI_MIN}
          max={SHADOW_OFFSET_UI_MAX}
          step={1}
          disabled={busy || !canLiveEdit}
          help="100 が基準です。旧より大きく上下へずらせます。"
          onChange={(n) =>
            setShadowOffsetY(
              clamp(uiShadowOffsetToSaved(n), SHADOW_OFFSET_MIN, SHADOW_OFFSET_MAX)
            )
          }
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
          最終反映は「再合成」で更新します。
        </div>
      </div>
    </div>
  );
}