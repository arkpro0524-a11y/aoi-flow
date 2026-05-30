// /app/api/drafts/get/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminDb } from "@/firebaseAdmin";

/**
 * AOI FLOW
 * draft 読込API
 *
 * このAPIの役割
 * - draft を取得する
 * - 所有者チェックを行う
 * - 旧保存データをある程度ここで吸収して返す
 * - フロント側の読込を安定させる
 *
 * 今回の重要修正
 * - brand / brandId を吸収
 * - keywords / keywordsText を吸収
 * - ig / x / ig3 と igCaption / xCaption / shortCopies を吸収
 * - null / undefined / 変な型をある程度整える
 * - 画像・動画の代表URLを最低限そろえる
 * - テンプレ背景保存項目を安全に吸収する
 *
 * 注意
 * - ここで「意味を変える大改造」はしない
 * - UI初期化の最終判断は hook 側に残す
 * - ただし、読込時に崩れやすいデータはここで整えて返す
 */

/* -------------------------------------------------- */
/* 小関数 */
/* -------------------------------------------------- */

type BrandId = "vento" | "riva";
type Phase = "draft" | "ready" | "posted";
type BackgroundSourceTab = "template_bg" | "ai_bg";

function normalizeBrandId(v: unknown): BrandId {
  return v === "riva" ? "riva" : "vento";
}

function normalizePhase(v: unknown): Phase {
  if (v === "ready") return "ready";
  if (v === "posted") return "posted";
  return "draft";
}

function normalizeBackgroundSourceTab(v: unknown): BackgroundSourceTab {
  return v === "template_bg" ? "template_bg" : "ai_bg";
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asOptionalString(v: unknown): string | undefined {
  const s = asTrimmedString(v);
  return s ? s : undefined;
}

function normalizeStringArray(input: unknown, limit = 10): string[] {
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

function normalizeShortCopies(raw: unknown, fallbackIg3?: unknown) {
  const out: Array<{ id: string; text: string }> = [];

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
        const id = asTrimmedString((item as any).id) || `short-${i + 1}`;
        const text = asTrimmedString((item as any).text);

        if (!text) continue;

        out.push({
          id,
          text,
        });
      }
    }
  }

  if (out.length > 0) {
    return out.slice(0, 3);
  }

  if (Array.isArray(fallbackIg3)) {
    return fallbackIg3
      .map((x, index) => {
        const text = asTrimmedString(x);
        if (!text) return null;

        return {
          id: `ig3-${index + 1}`,
          text,
        };
      })
      .filter(Boolean)
      .slice(0, 3) as Array<{ id: string; text: string }>;
  }

  return [];
}

function toIg3(shortCopies: Array<{ id: string; text: string }>): string[] {
  return shortCopies
    .map((x) => asTrimmedString(x.text))
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeVideoSettings(raw: any) {
  if (!raw || typeof raw !== "object") return undefined;

  const seconds = raw.seconds === 10 ? 10 : 5;
  const quality = raw.quality === "high" ? "high" : "standard";
  const template =
    typeof raw.template === "string" && raw.template.trim()
      ? raw.template.trim()
      : "zoom";

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

function normalizeImages(raw: unknown, baseImageUrl?: string) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const primaryRaw = (raw as any).primary;
    const materialsRaw = (raw as any).materials;

    const primary =
      primaryRaw && typeof primaryRaw === "object"
        ? {
            id: asTrimmedString(primaryRaw.id) || "primary",
            url: asTrimmedString(primaryRaw.url),
            createdAt:
              typeof primaryRaw.createdAt === "number" && Number.isFinite(primaryRaw.createdAt)
                ? primaryRaw.createdAt
                : Date.now(),
            role: asTrimmedString(primaryRaw.role) || "product",
          }
        : null;

    const materials = Array.isArray(materialsRaw)
      ? materialsRaw
          .map((item: any, index: number) => {
            if (typeof item === "string") {
              const url = item.trim();
              if (!url) return null;

              return {
                id: `material-${index + 1}`,
                url,
                createdAt: Date.now(),
                role: "product",
              };
            }

            if (item && typeof item === "object") {
              const url = asTrimmedString(item.url);
              if (!url) return null;

              return {
                id: asTrimmedString(item.id) || `material-${index + 1}`,
                url,
                createdAt:
                  typeof item.createdAt === "number" && Number.isFinite(item.createdAt)
                    ? item.createdAt
                    : Date.now(),
                role: asTrimmedString(item.role) || "product",
              };
            }

            return null;
          })
          .filter(Boolean)
      : [];

    return {
      primary:
        primary && primary.url
          ? primary
          : baseImageUrl
            ? {
                id: "legacy-primary",
                url: baseImageUrl,
                createdAt: Date.now(),
                role: "product",
              }
            : null,
      materials,
    };
  }

  return {
    primary: baseImageUrl
      ? {
          id: "legacy-primary",
          url: baseImageUrl,
          createdAt: Date.now(),
          role: "product",
        }
      : null,
    materials: [],
  };
}

function normalizeTemplateBgRecommendations(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const id = asTrimmedString((item as any).id);
      const reason = asTrimmedString((item as any).reason);
      const scoreRaw = (item as any).score;
      const score =
        typeof scoreRaw === "number" && Number.isFinite(scoreRaw)
          ? scoreRaw
          : Number.isFinite(Number(scoreRaw))
            ? Number(scoreRaw)
            : 0;

      if (!id) return null;

      return {
        id,
        score,
        reason,
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

/* -------------------------------------------------- */
/* 本体 */
/* -------------------------------------------------- */

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);

    const body = (await req.json().catch(() => ({}))) as {
      draftId?: unknown;
    };

    const draftId =
      typeof body.draftId === "string" && body.draftId.trim()
        ? body.draftId.trim()
        : "";

    if (!draftId) {
      return NextResponse.json(
        { ok: false, error: "draftId is required" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const ref = db.collection("drafts").doc(draftId);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: "draft not found" },
        { status: 404 }
      );
    }

    const raw = snap.data() || {};

    if (String(raw.userId || "") !== user.uid) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

    const brandId = normalizeBrandId(raw.brandId ?? raw.brand);
    const phase = normalizePhase(raw.phase);

    const vision = asString(raw.vision);

    const keywords =
      typeof raw.keywords === "string"
        ? raw.keywords
        : typeof raw.keywordsText === "string"
          ? raw.keywordsText
          : "";

    const igCaption =
      typeof raw.igCaption === "string"
        ? raw.igCaption
        : typeof raw.ig === "string"
          ? raw.ig
          : typeof raw.caption_final === "string"
            ? raw.caption_final
            : "";

    const xCaption =
      typeof raw.xCaption === "string"
        ? raw.xCaption
        : typeof raw.x === "string"
          ? raw.x
          : "";

    const shortCopies = normalizeShortCopies(raw.shortCopies, raw.ig3);

    const baseImageUrl = asOptionalString(raw.baseImageUrl);
    const bgImageUrl = asOptionalString(raw.bgImageUrl);
    const aiImageUrl = asOptionalString(raw.aiImageUrl);
    const compositeImageUrl = asOptionalString(raw.compositeImageUrl);
    const imageIdeaUrl = asOptionalString(raw.imageIdeaUrl);

    const imageUrl =
      asOptionalString(raw.imageUrl) ??
      aiImageUrl ??
      compositeImageUrl ??
      baseImageUrl;

    const bgImageUrls = normalizeStringArray(raw.bgImageUrls, 10);
    const imageIdeaUrls = normalizeStringArray(raw.imageIdeaUrls, 10);

    const videoUrl = asOptionalString(raw.videoUrl);
    const videoUrls = normalizeStringArray(raw.videoUrls, 10);

    const nonAiVideoUrl = asOptionalString(raw.nonAiVideoUrl);
    const nonAiVideoUrls = normalizeStringArray(raw.nonAiVideoUrls, 10);

    const videoSettings =
      normalizeVideoSettings(raw.videoSettings) ??
      normalizeVideoSettings({
        seconds: raw.videoSeconds,
        quality: raw.videoQuality,
        template: raw.videoTemplate,
        size: raw.videoSize,
      });

    // -------------------------
    // テンプレ背景系
    // -------------------------
    const backgroundSourceTab = normalizeBackgroundSourceTab(raw.backgroundSourceTab);

    const templateBgUrl = asOptionalString(raw.templateBgUrl);
    const templateBgUrls = normalizeStringArray(raw.templateBgUrls, 30);
    const templateBgSelectedId = asOptionalString(raw.templateBgSelectedId);
    const templateBgRecommendedIds = normalizeStringArray(raw.templateBgRecommendedIds, 10);
    const templateBgRecommendations = normalizeTemplateBgRecommendations(
      raw.templateBgRecommendations
    );

    const normalizedData = {
      ...raw,

      id: draftId,
      userId: user.uid,

      /* 正式系 */
      brandId,
      phase,
      vision,
      keywords,
      igCaption,
      xCaption,
      shortCopies,
      selectedShortCopy: asOptionalString(raw.selectedShortCopy),

      baseImageUrl,
      bgImageUrl,
      aiImageUrl,
      compositeImageUrl,
      imageIdeaUrl,
      videoUrl,
      videoSettings,

      textEnabled: typeof raw.textEnabled === "boolean" ? raw.textEnabled : true,
      textSize: typeof raw.textSize === "number" ? raw.textSize : 44,
      textY: typeof raw.textY === "number" ? raw.textY : 80,
      bandOpacity: typeof raw.bandOpacity === "number" ? raw.bandOpacity : 0.45,

      /* 互換系 */
      brand: brandId,
      keywordsText: keywords,
      ig: igCaption,
      x: xCaption,
      ig3: toIg3(shortCopies),

      imageUrl,
      imageSource:
        raw.imageSource === "ai" ||
        raw.imageSource === "composite" ||
        raw.imageSource === "upload"
          ? raw.imageSource
          : compositeImageUrl
            ? "composite"
            : baseImageUrl
              ? "upload"
              : aiImageUrl
                ? "ai"
                : "upload",

      bgImageUrls,
      imageIdeaUrls,

      nonAiVideoUrl,
      nonAiVideoUrls,

      images: normalizeImages(raw.images, baseImageUrl),

      title: asOptionalString(raw.title),
      memo: asString(raw.memo),

      textOverlayBySlot:
        raw.textOverlayBySlot && typeof raw.textOverlayBySlot === "object"
          ? raw.textOverlayBySlot
          : {
              base: undefined,
              mood: undefined,
              composite: undefined,
            },

      videoSource:
        raw.videoSource === "runway" || raw.videoSource === "nonai"
          ? raw.videoSource
          : nonAiVideoUrl
            ? "nonai"
            : undefined,

      nonAiVideoPreset:
        raw.nonAiVideoPreset && typeof raw.nonAiVideoPreset === "object"
          ? raw.nonAiVideoPreset
          : undefined,

      videoTaskId: asOptionalString(raw.videoTaskId),
      videoStatus:
        raw.videoStatus === "queued" ||
        raw.videoStatus === "running" ||
        raw.videoStatus === "done" ||
        raw.videoStatus === "failed" ||
        raw.videoStatus === "succeeded"
          ? raw.videoStatus
          : "idle",

      videoSeconds: videoSettings?.seconds ?? 5,
      videoQuality: videoSettings?.quality ?? "standard",
      videoTemplate: videoSettings?.template ?? "zoom",
      videoSize: videoSettings?.size ?? "720x1280",

      selectedStaticVariantId: asOptionalString(raw.selectedStaticVariantId),
      selectedStaticPrompt: asOptionalString(raw.selectedStaticPrompt),
      selectedStaticVariantTitle: asOptionalString(raw.selectedStaticVariantTitle),

      staticImageLogs: Array.isArray(raw.staticImageLogs) ? raw.staticImageLogs : [],
      staticImageVariants: Array.isArray(raw.staticImageVariants) ? raw.staticImageVariants : [],
      bgCandidates: Array.isArray(raw.bgCandidates) ? raw.bgCandidates : [],
      bgPickLogs: Array.isArray(raw.bgPickLogs) ? raw.bgPickLogs : [],

      // -------------------------
      // テンプレ背景系
      // -------------------------
      backgroundSourceTab,
      templateBgUrl,
      templateBgUrls,
      templateBgSelectedId,
      templateBgRecommendedIds,
      templateBgRecommendations,

      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };

    return NextResponse.json({
      ok: true,
      draftId,
      data: normalizedData,
    });
  } catch (e: any) {
    console.error("[drafts/get] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "get draft failed" },
      { status: 500 }
    );
  }
}