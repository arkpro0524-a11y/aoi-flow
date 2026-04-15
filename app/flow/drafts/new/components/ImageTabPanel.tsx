//app/flow/drafts/new/components/ImageTabPanel.tsx
"use client";

import React from "react";
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
 * - StaticOptimizationCard の import / 描画を安全に削除
 * - ただし、他の既存機能は削除しない
 * - BackgroundPanel 側の 3ボタンUI と既存背景機能はそのまま活かす
 * - 画像生成まわりの props 構造は崩さない
 *
 * 重要
 * - staticPurpose / staticVariants / staticRecommendation などの props は
 *   いまはこのファイル内では直接使わないが、
 *   親側との整合性を崩さないため Props からは消していない
 * - 将来、親側も整理するときにまとめて削除すればよい
 *
 * 今回の判断
 * - 文字表示の ④ 反映ロジックは BackgroundPanel → ProductPlacementEditor 側で扱う
 * - そのため、このファイルでは不要な追加改造はしない
 * - 既存の橋渡しを壊さないことを最優先にする
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

  /**
   * 以前は StaticOptimizationCard に流していた値
   * 今回は UI から外すが、親との型互換を崩さないため残している
   */
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

  /**
   * 以前は StaticOptimizationCard に流していた値
   * 今回は UI から外すが、親との型互換を崩さないため残している
   */
  staticRecommendation: string;
  staticVariants: StaticImageVariant[];
  staticBusy: boolean;

  /**
   * 以前は StaticOptimizationCard に流していた値
   * 今回は UI から外すが、親との型互換を崩さないため残している
   */
  purposeLabel: Record<ImagePurpose, string>;
  bgSceneLabel: Record<BgScene, string>;

  bgDisplayUrl: string;
  backgroundKeyword: string;
  setBackgroundKeyword: React.Dispatch<React.SetStateAction<string>>;

  canGenerate: boolean;
  isCompositeFresh: boolean;

  /**
   * 以前は StaticOptimizationCard に流していた値
   * 今回は UI から外すが、親との型互換を崩さないため残している
   */
  onGenerateStaticVariants: () => Promise<void>;
  onSelectStaticVariant: (v: StaticImageVariant) => Promise<void>;

  onUploadImageFilesNew: (files: File[]) => Promise<void> | void;
  onCutoutCurrentBaseToReplace: () => Promise<void> | void;
  onPromoteMaterialToBase: (url: string) => Promise<void> | void;
  onSaveCompositeAsImageUrl: () => Promise<void> | void;
  onSaveCompositeTextImageFromCompositeSlot: () => Promise<void> | void;
  onSaveDraft: () => void | Promise<void>;

  onGenerateBackgroundImage: (keyword: string) => Promise<string>;
  onReplaceBackgroundAndSaveToAiImage: () => Promise<void>;
  onSyncBgImagesFromStorage: () => Promise<void>;
  onClearBgHistory: () => Promise<void>;

  onGenerateAiImage: () => Promise<void>;
  onSyncIdeaImagesFromStorage: () => Promise<void>;
  onClearIdeaHistory: () => void;

  /**
   * テンプレ背景の正式な親state
   * - page.tsx → ImageTabPanel → BackgroundPanel で橋渡しする
   */
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

  sizeTemplateType: SizeTemplateType;
  setSizeTemplateType: React.Dispatch<React.SetStateAction<SizeTemplateType>>;

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
  onSaveCompositeAsImageUrl,
  onSaveCompositeTextImageFromCompositeSlot,
  onSaveDraft,

  onGenerateBackgroundImage,
  onReplaceBackgroundAndSaveToAiImage,
  onSyncBgImagesFromStorage,
  onClearBgHistory,

  onGenerateAiImage,
  onSyncIdeaImagesFromStorage,
  onClearIdeaHistory,

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
  onSavePlacement,

  sizeTemplateType,
  setSizeTemplateType,

  storyDisplayUrl,
  onGenerateStoryImage,
}: Props) {
  /**
   * 注意
   * - 下の変数たちは今回このファイルでは使っていない
   * - しかし親側との props 契約を崩さないため、受け取り自体は残している
   * - ESLint / TypeScript の未使用警告対策として void 参照しておく
   */
  void staticPurpose;
  void setStaticPurpose;
  void staticRecommendation;
  void staticVariants;
  void staticBusy;
  void purposeLabel;
  void bgSceneLabel;
  void onGenerateStaticVariants;
  void onSelectStaticVariant;

  return (
    <div className="flex flex-col gap-3">
      {/* =========================
          元画像パネル
          - アップロード
          - 切り抜き
          - ベース画像管理
      ========================= */}
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

      {/* =========================
          背景パネル
          - ここが現在のメインUI
          - 3ボタン用途プリセット
          - テンプレ背景 / AI背景
          - 背景履歴
          - 合成タブ
      ========================= */}
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
  clearBgHistory={onClearBgHistory}
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
  onSavePlacement={onSavePlacement}
/>
      {/* =========================
          使用シーン / イメージ画像
      ========================= */}
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

      {/* =========================
          サイズテンプレ
      ========================= */}
      <SizeTemplatePanel
        sizeTemplateType={sizeTemplateType}
        setSizeTemplateType={setSizeTemplateType}
        busy={busy}
      />

      {/* =========================
          ストーリー画像
      ========================= */}
      <StoryImagePanel
        storyImageUrl={storyDisplayUrl}
        onGenerateStoryImage={onGenerateStoryImage}
        busy={busy}
      />
    </div>
  );
}