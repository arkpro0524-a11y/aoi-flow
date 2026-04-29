// /app/flow/drafts/new/components/ImageTabPanel.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";

import BaseImagePanel from "./BaseImagePanel";
import BackgroundPanel from "./BackgroundPanel";
import IdeaImagePanel from "./IdeaImagePanel";
import SizeTemplatePanel from "./SizeTemplatePanel";
import StoryImagePanel from "./StoryImagePanel";

import type {
  DraftDoc,
  TextOverlay,
  ImagePurpose,
  StaticImageVariant,
  ProductPhotoMode,
  SizeTemplateType,
} from "@/lib/types/draft";

/**
 * このファイルの役割
 * - 画像タブ全体の各パネルをまとめる
 * - page.tsx から受けた props を各子パネルへ正しく橋渡しする
 * - 売れる判断OSへの導線を画像エリアに追加する
 *
 * 今回の追加
 * - 「この画像で売れる診断」ボタンを追加
 * - d.outcome.sellCheck がある場合、診断結果を表示
 * - 既存の画像生成・背景・合成・サイズ・ストーリー機能は削除しない
 */

type BgScene = "studio" | "lifestyle" | "scale" | "detail";
type ImageSlot = "base" | "mood" | "composite";

type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";

type TemplateRecommendItemForPanel = {
  url: string;
  reason: string;
  score?: number;
};

type TemplateRecommendResultForPanel = {
  topReason?: string;
  recommended?: TemplateRecommendItemForPanel[];
};

type Props = {
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

  d: DraftDoc;
  uid: string | null;
  busy: boolean;

  cutoutBusy: boolean;
  cutoutReason: string;

  overlayPreviewDataUrl: string | null;
  baseCandidates: string[];
  currentSlot: ImageSlot;
  formStyle: React.CSSProperties;
  defaultTextOverlay: TextOverlay;
  textOverlay?: TextOverlay | null;
  compositeTextImageUrl?: string;

  staticPurpose: ImagePurpose;
  setStaticPurpose: React.Dispatch<React.SetStateAction<ImagePurpose>>;

  productCategory: ProductCategory;
  setProductCategory: React.Dispatch<React.SetStateAction<ProductCategory>>;

  productSize: ProductSize;
  setProductSize: React.Dispatch<React.SetStateAction<ProductSize>>;

  groundingType: GroundingType;
  setGroundingType: React.Dispatch<React.SetStateAction<GroundingType>>;

  sellDirection: SellDirection;
  setSellDirection: React.Dispatch<React.SetStateAction<SellDirection>>;

  bgScene: BgScene;
  setBgScene: React.Dispatch<React.SetStateAction<BgScene>>;

  staticRecommendation: string;
  staticVariants: StaticImageVariant[];
  staticBusy: boolean;

  purposeLabel: Record<ImagePurpose, string>;
  bgSceneLabel: Record<BgScene, string>;

  bgDisplayUrl: string;
  backgroundKeyword: string;
  setBackgroundKeyword: React.Dispatch<React.SetStateAction<string>>;

  canGenerate: boolean;
  isCompositeFresh: boolean;

  onGenerateStaticVariants: () => Promise<void>;
  onSelectStaticVariant: (v: StaticImageVariant) => Promise<void>;

  onUploadImageFilesNew: (files: File[]) => Promise<void> | void;
  onCutoutCurrentBaseToReplace: () => Promise<void> | void;
  onPromoteMaterialToBase: (url: string) => Promise<void> | void;
  onRemoveBaseOrMaterialImage: (url: string) => Promise<void> | void;
  onSyncBaseAndMaterialImagesFromStorage: () => Promise<void> | void;
  onSaveCompositeAsImageUrl: () => Promise<void> | void;
  onSaveCompositeTextImageFromCompositeSlot: () => Promise<void> | void;
  onSaveDraft: () => void | Promise<void>;

  onGenerateBackgroundImage: (keyword: string) => Promise<string>;
  onReplaceBackgroundAndSaveToAiImage: () => Promise<void>;
  onSyncBgImagesFromStorage: () => Promise<void>;
  onSyncTemplateBgImagesFromStorage: () => Promise<void> | void;
  onSyncCompositeImagesFromStorage: () => Promise<void> | void;
  onSyncCompositeTextImagesFromStorage: () => Promise<void> | void;
  onClearBgHistory: () => Promise<void>;
  onRemoveTemplateBgImage?: (url: string) => Promise<void> | void;
  onRemoveAiBgImage?: (url: string) => Promise<void> | void;
  onRemoveCompositeImage?: (url?: string) => Promise<void> | void;
  onRemoveCompositeTextImage?: (url: string) => Promise<void> | void;

  onGenerateAiImage: () => Promise<void>;
  onSyncIdeaImagesFromStorage: () => Promise<void>;
  onClearIdeaHistory: () => void;
  onSyncStoryImagesFromStorage?: () => Promise<void> | void;

  templateBgUrl?: string;
  templateBgUrls?: string[];

  generateTemplateBackground?: () => Promise<string | void>;
  fetchTemplateRecommendations?: () => Promise<TemplateRecommendResultForPanel | void>;
  selectTemplateBackground?: (url: string) => Promise<void> | void;

  setBgImageUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;

  saveDraft: (partial?: Partial<DraftDoc>) => Promise<string | null>;
  showMsg: (s: string) => void;

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

  backgroundScale: number;
  setBackgroundScale: React.Dispatch<React.SetStateAction<number>>;

  backgroundX: number;
  setBackgroundX: React.Dispatch<React.SetStateAction<number>>;

  backgroundY: number;
  setBackgroundY: React.Dispatch<React.SetStateAction<number>>;

  editingStep: "background" | "product" | "shadow";
  setEditingStep: React.Dispatch<
    React.SetStateAction<"background" | "product" | "shadow">
  >;

  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => Promise<void> | void;
  onRedo: () => Promise<void> | void;

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
  ) => Promise<void> | void;

  sizeTemplateType: SizeTemplateType;
  setSizeTemplateType: React.Dispatch<React.SetStateAction<SizeTemplateType>>;

  storyDisplayUrl: string;
  onGenerateStoryImage: () => Promise<void>;
};

function formatYen(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString()}円`;
}

function getDiagnosisImageUrl(d: DraftDoc): string {
  return String(
    d.compositeImageUrl ||
      d.aiImageUrl ||
      d.imageUrl ||
      d.baseImageUrl ||
      d.imageIdeaUrl ||
      ""
  ).trim();
}

function SellCheckBridgeCard(props: {
  d: DraftDoc;
  busy: boolean;
  saveDraft: (partial?: Partial<DraftDoc>) => Promise<string | null>;
  showMsg: (s: string) => void;
}) {
  const { d, busy, saveDraft, showMsg } = props;
  const router = useRouter();

  const sellCheck = d.outcome?.sellCheck;
  const diagnosisImageUrl = getDiagnosisImageUrl(d);

  async function goSellCheck() {
    if (busy) return;

    const existingId = String(d.id ?? "").trim();

    try {
      let draftId = existingId;

      if (!draftId) {
        const savedId = await saveDraft();
        draftId = String(savedId ?? "").trim();
      }

      if (!draftId) {
        showMsg("先に下書きを保存してください");
        return;
      }

      if (!diagnosisImageUrl) {
        showMsg("診断できる画像がありません。合成画像または元画像を用意してください");
        return;
      }

      router.push(`/flow/sell-check?draftId=${encodeURIComponent(draftId)}`);
    } catch (e) {
      console.error(e);
      showMsg("売れる診断への移動に失敗しました");
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black text-white/90">売れる診断</div>
          <div className="mt-1 text-xs text-white/55" style={{ lineHeight: 1.6 }}>
            現在の制作画像を使って、価格・状態・画像の売れやすさを診断します。
          </div>
        </div>

        <button
          type="button"
          onClick={goSellCheck}
          disabled={busy || !diagnosisImageUrl}
          className="rounded-full bg-white px-5 py-2 text-xs font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          この画像で売れる診断
        </button>
      </div>

      {!diagnosisImageUrl ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/55">
          診断対象画像がまだありません。元画像・AI画像・合成画像のいずれかを作成してください。
        </div>
      ) : null}

      {sellCheck ? (
        <div className="mt-3 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="text-xs font-bold text-white/50">診断スコア</div>
              <div className="mt-1 text-3xl font-black text-white">
                {sellCheck.score}
                <span className="ml-1 text-base text-white/55">/100</span>
              </div>
            </div>

            <div className="rounded-full bg-white px-3 py-1 text-sm font-black text-black">
              {sellCheck.rank}
            </div>

            <div className="text-sm font-black text-white/80">
              {sellCheck.action}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <div className="text-xs font-bold text-white/50">推奨価格帯</div>
            <div className="mt-1 text-lg font-black text-white">
              {formatYen(sellCheck.suggestedPriceMin)}〜
              {formatYen(sellCheck.suggestedPriceMax)}
            </div>
          </div>

          {sellCheck.improvements.length > 0 ? (
            <div>
              <div className="text-xs font-bold text-white/50">改善ポイント</div>
              <div className="mt-2 grid gap-2">
                {sellCheck.improvements.slice(0, 3).map((x, i) => (
                  <div
                    key={`${x}-${i}`}
                    className="rounded-xl bg-black/25 px-3 py-2 text-xs text-white/75"
                  >
                    {x}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="text-xs text-white/45">
            最終診断：
            {typeof sellCheck.checkedAt === "number"
              ? new Date(sellCheck.checkedAt).toLocaleString("ja-JP")
              : "記録あり"}
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/55">
          まだ診断結果はありません。診断後、結果はこの下書きに戻って表示されます。
        </div>
      )}
    </div>
  );
}

export default function ImageTabPanel({
  d,
  uid,
  busy,
  serverPlacementMeta,

  cutoutBusy,
  cutoutReason,

  overlayPreviewDataUrl,
  baseCandidates,
  currentSlot,
  formStyle,
  defaultTextOverlay,
  textOverlay = null,
  compositeTextImageUrl = "",

  staticPurpose,
  setStaticPurpose,

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

  staticRecommendation,
  staticVariants,
  staticBusy,

  purposeLabel,
  bgSceneLabel,

  bgDisplayUrl,
  backgroundKeyword,
  setBackgroundKeyword,

  canGenerate,
  isCompositeFresh,

  onGenerateStaticVariants,
  onSelectStaticVariant,

  onUploadImageFilesNew,
  onCutoutCurrentBaseToReplace,
  onPromoteMaterialToBase,
  onRemoveBaseOrMaterialImage,
  onSyncBaseAndMaterialImagesFromStorage,
  onSaveCompositeAsImageUrl,
  onSaveCompositeTextImageFromCompositeSlot,
  onSaveDraft,

  onGenerateBackgroundImage,
  onReplaceBackgroundAndSaveToAiImage,
  onSyncBgImagesFromStorage,
  onSyncTemplateBgImagesFromStorage,
  onSyncCompositeImagesFromStorage,
  onSyncCompositeTextImagesFromStorage,
  onClearBgHistory,
  onRemoveTemplateBgImage,
  onRemoveAiBgImage,
  onRemoveCompositeImage,
  onRemoveCompositeTextImage,

  onGenerateAiImage,
  onSyncIdeaImagesFromStorage,
  onClearIdeaHistory,
  onSyncStoryImagesFromStorage,

  templateBgUrl,
  templateBgUrls,
  generateTemplateBackground,
  fetchTemplateRecommendations,
  selectTemplateBackground,

  setBgImageUrl,
  setD,

  saveDraft,
  showMsg,

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

  backgroundScale,
  setBackgroundScale,
  backgroundX,
  setBackgroundX,
  backgroundY,
  setBackgroundY,

  editingStep,
  setEditingStep,
  canUndo,
  canRedo,
  onUndo,
  onRedo,

  onSavePlacement,

  sizeTemplateType,
  setSizeTemplateType,

  storyDisplayUrl,
  onGenerateStoryImage,
}: Props) {
  void staticPurpose;
  void setStaticPurpose;
  void staticRecommendation;
  void staticVariants;
  void staticBusy;
  void purposeLabel;
  void bgSceneLabel;
  void onGenerateStaticVariants;
  void onSelectStaticVariant;
  void onSyncStoryImagesFromStorage;

  return (
    <div className="flex flex-col gap-3">
      <SellCheckBridgeCard
        d={d}
        busy={busy}
        saveDraft={saveDraft}
        showMsg={showMsg}
      />

      <BaseImagePanel
        d={d}
        uid={uid}
        busy={busy}
        cutoutBusy={cutoutBusy}
        cutoutReason={cutoutReason}
        overlayPreviewDataUrl={overlayPreviewDataUrl}
        baseCandidates={baseCandidates}
        currentSlot={currentSlot}
        formStyle={formStyle}
        defaultTextOverlay={defaultTextOverlay}
        onUploadImageFilesNew={onUploadImageFilesNew}
        onCutoutCurrentBaseToReplace={onCutoutCurrentBaseToReplace}
        onPromoteMaterialToBase={onPromoteMaterialToBase}
        onRemoveBaseOrMaterialImage={onRemoveBaseOrMaterialImage}
        onSyncBaseAndMaterialImagesFromStorage={onSyncBaseAndMaterialImagesFromStorage}
        onSaveCompositeAsImageUrl={onSaveCompositeAsImageUrl}
        onSaveDraft={onSaveDraft}
        showMsg={showMsg}
        setD={setD}
      />

      <BackgroundPanel
        bgDisplayUrl={bgDisplayUrl}
        backgroundKeyword={backgroundKeyword}
        setBackgroundKeyword={setBackgroundKeyword}
        uid={uid}
        busy={busy}
        d={d}
        textOverlay={textOverlay}
        compositeTextImageUrl={compositeTextImageUrl}
        onSaveCompositeTextImageFromCompositeSlot={onSaveCompositeTextImageFromCompositeSlot}
        templateBgUrl={templateBgUrl}
        templateBgUrls={templateBgUrls}
        generateBackgroundImage={onGenerateBackgroundImage}
        replaceBackgroundAndSaveToAiImage={onReplaceBackgroundAndSaveToAiImage}
        syncBgImagesFromStorage={onSyncBgImagesFromStorage}
        syncTemplateBgImagesFromStorage={onSyncTemplateBgImagesFromStorage}
        syncCompositeImagesFromStorage={onSyncCompositeImagesFromStorage}
        syncCompositeTextImagesFromStorage={onSyncCompositeTextImagesFromStorage}
        clearBgHistory={onClearBgHistory}
        onRemoveTemplateBgImage={onRemoveTemplateBgImage}
        onRemoveAiBgImage={onRemoveAiBgImage}
        onRemoveCompositeImage={onRemoveCompositeImage}
        onRemoveCompositeTextImage={onRemoveCompositeTextImage}
        generateTemplateBackground={generateTemplateBackground}
        fetchTemplateRecommendations={fetchTemplateRecommendations}
        selectTemplateBackground={selectTemplateBackground}
        setBgImageUrl={setBgImageUrl}
        setD={setD}
        saveDraft={saveDraft}
        formStyle={formStyle}
        showMsg={showMsg}
        productCategory={productCategory}
        setProductCategory={setProductCategory}
        productSize={productSize}
        setProductSize={setProductSize}
        groundingType={groundingType}
        setGroundingType={setGroundingType}
        sellDirection={sellDirection}
        setSellDirection={setSellDirection}
        bgScene={bgScene}
        setBgScene={setBgScene}
        aiImageUrl={d.aiImageUrl ?? ""}
        isCompositeFresh={isCompositeFresh}
        activePhotoMode={activePhotoMode}
        setActivePhotoMode={setActivePhotoMode}
        placementScale={placementScale}
        setPlacementScale={setPlacementScale}
        placementX={placementX}
        setPlacementX={setPlacementX}
        placementY={placementY}
        setPlacementY={setPlacementY}
        shadowOpacity={shadowOpacity}
        setShadowOpacity={setShadowOpacity}
        shadowBlur={shadowBlur}
        setShadowBlur={setShadowBlur}
        shadowScale={shadowScale}
        setShadowScale={setShadowScale}
        shadowOffsetX={shadowOffsetX}
        setShadowOffsetX={setShadowOffsetX}
        shadowOffsetY={shadowOffsetY}
        setShadowOffsetY={setShadowOffsetY}
        backgroundScale={backgroundScale}
        setBackgroundScale={setBackgroundScale}
        backgroundX={backgroundX}
        setBackgroundX={setBackgroundX}
        backgroundY={backgroundY}
        setBackgroundY={setBackgroundY}
        editingStep={editingStep}
        setEditingStep={setEditingStep}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        onSavePlacement={onSavePlacement}
        serverPlacementMeta={serverPlacementMeta}
      />

      <IdeaImagePanel
        d={d}
        uid={uid}
        busy={busy}
        canGenerate={canGenerate}
        generateAiImage={onGenerateAiImage}
        syncIdeaImagesFromStorage={onSyncIdeaImagesFromStorage}
        clearIdeaHistory={onClearIdeaHistory}
        setD={setD}
        saveDraft={saveDraft}
        showMsg={showMsg}
      />

      <SizeTemplatePanel
        sizeTemplateType={sizeTemplateType}
        setSizeTemplateType={setSizeTemplateType}
        busy={busy}
      />

      <StoryImagePanel
        storyImageUrl={storyDisplayUrl}
        onGenerateStoryImage={onGenerateStoryImage}
        busy={busy}
      />
    </div>
  );
}