//app/flow/drafts/new/components/BackgroundPanel.tsx

"use client";

import React, { useMemo, useState } from "react";
import type { DraftDoc, ProductPhotoMode } from "@/lib/types/draft";
import { Btn } from "../ui";
import ProductPlacementEditor from "./ProductPlacementEditor";

/**
 * ② 背景のみ（合成・動画用）
 * ④ 合成画像（動画用・文字なし）
 *
 * このファイルの役割
 * - 背景生成
 * - 背景一覧
 * - おすすめ取得
 * - composite タブでは ProductPlacementEditor を呼び出す
 *
 * 重要
 * - 旧 composite 内の機能は削らず、ProductPlacementEditor 側へ移設する
 * - 背景生成側 UI はこのファイルに残す
 *
 * 今回の整理方針
 * - backgroundSourceTab を削除
 * - 「背景タイプ」の二重UIを削除
 * - ただしテンプレ背景 / AI背景の機能は全部残す
 * - 背景選択タブの中に、
 *   1. テンプレ背景セクション
 *   2. AI背景セクション
 *   を順番に並べる
 */

type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";
type BgScene = "studio" | "lifestyle" | "scale" | "detail";

type InnerTab = "background" | "composite";

type TemplateRecommendItem = {
  url: string;
  reason: string;
  score?: number;
};

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

  generateBackgroundImage: (keyword: string) => Promise<string>;
  replaceBackgroundAndSaveToAiImage: () => Promise<void>;
  syncBgImagesFromStorage: () => Promise<void>;
  clearBgHistory: () => Promise<void>;

  templateBgUrl?: string;
  templateBgUrls?: string[];
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

  activePhotoMode: ProductPhotoMode;
  setActivePhotoMode: React.Dispatch<React.SetStateAction<ProductPhotoMode>>;

  placementScale: number;
  setPlacementScale: React.Dispatch<React.SetStateAction<number>>;

  placementX: number;
  setPlacementX: React.Dispatch<React.SetStateAction<number>>;

  placementY: number;
  setPlacementY: React.Dispatch<React.SetStateAction<number>>;

  shadowOpacity: number;
  setShadowOpacity: React.Dispatch<React.SetStateAction<number>>;

  shadowBlur: number;
  setShadowBlur: React.Dispatch<React.SetStateAction<number>>;

  shadowScale: number;
  setShadowScale: React.Dispatch<React.SetStateAction<number>>;

  shadowOffsetX: number;
  setShadowOffsetX: React.Dispatch<React.SetStateAction<number>>;

  shadowOffsetY: number;
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
  }) => Promise<void> | void;
};

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

  templateBgUrl = "",
  templateBgUrls: templateBgUrlsFromParent = [],
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
  shadowOpacity,
  setShadowOpacity,
  shadowBlur,
  setShadowBlur,
  shadowScale,
  setShadowScale,
  shadowOffsetX,
  setShadowOffsetX,
  shadowOffsetY,
  setShadowOffsetY,
  onSavePlacement,
}: Props) {
  const [innerTab, setInnerTab] = useState<InnerTab>("background");

  const [templateRecommendBusy, setTemplateRecommendBusy] = useState(false);
  const [templateRecommendTopReason, setTemplateRecommendTopReason] = useState("");
  const [templateRecommended, setTemplateRecommended] = useState<TemplateRecommendItem[]>([]);

  const templatePreviewBackgroundUrl = useMemo(() => {
    return String(templateBgUrl || d.templateBgUrl || "").trim();
  }, [templateBgUrl, d.templateBgUrl]);

  /**
   * AI背景の背景のみプレビューは d.bgImageUrl を最優先にする
   * これで activePhotoMode が template の時でも AI背景候補が正しく見える
   */
  const aiOnlyPreviewBackgroundUrl = useMemo(() => {
    return String(d.bgImageUrl || bgDisplayUrl || "").trim();
  }, [d.bgImageUrl, bgDisplayUrl]);

  const templateBgUrls = useMemo(() => {
    const raw =
      Array.isArray(templateBgUrlsFromParent) && templateBgUrlsFromParent.length > 0
        ? templateBgUrlsFromParent
        : Array.isArray(d.templateBgUrls)
          ? d.templateBgUrls
          : [];

    return Array.from(new Set(raw.map((u) => String(u || "").trim()).filter(Boolean)));
  }, [templateBgUrlsFromParent, d.templateBgUrls]);

  const aiBgUrls = useMemo(() => {
    const raw = Array.isArray(d.bgImageUrls) ? d.bgImageUrls : [];
    return Array.from(new Set(raw.map((u) => String(u || "").trim()).filter(Boolean)));
  }, [d.bgImageUrls]);

  async function handleSelectTemplateBackground(url: string) {
    const picked = String(url || "").trim();
    if (!picked) return;

    try {
      if (typeof selectTemplateBackground === "function") {
        await selectTemplateBackground(picked);
        setActivePhotoMode("template");
      } else {
        setD((prev) => ({
          ...prev,
          templateBgUrl: picked,
          activePhotoMode: "template",
        }));

        await saveDraft({
          templateBgUrl: picked,
          activePhotoMode: "template",
        });
      }

      setActivePhotoMode("template");
      showMsg("テンプレ背景を選択しました");
    } catch (e: any) {
      console.error(e);
      showMsg(`テンプレ背景の選択に失敗：${e?.message || "不明"}`);
    }
  }

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
      await generateTemplateBackground();
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

    setD((p) => ({
      ...p,
      bgImageUrl: picked,
      activePhotoMode: "ai_bg",
    }));

    await saveDraft({
      bgImageUrl: picked,
      activePhotoMode: "ai_bg",
    });

    setActivePhotoMode("ai_bg");
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
                背景選択
              </div>

              <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
                テンプレ背景とAI背景をここでまとめて管理します。選択した背景は合成タブの編集プレビューに反映されます。
              </div>
            </div>

            {/* =========================
             * テンプレ背景セクション
             * ========================= */}
            <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-white/85 font-bold" style={{ fontSize: 12 }}>
                  テンプレ背景
                </div>

                <SmallBadge
                  active={activePhotoMode === "template"}
                  label={activePhotoMode === "template" ? "現在の編集対象" : "切替可能"}
                />
              </div>

              <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
                テンプレ背景は「売るための整った背景」です。
              </div>

              <div className="mt-3">
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
              </div>

              <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
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

              <div className="mt-3 flex flex-wrap gap-2">
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

              <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.5 }}>
                ※ テンプレ背景は、商品を主役に見せる販売向け背景です。
              </div>

              {templateRecommendTopReason || templateRecommended.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
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
                        const isCurrent =
                          String(templateBgUrl || d.templateBgUrl || "").trim() === item.url;

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
                <div className="mt-3">
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
                      const isCurrentTemplate =
                        String(templateBgUrl || d.templateBgUrl || "").trim() === u;

                      const recommendedItem = templateRecommended.find(
                        (item) => item.url === u
                      );

                      return (
                        <button
                          key={`${u}-${index}`}
                          type="button"
                          onClick={() => {
                            setActivePhotoMode("template");
                            void handleSelectTemplateBackground(u);
                          }}
                          className="rounded-xl border px-3 py-3 text-left transition hover:bg-white/5"
                          style={{
                            borderColor: isCurrentTemplate
                              ? "rgba(255,255,255,0.34)"
                              : "rgba(255,255,255,0.10)",
                            background: isCurrentTemplate
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
                                active={isCurrentTemplate}
                                label={isCurrentTemplate ? "選択中" : "未選択"}
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
                  className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white/55"
                  style={{ fontSize: 12, lineHeight: 1.6 }}
                >
                  まだテンプレ背景がありません。先に「テンプレ背景を生成」を押してください。
                </div>
              )}
            </div>

            {/* =========================
             * AI背景セクション
             * ========================= */}
            <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-white/85 font-bold" style={{ fontSize: 12 }}>
                  AI背景
                </div>

                <SmallBadge
                  active={activePhotoMode === "ai_bg"}
                  label={activePhotoMode === "ai_bg" ? "現在の編集対象" : "切替可能"}
                />
              </div>

              <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
                AI背景は「キーワードから空間を作る背景」です。
              </div>

              <div className="mt-3">
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
              </div>

              <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
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

              <div className="mt-3">
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

              <div className="mt-3 flex flex-wrap gap-2">
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
                  disabled={!uid || busy || (!aiOnlyPreviewBackgroundUrl && !String(backgroundKeyword || "").trim())}
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

              <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.5 }}>
                ※ この背景が「合成」と「動画」に使われます。
              </div>

              {aiBgUrls.length > 0 ? (
                <div className="mt-3">
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
                        onClick={() => {
                          setActivePhotoMode("ai_bg");
                          void handleSelectAiBackground(u);
                        }}
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
            </div>
          </>
        ) : null}

        {innerTab === "composite" ? (
          <ProductPlacementEditor
            baseImageUrl={d.baseImageUrl}
            foregroundImageUrl={d.foregroundImageUrl}
            bgImageUrl={String(d.bgImageUrl || "").trim()}
            aiImageUrl={aiImageUrl}
            templateBgUrl={templateBgUrl}
            templateBgUrls={templateBgUrls}
            aiBgUrls={aiBgUrls}
            templateRecommended={templateRecommended}
            templateRecommendTopReason={templateRecommendTopReason}
            isCompositeFresh={isCompositeFresh}
            productCategory={productCategory}
            productSize={productSize}
            groundingType={groundingType}
            bgScene={bgScene}
            activePhotoMode={activePhotoMode}
            onChangePhotoMode={setActivePhotoMode}
            onSelectTemplateBg={handleSelectTemplateBackground}
            onSelectAiBg={handleSelectAiBackground}
            onRecompose={replaceBackgroundAndSaveToAiImage}
            placementScale={placementScale}
            placementX={placementX}
            placementY={placementY}
            shadowOpacity={shadowOpacity}
            shadowBlur={shadowBlur}
            shadowScale={shadowScale}
            shadowOffsetX={shadowOffsetX}
            shadowOffsetY={shadowOffsetY}
            setPlacementScale={setPlacementScale}
            setPlacementX={setPlacementX}
            setPlacementY={setPlacementY}
            setShadowOpacity={setShadowOpacity}
            setShadowBlur={setShadowBlur}
            setShadowScale={setShadowScale}
            setShadowOffsetX={setShadowOffsetX}
            setShadowOffsetY={setShadowOffsetY}
            onSavePlacement={onSavePlacement}
            busy={busy}
            showMsg={showMsg}
          />
        ) : null}
      </div>
    </details>
  );
}