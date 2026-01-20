// /app/api/config/route.ts
/**
 * app/api/config/route.ts
 * ─────────────────────────────────────────────
 * 役割：
 * - フロント/UI が参照する「機能フラグ・上限・対応可否」を一元提供
 * - UIはこのJSONだけを見て表示/非表示・説明文を切替
 *
 * 設計原則（厳守）：
 * - UI / 既存UX を一切変更しない
 * - 既存 props / state / Firestore schema を壊さない
 * - mock / 実 の差は「値」だけ（JSON構造は完全一致）
 */

import { NextResponse } from "next/server";
import { PRICING, MAX_PROMPT_CHARS } from "@/lib/server/pricing";

/* =========================================================
   ENV
========================================================= */

const USE_MOCK = process.env.USE_CONFIG_MOCK === "true";

/* =========================================================
   共通：Runway設定（UI向けに“説明可能”な形）
   ✅ enabled は引数で注入（重複定義を根絶）
========================================================= */

function runwayPublicConfig(enabled: boolean) {
  return {
    enabled,

    // UIがそのまま表示できる定義
    models: [
      {
        key: "gen4_turbo",
        label: "Gen-4 Turbo",
        use: "image-to-video",
        note: "高速・安定（商品/広告向け）",
      },
    ],

    ratios: [
      {
        key: "1280:720",
        label: "16:9（横）",
        platforms: ["instagram", "youtube"],
      },
      {
        key: "720:1280",
        label: "9:16（縦）",
        platforms: ["instagram", "tiktok"],
      },
      {
        key: "1080:1080",
        label: "1:1（正方形）",
        platforms: ["instagram"],
      },
    ],

    seconds: [5, 10] as const,
    quality: ["standard", "high"] as const,

    notes: ["Runwayは動画生成のみ担当", "背景生成/画像生成はOpenAI系と併用可能"],
  };
}

/* =========================================================
   Mock
========================================================= */

function mockConfig() {
  const enabled = true;

  return {
    ok: true,
    mock: true,

    // ✅ UIはここを読む（価格目安）
    pricing: PRICING.public(),

    features: {
      imageGeneration: true,
      backgroundGeneration: true,
      videoGeneration: true,
      replaceBackground: true,
      migrateVideo: true,
    },

    runway: runwayPublicConfig(enabled),

    limits: {
      maxPromptChars: MAX_PROMPT_CHARS,
      recommendTemplate: true,
    },
  };
}

/* =========================================================
   GET Handler
========================================================= */

export async function GET() {
  try {
    /* ---------------------------------------------
       STEP7-A：Mock
    --------------------------------------------- */
    if (USE_MOCK) {
      return NextResponse.json(mockConfig());
    }

    /* ---------------------------------------------
       STEP7-B：実設定
    --------------------------------------------- */

    const hasRunwayKey = Boolean(process.env.RUNWAYML_API_SECRET);

    return NextResponse.json({
      ok: true,
      mock: false,

      // ✅ UIはここを読む（価格目安）
      pricing: PRICING.public(),

      features: {
        imageGeneration: true,
        backgroundGeneration: true,
        videoGeneration: hasRunwayKey,
        replaceBackground: true,
        migrateVideo: true,
      },

      runway: runwayPublicConfig(hasRunwayKey),

      limits: {
        maxPromptChars: MAX_PROMPT_CHARS,
        recommendTemplate: true,
      },
    });
  } catch (err: any) {
    console.error("[config]", err);

    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "config 取得に失敗しました",
      },
      { status: 500 }
    );
  }
}