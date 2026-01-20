/**
 * app/api/recommend-video-template/route.ts
 * ─────────────────────────────────────────────
 * 役割：
 * - 入力（画像有無/用途/尺/品質 等）から推奨テンプレを返す
 *
 * 設計：
 * - USE_RECOMMEND_VIDEO_TEMPLATE_MOCK=true  → mock JSON
 * - false → （現時点では未実装なので 501）
 *
 * 注意：
 * - lib/server/runway.ts は「動画生成専用」なので、ここから import しない
 * - JSON構造は mock/実 で完全一致（実装時もこの形を維持）
 */

import { NextResponse } from "next/server";
import { getIdempotencyKey } from "@/lib/server/idempotency";

/* =========================================================
   型（このAPI内だけで完結 / UIは一切触らない）
========================================================= */

export type RecommendVideoTemplateParams = {
  hasImage: boolean;
  purpose?: string; // "product" etc
  seconds?: number; // UI入力をそのまま受ける
  quality?: string; // "standard" | "high" など
  platform?: string; // "instagram" etc
};

type Recommendation = {
  model: string;
  ratio: string;
  seconds: number;
  quality: "standard" | "high";
  reason: string;
};

/* =========================================================
   ENV 切替
========================================================= */

const USE_MOCK = process.env.USE_RECOMMEND_VIDEO_TEMPLATE_MOCK === "true";

/* =========================================================
   Mock 実装
========================================================= */

function mockRecommendTemplate(params: RecommendVideoTemplateParams) {
  const seconds = params.seconds === 5 ? 5 : 10;
  const quality = String(params.quality).toLowerCase() === "high" ? "high" : "standard";

  const recommendation: Recommendation = {
    model: "gen4_turbo",
    ratio: "1280:720",
    seconds,
    quality,
    reason: "商品アップ向けの汎用テンプレ（安定性優先）",
  };

  return {
    ok: true,
    mock: true,
    recommendation,
  };
}

/* =========================================================
   POST Handler
========================================================= */

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const params: RecommendVideoTemplateParams = {
      hasImage: Boolean(body.hasImage),
      purpose: body.purpose ?? "product",
      seconds: body.seconds,
      quality: body.quality,
      platform: body.platform ?? "instagram",
    };

    const _idemKey = getIdempotencyKey(req, params);

    // STEP6-A：Mock
    if (USE_MOCK) {
      return NextResponse.json(mockRecommendTemplate(params));
    }

    // STEP6-B：実ロジック（後続STEPで実装）
    return NextResponse.json(
      { ok: false, error: "recommend-video-template (real) is not implemented yet" },
      { status: 501 }
    );
  } catch (err: any) {
    console.error("[recommend-video-template]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "テンプレ推薦に失敗しました" },
      { status: 500 }
    );
  }
}