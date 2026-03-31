"use client";

import React, { useMemo, useState } from "react";
import { Btn } from "../ui";
import type { ProductPhotoMode } from "@/lib/types/draft";

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
 * 今回の整理方針
 * - 「背景モード」UI は削除
 * - ただし activePhotoMode の内部利用は維持
 * - 背景選択そのものがモード切替を兼ねる
 * - 「編集用プレビュー」と「保存済み完成画像」を完全に分離
 * - 完成画像は aiImageUrl を専用枠で表示
 * - 既存の背景選択 / スライダー / 保存 / 再合成 / おすすめ表示機能は削除しない
 * - 編集プレビュー / 保存済み完成画像 をタブで切り替え
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

type Props = {
  baseImageUrl?: string;
  foregroundImageUrl?: string;
  bgImageUrl?: string;
  aiImageUrl?: string;
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

  setPlacementScale: React.Dispatch<React.SetStateAction<number>>;
  setPlacementX: React.Dispatch<React.SetStateAction<number>>;
  setPlacementY: React.Dispatch<React.SetStateAction<number>>;
  setShadowOpacity: React.Dispatch<React.SetStateAction<number>>;
  setShadowBlur: React.Dispatch<React.SetStateAction<number>>;
  setShadowScale: React.Dispatch<React.SetStateAction<number>>;
  setShadowOffsetX: React.Dispatch<React.SetStateAction<number>>;
  setShadowOffsetY: React.Dispatch<React.SetStateAction<number>>;

  onSavePlacement: (partial?: {
    scale?: number;
    x?: number;
    y?: number;
    shadowOpacity?: number;
    shadowBlur?: number;
    shadowScale?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
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
 * 保存値 scale は 0.4〜2.2
 * UI は 20〜95
 */
function savedScaleToUi(saved: number) {
  const safe = clamp(saved, 0.4, 2.2);
  const ratio = (safe - 0.4) / (2.2 - 0.4);
  return 20 + ratio * (95 - 20);
}

function savedPosToUi(saved: number) {
  return clamp(saved, 0, 1) * 100;
}

/**
 * UI表示値 → 保存値
 */
function uiScaleToSaved(ui: number) {
  const safe = clamp(ui, 20, 95);
  const ratio = (safe - 20) / (95 - 20);
  return 0.4 + ratio * (2.2 - 0.4);
}

function uiPosToSaved(ui: number) {
  return clamp(ui, 0, 100) / 100;
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

  left = clamp(left, 0, Math.max(0, canvas - fgWidth));

  const maxTop =
    groundingType === "hanging"
      ? canvas - fgHeight - 20
      : groundingType === "wall"
        ? canvas - fgHeight - 40
        : canvas - fgHeight - 10;

  top = clamp(top, 0, Math.max(0, maxTop));

  const isNearDefaultX = Math.abs(placement.x - 0.5) <= 0.03;
  const isNearDefaultY = Math.abs(placement.y - 0.5) <= 0.03;

  if (isNearDefaultX) {
    left = clamp(defaultLeft, 0, Math.max(0, canvas - fgWidth));
  }

  if (isNearDefaultY) {
    top = clamp(defaultTop, 0, Math.max(0, maxTop));
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

  const cx = clamp(
    Math.round(centerX + shadowOffsetX * 40),
    0,
    canvas
  );

  const cy = clamp(
    Math.round(contactY + 2 + shadowOffsetY * 40),
    0,
    canvas
  );

  const opacity = clamp(
    0.12 + shadowOpacity * 0.6,
    0,
    0.5
  );

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

  setPlacementScale,
  setPlacementX,
  setPlacementY,
  setShadowOpacity,
  setShadowBlur,
  setShadowScale,
  setShadowOffsetX,
  setShadowOffsetY,

  onSavePlacement,
  busy = false,
  showMsg,
}: Props) {
  const [foregroundNaturalSize, setForegroundNaturalSize] = useState({
    width: 0,
    height: 0,
  });
  const [activePreviewTab, setActivePreviewTab] = useState<"edit" | "final">("edit");

  const safeScale = clamp(
    placementScale > 0 && placementScale <= 2.2
      ? savedScaleToUi(placementScale)
      : placementScale || 42,
    20,
    95
  );

  const safeX = clamp(
    placementX >= 0 && placementX <= 1 ? savedPosToUi(placementX) : placementX || 50,
    0,
    100
  );

  const safeY = clamp(
    placementY >= 0 && placementY <= 1 ? savedPosToUi(placementY) : placementY || 62,
    0,
    100
  );

  const safeShadowOpacity = clamp(shadowOpacity || 0.12, 0, 1);
  const safeShadowBlur = clamp(shadowBlur || 12, 0, 100);
  const safeShadowScale = clamp(shadowScale || 1, 0.5, 2);
  const safeShadowOffsetX = clamp(shadowOffsetX || 0, -1, 1);
  const safeShadowOffsetY = clamp(shadowOffsetY || 0.02, -1, 1);

  const normalizedSavedScaleForPreview = useMemo(() => {
    if (placementScale > 0 && placementScale <= 2.2) {
      return clamp(placementScale, 0.4, 2.2);
    }
    return uiScaleToSaved(placementScale || 42);
  }, [placementScale]);

  const previewGeometry = useMemo(() => {
    const canvas = PREVIEW_CANVAS;

    const placement = {
      scale: normalizedSavedScaleForPreview,
      x: uiPosToSaved(safeX),
      y: uiPosToSaved(safeY),
    };

    const baseProductWidthRatio = 0.42;
    const effectiveProductWidthRatio = clamp(
      baseProductWidthRatio * normalizedSavedScaleForPreview,
      0.18,
      0.82
    );

    const productTargetWidth = Math.round(canvas * effectiveProductWidthRatio);

    const previewFgSize = resolvePreviewForegroundSize({
      naturalWidth: foregroundNaturalSize.width || productTargetWidth,
      naturalHeight: foregroundNaturalSize.height || productTargetWidth,
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
    safeX,
    safeY,
    safeShadowOpacity,
    safeShadowBlur,
    safeShadowScale,
    safeShadowOffsetX,
    safeShadowOffsetY,
    foregroundNaturalSize.width,
    foregroundNaturalSize.height,
    productCategory,
    productSize,
    groundingType,
    bgScene,
  ]);

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
      return !!String(bgImageUrl || "").trim();
    }

    return false;
  }, [
    unifiedForegroundUrl,
    activePhotoMode,
    templatePreviewBackgroundUrl,
    bgImageUrl,
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
            }}
          >
            {previewBaseUrl ? (
              <img
                src={previewBaseUrl}
                alt="preview base"
                className="absolute inset-0 h-full w-full object-cover"
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

                    if (naturalWidth > 0 && naturalHeight > 0) {
                      setForegroundNaturalSize((prev) => {
                        if (
                          prev.width === naturalWidth &&
                          prev.height === naturalHeight
                        ) {
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
              </>
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
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/25">
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
            ここに出る画像が、再合成で保存された最終画像です。
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
                まだ完成画像はありません
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 border border-white/10" />
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
              setPlacementScale(82);
              setPlacementX(50);
              setPlacementY(64);
            }}
          />

          <ModeButton
            active={false}
            label="BRAND（世界観）"
            disabled={busy}
            onClick={() => {
              setPlacementScale(65);
              setPlacementX(50);
              setPlacementY(55);
            }}
          />

          <ModeButton
            active={false}
            label="SMALL（余白）"
            disabled={busy}
            onClick={() => {
              setPlacementScale(48);
              setPlacementX(50);
              setPlacementY(52);
            }}
          />
        </div>

        <div className="mt-2 text-white/50" style={{ fontSize: 11, lineHeight: 1.6 }}>
          ワンクリックで売れやすい配置に自動調整されます。
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <SliderRow
          label="大きさ"
          value={safeScale}
          min={20}
          max={95}
          step={1}
          disabled={busy || !canLiveEdit}
          help={
            canLiveEdit
              ? "背景を見ながら、その場でリアルタイムに反映されます。"
              : "背景または前景が無いため、今は編集プレビューできません。"
          }
          onChange={(n) => setPlacementScale(clamp(n, 20, 95))}
        />

        <SliderRow
          label="左右位置"
          value={safeX}
          min={0}
          max={100}
          step={1}
          disabled={busy || !canLiveEdit}
          help={
            canLiveEdit
              ? "50 が真ん中です。"
              : "背景または前景が無いため、今は編集プレビューできません。"
          }
          onChange={(n) => setPlacementX(clamp(n, 0, 100))}
        />

        <SliderRow
          label="上下位置"
          value={safeY}
          min={0}
          max={100}
          step={1}
          disabled={busy || !canLiveEdit}
          help={
            canLiveEdit
              ? "数字を小さくすると上、大きくすると下です。"
              : "背景または前景が無いため、今は編集プレビューできません。"
          }
          onChange={(n) => setPlacementY(clamp(n, 0, 100))}
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
          min={0}
          max={100}
          step={1}
          disabled={busy || !canLiveEdit}
          help="数字が大きいほど影が柔らかく広がります。"
          onChange={(n) => setShadowBlur(clamp(n, 0, 100))}
        />

        <SliderRow
          label="影の広がり"
          value={Math.round(safeShadowScale * 100)}
          min={50}
          max={200}
          step={1}
          disabled={busy || !canLiveEdit}
          help="数字が大きいほど影の横幅が広がります。"
          onChange={(n) => setShadowScale(clamp(n / 100, 0.5, 2))}
        />

        <SliderRow
          label="影の左右位置"
          value={Math.round((safeShadowOffsetX + 1) * 50)}
          min={0}
          max={100}
          step={1}
          disabled={busy || !canLiveEdit}
          help="50 が基準です。小さいと左、大きいと右へずれます。"
          onChange={(n) => setShadowOffsetX(clamp((n - 50) / 50, -1, 1))}
        />

        <SliderRow
          label="影の上下位置"
          value={Math.round((safeShadowOffsetY + 1) * 50)}
          min={0}
          max={100}
          step={1}
          disabled={busy || !canLiveEdit}
          help="50 が基準です。小さいと上、大きいと下へずれます。"
          onChange={(n) => setShadowOffsetY(clamp((n - 50) / 50, -1, 1))}
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