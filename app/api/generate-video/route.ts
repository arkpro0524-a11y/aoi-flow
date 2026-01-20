// app/api/generate-video/route.ts
/**
 * app/api/generate-video/route.ts
 * ─────────────────────────────────────────────
 * 役割：
 * - UI からの動画生成リクエストを受ける
 * - mock → 実Runway を ENV で切替
 *
 * ✅ 今回の修正（互換のみ）
 * - UI が j.url を参照しているため、必ず url を返す
 * - 将来整理用に videoUrl も残す（同じ値）
 *
 * 切替方法：
 * - USE_RUNWAY_MOCK=true  → mock JSON を返す
 * - USE_RUNWAY_MOCK=false → 実 Runway SDK を呼ぶ
 */

import { NextResponse } from "next/server";
import { PRICING } from "@/lib/server/pricing";
import { getIdempotencyKey } from "@/lib/server/idempotency";
import { generateVideoWithRunway, type RunwayVideoParams } from "@/lib/server/runway";

/* =========================================================
   ENV 切替
========================================================= */

const USE_MOCK = process.env.USE_RUNWAY_MOCK === "true";

/* =========================================================
   Mock 実装（UI 接続確認用）
========================================================= */

function mockGenerateVideo(params: RunwayVideoParams) {
  const yen = PRICING.calcVideoCostYen(params.seconds, params.quality);

  const mockUrl = "https://example.com/mock-video.mp4";

  return {
    ok: true,
    mock: true,

    // ✅ UI互換：必ず url
    url: mockUrl,
    // ✅ 将来整理用：videoUrl も残す
    videoUrl: mockUrl,

    model: params.model,
    seconds: params.seconds,
    quality: params.quality,
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

    /* ---------------------------------------------
       入力正規化（UI仕様は壊さない）
    --------------------------------------------- */

    const seconds = PRICING.normalizeVideoSeconds(body.seconds);

    // quality の正規化
    const quality = String(body.quality).toLowerCase() === "high" ? "high" : "standard";

    const params: RunwayVideoParams = {
      model: body.model || "gen4_turbo",
      promptImage: body.promptImage,
      promptText: body.promptText,
      seconds,
      ratio: body.ratio || "1280:720",
      quality,
    };

    if (!params.promptImage || !params.promptText) {
      return NextResponse.json(
        { ok: false, error: "promptImage と promptText は必須です" },
        { status: 400 }
      );
    }

    /* ---------------------------------------------
       冪等キー
    --------------------------------------------- */

    // params だけで安定化（同条件の連打で課金事故を増やさない）
    const idemKey = getIdempotencyKey(req, params);

    /* ---------------------------------------------
       Mock
    --------------------------------------------- */

    if (USE_MOCK) {
      return NextResponse.json(mockGenerateVideo(params));
    }

    /* ---------------------------------------------
       Real Runway
    --------------------------------------------- */

    const result = await generateVideoWithRunway(params, { idempotencyKey: idemKey });

    const yen = PRICING.calcVideoCostYen(seconds, quality);

    // ✅ UI互換：url を必ず返す（UIが j.url を見る）
    // ✅ 将来整理：videoUrl も返す（同値）
    return NextResponse.json({
      ok: true,
      mock: false,

      url: result.videoUrl,
      videoUrl: result.videoUrl,

      model: result.model,
      seconds: result.seconds,
      quality: result.quality,
      ratio: result.ratio,
      yen,
    });
  } catch (err: any) {
    console.error("[generate-video]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "動画生成に失敗しました" },
      { status: 500 }
    );
  }
}