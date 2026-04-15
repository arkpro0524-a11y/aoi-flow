// /app/flow/drafts/new/hooks/useDraftEditorController.ts
"use client";

import { useEffect, useMemo } from "react";
import type {
  DraftDoc,
  TextOverlay,
  ProductPhotoMode,
  SizeTemplateType,
} from "@/lib/types/draft";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import useDraftEditorState, {
  getOverlaySourceUrlForPreview,
  type TemplateBgRecommendItem,
} from "./useDraftEditorState";
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
 * - useDraftImageActions 側の返り値を UI 用に正規化する
 * - template 背景専用 state を state.d から local state に同期する
 * - ブランド切替時に template 背景専用 local state も初期化する
 * - TypeScript が null を混ぜないように型ガードを入れる
 *
 * 今回の本質修正
 * - shadow 系 state / setter を controller の return に追加する
 * - savePlacement で shadow 系も保存できるようにする
 * - Firestore 読込時に shadow 系 local state も同期する
 *
 * 今回の追加修正
 * - ④ 合成スロットでの文字プレビュー元画像判定を強化する
 * - currentSlot === "composite" の時は aiImageUrl / compositeImageUrl などを優先する
 * - 既存の他スロット挙動は壊さない
 *
 * 今回のエラー修正
 * - useEffect の依存配列サイズ変更エラーを避けるため、
 *   ④文字プレビュー用 effect の依存配列を固定サイズにする
 * - 依存対象は文字列キーにまとめて useMemo で先に作る
 *
 * 今回の重要修正
 * - 文字プレビュー生成時に「今見ているスロットの overlay」と
 *   「そのスロットに対応する preview source」を厳密に同期させる
 * - imageActions オブジェクト全体ではなく、
 *   renderToCanvasAndGetDataUrlSilent 関数だけを依存対象にする
 * - overlay があるのに preview が消える事故を減らす
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

/**
 * null を確実に除去するための型ガード
 */
function isTemplateBgRecommendItem(
  value: TemplateBgRecommendItem | null
): value is TemplateBgRecommendItem {
  return value !== null;
}

/**
 * 文字プレビューの土台画像を安全に決める関数
 *
 * 重要
 * - base / mood は既存の getOverlaySourceUrlForPreview をそのまま使う
 * - composite のときだけ ④で見る画像を優先する
 * - これにより、④用の文字プレビューが出ない問題を避ける
 */
function resolveOverlayPreviewSourceUrl(
  d: DraftDoc,
  currentSlot: "base" | "mood" | "composite"
): string {
  if (currentSlot === "composite") {
    const compositeCandidates = [
      d.aiImageUrl,
      d.compositeImageUrl,
      d.imageUrl,
      d.stageImageUrl,
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean);

    if (compositeCandidates.length > 0) {
      return compositeCandidates[0];
    }
  }

  return String(getOverlaySourceUrlForPreview(d) || "").trim();
}

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
     * template 系の props もここ経由で受けられるようにしている
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

  /**
   * 文字プレビュー描画関数だけを切り出して依存を安定させる
   */
  const renderOverlayPreview = imageActions.renderToCanvasAndGetDataUrlSilent;

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

    /**
     * template 背景専用 local state も初期化する
     */
    state.setTemplateBgUrl(null);
    state.setTemplateBgUrls([]);
    state.setTemplateBgRecommend([]);
    state.setTemplateBgRecommendReason("");

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

      templateBgUrl: undefined,
      templateBgUrls: [],
      templateBgSelectedId: undefined,
      templateBgRecommendedIds: [],
      templateBgRecommendations: [],

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

    /**
     * template 背景専用 local state も初期化する
     */
    state.setTemplateBgUrl(null);
    state.setTemplateBgUrls([]);
    state.setTemplateBgRecommend([]);
    state.setTemplateBgRecommendReason("");

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

      templateBgUrl: undefined,
      templateBgUrls: [],
      templateBgSelectedId: undefined,
      templateBgRecommendedIds: [],
      templateBgRecommendations: [],

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
   *
   * 今回の修正
   * - shadow 系も partial で受け取って保存する
   */
  async function savePlacement(partial?: {
    scale?: number;
    x?: number;
    y?: number;
    shadowOpacity?: number;
    shadowBlur?: number;
    shadowScale?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
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

    const nextShadowOpacity =
      typeof partial?.shadowOpacity === "number"
        ? partial.shadowOpacity
        : state.shadowOpacity;

    const nextShadowBlur =
      typeof partial?.shadowBlur === "number"
        ? partial.shadowBlur
        : state.shadowBlur;

    const nextShadowScale =
      typeof partial?.shadowScale === "number"
        ? partial.shadowScale
        : state.shadowScale;

    const nextShadowOffsetX =
      typeof partial?.shadowOffsetX === "number"
        ? partial.shadowOffsetX
        : state.shadowOffsetX;

    const nextShadowOffsetY =
      typeof partial?.shadowOffsetY === "number"
        ? partial.shadowOffsetY
        : state.shadowOffsetY;

    const nextMode = partial?.activePhotoMode ?? state.activePhotoMode;

    state.setPlacementScale(nextScale);
    state.setPlacementX(nextX);
    state.setPlacementY(nextY);

    state.setShadowOpacity(nextShadowOpacity);
    state.setShadowBlur(nextShadowBlur);
    state.setShadowScale(nextShadowScale);
    state.setShadowOffsetX(nextShadowOffsetX);
    state.setShadowOffsetY(nextShadowOffsetY);

    state.setActivePhotoMode(nextMode);

    const patch: Partial<DraftDoc> = {
      activePhotoMode: nextMode,
      placement: {
        scale: nextScale,
        x: nextX,
        y: nextY,
        shadow: {
          opacity: nextShadowOpacity,
          blur: nextShadowBlur,
          scale: nextShadowScale,
          offsetX: nextShadowOffsetX,
          offsetY: nextShadowOffsetY,
        },
      },
      shadowOpacity: nextShadowOpacity,
      shadowBlur: nextShadowBlur,
      shadowScale: nextShadowScale,
      shadowOffsetX: nextShadowOffsetX,
      shadowOffsetY: nextShadowOffsetY,
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
   * UI 側は fetchTemplateRecommendations という名前と
   * { topReason, recommended: [{ url, reason, score }] }
   * を期待している。
   *
   * actions 側の返り値を
   * ここで正規化して返す。
   */
  async function fetchTemplateRecommendations(): Promise<TemplateRecommendResultForPanel> {
    const rawResult =
      typeof (imageActions as any).fetchTemplateRecommendations === "function"
        ? await (imageActions as any).fetchTemplateRecommendations()
        : typeof (imageActions as any).recommendTemplateBackgrounds === "function"
          ? await (imageActions as any).recommendTemplateBackgrounds()
          : [];

    const safeList = Array.isArray(rawResult)
      ? rawResult
      : Array.isArray((rawResult as any)?.recommended)
        ? (rawResult as any).recommended
        : [];

    const normalizedRecommended = safeList
      .map((item: any): TemplateBgRecommendItem | null => {
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
      .filter(isTemplateBgRecommendItem);

    const topReason = String(
      (rawResult as any)?.topReason ||
        (rawResult as any)?.picked?.reason ||
        normalizedRecommended[0]?.reason ||
        ""
    ).trim();

    /**
     * controller 正規化後の結果を local state にも反映
     */
    state.setTemplateBgRecommend(normalizedRecommended);
    state.setTemplateBgRecommendReason(topReason);

    return {
      topReason,
      recommended: normalizedRecommended,
    };
  }

  /**
   * ④ 文字プレビュー用の依存キー
   *
   * 重要
   * - useEffect の依存配列サイズを固定するため、
   *   可変の個別 URL 群をここで 1 本の文字列にまとめる
   * - dependency array に直接 URL を増減させない
   */
  const overlayForCurrentSlot = useMemo(() => {
    return (state.d.textOverlayBySlot?.[state.currentSlot] ?? null) as TextOverlay | null;
  }, [state.d.textOverlayBySlot, state.currentSlot]);

  const overlayTextKey = useMemo(() => {
    const overlay = overlayForCurrentSlot;

    if (!overlay) return "";

    const lines = Array.isArray(overlay.lines)
      ? overlay.lines.map((v) => String(v ?? "").trim())
      : [];

    const text = typeof overlay.text === "string" ? overlay.text.trim() : "";

    return JSON.stringify({
      lines,
      text,
      x: overlay.x ?? null,
      y: overlay.y ?? null,
      fontSize: overlay.fontSize ?? null,
      lineHeight: overlay.lineHeight ?? null,
      color: overlay.color ?? null,
      backgroundEnabled: overlay.background?.enabled ?? null,
      backgroundColor: overlay.background?.color ?? null,
      bandOpacity: overlay.bandOpacity ?? null,
    });
  }, [overlayForCurrentSlot]);

  const overlaySourceKey = useMemo(() => {
    return resolveOverlayPreviewSourceUrl(state.d, state.currentSlot);
  }, [state.d, state.currentSlot]);

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

  /**
   * 文字プレビュー生成
   *
   * 重要
   * - 今見ているスロットの overlay が存在し、
   *   そのスロットで使える source 画像がある時だけ生成する
   * - 文字が無い / 画像が無い時だけ preview を消す
   * - render 関数は imageActions 全体ではなく個別関数を依存にする
   */
  useEffect(() => {
    let cancelled = false;

    const overlay = overlayForCurrentSlot;

    const linesText = Array.isArray(overlay?.lines)
      ? overlay.lines.join("\n").trim()
      : "";

    /**
     * lines が無くても text 互換がある場合は拾う
     */
    const legacyText =
      typeof overlay?.text === "string" ? overlay.text.trim() : "";

    const hasText = Boolean(linesText || legacyText);

    /**
     * 文字が無い時はプレビューを消す
     */
    if (!hasText) {
      state.setOverlayPreviewDataUrl(null);
      return;
    }

    /**
     * 該当スロットに対応する土台画像が無い時も消す
     */
    if (!overlaySourceKey) {
      state.setOverlayPreviewDataUrl(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const out = await renderOverlayPreview();

        if (!cancelled) {
          state.setOverlayPreviewDataUrl(out);
        }
      } catch {
        if (!cancelled) {
          state.setOverlayPreviewDataUrl(null);
        }
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    overlayForCurrentSlot,
    overlayTextKey,
    overlaySourceKey,
    renderOverlayPreview,
    state.setOverlayPreviewDataUrl,
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
   *
   * template 背景専用 state もここで同期する
   * 今回の修正:
   * - shadow 系 state も同期する
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

    /**
     * 影パラメータ同期
     * - まず placement.shadow を優先
     * - 無ければ旧 root 値を使う
     */
    const placementShadow = (state.d as any)?.placement?.shadow ?? {};

    const nextShadowOpacity =
      typeof placementShadow.opacity === "number" && Number.isFinite(placementShadow.opacity)
        ? placementShadow.opacity
        : typeof (state.d as any).shadowOpacity === "number" &&
            Number.isFinite((state.d as any).shadowOpacity)
          ? (state.d as any).shadowOpacity
          : undefined;

    if (typeof nextShadowOpacity === "number") {
      state.setShadowOpacity((prev) =>
        prev !== nextShadowOpacity ? nextShadowOpacity : prev
      );
    }

    const nextShadowBlur =
      typeof placementShadow.blur === "number" && Number.isFinite(placementShadow.blur)
        ? placementShadow.blur
        : typeof (state.d as any).shadowBlur === "number" &&
            Number.isFinite((state.d as any).shadowBlur)
          ? (state.d as any).shadowBlur
          : undefined;

    if (typeof nextShadowBlur === "number") {
      state.setShadowBlur((prev) =>
        prev !== nextShadowBlur ? nextShadowBlur : prev
      );
    }

    const nextShadowScale =
      typeof placementShadow.scale === "number" && Number.isFinite(placementShadow.scale)
        ? placementShadow.scale
        : typeof (state.d as any).shadowScale === "number" &&
            Number.isFinite((state.d as any).shadowScale)
          ? (state.d as any).shadowScale
          : undefined;

    if (typeof nextShadowScale === "number") {
      state.setShadowScale((prev) =>
        prev !== nextShadowScale ? nextShadowScale : prev
      );
    }

    const nextShadowOffsetX =
      typeof placementShadow.offsetX === "number" && Number.isFinite(placementShadow.offsetX)
        ? placementShadow.offsetX
        : typeof (state.d as any).shadowOffsetX === "number" &&
            Number.isFinite((state.d as any).shadowOffsetX)
          ? (state.d as any).shadowOffsetX
          : undefined;

    if (typeof nextShadowOffsetX === "number") {
      state.setShadowOffsetX((prev) =>
        prev !== nextShadowOffsetX ? nextShadowOffsetX : prev
      );
    }

    const nextShadowOffsetY =
      typeof placementShadow.offsetY === "number" && Number.isFinite(placementShadow.offsetY)
        ? placementShadow.offsetY
        : typeof (state.d as any).shadowOffsetY === "number" &&
            Number.isFinite((state.d as any).shadowOffsetY)
          ? (state.d as any).shadowOffsetY
          : undefined;

    if (typeof nextShadowOffsetY === "number") {
      state.setShadowOffsetY((prev) =>
        prev !== nextShadowOffsetY ? nextShadowOffsetY : prev
      );
    }

    /**
     * テンプレ背景URL
     */
    const nextTemplateBgUrl =
      typeof state.d.templateBgUrl === "string" ? state.d.templateBgUrl.trim() : "";

    state.setTemplateBgUrl((prev) =>
      (prev ?? "") !== nextTemplateBgUrl ? nextTemplateBgUrl || null : prev
    );

    /**
     * テンプレ背景URL一覧
     */
    const nextTemplateBgUrls = Array.isArray(state.d.templateBgUrls)
      ? state.d.templateBgUrls.map((u) => String(u ?? "").trim()).filter(Boolean)
      : [];

    state.setTemplateBgUrls((prev) =>
      JSON.stringify(prev) !== JSON.stringify(nextTemplateBgUrls) ? nextTemplateBgUrls : prev
    );

    /**
     * テンプレ背景おすすめ一覧
     * - 保存先は templateBgRecommendations を優先
     * - 旧/混在形式でも url / imageUrl のどちらでも吸収
     */
    const nextTemplateBgRecommend = Array.isArray((state.d as any).templateBgRecommendations)
      ? ((state.d as any).templateBgRecommendations as any[])
          .map((item: any): TemplateBgRecommendItem | null => {
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
          .filter(isTemplateBgRecommendItem)
      : [];

    state.setTemplateBgRecommend((prev) =>
      JSON.stringify(prev) !== JSON.stringify(nextTemplateBgRecommend)
        ? nextTemplateBgRecommend
        : prev
    );

    /**
     * テンプレ背景おすすめ理由
     * - 保存先が無ければ 1件目理由を採用
     */
    const nextTemplateBgRecommendReason = String(
      (state.d as any).templateBgRecommendReason ||
        nextTemplateBgRecommend[0]?.reason ||
        ""
    ).trim();

    state.setTemplateBgRecommendReason((prev) =>
      prev !== nextTemplateBgRecommendReason ? nextTemplateBgRecommendReason : prev
    );

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

    /**
     * 今回の修正:
     * shadow 系 state を page.tsx へ返す
     */
    shadowOpacity: state.shadowOpacity,
    shadowBlur: state.shadowBlur,
    shadowScale: state.shadowScale,
    shadowOffsetX: state.shadowOffsetX,
    shadowOffsetY: state.shadowOffsetY,

    templateBgUrl: state.templateBgUrl,
    templateBgUrls: state.templateBgUrls,
    templateBgRecommend: state.templateBgRecommend,
    templateBgRecommendReason: state.templateBgRecommendReason,

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

    /**
     * 今回の修正:
     * shadow 系 setter を page.tsx へ返す
     */
    setShadowOpacity: state.setShadowOpacity,
    setShadowBlur: state.setShadowBlur,
    setShadowScale: state.setShadowScale,
    setShadowOffsetX: state.setShadowOffsetX,
    setShadowOffsetY: state.setShadowOffsetY,

    setTemplateBgUrl: state.setTemplateBgUrl,
    setTemplateBgUrls: state.setTemplateBgUrls,
    setTemplateBgRecommend: state.setTemplateBgRecommend,
    setTemplateBgRecommendReason: state.setTemplateBgRecommendReason,

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
    removeBaseOrMaterialImage: (imageActions as any).removeBaseOrMaterialImage,
    removeTemplateBgImage: (imageActions as any).removeTemplateBgImage,
    removeAiBgImage: (imageActions as any).removeAiBgImage,
    removeCompositeImage: (imageActions as any).removeCompositeImage,
    removeCompositeTextImage: (imageActions as any).removeCompositeTextImage,

    generateStaticVariants: staticOptimization.generateStaticVariants,
    selectStaticVariant: staticOptimization.selectStaticVariant,

    generateCaptions: captionActions.generateCaptions,
    applyIg3ToOverlayOnly: captionActions.applyIg3ToOverlayOnly,

    generateAiImage: imageActions.generateAiImage,
    saveCompositeAsImageUrl: imageActions.saveCompositeAsImageUrl,
    saveCompositeTextImageFromCompositeSlot:
      (imageActions as any).saveCompositeTextImageFromCompositeSlot,
    generateBackgroundImage: imageActions.generateBackgroundImage,
    replaceBackgroundAndSaveToAiImage: imageActions.replaceBackgroundAndSaveToAiImage,
    clearBgHistory: imageActions.clearBgHistory,
    syncBgImagesFromStorage: imageActions.syncBgImagesFromStorage,
    syncBaseAndMaterialImagesFromStorage:
      (imageActions as any).syncBaseAndMaterialImagesFromStorage,
    syncCompositeImagesFromStorage:
      (imageActions as any).syncCompositeImagesFromStorage,
    syncCompositeTextImagesFromStorage:
      (imageActions as any).syncCompositeTextImagesFromStorage,
    syncIdeaImagesFromStorage: imageActions.syncIdeaImagesFromStorage,
    clearIdeaHistory: imageActions.clearIdeaHistory,

    generateTemplateBackground: (imageActions as any).generateTemplateBackground,
    fetchTemplateRecommendations,
    selectTemplateBackground: (imageActions as any).selectTemplateBackground,
    syncTemplateBgImagesFromStorage:
      (imageActions as any).syncTemplateBgImagesFromStorage,

    savePlacement,
    generateStoryImage,
    syncStoryImagesFromStorage:
      (imageActions as any).syncStoryImagesFromStorage,

    syncVideosFromStorage: videoActions.syncVideosFromStorage,
    saveNonAiVideoToDraft: videoActions.saveNonAiVideoToDraft,
    burnVideo: videoActions.burnVideo,

    setPhase,
    handleSelectVento,
    handleSelectRiva,
    handleEnsureDraftId,
  };
}