// /app/flow/drafts/new/components/BackgroundPanel.tsx
"use client";

import React, { useMemo, useState } from "react";
import type { DraftDoc, ProductPhotoMode } from "@/lib/types/draft";
import { Btn } from "../ui";

/**
 * ② 背景のみ（合成・動画用）
 * ④ 合成画像（動画用・文字なし）
 *
 * このファイルの役割
 * - 「背景選択」と「商品/背景合成」を同じ枠の中で切り替える
 * - AI背景の既存フローを維持する
 * - テンプレ背景のUIを扱う
 *
 * 今回の重要修正
 * - recommend API の返り値ゆれを安全に吸収する
 *   1. topReason
 *   2. picked.reason
 *   3. recommended[].url
 *   4. recommended[].imageUrl
 * - これで API 側が旧形式でも新形式でも UI が落ちないようにする
 *
 * 今回の追加修正
 * - 「商品/背景合成」タブにもテンプレ背景おすすめ情報を表示する
 * - 背景選択タブで取得したおすすめ情報を、そのまま合成タブでも使う
 * - これにより、最終判断の場で
 *   - おすすめ理由
 *   - 候補比較
 *   - 選択中状態
 *   を確認できる
 *
 * 既存の重要仕様
 * - template:
 *   背景画像を下に出して、商品切り抜きを上に重ねる
 * - ai_bg:
 *   すでに保存されている合成済み画像 aiImageUrl をそのまま出す
 * - ai_bg の時は d.baseImageUrl をさらに上から重ねない
 */

type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";
type BgScene = "studio" | "lifestyle" | "scale" | "detail";

type InnerTab = "background" | "composite";
type BackgroundSourceTab = "template" | "ai";

/**
 * UIで使うおすすめ1件分の型
 * - url を正式扱いにする
 * - imageUrl は旧API互換の吸収用
 */
type TemplateRecommendItem = {
  url: string;
  reason: string;
  score?: number;
};

/**
 * UIで使うおすすめ結果
 * - topReason を正式扱いにする
 * - picked は旧API互換の吸収用
 */
type TemplateRecommendResult = {
  topReason?: string;
  recommended?: Array<{
    url?: string;
    imageUrl?: string;
    reason?: string;
    score?: number;
  }>;
  picked?: {
    reason?: string;
  } | null;
};

const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  furniture: "家具",
  goods: "雑貨",
  apparel: "アパレル",
  small: "小型商品",
  other: "その他",
};

const PRODUCT_SIZE_LABEL: Record<ProductSize, string> = {
  large: "大",
  medium: "中",
  small: "小",
};

const GROUNDING_TYPE_LABEL: Record<GroundingType, string> = {
  floor: "床置き",
  table: "卓上",
  hanging: "吊り下げ",
  wall: "壁寄せ",
};

const SELL_DIRECTION_LABEL: Record<SellDirection, string> = {
  sales: "売上重視",
  branding: "世界観重視",
  trust: "信頼重視",
  story: "ストーリー重視",
};

const BG_SCENE_LABEL: Record<BgScene, string> = {
  studio: "スタジオ",
  lifestyle: "ライフスタイル",
  scale: "スケール訴求",
  detail: "ディテール訴求",
};

type Props = {
  bgDisplayUrl: string;
  backgroundKeyword: string;
  setBackgroundKeyword: React.Dispatch<React.SetStateAction<string>>;
  uid: string | null;
  busy: boolean;
  d: DraftDoc;

  /**
   * 既存の AI 背景系
   */
  generateBackgroundImage: (keyword: string) => Promise<string>;
  replaceBackgroundAndSaveToAiImage: () => Promise<void>;
  syncBgImagesFromStorage: () => Promise<void>;
  clearBgHistory: () => Promise<void>;

  /**
   * テンプレ背景系
   */
  generateTemplateBackground?: () => Promise<string | void>;
  fetchTemplateRecommendations?: () => Promise<TemplateRecommendResult | void>;
  selectTemplateBackground?: (url: string) => Promise<void> | void;

  setBgImageUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;
  saveDraft: (partial?: Partial<DraftDoc>) => Promise<string | null>;

  formStyle: React.CSSProperties;
  showMsg: (msg: string) => void;

  productCategory?: ProductCategory;
  setProductCategory?: React.Dispatch<React.SetStateAction<ProductCategory>>;

  productSize?: ProductSize;
  setProductSize?: React.Dispatch<React.SetStateAction<ProductSize>>;

  groundingType?: GroundingType;
  setGroundingType?: React.Dispatch<React.SetStateAction<GroundingType>>;

  sellDirection?: SellDirection;
  setSellDirection?: React.Dispatch<React.SetStateAction<SellDirection>>;

  bgScene?: BgScene;
  setBgScene?: React.Dispatch<React.SetStateAction<BgScene>>;

  aiImageUrl?: string;
  isCompositeFresh?: boolean;

  /**
   * ④ 合成画像タブで使う配置調整
   */
  activePhotoMode: ProductPhotoMode;
  setActivePhotoMode: React.Dispatch<React.SetStateAction<ProductPhotoMode>>;

  placementScale: number;
  setPlacementScale: React.Dispatch<React.SetStateAction<number>>;

  placementX: number;
  setPlacementX: React.Dispatch<React.SetStateAction<number>>;

  placementY: number;
  setPlacementY: React.Dispatch<React.SetStateAction<number>>;

  onSavePlacement: (partial?: {
    scale?: number;
    x?: number;
    y?: number;
    activePhotoMode?: ProductPhotoMode;
  }) => Promise<void> | void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * 保存値 → UI表示値
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
 * API 側 compose-product-stage と同じ考え方で
 * preview 用の商品横幅比率を出す
 */
function savedScaleToPreviewWidthPercent(savedScale: number) {
  const normalizedSavedScale = clamp(savedScale, 0.4, 2.2);
  const baseProductWidthRatio = 0.42;
  const effectiveProductWidthRatio = clamp(
    baseProductWidthRatio * normalizedSavedScale,
    0.18,
    0.82
  );
  return effectiveProductWidthRatio * 100;
}

function SegButton({
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
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function TopTabButton({
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
        "rounded-xl border px-3 py-2 text-xs transition",
        active
          ? "border-white/60 bg-white/10 text-white"
          : "border-white/10 bg-black/20 text-white/65 hover:bg-white/5",
      ].join(" ")}
    >
      {label}
    </button>
  );
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
        disabled ? "cursor-not-allowed opacity-50" : "",
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
        <div className="mt-2 text-white/50" style={{ fontSize: 11, lineHeight: 1.5 }}>
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

export default function BackgroundPanel({
  bgDisplayUrl,
  backgroundKeyword,
  setBackgroundKeyword,
  uid,
  busy,
  d,

  generateBackgroundImage,
  replaceBackgroundAndSaveToAiImage,
  syncBgImagesFromStorage,
  clearBgHistory,

  generateTemplateBackground,
  fetchTemplateRecommendations,
  selectTemplateBackground,

  setBgImageUrl,
  setD,
  saveDraft,

  formStyle,
  showMsg,

  productCategory = "other",
  setProductCategory,
  productSize = "medium",
  setProductSize,
  groundingType = "floor",
  setGroundingType,
  sellDirection = "sales",
  setSellDirection,
  bgScene = "studio",
  setBgScene,

  aiImageUrl = "",
  isCompositeFresh = false,

  activePhotoMode,
  setActivePhotoMode,
  placementScale,
  setPlacementScale,
  placementX,
  setPlacementX,
  placementY,
  setPlacementY,
  onSavePlacement,
}: Props) {
  const [innerTab, setInnerTab] = useState<InnerTab>("background");
  const [backgroundSourceTab, setBackgroundSourceTab] =
    useState<BackgroundSourceTab>("template");

  /**
   * テンプレ背景おすすめのローカル表示用 state
   */
  const [templateRecommendBusy, setTemplateRecommendBusy] = useState(false);
  const [templateRecommendTopReason, setTemplateRecommendTopReason] = useState("");
  const [templateRecommended, setTemplateRecommended] = useState<TemplateRecommendItem[]>([]);

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

  const normalizedSavedScaleForPreview = useMemo(() => {
    if (placementScale > 0 && placementScale <= 2.2) {
      return clamp(placementScale, 0.4, 2.2);
    }
    return uiScaleToSaved(placementScale || 42);
  }, [placementScale]);

  const previewProductWidthPercent = useMemo(() => {
    return savedScaleToPreviewWidthPercent(normalizedSavedScaleForPreview);
  }, [normalizedSavedScaleForPreview]);

  const templatePreviewBackgroundUrl = useMemo(() => {
    return String(d.templateBgUrl || bgDisplayUrl || "").trim();
  }, [d.templateBgUrl, bgDisplayUrl]);

  const aiOnlyPreviewBackgroundUrl = useMemo(() => {
    return String(bgDisplayUrl || "").trim();
  }, [bgDisplayUrl]);

  const aiBgPreviewImageUrl = useMemo(() => {
    return String(aiImageUrl || "").trim();
  }, [aiImageUrl]);

  const previewBaseUrl = useMemo(() => {
    if (activePhotoMode === "template") {
      return templatePreviewBackgroundUrl;
    }

    if (activePhotoMode === "ai_bg") {
      return aiBgPreviewImageUrl;
    }

    return templatePreviewBackgroundUrl || aiBgPreviewImageUrl || "";
  }, [activePhotoMode, templatePreviewBackgroundUrl, aiBgPreviewImageUrl]);

  const unifiedForegroundUrl = useMemo(() => {
    return String(d.foregroundImageUrl || d.baseImageUrl || "").trim();
  }, [d]);

  const shouldShowProductOverlay =
    activePhotoMode === "template" && !!unifiedForegroundUrl;

  const templateBgUrls = useMemo(() => {
    const raw = Array.isArray(d.templateBgUrls) ? d.templateBgUrls : [];
    return Array.from(new Set(raw.map((u) => String(u || "").trim()).filter(Boolean)));
  }, [d.templateBgUrls]);

  const aiBgUrls = useMemo(() => {
    const raw = Array.isArray(d.bgImageUrls) ? d.bgImageUrls : [];
    return Array.from(new Set(raw.map((u) => String(u || "").trim()).filter(Boolean)));
  }, [d.bgImageUrls]);

  /**
   * 合成タブで表示する「今の背景がおすすめ何位か」を出す
   */
  const currentTemplateRecommendIndex = useMemo(() => {
    const current = String(d.templateBgUrl || "").trim();
    if (!current) return -1;
    return templateRecommended.findIndex((item) => item.url === current);
  }, [d.templateBgUrl, templateRecommended]);

  const productStyle: React.CSSProperties = {
    position: "absolute",
    width: `${previewProductWidthPercent}%`,
    maxWidth: "82%",
    left: `${safeX}%`,
    top: `${safeY}%`,
    transform: "translate(-50%, -50%)",
    objectFit: "contain",
    filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.28))",
    pointerEvents: "none",
    userSelect: "none",
  };

  async function saveCurrentPlacement() {
    await onSavePlacement({
      scale: uiScaleToSaved(safeScale),
      x: uiPosToSaved(safeX),
      y: uiPosToSaved(safeY),
      activePhotoMode,
    });
  }

  const isTemplateMode = activePhotoMode === "template";
  const isAiBgMode = activePhotoMode === "ai_bg";

  async function handleSelectTemplateBackground(url: string) {
    const picked = String(url || "").trim();
    if (!picked) return;

    try {
      if (typeof selectTemplateBackground === "function") {
        await selectTemplateBackground(picked);
      } else {
        setD((prev) => ({
          ...prev,
          templateBgUrl: picked,
          bgImageUrl: picked,
          activePhotoMode: "template",
        }));

        await saveDraft({
          templateBgUrl: picked,
          bgImageUrl: picked,
          activePhotoMode: "template",
        });
      }

      setBgImageUrl(picked);
      setActivePhotoMode("template");
      showMsg("テンプレ背景を選択しました");
    } catch (e: any) {
      console.error(e);
      showMsg(`テンプレ背景の選択に失敗：${e?.message || "不明"}`);
    }
  }

  /**
   * テンプレ背景おすすめ取得
   *
   * 今回の本質修正
   * - topReason / picked.reason の両方を吸収
   * - recommended[].url / recommended[].imageUrl の両方を吸収
   */
  async function handleFetchTemplateRecommendations() {
    if (!uid || busy || templateBgUrls.length === 0) return;

    if (typeof fetchTemplateRecommendations !== "function") {
      showMsg("テンプレ背景おすすめ取得がまだ配線されていません");
      return;
    }

    try {
      setTemplateRecommendBusy(true);

      const result = await fetchTemplateRecommendations();

      const topReason = String(result?.topReason || result?.picked?.reason || "").trim();

      const recommended = Array.isArray(result?.recommended)
        ? result.recommended
            .map((item) => {
              const url = String(item?.url || item?.imageUrl || "").trim();
              const reason = String(item?.reason || "").trim();
              const score =
                typeof item?.score === "number" && Number.isFinite(item.score)
                  ? item.score
                  : undefined;

              return {
                url,
                reason,
                score,
              };
            })
            .filter((item) => item.url)
        : [];

      setTemplateRecommendTopReason(topReason);
      setTemplateRecommended(recommended);

      if (recommended.length > 0) {
        showMsg("テンプレ背景のおすすめを取得しました");
      } else {
        showMsg("おすすめ候補は取得できましたが、表示対象がありませんでした");
      }
    } catch (e: any) {
      console.error(e);
      showMsg(`おすすめ取得に失敗：${e?.message || "不明"}`);
    } finally {
      setTemplateRecommendBusy(false);
    }
  }

  async function handleGenerateTemplateBackground() {
    if (!uid || busy) return;

    if (typeof generateTemplateBackground !== "function") {
      showMsg("テンプレ背景生成がまだ配線されていません");
      return;
    }

    try {
      const out = await generateTemplateBackground();

      if (typeof out === "string" && out.trim()) {
        setBgImageUrl(out.trim());
      }

      setActivePhotoMode("template");
      showMsg("テンプレ背景を生成しました");
    } catch (e: any) {
      console.error(e);
      showMsg(`テンプレ背景生成に失敗：${e?.message || "不明"}`);
    }
  }

  async function handleSelectAiBackground(url: string) {
    const picked = String(url || "").trim();
    if (!picked) return;

    setBgImageUrl(picked);
    setD((p) => ({ ...p, bgImageUrl: picked }));
    await saveDraft({ bgImageUrl: picked });
    showMsg("AI背景を選択しました");
  }

  return (
    <details className="area2 rounded-2xl border border-white/10 bg-black/20" open>
      <summary className="cursor-pointer select-none p-3">
        <div className="text-white/70" style={{ fontSize: 12 }}>
          【商品画像】静止画
        </div>
      </summary>

      <div className="flex flex-col gap-3 p-3 pt-0">
        <div className="flex flex-wrap items-center gap-2">
          <TopTabButton
            active={innerTab === "background"}
            label="背景選択"
            onClick={() => setInnerTab("background")}
          />
          <TopTabButton
            active={innerTab === "composite"}
            label="商品/背景合成"
            onClick={() => setInnerTab("composite")}
          />
        </div>

        {innerTab === "background" ? (
          <>
            <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
              <div className="text-white/85 font-bold" style={{ fontSize: 12 }}>
                背景タイプ
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <TopTabButton
                  active={backgroundSourceTab === "template"}
                  label="テンプレ背景"
                  onClick={() => setBackgroundSourceTab("template")}
                />
                <TopTabButton
                  active={backgroundSourceTab === "ai"}
                  label="AI背景"
                  onClick={() => setBackgroundSourceTab("ai")}
                />
              </div>

              <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
                テンプレ背景は「売るための整った背景」、AI背景は「キーワードから空間を作る背景」です。
              </div>
            </div>

            {backgroundSourceTab === "template" ? (
              <>
                {templatePreviewBackgroundUrl ? (
                  <img
                    src={templatePreviewBackgroundUrl}
                    alt="template background"
                    className="w-full rounded-xl border border-white/10"
                    style={{
                      height: 240,
                      objectFit: "contain",
                      background: "rgba(0,0,0,0.25)",
                    }}
                  />
                ) : (
                  <div
                    className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/55"
                    style={{ aspectRatio: "1 / 1", fontSize: 13 }}
                  >
                    テンプレ背景がありません
                  </div>
                )}

                <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
                  <div className="text-white/85 font-bold" style={{ fontSize: 12 }}>
                    商品理解レイヤー
                  </div>

                  <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
                    テンプレ背景のおすすめ精度を上げるために、商品カテゴリ・サイズ感・接地タイプ・売り方向・背景方向を先に決めます。
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      1. 商品カテゴリ
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(PRODUCT_CATEGORY_LABEL) as ProductCategory[]).map((key) => (
                        <SegButton
                          key={key}
                          active={productCategory === key}
                          label={PRODUCT_CATEGORY_LABEL[key]}
                          disabled={!setProductCategory || busy}
                          onClick={() => {
                            if (!setProductCategory) return;
                            setProductCategory(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      2. サイズ感
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(PRODUCT_SIZE_LABEL) as ProductSize[]).map((key) => (
                        <SegButton
                          key={key}
                          active={productSize === key}
                          label={PRODUCT_SIZE_LABEL[key]}
                          disabled={!setProductSize || busy}
                          onClick={() => {
                            if (!setProductSize) return;
                            setProductSize(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      3. 接地タイプ
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(GROUNDING_TYPE_LABEL) as GroundingType[]).map((key) => (
                        <SegButton
                          key={key}
                          active={groundingType === key}
                          label={GROUNDING_TYPE_LABEL[key]}
                          disabled={!setGroundingType || busy}
                          onClick={() => {
                            if (!setGroundingType) return;
                            setGroundingType(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      4. 売り方向
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(SELL_DIRECTION_LABEL) as SellDirection[]).map((key) => (
                        <SegButton
                          key={key}
                          active={sellDirection === key}
                          label={SELL_DIRECTION_LABEL[key]}
                          disabled={!setSellDirection || busy}
                          onClick={() => {
                            if (!setSellDirection) return;
                            setSellDirection(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      5. 背景方向
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(BG_SCENE_LABEL) as BgScene[]).map((key) => (
                        <SegButton
                          key={key}
                          active={bgScene === key}
                          label={BG_SCENE_LABEL[key]}
                          disabled={!setBgScene || busy}
                          onClick={() => {
                            if (!setBgScene) return;
                            setBgScene(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div
                    className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/65"
                    style={{ fontSize: 12, lineHeight: 1.6 }}
                  >
                    現在： {PRODUCT_CATEGORY_LABEL[productCategory]} / {PRODUCT_SIZE_LABEL[productSize]} /{" "}
                    {GROUNDING_TYPE_LABEL[groundingType]} / {SELL_DIRECTION_LABEL[sellDirection]} /{" "}
                    {BG_SCENE_LABEL[bgScene]}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Btn
                    variant="secondary"
                    disabled={!uid || busy}
                    onClick={handleGenerateTemplateBackground}
                  >
                    テンプレ背景を生成
                  </Btn>

                  <Btn
                    variant="secondary"
                    disabled={!uid || busy || templateBgUrls.length === 0 || templateRecommendBusy}
                    onClick={handleFetchTemplateRecommendations}
                  >
                    {templateRecommendBusy ? "おすすめ取得中..." : "おすすめ取得"}
                  </Btn>
                </div>

                <div className="text-white/55" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  ※ テンプレ背景は、商品を主役に見せる販売向け背景です。
                </div>

                {templateRecommendTopReason || templateRecommended.length > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
                    <div className="text-white/85 font-bold" style={{ fontSize: 12 }}>
                      おすすめテンプレ
                    </div>

                    {templateRecommendTopReason ? (
                      <div
                        className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/72"
                        style={{ fontSize: 12, lineHeight: 1.6 }}
                      >
                        {templateRecommendTopReason}
                      </div>
                    ) : null}

                    {templateRecommended.length > 0 ? (
                      <div className="mt-3 flex flex-col gap-2">
                        {templateRecommended.slice(0, 3).map((item, index) => {
                          const isCurrent = String(d.templateBgUrl || "").trim() === item.url;

                          return (
                            <button
                              key={`${item.url}-${index}`}
                              type="button"
                              onClick={() => void handleSelectTemplateBackground(item.url)}
                              className="rounded-xl border px-3 py-3 text-left transition hover:bg-white/5"
                              style={{
                                borderColor: "rgba(255,255,255,0.10)",
                                background: "rgba(0,0,0,0.15)",
                                color: "rgba(255,255,255,0.82)",
                              }}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-semibold" style={{ fontSize: 12 }}>
                                  おすすめ {index + 1}
                                  {typeof item.score === "number" ? ` / score ${item.score}` : ""}
                                </div>

                                <SmallBadge
                                  active={isCurrent}
                                  label={isCurrent ? "選択中" : "候補"}
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

                {templateBgUrls.length > 0 ? (
                  <div className="mt-1">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-white/70" style={{ fontSize: 12 }}>
                        テンプレ背景一覧
                      </div>
                      <div className="text-white/45" style={{ fontSize: 11 }}>
                        {templateBgUrls.length}件
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {templateBgUrls.slice(0, 8).map((u, index) => {
                        const isCurrent = String(d.templateBgUrl || "").trim() === u;

                        const recommendedItem = templateRecommended.find(
                          (item) => item.url === u
                        );

                        return (
                          <button
                            key={`${u}-${index}`}
                            type="button"
                            onClick={() => void handleSelectTemplateBackground(u)}
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
                                テンプレ背景 {index + 1}
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

                            <div className="mt-2 text-white/55" style={{ fontSize: 12 }}>
                              {u.slice(0, 72)}
                              {u.length > 72 ? "…" : ""}
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
                  </div>
                ) : (
                  <div
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white/55"
                    style={{ fontSize: 12, lineHeight: 1.6 }}
                  >
                    まだテンプレ背景がありません。先に「テンプレ背景を生成」を押してください。
                  </div>
                )}
              </>
            ) : null}

            {backgroundSourceTab === "ai" ? (
              <>
                {aiOnlyPreviewBackgroundUrl ? (
                  <img
                    src={aiOnlyPreviewBackgroundUrl}
                    alt="ai bg"
                    className="w-full rounded-xl border border-white/10"
                    style={{
                      height: 240,
                      objectFit: "contain",
                      background: "rgba(0,0,0,0.25)",
                    }}
                  />
                ) : (
                  <div
                    className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/55"
                    style={{ aspectRatio: "1 / 1", fontSize: 13 }}
                  >
                    背景がありません（背景生成）
                  </div>
                )}

                <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
                  <div className="text-white/85 font-bold" style={{ fontSize: 12 }}>
                    商品理解レイヤー
                  </div>

                  <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
                    背景を自然に作るために、商品カテゴリ・サイズ感・接地タイプ・売り方向・背景方向を先に決めます。
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      1. 商品カテゴリ
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(PRODUCT_CATEGORY_LABEL) as ProductCategory[]).map((key) => (
                        <SegButton
                          key={key}
                          active={productCategory === key}
                          label={PRODUCT_CATEGORY_LABEL[key]}
                          disabled={!setProductCategory || busy}
                          onClick={() => {
                            if (!setProductCategory) return;
                            setProductCategory(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      2. サイズ感
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(PRODUCT_SIZE_LABEL) as ProductSize[]).map((key) => (
                        <SegButton
                          key={key}
                          active={productSize === key}
                          label={PRODUCT_SIZE_LABEL[key]}
                          disabled={!setProductSize || busy}
                          onClick={() => {
                            if (!setProductSize) return;
                            setProductSize(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      3. 接地タイプ
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(GROUNDING_TYPE_LABEL) as GroundingType[]).map((key) => (
                        <SegButton
                          key={key}
                          active={groundingType === key}
                          label={GROUNDING_TYPE_LABEL[key]}
                          disabled={!setGroundingType || busy}
                          onClick={() => {
                            if (!setGroundingType) return;
                            setGroundingType(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      4. 売り方向
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(SELL_DIRECTION_LABEL) as SellDirection[]).map((key) => (
                        <SegButton
                          key={key}
                          active={sellDirection === key}
                          label={SELL_DIRECTION_LABEL[key]}
                          disabled={!setSellDirection || busy}
                          onClick={() => {
                            if (!setSellDirection) return;
                            setSellDirection(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      5. 背景方向
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(BG_SCENE_LABEL) as BgScene[]).map((key) => (
                        <SegButton
                          key={key}
                          active={bgScene === key}
                          label={BG_SCENE_LABEL[key]}
                          disabled={!setBgScene || busy}
                          onClick={() => {
                            if (!setBgScene) return;
                            setBgScene(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div
                    className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/65"
                    style={{ fontSize: 12, lineHeight: 1.6 }}
                  >
                    現在： {PRODUCT_CATEGORY_LABEL[productCategory]} / {PRODUCT_SIZE_LABEL[productSize]} /{" "}
                    {GROUNDING_TYPE_LABEL[groundingType]} / {SELL_DIRECTION_LABEL[sellDirection]} /{" "}
                    {BG_SCENE_LABEL[bgScene]}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                    背景キーワード
                  </div>

                  <input
                    value={backgroundKeyword}
                    onChange={(e) => setBackgroundKeyword(e.target.value)}
                    placeholder="例：玄関 / 書斎 / 薬局受付"
                    className="w-full rounded-xl border p-2"
                    style={formStyle}
                    disabled={!uid || busy}
                  />

                  <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    ※ キーワードは空間の方向づけです。商品そのものではなく、置かれる背景の文脈を入れてください。
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Btn
                    variant="secondary"
                    disabled={!uid || busy || !backgroundKeyword.trim()}
                    onClick={async () => {
                      try {
                        await generateBackgroundImage(backgroundKeyword);
                        showMsg("背景を生成しました");
                      } catch (e: any) {
                        console.error(e);
                        showMsg(`背景生成に失敗：${e?.message || "不明"}`);
                      }
                    }}
                  >
                    背景を生成
                  </Btn>

                  <Btn
                    variant="secondary"
                    disabled={!uid || busy || (!bgDisplayUrl && !String(backgroundKeyword || "").trim())}
                    onClick={replaceBackgroundAndSaveToAiImage}
                  >
                    製品画像＋背景を合成（保存）
                  </Btn>

                  <Btn
                    variant="secondary"
                    disabled={!uid || busy}
                    onClick={syncBgImagesFromStorage}
                  >
                    背景を同期（Storage→Firestore）
                  </Btn>
                </div>

                <div className="text-white/55" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  ※ この背景が「合成」と「動画」に使われます。
                </div>

                {aiBgUrls.length > 0 ? (
                  <div className="mt-1">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-white/70" style={{ fontSize: 12 }}>
                        背景履歴（クリックで表示｜課金なし）
                      </div>

                      <Btn
                        variant="danger"
                        disabled={!uid || busy || aiBgUrls.length === 0}
                        onClick={clearBgHistory}
                        title="この下書きの候補リストだけ消します（Storageの画像は消えません）"
                      >
                        履歴クリア
                      </Btn>
                    </div>

                    <div className="flex flex-col gap-2">
                      {aiBgUrls.slice(0, 6).map((u: string) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => void handleSelectAiBackground(u)}
                          className="rounded-xl border px-3 py-2 text-left transition"
                          style={{
                            borderColor: "rgba(255,255,255,0.10)",
                            background: "rgba(0,0,0,0.15)",
                            color: "rgba(255,255,255,0.78)",
                            fontSize: 12,
                          }}
                        >
                          {u.slice(0, 60)}
                          {u.length > 60 ? "…" : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {innerTab === "composite" ? (
          <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
            <div>
              <div className="text-white/86 font-bold" style={{ fontSize: 13 }}>
                ④ 合成画像の配置調整
              </div>
              <div
                className="mt-1 text-white/55"
                style={{ fontSize: 12, lineHeight: 1.5 }}
              >
                合成結果を見ながら、商品の大きさと位置をその場で調整します。
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
              <div className="mb-2 text-white/72" style={{ fontSize: 12 }}>
                背景モード
              </div>

              <div className="flex flex-wrap gap-2">
                <ModeButton
                  active={activePhotoMode === "template"}
                  label="テンプレ背景"
                  disabled={busy}
                  onClick={() => {
                    setActivePhotoMode("template");
                  }}
                />

                <ModeButton
                  active={activePhotoMode === "ai_bg"}
                  label="AI背景"
                  disabled={busy}
                  onClick={() => {
                    setActivePhotoMode("ai_bg");
                  }}
                />
              </div>

              <div className="mt-2 text-white/50" style={{ fontSize: 11, lineHeight: 1.6 }}>
                テンプレ背景は「背景＋商品切り抜きの確認用」、AI背景は「保存済み完成画像そのもの」です。
              </div>
            </div>

            {/* テンプレ背景モードの時は、合成タブにもおすすめ情報を出す */}
            {isTemplateMode && (templateRecommendTopReason || templateRecommended.length > 0) ? (
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
                      const isCurrent = String(d.templateBgUrl || "").trim() === item.url;

                      return (
                        <button
                          key={`${item.url}-composite-${index}`}
                          type="button"
                          onClick={() => void handleSelectTemplateBackground(item.url)}
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
              {isTemplateMode ? (
                <Btn
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    await saveCurrentPlacement();
                    showMsg("配置を保存しました");
                  }}
                >
                  配置を保存
                </Btn>
              ) : null}

              {isAiBgMode ? (
                <Btn
                  variant="secondary"
                  disabled={!uid || busy || (!bgDisplayUrl && !String(backgroundKeyword || "").trim())}
                  onClick={async () => {
                    await saveCurrentPlacement();
                    await replaceBackgroundAndSaveToAiImage();
                  }}
                >
                  再合成
                </Btn>
              ) : null}
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/25">
              <div
                className="border-b border-white/10 px-3 py-2 text-white/72"
                style={{ fontSize: 12 }}
              >
                合成プレビュー
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
                    {activePhotoMode === "template"
                      ? "テンプレ背景がありません"
                      : "AI背景の完成画像がありません"}
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
                  <img
                    src={unifiedForegroundUrl}
                    alt="product preview"
                    style={productStyle}
                  />
                ) : null}

                {!shouldShowProductOverlay &&
                activePhotoMode === "template" &&
                !unifiedForegroundUrl ? (
                  <div
                    className="absolute inset-0 flex items-center justify-center text-white/50"
                    style={{ fontSize: 12 }}
                  >
                    前景画像がありません
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

            <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
  <div className="text-white/72 mb-2" style={{ fontSize: 12 }}>
    構図プリセット（売れる配置）
  </div>

  <div className="flex flex-wrap gap-2">
    <ModeButton
      active={false}
      label="SELL（売る）"
      disabled={busy || activePhotoMode === "ai_bg"}
      onClick={() => {
        setPlacementScale(82);
        setPlacementX(50);
        setPlacementY(64);
      }}
    />

    <ModeButton
      active={false}
      label="BRAND（世界観）"
      disabled={busy || activePhotoMode === "ai_bg"}
      onClick={() => {
        setPlacementScale(65);
        setPlacementX(50);
        setPlacementY(55);
      }}
    />

    <ModeButton
      active={false}
      label="SMALL（余白）"
      disabled={busy || activePhotoMode === "ai_bg"}
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
                disabled={busy || activePhotoMode === "ai_bg"}
                help={
                  activePhotoMode === "template"
                    ? "数字が大きいほど商品が大きく見えます。preview も完成画像と同じ計算式に寄せています。"
                    : "AI背景は完成画像です。この場では重ね商品を動かさず、再合成で反映します。"
                }
                onChange={(n) => setPlacementScale(clamp(n, 20, 95))}
              />

              <SliderRow
                label="左右位置"
                value={safeX}
                min={0}
                max={100}
                step={1}
                disabled={busy || activePhotoMode === "ai_bg"}
                help={
                  activePhotoMode === "template"
                    ? "50 が真ん中です。数字を小さくすると左、大きくすると右です。"
                    : "AI背景は完成画像です。この場では重ね商品を動かさず、再合成で反映します。"
                }
                onChange={(n) => setPlacementX(clamp(n, 0, 100))}
              />

              <SliderRow
                label="上下位置"
                value={safeY}
                min={0}
                max={100}
                step={1}
                disabled={busy || activePhotoMode === "ai_bg"}
                help={
                  activePhotoMode === "template"
                    ? "数字を小さくすると上、大きくすると下です。"
                    : "AI背景は完成画像です。この場では重ね商品を動かさず、再合成で反映します。"
                }
                onChange={(n) => setPlacementY(clamp(n, 0, 100))}
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
                状態：{aiImageUrl ? "あり" : "まだ未作成"}
                {aiImageUrl ? ` / ${isCompositeFresh ? "最新" : "保存済み"}` : ""}
              </div>

              <div className="mt-2">
                テンプレ背景は、背景に対して商品を重ねた見た目確認用です。
              </div>

              <div className="mt-1">
                AI背景は、保存済みの完成画像そのものを表示します。
              </div>

              <div className="mt-2">
                AI背景で位置やサイズを反映したい時は、上の「再合成」を押してください。
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}