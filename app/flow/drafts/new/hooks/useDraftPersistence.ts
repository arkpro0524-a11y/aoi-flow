//app/flow/drafts/new/hooks/useDraftPersistence.ts
"use client";

import { useCallback, useEffect } from "react";
import { auth } from "@/firebase";
import { normalizeDraftImages } from "@/lib/drafts/normalizeDraftImages";
import type {
  DraftDoc,
  NonAiVideoPreset,
  ShortCopy,
  BrandId,
  Phase,
  VideoSettings,
  DraftOutcome,
  SellOutcomeStatus,
} from "@/lib/types/draft";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * 保存・読込専用 hook
 *
 * 今回追加
 * - outcome を保存・読込対象へ追加
 * - 売れる判断OS用の成果データを draft に紐づける
 */

type PreviewMode = "base" | "idea" | "composite";

type VideoPickerValue = {
  selectedId: string | null;
  motion: {
    tempo: "slow" | "normal" | "sharp";
    reveal: "early" | "delayed" | "last";
    intensity: "calm" | "balanced" | "strong";
    attitude: "humble" | "neutral" | "assertive";
    rhythm: "with_pause" | "continuous";
  } | null;
  recommended: any[];
};

type Params = {
  id: string | null;
  router: AppRouterInstance;
  uid: string | null;

  dRef: React.MutableRefObject<DraftDoc>;
  draftIdRef: React.MutableRefObject<string | null>;
  saveQueueRef: React.MutableRefObject<Promise<any>>;

  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;
  setDraftId: React.Dispatch<React.SetStateAction<string | null>>;
  setLoadBusy: React.Dispatch<React.SetStateAction<boolean>>;

  setBgImageUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setPreviewMode: React.Dispatch<React.SetStateAction<PreviewMode>>;
  setSelectedVideoUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setVideoPreviewUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setVideoHistory: React.Dispatch<React.SetStateAction<string[]>>;
  setUiMsg: React.Dispatch<React.SetStateAction<string>>;
  setPreviewReason: React.Dispatch<React.SetStateAction<string>>;
  setNonAiReason: React.Dispatch<React.SetStateAction<string>>;
  setNonAiPreset: React.Dispatch<React.SetStateAction<NonAiVideoPreset | null>>;
  setNonAiVideoPreviewUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setNonAiVideoHistory: React.Dispatch<React.SetStateAction<string[]>>;
  setVideoPickerValue: React.Dispatch<React.SetStateAction<VideoPickerValue>>;
};

function normalizeBrandId(v: unknown): BrandId {
  return v === "riva" ? "riva" : "vento";
}

function normalizePhase(v: unknown): Phase {
  if (v === "ready") return "ready";
  if (v === "posted") return "posted";
  return "draft";
}

function normalizeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeOptionalString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

function normalizeOptionalNumber(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function normalizeOptionalPositiveNumber(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

function normalizeStringUrlArray(input: unknown, limit = 10): string[] {
  if (!Array.isArray(input)) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= limit) break;
  }

  return out;
}

function normalizeOutcomeStatus(v: unknown): SellOutcomeStatus {
  if (v === "listed") return "listed";
  if (v === "sold") return "sold";
  if (v === "unsold") return "unsold";
  if (v === "stopped") return "stopped";
  return "unknown";
}

function normalizeOutcome(raw: unknown): DraftOutcome | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const data = raw as any;
  const status = normalizeOutcomeStatus(data.status);

  const out: DraftOutcome = {
    status,
  };

  const listedPrice = normalizeOptionalPositiveNumber(data.listedPrice);
  const soldPrice = normalizeOptionalPositiveNumber(data.soldPrice);
  const views = normalizeOptionalPositiveNumber(data.views);
  const likes = normalizeOptionalPositiveNumber(data.likes);
  const listedAt = normalizeOptionalPositiveNumber(data.listedAt);
  const soldAt = normalizeOptionalPositiveNumber(data.soldAt);
  const updatedAt = normalizeOptionalPositiveNumber(data.updatedAt);

  if (listedPrice !== undefined) out.listedPrice = listedPrice;
  if (soldPrice !== undefined) out.soldPrice = soldPrice;
  if (views !== undefined) out.views = views;
  if (likes !== undefined) out.likes = likes;
  if (listedAt !== undefined) out.listedAt = listedAt;
  if (soldAt !== undefined) out.soldAt = soldAt;
  if (updatedAt !== undefined) out.updatedAt = updatedAt;

  const platform = normalizeOptionalString(data.platform);
  const memo = normalizeOptionalString(data.memo);

  if (platform) out.platform = platform;
  if (memo) out.memo = memo;

  if (data.sellCheck && typeof data.sellCheck === "object") {
    const sc = data.sellCheck as any;
    const score = normalizeOptionalNumber(sc.score);
    const suggestedPriceMin = normalizeOptionalPositiveNumber(sc.suggestedPriceMin);
    const suggestedPriceMax = normalizeOptionalPositiveNumber(sc.suggestedPriceMax);
    const checkedAt = normalizeOptionalPositiveNumber(sc.checkedAt);

    if (
      score !== undefined &&
      suggestedPriceMin !== undefined &&
      suggestedPriceMax !== undefined
    ) {
      out.sellCheck = {
        score: Math.max(0, Math.min(100, Math.round(score))),
        rank:
          sc.rank === "A" || sc.rank === "B" || sc.rank === "C" || sc.rank === "D"
            ? sc.rank
            : "C",
        action: typeof sc.action === "string" ? sc.action : "",
        suggestedPriceMin,
        suggestedPriceMax,
        improvements: Array.isArray(sc.improvements)
          ? sc.improvements.map((x: unknown) => String(x || "").trim()).filter(Boolean)
          : [],
        reasons: Array.isArray(sc.reasons)
          ? sc.reasons.map((x: unknown) => String(x || "").trim()).filter(Boolean)
          : [],
        learnedSampleCount:
          normalizeOptionalPositiveNumber(sc.learnedSampleCount) ?? 0,
        checkedAt: checkedAt ?? Date.now(),
      };
    }
  }

  return out;
}

function normalizePreset(raw: any): NonAiVideoPreset | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const id = String(raw.id ?? "").trim();
  const major = String(raw.major ?? "").trim();
  const middle = String(raw.middle ?? "").trim();
  const minor = String(raw.minor ?? "").trim();

  if (!id) return undefined;

  return {
    id,
    major,
    middle,
    minor,
    tempo:
      raw.tempo === "slow" || raw.tempo === "normal" || raw.tempo === "sharp"
        ? raw.tempo
        : "normal",
    reveal:
      raw.reveal === "early" || raw.reveal === "delayed" || raw.reveal === "last"
        ? raw.reveal
        : "early",
    intensity:
      raw.intensity === "calm" || raw.intensity === "balanced" || raw.intensity === "strong"
        ? raw.intensity
        : "balanced",
    attitude:
      raw.attitude === "humble" || raw.attitude === "neutral" || raw.attitude === "assertive"
        ? raw.attitude
        : "neutral",
    rhythm:
      raw.rhythm === "with_pause" || raw.rhythm === "continuous"
        ? raw.rhythm
        : "continuous",
  };
}

function classifyUrl(u?: string) {
  if (!u) return "none" as const;
  const s = String(u).trim();
  if (!s) return "none" as const;

  if (!s.includes("/users%2F")) return "other" as const;
  if (s.includes("/generations%2Fimages%2F")) return "idea" as const;
  if (s.includes("%2Fbg%2F")) return "bg" as const;
  if (s.includes("%2Fvideos%2F")) return "video" as const;
  if (/\.jpe?g(\?|$)/i.test(s)) return "base" as const;
  if (/\.png(\?|$)/i.test(s)) return "draftPng" as const;

  return "other" as const;
}

function normalizeShortCopies(raw: unknown, fallbackIg3?: unknown): ShortCopy[] {
  const out: ShortCopy[] = [];

  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];

      if (typeof item === "string") {
        const text = item.trim();
        if (!text) continue;
        out.push({
          id: `legacy-short-${i + 1}`,
          text,
        });
        continue;
      }

      if (item && typeof item === "object") {
        const id = String((item as any).id ?? `short-${i + 1}`).trim();
        const text = String((item as any).text ?? "").trim();
        if (!text) continue;

        out.push({
          id: id || `short-${i + 1}`,
          text,
        });
      }
    }
  }

  if (out.length > 0) {
    return out.slice(0, 3);
  }

  if (Array.isArray(fallbackIg3)) {
    const ig3 = fallbackIg3
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, 3);

    return ig3.map((text, index) => ({
      id: `ig3-${index + 1}`,
      text,
    }));
  }

  return [];
}

function toIg3(shortCopies: ShortCopy[]): string[] {
  return shortCopies.map((x) => String(x.text || "").trim()).filter(Boolean).slice(0, 3);
}

function normalizeVideoSettings(raw: any): VideoSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const seconds = raw.seconds === 10 ? 10 : 5;
  const quality = raw.quality === "high" ? "high" : "standard";
  const template = typeof raw.template === "string" && raw.template.trim() ? raw.template.trim() : "zoom";

  const size =
    raw.size === "1280x720" || raw.size === "960x960" || raw.size === "720x1280"
      ? raw.size
      : "720x1280";

  return {
    seconds,
    quality,
    template,
    size,
  };
}

function buildFormalPatch(next: DraftDoc) {
  const shortCopies = Array.isArray(next.shortCopies) ? next.shortCopies : [];

  const keywords =
    typeof next.keywords === "string"
      ? next.keywords
      : typeof next.keywordsText === "string"
        ? next.keywordsText
        : "";

  const brandId = normalizeBrandId(next.brandId ?? next.brand);

  const igCaption =
    typeof next.igCaption === "string"
      ? next.igCaption
      : typeof next.ig === "string"
        ? next.ig
        : "";

  const xCaption =
    typeof next.xCaption === "string"
      ? next.xCaption
      : typeof next.x === "string"
        ? next.x
        : "";

  const videoSettings = normalizeVideoSettings(
    next.videoSettings ?? {
      seconds: next.videoSeconds,
      quality: next.videoQuality,
      template: next.videoTemplate,
      size: next.videoSize,
    }
  );

  return {
    userId: next.userId,
    brandId,
    phase: normalizePhase(next.phase),

    title: typeof next.title === "string" ? next.title : undefined,
    vision: typeof next.vision === "string" ? next.vision : "",

    keywords,
    igCaption,
    xCaption,
    shortCopies,
    selectedShortCopy: next.selectedShortCopy,

    baseImageUrl: next.baseImageUrl,
    bgImageUrl: next.bgImageUrl,
    aiImageUrl: next.aiImageUrl,
    compositeImageUrl: next.compositeImageUrl,
    videoUrl: next.videoUrl,
    videoSettings,

    textEnabled: next.textEnabled,
    textSize: next.textSize,
    textY: next.textY,
    bandOpacity: next.bandOpacity,

    images: next.images,

    imageIdeaUrl: next.imageIdeaUrl,
    imageIdeaUrls: next.imageIdeaUrls,
    bgImageUrls: next.bgImageUrls,
    nonAiVideoUrl: next.nonAiVideoUrl,
    nonAiVideoUrls: next.nonAiVideoUrls,
    selectedStaticVariantId: next.selectedStaticVariantId,
    selectedStaticPrompt: next.selectedStaticPrompt,
    selectedStaticVariantTitle: next.selectedStaticVariantTitle,
    originMeta: next.originMeta,
    staticImageLogs: next.staticImageLogs,
    staticImageVariants: next.staticImageVariants,
    imagePurpose: next.imagePurpose,
    bgCandidates: next.bgCandidates,
    selectedBgCandidateId: next.selectedBgCandidateId,
    bgPickLogs: next.bgPickLogs,
    bgRefinedPrompt: next.bgRefinedPrompt,
    bgRefinedUrl: next.bgRefinedUrl,
    bgRefineEnabled: next.bgRefineEnabled,

    activePhotoMode: next.activePhotoMode,
    placement: next.placement,
    placementStep: next.placementStep,

    shadowOpacity: next.shadowOpacity,
    shadowBlur: next.shadowBlur,
    shadowScale: next.shadowScale,
    shadowOffsetX: next.shadowOffsetX,
    shadowOffsetY: next.shadowOffsetY,

    backgroundScale: next.backgroundScale,
    backgroundX: next.backgroundX,
    backgroundY: next.backgroundY,

    backgroundSourceTab: next.backgroundSourceTab,
    templateBgUrl: next.templateBgUrl,
    templateBgUrls: next.templateBgUrls,
    templateBgSelectedId: next.templateBgSelectedId,
    templateBgRecommendedIds: next.templateBgRecommendedIds,
    templateBgRecommendations: next.templateBgRecommendations,
    templateBgRecommendReason: next.templateBgRecommendReason,

    useSceneImageUrl: next.useSceneImageUrl,
    useSceneImageUrls: next.useSceneImageUrls,

    sizeTemplateType: next.sizeTemplateType,
    sizeTemplateImageUrl: next.sizeTemplateImageUrl,

    detailImageUrl: next.detailImageUrl,
    detailImageUrls: next.detailImageUrls,

    storyImageUrl: next.storyImageUrl,
    storyImageUrls: next.storyImageUrls,

    productVideo: next.productVideo,
    cmVideo: next.cmVideo,
    motion: next.motion,
    cmApplied: next.cmApplied,

    outcome: next.outcome,

    brand: brandId,
    keywordsText: keywords,
    memo: next.memo,
    ig: igCaption,
    x: xCaption,
    ig3: toIg3(shortCopies),
    imageUrl: next.imageUrl,
    imageSource: next.imageSource,
    textOverlayBySlot: next.textOverlayBySlot,
    videoSource: next.videoSource,
    nonAiVideoPreset: next.nonAiVideoPreset,
    videoUrls: next.videoUrls,
    videoTaskId: next.videoTaskId,
    videoStatus: next.videoStatus,
    videoSeconds: next.videoSeconds,
    videoQuality: next.videoQuality,
    videoTemplate: next.videoTemplate,
    videoSize: next.videoSize,
    videoPersona: next.videoPersona,
    videoEngine: next.videoEngine,
    videoBurnedUrl: next.videoBurnedUrl,
    videoBurnedAt: next.videoBurnedAt,
    videoTextOverlay: next.videoTextOverlay,
  };
}

export default function useDraftPersistence(params: Params) {
  const {
    id,
    router,
    uid,

    dRef,
    draftIdRef,
    saveQueueRef,

    setD,
    setDraftId,
    setLoadBusy,

    setBgImageUrl,
    setPreviewMode,
    setSelectedVideoUrl,
    setVideoPreviewUrl,
    setVideoHistory,
    setUiMsg,
    setPreviewReason,
    setNonAiReason,
    setNonAiPreset,
    setNonAiVideoPreviewUrl,
    setNonAiVideoHistory,
    setVideoPickerValue,
  } = params;

  const showMsg = useCallback(
    (s: string) => {
      setUiMsg(s);
    },
    [setUiMsg]
  );

  function enqueueSave<T>(job: () => Promise<T>): Promise<T> {
    const next = saveQueueRef.current.then(job);
    saveQueueRef.current = next.catch(() => null);
    return next;
  }

  const saveDraft = useCallback(
    async (partial?: Partial<DraftDoc>): Promise<string | null> => {
      return enqueueSave(async () => {
        const u = auth.currentUser;

        if (!u?.uid) {
          showMsg("ログイン確認中です（保存できません）");
          return null;
        }

        const token = await u.getIdToken(true);

        const base = dRef.current;
        const next: DraftDoc = {
          ...base,
          ...(partial ?? {}),
          userId: u.uid,
        };

        const payload = buildFormalPatch(next);
        const currentDraftId = draftIdRef.current;

        const res = await fetch("/api/drafts/save", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            draftId: currentDraftId,
            patch: payload,
          }),
        });

        const j = await res.json().catch(() => ({}));

        if (!res.ok || !j?.ok) {
          throw new Error(j?.error || `save failed (${res.status})`);
        }

        const savedId = String(j.draftId || "").trim();
        if (!savedId) {
          throw new Error("draftId missing from API response");
        }

        if (!currentDraftId) {
          draftIdRef.current = savedId;
          setDraftId(savedId);

          if (!id) {
            router.replace(`/flow/drafts/new?id=${encodeURIComponent(savedId)}`);
          }
        }

        dRef.current = next;
        setD(next);

        return savedId;
      });
    },
    [dRef, draftIdRef, id, router, setD, setDraftId, showMsg]
  );

  useEffect(() => {
    if (!uid) return;

    setSelectedVideoUrl(null);
    setVideoPreviewUrl(null);
    setVideoHistory([]);
    setUiMsg("");
    setPreviewReason("");

    setNonAiReason("");
    setNonAiPreset(null);
    setNonAiVideoPreviewUrl(null);
    setNonAiVideoHistory([]);

    (async () => {
      setLoadBusy(true);

      try {
        if (!id) {
          setDraftId(null);
          setD((prev) => ({
            ...prev,
            userId: uid,
          }));
          return;
        }

        const token = await auth.currentUser?.getIdToken(true);
        if (!token) throw new Error("no token");

        const r = await fetch("/api/drafts/get", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ draftId: id }),
        });

        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) {
          throw new Error(j?.error || "get draft failed");
        }

        const data = (j.data || {}) as any;
        const normalized = normalizeDraftImages(data);

        const brandId = normalizeBrandId(data.brandId ?? data.brand);
        const phase = normalizePhase(data.phase);
        const vision = normalizeString(data.vision);

        const keywords =
          typeof data.keywords === "string"
            ? data.keywords
            : typeof data.keywordsText === "string"
              ? data.keywordsText
              : "";

        const igCaption =
          typeof data.igCaption === "string"
            ? data.igCaption
            : typeof data.ig === "string"
              ? data.ig
              : typeof data.caption_final === "string"
                ? data.caption_final
                : "";

        const xCaption =
          typeof data.xCaption === "string"
            ? data.xCaption
            : typeof data.x === "string"
              ? data.x
              : "";

        const shortCopies = normalizeShortCopies(data.shortCopies, data.ig3);

        const title =
          normalizeOptionalString(data.title) ??
          normalizeOptionalString(data.memo) ??
          normalizeOptionalString(igCaption) ??
          normalizeOptionalString(vision);

        let baseImageUrl = normalizeOptionalString(data.baseImageUrl);
        let aiImageUrl = normalizeOptionalString(data.aiImageUrl);
        let imageIdeaUrl = normalizeOptionalString(data.imageIdeaUrl);
        let bgImageUrlSingle = normalizeOptionalString(data.bgImageUrl);
        const compositeImageUrl = normalizeOptionalString(data.compositeImageUrl);
        const imageUrl = normalizeOptionalString(data.imageUrl);

        if (!imageIdeaUrl && classifyUrl(aiImageUrl) === "idea") {
          imageIdeaUrl = aiImageUrl;
          aiImageUrl = undefined;
        }

        if (!bgImageUrlSingle && classifyUrl(imageUrl) === "bg") {
          bgImageUrlSingle = imageUrl;
        }

        if (!baseImageUrl && classifyUrl(imageUrl) === "base") {
          baseImageUrl = imageUrl;
        }

        const bgImageUrls = normalizeStringUrlArray(data.bgImageUrls, 10);

        const videoSettings =
          normalizeVideoSettings(data.videoSettings) ??
          normalizeVideoSettings({
            seconds: data.videoSeconds,
            quality: data.videoQuality,
            template: data.videoTemplate,
            size: data.videoSize,
          });

        const legacyVideoUrls = normalizeStringUrlArray(data.videoUrls, 10);
        const legacyVideoUrl = normalizeOptionalString(data.videoUrl);

        const nonAiVideoUrls0 = normalizeStringUrlArray(data.nonAiVideoUrls, 10);
        const nonAiVideoUrl0 = normalizeOptionalString(data.nonAiVideoUrl);

        const legacyHead = nonAiVideoUrl0 || legacyVideoUrl || "";

        const nonAiVideoUrls =
          nonAiVideoUrls0.length > 0
            ? nonAiVideoUrls0
            : legacyVideoUrls.length > 0
              ? legacyVideoUrls
              : [];

        const nonAiVideoUrl =
          nonAiVideoUrl0 ||
          legacyHead ||
          (nonAiVideoUrls.length ? nonAiVideoUrls[0] : undefined);

        const nonAiVideoPreset = normalizePreset(data.nonAiVideoPreset);

        const imageSource: DraftDoc["imageSource"] =
          data.imageSource === "ai" ||
          data.imageSource === "composite" ||
          data.imageSource === "upload"
            ? data.imageSource
            : compositeImageUrl
              ? "composite"
              : baseImageUrl
                ? "upload"
                : aiImageUrl
                  ? "ai"
                  : "upload";

        const nextDraft: DraftDoc = {
          ...normalized,

          id,
          userId: uid,

          brandId,
          brand: brandId,
          phase,

          title,
          vision,

          keywords,
          keywordsText: keywords,
          memo: normalizeString(data.memo),

          igCaption,
          xCaption,
          shortCopies,
          selectedShortCopy: normalizeOptionalString(data.selectedShortCopy),

          ig: igCaption,
          x: xCaption,
          ig3: toIg3(shortCopies),

          baseImageUrl,
          bgImageUrl: bgImageUrlSingle,
          stageImageUrl: normalizeOptionalString(data.stageImageUrl),
          compositeImageUrl,

          aiImageUrl,
          imageIdeaUrl,
          imageIdeaUrls: normalizeStringUrlArray(data.imageIdeaUrls, 10),
          bgImageUrls,

          imageUrl,
          imageSource,

          images:
            data.images ?? {
              primary: baseImageUrl
                ? {
                    id: "legacy-primary",
                    url: baseImageUrl,
                    createdAt: Date.now(),
                    role: "product",
                  }
                : null,
              materials: [],
            },

          imagePurpose:
            data.imagePurpose === "branding" ||
            data.imagePurpose === "trust" ||
            data.imagePurpose === "story"
              ? data.imagePurpose
              : "sales",

          staticImageVariants: Array.isArray(data.staticImageVariants)
            ? data.staticImageVariants
            : [],
          staticImageLogs: Array.isArray(data.staticImageLogs) ? data.staticImageLogs : [],

          selectedStaticVariantId: normalizeOptionalString(data.selectedStaticVariantId),
          selectedStaticPrompt: normalizeOptionalString(data.selectedStaticPrompt),
          selectedStaticVariantTitle: normalizeOptionalString(data.selectedStaticVariantTitle),

          bgCandidates: Array.isArray(data.bgCandidates) ? data.bgCandidates : [],
          selectedBgCandidateId: normalizeOptionalString(data.selectedBgCandidateId),
          bgPickLogs: Array.isArray(data.bgPickLogs) ? data.bgPickLogs : [],

          bgRefinedPrompt: normalizeOptionalString(data.bgRefinedPrompt),
          bgRefinedUrl: normalizeOptionalString(data.bgRefinedUrl),
          bgRefineEnabled: data.bgRefineEnabled === true,

          originMeta:
            typeof data.originMeta === "object" && data.originMeta
              ? data.originMeta
              : undefined,

          activePhotoMode: data.activePhotoMode === "template" ? "template" : "ai_bg",
          placement: data.placement ?? undefined,
          placementStep:
            data.placementStep === "background" ||
            data.placementStep === "product" ||
            data.placementStep === "shadow"
              ? data.placementStep
              : undefined,

          shadowOpacity: normalizeOptionalNumber(data.shadowOpacity),
          shadowBlur: normalizeOptionalNumber(data.shadowBlur),
          shadowScale: normalizeOptionalNumber(data.shadowScale),
          shadowOffsetX: normalizeOptionalNumber(data.shadowOffsetX),
          shadowOffsetY: normalizeOptionalNumber(data.shadowOffsetY),

          backgroundScale: normalizeOptionalNumber(data.backgroundScale),
          backgroundX: normalizeOptionalNumber(data.backgroundX),
          backgroundY: normalizeOptionalNumber(data.backgroundY),

          backgroundSourceTab:
            data.backgroundSourceTab === "template_bg" ||
            data.backgroundSourceTab === "ai_bg"
              ? data.backgroundSourceTab
              : undefined,

          templateBgUrl: normalizeOptionalString(data.templateBgUrl),
          templateBgUrls: normalizeStringUrlArray(data.templateBgUrls, 20),
          templateBgSelectedId: normalizeOptionalString(data.templateBgSelectedId),
          templateBgRecommendedIds: Array.isArray(data.templateBgRecommendedIds)
            ? data.templateBgRecommendedIds
                .map((x: unknown) => String(x || "").trim())
                .filter(Boolean)
            : undefined,
          templateBgRecommendations: Array.isArray(data.templateBgRecommendations)
            ? data.templateBgRecommendations
            : undefined,
          templateBgRecommendReason: normalizeOptionalString(data.templateBgRecommendReason),

          useSceneImageUrl: normalizeOptionalString(data.useSceneImageUrl),
          useSceneImageUrls: normalizeStringUrlArray(data.useSceneImageUrls, 10),

          sizeTemplateType: data.sizeTemplateType,
          sizeTemplateImageUrl: normalizeOptionalString(data.sizeTemplateImageUrl),

          detailImageUrl: normalizeOptionalString(data.detailImageUrl),
          detailImageUrls: normalizeStringUrlArray(data.detailImageUrls, 10),

          storyImageUrl: normalizeOptionalString(data.storyImageUrl),
          storyImageUrls: normalizeStringUrlArray(data.storyImageUrls, 10),

          textEnabled: typeof data.textEnabled === "boolean" ? data.textEnabled : true,
          textSize: typeof data.textSize === "number" ? data.textSize : 44,
          textY: typeof data.textY === "number" ? data.textY : 80,
          bandOpacity: typeof data.bandOpacity === "number" ? data.bandOpacity : 0.45,

          textOverlayBySlot:
            data.textOverlayBySlot ?? {
              base: undefined,
              mood: undefined,
              composite: undefined,
            },

          videoUrl: legacyVideoUrl,
          videoSettings,

          videoUrls: legacyVideoUrls,
          videoTaskId: normalizeOptionalString(data.videoTaskId),
          videoStatus:
            data.videoStatus === "queued" ||
            data.videoStatus === "running" ||
            data.videoStatus === "done" ||
            data.videoStatus === "failed" ||
            data.videoStatus === "succeeded"
              ? data.videoStatus
              : "idle",

          videoSeconds: videoSettings?.seconds ?? 5,
          videoQuality: videoSettings?.quality ?? "standard",
          videoTemplate: videoSettings?.template ?? "zoom",
          videoSize: videoSettings?.size ?? "720x1280",

          videoPersona: data.videoPersona ?? undefined,
          videoEngine:
            data.videoEngine === "runway" || data.videoEngine === "nonai"
              ? data.videoEngine
              : undefined,
          videoSource:
            data.videoSource === "runway" || data.videoSource === "nonai"
              ? data.videoSource
              : nonAiVideoUrl
                ? "nonai"
                : undefined,

          nonAiVideoUrl,
          nonAiVideoUrls,
          nonAiVideoPreset,

          videoBurnedUrl: normalizeOptionalString(data.videoBurnedUrl),
          videoBurnedAt: data.videoBurnedAt,
          videoTextOverlay: data.videoTextOverlay,

          productVideo: data.productVideo ?? undefined,
          cmVideo: data.cmVideo ?? undefined,
          motion: data.motion ?? undefined,
          cmApplied: data.cmApplied,

          outcome: normalizeOutcome(data.outcome),

          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };

        setD(nextDraft);
        dRef.current = nextDraft;
        draftIdRef.current = id;
        setDraftId(id);

        if (baseImageUrl) {
          setPreviewMode("base");
        } else if (imageIdeaUrl) {
          setPreviewMode("idea");
        } else if (aiImageUrl) {
          setPreviewMode("composite");
        } else {
          setPreviewMode("base");
        }

        const initialBg = bgImageUrlSingle ?? (bgImageUrls.length ? bgImageUrls[0] : null);
        setBgImageUrl(initialBg);

        setNonAiPreset(nonAiVideoPreset ?? null);

        setVideoPickerValue(
          nonAiVideoPreset
            ? {
                selectedId: nonAiVideoPreset.id,
                motion: {
                  tempo: nonAiVideoPreset.tempo,
                  reveal: nonAiVideoPreset.reveal,
                  intensity: nonAiVideoPreset.intensity,
                  attitude: nonAiVideoPreset.attitude,
                  rhythm: nonAiVideoPreset.rhythm,
                },
                recommended: [],
              }
            : {
                selectedId: null,
                motion: null,
                recommended: [],
              }
        );

        setNonAiVideoHistory(nonAiVideoUrls);

        const legacyRunwayHead = (() => {
          const list: string[] = [];
          if (legacyVideoUrl) list.push(legacyVideoUrl);
          if (legacyVideoUrls.length) list.push(...legacyVideoUrls);

          const uniq: string[] = [];
          const seen = new Set<string>();

          for (const u of list) {
            const s = String(u || "").trim();
            if (!s) continue;
            if (seen.has(s)) continue;
            seen.add(s);
            uniq.push(s);
          }

          return uniq.length ? uniq[0] : "";
        })();

        if (nonAiVideoUrl) {
          setNonAiVideoPreviewUrl(nonAiVideoUrl);
        } else if (nonAiVideoUrls.length) {
          setNonAiVideoPreviewUrl(nonAiVideoUrls[0]);
        } else if (legacyRunwayHead) {
          setNonAiVideoPreviewUrl(legacyRunwayHead);
        } else {
          setNonAiVideoPreviewUrl(null);
        }

        const head =
          String(nonAiVideoUrl ?? "").trim() ||
          (nonAiVideoUrls.length ? String(nonAiVideoUrls[0] ?? "").trim() : "") ||
          legacyRunwayHead;

        if (head) {
          setSelectedVideoUrl(head);
        }
      } finally {
        setLoadBusy(false);
      }
    })();
  }, [
    uid,
    id,
    dRef,
    draftIdRef,
    setD,
    setDraftId,
    setLoadBusy,
    setBgImageUrl,
    setPreviewMode,
    setSelectedVideoUrl,
    setVideoPreviewUrl,
    setVideoHistory,
    setUiMsg,
    setPreviewReason,
    setNonAiReason,
    setNonAiPreset,
    setNonAiVideoPreviewUrl,
    setNonAiVideoHistory,
    setVideoPickerValue,
  ]);

  return {
    saveDraft,
    showMsg,
  };
}