// /app/flow/drafts/new/hooks/useDraftEditorController.ts
"use client";

import { useEffect } from "react";
import type {
  DraftDoc,
  TextOverlay,
  ProductPhotoMode,
  SizeTemplateType,
} from "@/lib/types/draft";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import useDraftEditorState, { getOverlaySourceUrlForPreview } from "./useDraftEditorState";
import useDraftPersistence from "./useDraftPersistence";
import useDraftImageActions from "./useDraftImageActions";
import useDraftCaptionActions from "./useDraftCaptionActions";
import useDraftStaticOptimization from "./useDraftStaticOptimization";
import useDraftVideoActions from "./useDraftVideoActions";
import useDraftAuth from "./useDraftAuth";
import useDraftPricing from "./useDraftPricing";

/**
 * この controller の役割
 * - state / persistence / action hooks を束ねる
 * - page.tsx が使いやすい形に加工して返す
 *
 * 今回の修正ポイント
 * - fetchTemplateRecommendations を正式に返す
 * - useDraftImageActions 側の実装名
 *   recommendTemplateBackgrounds
 *   とのズレをここで吸収する
 * - BackgroundPanel が期待している返り値
 *   { topReason, recommended: [{ url, reason, score }] }
 *   にここで正規化する
 */

type Params = {
  id: string | null;
  router: AppRouterInstance;
};

/**
 * BackgroundPanel が期待するおすすめ返り値
 */
type TemplateRecommendResultForPanel = {
  topReason?: string;
  recommended?: Array<{
    url: string;
    reason: string;
    score?: number;
  }>;
};

export default function useDraftEditorController(params: Params) {
  const { id, router } = params;

  const state = useDraftEditorState(id);

  useDraftAuth({
    router,
    uid: state.uid,
    setUid: state.setUid,
    setIdToken: state.setIdToken,
    setLoadBusy: state.setLoadBusy,
    setRecommendReason: state.setRecommendReason,
  });

  useDraftPricing({
    setPricing: state.setPricing,
    setPricingBusy: state.setPricingBusy,
    setPricingError: state.setPricingError,
    setPricingUpdatedAt: state.setPricingUpdatedAt,
  });

  const persistence = useDraftPersistence({
    id,
    router,
    uid: state.uid,

    dRef: state.dRef,
    draftIdRef: state.draftIdRef,
    saveQueueRef: state.saveQueueRef,

    setD: state.setD,
    setDraftId: state.setDraftId,
    setLoadBusy: state.setLoadBusy,

    setBgImageUrl: state.setBgImageUrl,
    setPreviewMode: state.setPreviewMode,
    setSelectedVideoUrl: state.setSelectedVideoUrl,
    setVideoPreviewUrl: state.setVideoPreviewUrl,
    setVideoHistory: state.setVideoHistory,
    setUiMsg: state.setUiMsg,
    setPreviewReason: state.setPreviewReason,
    setNonAiReason: state.setNonAiReason,
    setNonAiPreset: state.setNonAiPreset,
    setNonAiVideoPreviewUrl: state.setNonAiVideoPreviewUrl,
    setNonAiVideoHistory: state.setNonAiVideoHistory,
    setVideoPickerValue: state.setVideoPickerValue,
  });

  const imageActions = useDraftImageActions({
    uid: state.uid,
    draftId: state.draftId,
    d: state.d,
    dRef: state.dRef,
    canvasRef: state.canvasRef,
    inFlightRef: state.inFlightRef,

    currentSlot: state.currentSlot,

    staticPurpose: state.staticPurpose,
    bgScene: state.bgScene,
    backgroundKeyword: state.backgroundKeyword,
    bgBusy: state.bgBusy,
    bgImageUrl: state.bgImageUrl,
    bgDisplayUrl: state.bgDisplayUrl,

    productCategory: state.productCategory,
    productSize: state.productSize,
    groundingType: state.groundingType,
    sellDirection: state.sellDirection,

    /**
     * 既存 state 一式をまとめて渡す
     * template 系の optional props もここ経由で受けられるようにしている
     */
    ...(state as any),

    setD: state.setD,
    setBusy: state.setBusy,
    setCutoutBusy: state.setCutoutBusy,
    setCutoutReason: state.setCutoutReason,
    setBgBusy: state.setBgBusy,
    setBgImageUrl: state.setBgImageUrl,
    setPreviewMode: state.setPreviewMode,
    setPreviewReason: state.setPreviewReason,
    setRightTab: state.setRightTab,
    setCompositeFromBaseUrl: state.setCompositeFromBaseUrl,

    saveDraft: persistence.saveDraft,
    showMsg: persistence.showMsg,
  } as any);

  const captionActions = useDraftCaptionActions({
    uid: state.uid,
    busy: state.busy,
    dRef: state.dRef,
    currentSlot: state.currentSlot,
    inFlightRef: state.inFlightRef,

    setBusy: state.setBusy,
    setD: state.setD,
    setPreviewMode: state.setPreviewMode,
    setPreviewReason: state.setPreviewReason,

    saveDraft: persistence.saveDraft,
    showMsg: persistence.showMsg,
  });

  const staticOptimization = useDraftStaticOptimization({
    idToken: state.idToken,
    dRef: state.dRef,
    staticPurpose: state.staticPurpose,

    setD: state.setD,
    setStaticRecommendation: state.setStaticRecommendation,
    setStaticVariants: state.setStaticVariants,
    setStaticBusy: state.setStaticBusy,

    saveDraft: persistence.saveDraft,
    showMsg: persistence.showMsg,
  });

  const videoActions = useDraftVideoActions({
    uid: state.uid,
    idToken: state.idToken,
    draftId: state.draftId,
    d: state.d,
    dRef: state.dRef,
    currentSlot: state.currentSlot,
    inFlightRef: state.inFlightRef,

    setBusy: state.setBusy,
    setRightTab: state.setRightTab,
    setVideoTab: state.setVideoTab,
    setRecommendReason: state.setRecommendReason,
    setVideoPickerValue: state.setVideoPickerValue,
    setNonAiPreset: state.setNonAiPreset,
    setNonAiReason: state.setNonAiReason,
    setSelectedVideoUrl: state.setSelectedVideoUrl,
    setNonAiVideoPreviewUrl: state.setNonAiVideoPreviewUrl,
    setNonAiVideoHistory: state.setNonAiVideoHistory,
    setBurnReason: state.setBurnReason,
    setD: state.setD,

    saveDraft: persistence.saveDraft,
    showMsg: persistence.showMsg,
  });

  function commitDraftPatch(patch: Partial<DraftDoc>) {
    const next = { ...state.dRef.current, ...patch } as DraftDoc;
    state.dRef.current = next;
    state.setD(next);
    return next;
  }

  async function setPhase(next: "draft" | "ready" | "posted") {
    await persistence.saveDraft({ phase: next } as any);

    if (next === "ready") {
      router.replace("/flow/inbox");
    }

    if (next === "posted") {
      router.replace("/flow/drafts");
    }
  }

  function handleSelectVento() {
    state.setSelectedVideoUrl(null);
    state.setVideoPreviewUrl(null);
    state.setVideoHistory([]);
    state.setBgImageUrl(null);
    state.setPreviewReason("");
    state.setUiMsg("");

    state.setNonAiReason("");
    state.setNonAiPreset(null);
    state.setNonAiVideoPreviewUrl(null);
    state.setNonAiVideoHistory([]);

    state.setUseSceneImageUrl(null);
    state.setUseSceneImageUrls([]);
    state.setStoryImageUrl(null);
    state.setStoryImageUrls([]);

    state.setD((prev) => ({
      ...prev,
      brand: "vento",
      brandId: "vento",
      bgImageUrl: undefined,
      bgImageUrls: [],
      aiImageUrl: undefined,
      videoSource: undefined,
      nonAiVideoUrl: undefined,
      nonAiVideoUrls: [],
      nonAiVideoPreset: undefined,
      useSceneImageUrl: undefined,
      useSceneImageUrls: [],
      imageIdeaUrl: undefined,
      imageIdeaUrls: [],
      storyImageUrl: undefined,
      storyImageUrls: [],
    }));
  }

  function handleSelectRiva() {
    state.setSelectedVideoUrl(null);
    state.setVideoPreviewUrl(null);
    state.setVideoHistory([]);
    state.setBgImageUrl(null);
    state.setPreviewReason("");
    state.setUiMsg("");

    state.setNonAiReason("");
    state.setNonAiPreset(null);
    state.setNonAiVideoPreviewUrl(null);
    state.setNonAiVideoHistory([]);

    state.setUseSceneImageUrl(null);
    state.setUseSceneImageUrls([]);
    state.setStoryImageUrl(null);
    state.setStoryImageUrls([]);

    state.setD((prev) => ({
      ...prev,
      brand: "riva",
      brandId: "riva",
      bgImageUrl: undefined,
      bgImageUrls: [],
      aiImageUrl: undefined,
      videoSource: undefined,
      nonAiVideoUrl: undefined,
      nonAiVideoUrls: [],
      nonAiVideoPreset: undefined,
      useSceneImageUrl: undefined,
      useSceneImageUrls: [],
      imageIdeaUrl: undefined,
      imageIdeaUrls: [],
      storyImageUrl: undefined,
      storyImageUrls: [],
    }));
  }

  async function handleEnsureDraftId() {
    if (!state.draftId) {
      await persistence.saveDraft();
      persistence.showMsg("先に下書きを作成しました");
    } else {
      persistence.showMsg("この下書きはすでに作成済みです");
    }
  }

  /**
   * ① 商品写真の位置・サイズ保存
   */
  async function savePlacement(partial?: {
    scale?: number;
    x?: number;
    y?: number;
    activePhotoMode?: ProductPhotoMode;
  }) {
    if (typeof (imageActions as any).saveProductPlacement === "function") {
      await (imageActions as any).saveProductPlacement(partial);
      return;
    }

    const nextScale =
      typeof partial?.scale === "number" ? partial.scale : state.placementScale;
    const nextX = typeof partial?.x === "number" ? partial.x : state.placementX;
    const nextY = typeof partial?.y === "number" ? partial.y : state.placementY;
    const nextMode = partial?.activePhotoMode ?? state.activePhotoMode;

    state.setPlacementScale(nextScale);
    state.setPlacementX(nextX);
    state.setPlacementY(nextY);
    state.setActivePhotoMode(nextMode);

    const patch: Partial<DraftDoc> = {
      activePhotoMode: nextMode,
      placement: {
        scale: nextScale,
        x: nextX,
        y: nextY,
      },
    };

    commitDraftPatch(patch);
    await persistence.saveDraft(patch);
    persistence.showMsg("配置を保存しました");
  }

  /**
   * ⑤ ストーリー画像生成
   */
  async function generateStoryImage() {
    if (typeof (imageActions as any).generateStoryImage === "function") {
      await (imageActions as any).generateStoryImage();
      return;
    }

    await imageActions.generateAiImage();

    const source =
      String(state.dRef.current.storyImageUrl || "").trim() ||
      String(state.dRef.current.useSceneImageUrl || "").trim() ||
      String(state.dRef.current.imageIdeaUrl || "").trim();

    if (!source) return;

    const nextList = Array.from(
      new Set([
        source,
        ...(Array.isArray(state.storyImageUrls) ? state.storyImageUrls : []),
        ...(Array.isArray(state.dRef.current.storyImageUrls)
          ? state.dRef.current.storyImageUrls
          : []),
      ])
    ).filter(Boolean);

    state.setStoryImageUrl(source);
    state.setStoryImageUrls(nextList);

    const patch: Partial<DraftDoc> = {
      storyImageUrl: source,
      storyImageUrls: nextList,
    };

    commitDraftPatch(patch);
    await persistence.saveDraft(patch);
    persistence.showMsg("ストーリー画像を生成しました");
  }

  /**
   * ③ サイズテンプレ
   */
  async function syncSizeTemplate(next: SizeTemplateType) {
    state.setSizeTemplateType(next);
    const patch: Partial<DraftDoc> = { sizeTemplateType: next };
    commitDraftPatch(patch);
    await persistence.saveDraft(patch);
  }

  /**
   * 今回の修正ポイント
   *
   * useDraftImageActions 側の実装名は
   * - recommendTemplateBackgrounds
   *
   * しかし UI 側は
   * - fetchTemplateRecommendations
   * という名前と
   * - { topReason, recommended: [{ url, reason, score }] }
   * という返り値を期待している
   *
   * そのため controller で名前ズレと返り値ズレを吸収する
   */
  async function fetchTemplateRecommendations(): Promise<TemplateRecommendResultForPanel> {
    const rawList =
      typeof (imageActions as any).recommendTemplateBackgrounds === "function"
        ? await (imageActions as any).recommendTemplateBackgrounds()
        : [];

    const safeList = Array.isArray(rawList) ? rawList : [];

    const normalizedRecommended = safeList
      .map((item: any) => {
        const url = String(item?.url ?? item?.imageUrl ?? "").trim();
        const reason = String(item?.reason ?? "").trim();
        const score =
          typeof item?.score === "number" && Number.isFinite(item.score)
            ? item.score
            : undefined;

        if (!url) return null;

        return {
          url,
          reason,
          score,
        };
      })
      .filter(Boolean) as Array<{
      url: string;
      reason: string;
      score?: number;
    }>;

    return {
      topReason:
        normalizedRecommended.length > 0
          ? String(normalizedRecommended[0]?.reason || "").trim()
          : "",
      recommended: normalizedRecommended,
    };
  }

  useEffect(() => {
    state.dRef.current = state.d;
  }, [state.d, state.dRef]);

  useEffect(() => {
    state.draftIdRef.current = state.draftId;
  }, [state.draftId, state.draftIdRef]);

  useEffect(() => {
    if (state.rightTab !== "video") return;

    const rec = Array.isArray(state.videoPickerValue?.recommended)
      ? state.videoPickerValue.recommended
      : [];

    if (!rec.length) return;

    if (!state.recommendUserLocked && state.recommendAutoEnabled) {
      state.setRecommendReason(`おすすめがあります：${rec.length}件（1位を自動確定します）`);
    } else {
      state.setRecommendReason(
        `おすすめがあります：${rec.length}件（手動選択が優先されています）`
      );
    }
  }, [
    state.rightTab,
    state.videoPickerValue?.recommended,
    state.recommendUserLocked,
    state.recommendAutoEnabled,
    state.setRecommendReason,
  ]);

  useEffect(() => {
    let cancelled = false;

    const slot = state.currentSlot;
    const overlay = (state.d.textOverlayBySlot?.[slot] ?? null) as TextOverlay | null;
    const text = Array.isArray(overlay?.lines) ? overlay.lines.join("\n").trim() : "";

    if (!text) {
      state.setOverlayPreviewDataUrl(null);
      return;
    }

    const srcForOverlay = getOverlaySourceUrlForPreview(state.d);
    if (!srcForOverlay) {
      state.setOverlayPreviewDataUrl(null);
      return;
    }

    const timer = setTimeout(async () => {
      const out = await imageActions.renderToCanvasAndGetDataUrlSilent();

      if (!cancelled) {
        state.setOverlayPreviewDataUrl(out);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    state.currentSlot,
    state.d.textOverlayBySlot,
    state.d.baseImageUrl,
    state.d,
    state.setOverlayPreviewDataUrl,
    imageActions,
  ]);

  useEffect(() => {
    const currentIdeaLikeUrl =
      state.d.useSceneImageUrl || state.d.imageIdeaUrl || state.useSceneImageUrl || "";

    const ok =
      (state.previewMode === "base" && !!state.d.baseImageUrl) ||
      (state.previewMode === "idea" && !!currentIdeaLikeUrl) ||
      (state.previewMode === "composite" && !!state.d.aiImageUrl);

    if (ok && state.previewReason) {
      state.setPreviewReason("");
    }
  }, [
    state.previewMode,
    state.d.baseImageUrl,
    state.d.useSceneImageUrl,
    state.d.imageIdeaUrl,
    state.useSceneImageUrl,
    state.d.aiImageUrl,
    state.previewReason,
    state.setPreviewReason,
  ]);

  useEffect(() => {
    if (state.rightTab !== "video") return;
    if (state.videoTab !== "product") return;

    const head =
      String(state.d.nonAiVideoUrl ?? "").trim() ||
      (Array.isArray(state.d.nonAiVideoUrls) && state.d.nonAiVideoUrls.length
        ? String(state.d.nonAiVideoUrls[0] ?? "").trim()
        : "");

    if (!head) return;

    if (!state.selectedVideoUrl) {
      state.setSelectedVideoUrl(head);
    }

    if (!state.nonAiVideoPreviewUrl) {
      state.setNonAiVideoPreviewUrl(head);
    }
  }, [
    state.rightTab,
    state.videoTab,
    state.d.nonAiVideoUrl,
    state.d.nonAiVideoUrls,
    state.selectedVideoUrl,
    state.nonAiVideoPreviewUrl,
    state.setSelectedVideoUrl,
    state.setNonAiVideoPreviewUrl,
  ]);

  useEffect(() => {
    const burnSrc = String(state.d.nonAiVideoUrl || "").trim();

    if (!burnSrc) {
      state.setBurnReason("焼き込みできません：非AI動画がありません（先に商品動画を作成してください）");
    }
  }, [state.d.nonAiVideoUrl, state.setBurnReason]);

  /**
   * Firestore 読込 → ローカル state 同期
   */
  useEffect(() => {
    const nextPhotoMode = (state.d.activePhotoMode ?? "ai_bg") as ProductPhotoMode;
    state.setActivePhotoMode((prev) => (prev !== nextPhotoMode ? nextPhotoMode : prev));

    const nextPlacement = state.d.placement;
    if (nextPlacement) {
      if (
        typeof nextPlacement.scale === "number" &&
        Number.isFinite(nextPlacement.scale)
      ) {
        state.setPlacementScale((prev) =>
          prev !== nextPlacement.scale ? nextPlacement.scale : prev
        );
      }

      if (
        typeof nextPlacement.x === "number" &&
        Number.isFinite(nextPlacement.x)
      ) {
        state.setPlacementX((prev) =>
          prev !== nextPlacement.x ? nextPlacement.x : prev
        );
      }

      if (
        typeof nextPlacement.y === "number" &&
        Number.isFinite(nextPlacement.y)
      ) {
        state.setPlacementY((prev) =>
          prev !== nextPlacement.y ? nextPlacement.y : prev
        );
      }
    }

    const nextSizeTemplateType = (state.d.sizeTemplateType ?? "simple") as SizeTemplateType;
    state.setSizeTemplateType((prev) =>
      prev !== nextSizeTemplateType ? nextSizeTemplateType : prev
    );

    const nextStoryUrl =
      typeof state.d.storyImageUrl === "string" ? state.d.storyImageUrl.trim() : "";
    state.setStoryImageUrl((prev) =>
      (prev ?? "") !== nextStoryUrl ? nextStoryUrl || null : prev
    );

    const nextStoryUrls = Array.isArray(state.d.storyImageUrls)
      ? state.d.storyImageUrls.map((u) => String(u ?? "").trim()).filter(Boolean)
      : [];

    state.setStoryImageUrls((prev) =>
      JSON.stringify(prev) !== JSON.stringify(nextStoryUrls) ? nextStoryUrls : prev
    );
  }, [state.d]);

  return {
    DEFAULT_TEXT_OVERLAY: state.DEFAULT_TEXT_OVERLAY,

    uid: state.uid,
    idToken: state.idToken,
    busy: state.busy,
    loadBusy: state.loadBusy,
    draftId: state.draftId,
    d: state.d,

    cutoutBusy: state.cutoutBusy,
    cutoutReason: state.cutoutReason,

    backgroundKeyword: state.backgroundKeyword,

    productCategory: state.productCategory,
    productSize: state.productSize,
    groundingType: state.groundingType,
    sellDirection: state.sellDirection,
    bgScene: state.bgScene,

    activePhotoMode: state.activePhotoMode,
    placementScale: state.placementScale,
    placementX: state.placementX,
    placementY: state.placementY,

    useSceneImageUrl: state.useSceneImageUrl,
    useSceneImageUrls: state.useSceneImageUrls,

    sizeTemplateType: state.sizeTemplateType,

    storyImageUrl: state.storyImageUrl,
    storyImageUrls: state.storyImageUrls,
    storyDisplayUrl: state.storyDisplayUrl,

    staticPurpose: state.staticPurpose,
    staticRecommendation: state.staticRecommendation,
    staticVariants: state.staticVariants,
    staticBusy: state.staticBusy,

    recommendReason: state.recommendReason,
    videoPickerValue: state.videoPickerValue,
    recommendUserLocked: state.recommendUserLocked,
    recommendAutoEnabled: state.recommendAutoEnabled,

    rightTab: state.rightTab,
    videoTab: state.videoTab,
    overlayPreviewDataUrl: state.overlayPreviewDataUrl,
    previewMode: state.previewMode,
    previewReason: state.previewReason,
    uiMsg: state.uiMsg,

    videoPreviewUrl: state.videoPreviewUrl,
    videoHistory: state.videoHistory,
    selectedVideoUrl: state.selectedVideoUrl,

    nonAiVideoPreviewUrl: state.nonAiVideoPreviewUrl,
    nonAiVideoHistory: state.nonAiVideoHistory,
    nonAiPreset: state.nonAiPreset,
    nonAiReason: state.nonAiReason,
    nonAiBusy: state.nonAiBusy,
    burnReason: state.burnReason,

    bgImageUrl: state.bgImageUrl,
    bgBusy: state.bgBusy,

    pricing: state.pricing,
    pricingBusy: state.pricingBusy,
    pricingError: state.pricingError,
    pricingUpdatedAt: state.pricingUpdatedAt,

    compositeFromBaseUrl: state.compositeFromBaseUrl,

    setUid: state.setUid,
    setIdToken: state.setIdToken,
    setBusy: state.setBusy,
    setLoadBusy: state.setLoadBusy,
    setDraftId: state.setDraftId,
    setD: state.setD,

    setCutoutBusy: state.setCutoutBusy,
    setCutoutReason: state.setCutoutReason,

    setBackgroundKeyword: state.setBackgroundKeyword,

    setProductCategory: state.setProductCategory,
    setProductSize: state.setProductSize,
    setGroundingType: state.setGroundingType,
    setSellDirection: state.setSellDirection,
    setBgScene: state.setBgScene,

    setActivePhotoMode: state.setActivePhotoMode,
    setPlacementScale: state.setPlacementScale,
    setPlacementX: state.setPlacementX,
    setPlacementY: state.setPlacementY,

    setUseSceneImageUrl: state.setUseSceneImageUrl,
    setUseSceneImageUrls: state.setUseSceneImageUrls,

    setSizeTemplateType: async (next: React.SetStateAction<SizeTemplateType>) => {
      const resolved =
        typeof next === "function"
          ? (next as (prev: SizeTemplateType) => SizeTemplateType)(state.sizeTemplateType)
          : next;
      await syncSizeTemplate(resolved);
    },

    setStoryImageUrl: state.setStoryImageUrl,
    setStoryImageUrls: state.setStoryImageUrls,

    setStaticPurpose: state.setStaticPurpose,
    setStaticRecommendation: state.setStaticRecommendation,
    setStaticVariants: state.setStaticVariants,
    setStaticBusy: state.setStaticBusy,

    setRecommendReason: state.setRecommendReason,
    setVideoPickerValue: state.setVideoPickerValue,
    setRecommendUserLocked: state.setRecommendUserLocked,
    setRecommendAutoEnabled: state.setRecommendAutoEnabled,

    setRightTab: state.setRightTab,
    setVideoTab: state.setVideoTab,
    setOverlayPreviewDataUrl: state.setOverlayPreviewDataUrl,
    setPreviewMode: state.setPreviewMode,
    setPreviewReason: state.setPreviewReason,
    setUiMsg: state.setUiMsg,

    setVideoPreviewUrl: state.setVideoPreviewUrl,
    setVideoHistory: state.setVideoHistory,
    setSelectedVideoUrl: state.setSelectedVideoUrl,

    setNonAiVideoPreviewUrl: state.setNonAiVideoPreviewUrl,
    setNonAiVideoHistory: state.setNonAiVideoHistory,
    setNonAiPreset: state.setNonAiPreset,
    setNonAiReason: state.setNonAiReason,
    setNonAiBusy: state.setNonAiBusy,
    setBurnReason: state.setBurnReason,

    setBgImageUrl: state.setBgImageUrl,
    setBgBusy: state.setBgBusy,

    setPricing: state.setPricing,
    setPricingBusy: state.setPricingBusy,
    setPricingError: state.setPricingError,
    setPricingUpdatedAt: state.setPricingUpdatedAt,

    setCompositeFromBaseUrl: state.setCompositeFromBaseUrl,

    canvasRef: state.canvasRef,
    inFlightRef: state.inFlightRef,
    dRef: state.dRef,
    draftIdRef: state.draftIdRef,

    currentSlot: state.currentSlot,
    baseCandidates: state.baseCandidates,
    isCompositeFresh: state.isCompositeFresh,
    brandLabel: state.brandLabel,
    phaseLabel: state.phaseLabel,
    canGenerate: state.canGenerate,
    bgDisplayUrl: state.bgDisplayUrl,
    displayVideoUrl: state.displayVideoUrl,
    videoCandidates: state.videoCandidates,
    videoCandidatesTop3: state.videoCandidatesTop3,
    costStandard: state.costStandard,
    costHigh: state.costHigh,
    pricingMetaText: state.pricingMetaText,
    isOwner: state.isOwner,

    showMsg: persistence.showMsg,
    commitDraftPatch,
    saveDraft: persistence.saveDraft,

    fetchRecommendPresets: videoActions.fetchRecommendPresets,
    applyTopRecommendation: videoActions.applyTopRecommendation,

    cutoutCurrentBaseToReplace: imageActions.cutoutCurrentBaseToReplace,
    onUploadImageFilesNew: imageActions.onUploadImageFilesNew,
    promoteMaterialToBase: imageActions.promoteMaterialToBase,

    generateStaticVariants: staticOptimization.generateStaticVariants,
    selectStaticVariant: staticOptimization.selectStaticVariant,

    generateCaptions: captionActions.generateCaptions,
    applyIg3ToOverlayOnly: captionActions.applyIg3ToOverlayOnly,

    generateAiImage: imageActions.generateAiImage,
    saveCompositeAsImageUrl: imageActions.saveCompositeAsImageUrl,
    generateBackgroundImage: imageActions.generateBackgroundImage,
    replaceBackgroundAndSaveToAiImage: imageActions.replaceBackgroundAndSaveToAiImage,
    clearBgHistory: imageActions.clearBgHistory,
    syncBgImagesFromStorage: imageActions.syncBgImagesFromStorage,
    syncIdeaImagesFromStorage: imageActions.syncIdeaImagesFromStorage,
    clearIdeaHistory: imageActions.clearIdeaHistory,

    /**
     * テンプレ背景系
     * - generate はそのまま返す
     * - recommend は controller 側で名前と返り値を吸収した関数を返す
     * - select はそのまま返す
     */
    generateTemplateBackground: (imageActions as any).generateTemplateBackground,
    fetchTemplateRecommendations,
    selectTemplateBackground: (imageActions as any).selectTemplateBackground,

    savePlacement,
    generateStoryImage,

    syncVideosFromStorage: videoActions.syncVideosFromStorage,
    saveNonAiVideoToDraft: videoActions.saveNonAiVideoToDraft,
    burnVideo: videoActions.burnVideo,

    setPhase,
    handleSelectVento,
    handleSelectRiva,
    handleEnsureDraftId,
  };
}