/**
 * app/api/generate-background/route.ts
 * ─────────────────────────────────────────────
 * 役割：
 * - 背景画像生成（商品切り抜き後に合成する“背景”）
 * - mock → 実API を ENV で切替
 *
 * 切替：
 * - USE_BACKGROUND_MOCK=true  → mock JSON
 * - USE_BACKGROUND_MOCK=false → （現時点では未実装なので 501）
 *
 * 注意：
 * - lib/server/runway.ts は「動画生成専用」なので、ここから import しない
 */

import { NextResponse } from "next/server";
import { PRICING } from "@/lib/server/pricing";
import { getIdempotencyKey } from "@/lib/server/idempotency";

/* =========================================================
   型（このAPI内だけで完結 / UIは触らない）
========================================================= */

export type BackgroundGenParams = {
  prompt: string;
  ratio: string; // "1280:720" 等
  style: string; // UI入力をそのまま受ける
};

/* =========================================================
   ENV 切替
========================================================= */

const USE_MOCK = process.env.USE_BACKGROUND_MOCK === "true";

/* =========================================================
   Mock 実装（UI接続確認用）
========================================================= */

function mockGenerateBackground(params: BackgroundGenParams) {
  const yen = PRICING.calcImageCostYen();

  return {
    ok: true,
    mock: true,
    imageUrl: "https://example.com/mock-background.png",
    prompt: params.prompt,
    ratio: params.ratio,
    yen,
  };
}

/* =========================================================
   POST Handler
========================================================= */

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const params: BackgroundGenParams = {
      prompt: body.prompt,
      ratio: body.ratio || "1280:720",
      style: body.style || "clean",
    };

    if (!params.prompt) {
      return NextResponse.json(
        { ok: false, error: "prompt は必須です" },
        { status: 400 }
      );
    }

    const _idemKey = getIdempotencyKey(req, params);

    // STEP3-A：Mock
    if (USE_MOCK) {
      return NextResponse.json(mockGenerateBackground(params));
    }

    // STEP3-B：実API（後続STEPで実装）
    return NextResponse.json(
      { ok: false, error: "generate-background (real) is not implemented yet" },
      { status: 501 }
    );
  } catch (err: any) {
    console.error("[generate-background]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "背景生成に失敗しました" },
      { status: 500 }
    );
  }
}