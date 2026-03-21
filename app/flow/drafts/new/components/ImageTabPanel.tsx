// /app/flow/drafts/new/components/ImageTabPanel.tsx
"use client";

import React from "react";
import StaticOptimizationCard from "./StaticOptimizationCard";
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
 *
 * 今回の修正ポイント
 * - BackgroundPanel へテンプレ背景用 props を追加で流す
 * - これで「テンプレ背景を生成 / おすすめ取得 / 候補選択」が
 *   実体関数まで届くようにする
 */

type BgScene = "studio" | "lifestyle" | "scale" | "detail";
type ImageSlot = "base" | "mood" | "composite";

type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";

/**
 * BackgroundPanel が期待しているおすすめ返り値の形
 * - url
 * - reason
 * - score
 */
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
  d: DraftDoc;
  uid: string | null;
  busy: boolean;

  cutoutBusy: boolean;
  cutoutReason: string;

  overlayPreviewDataUrl: string | null;
  baseCandidates: any[];
  currentSlot: ImageSlot;
  formStyle: React.CSSProperties;
  defaultTextOverlay: TextOverlay;

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

  onUploadImageFilesNew: (files: File[]) => Promise<void>;
  onCutoutCurrentBaseToReplace: () => Promise<void>;
  onPromoteMaterialToBase: (url: string) => Promise<void>;
  onSaveCompositeAsImageUrl: () => Promise<void>;
  onSaveDraft: () => void | Promise<void>;

  onGenerateBackgroundImage: (keyword: string) => Promise<string>;
  onReplaceBackgroundAndSaveToAiImage: () => Promise<void>;
  onSyncBgImagesFromStorage: () => Promise<void>;
  onClearBgHistory: () => Promise<void>;

  onGenerateAiImage: () => Promise<void>;
  onSyncIdeaImagesFromStorage: () => Promise<void>;
  onClearIdeaHistory: () => void;

  /**
   * 今回追加
   * テンプレ背景関連
   */
  generateTemplateBackground?: () => Promise<string | void>;
  fetchTemplateRecommendations?: () => Promise<TemplateRecommendResultForPanel | void>;
  selectTemplateBackground?: (url: string) => Promise<void> | void;

  setBgImageUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;

  saveDraft: (partial?: Partial<DraftDoc>) => Promise<string | null>;
  showMsg: (s: string) => void;

  /**
   * ④ 合成画像タブ内で使う配置調整 props
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

  /**
   * ③ サイズテンプレ
   */
  sizeTemplateType: SizeTemplateType;
  setSizeTemplateType: React.Dispatch<React.SetStateAction<SizeTemplateType>>;

  /**
   * ⑤ ストーリー
   */
  storyDisplayUrl: string;
  onGenerateStoryImage: () => Promise<void>;
};

export default function ImageTabPanel({
  d,
  uid,
  busy,

  cutoutBusy,
  cutoutReason,

  overlayPreviewDataUrl,
  baseCandidates,
  currentSlot,
  formStyle,
  defaultTextOverlay,

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
  onSaveCompositeAsImageUrl,
  onSaveDraft,

  onGenerateBackgroundImage,
  onReplaceBackgroundAndSaveToAiImage,
  onSyncBgImagesFromStorage,
  onClearBgHistory,

  onGenerateAiImage,
  onSyncIdeaImagesFromStorage,
  onClearIdeaHistory,

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
  onSavePlacement,

  sizeTemplateType,
  setSizeTemplateType,

  storyDisplayUrl,
  onGenerateStoryImage,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <StaticOptimizationCard
        staticPurpose={staticPurpose}
        setStaticPurpose={setStaticPurpose}
        bgScene={bgScene}
        setBgScene={setBgScene}
        staticRecommendation={staticRecommendation}
        staticVariants={staticVariants}
        staticBusy={staticBusy}
        purposeLabel={purposeLabel}
        bgSceneLabel={bgSceneLabel}
        onGenerateStaticVariants={onGenerateStaticVariants}
        onSelectStaticVariant={onSelectStaticVariant}
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
        generateBackgroundImage={onGenerateBackgroundImage}
        replaceBackgroundAndSaveToAiImage={onReplaceBackgroundAndSaveToAiImage}
        syncBgImagesFromStorage={onSyncBgImagesFromStorage}
        clearBgHistory={onClearBgHistory}
        /**
         * 今回追加
         * テンプレ背景系の処理を BackgroundPanel に流す
         */
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
        onSavePlacement={onSavePlacement}
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