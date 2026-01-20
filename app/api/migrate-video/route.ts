/**
 * app/api/migrate-video/route.ts
 * ─────────────────────────────────────────────
 * 役割：
 * - 既存の動画URL（外部/旧生成物）を Runway 管理下へ移行
 * - 仕様：mock → 実API を ENV で切替
 *
 * 切替：
 * - USE_MIGRATE_VIDEO_MOCK=true  → mock JSON
 * - USE_MIGRATE_VIDEO_MOCK=false → （現時点では未実装なので 501）
 *
 * 注意：
 * - lib/server/runway.ts は「動画生成専用」なので、ここから import しない
 */

import { NextResponse } from "next/server";
import { getIdempotencyKey } from "@/lib/server/idempotency";

/* =========================================================
   型（このAPI内だけで完結 / UIは一切触らない）
========================================================= */

export type MigrateVideoParams = {
  sourceVideoUrl: string;
  model?: string; // e.g. "gen4_turbo"
};

/* =========================================================
   ENV 切替
========================================================= */

const USE_MOCK = process.env.USE_MIGRATE_VIDEO_MOCK === "true";

/* =========================================================
   Mock 実装（UI接続確認用）
========================================================= */

function mockMigrateVideo(params: MigrateVideoParams) {
  return {
    ok: true,
    mock: true,
    sourceUrl: params.sourceVideoUrl,
    runwayVideoUrl: "https://example.com/mock-migrated-video.mp4",
    model: params.model ?? "gen4_turbo",
  };
}

/* =========================================================
   POST Handler
========================================================= */

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const params: MigrateVideoParams = {
      sourceVideoUrl: body.sourceVideoUrl,
      model: body.model ?? "gen4_turbo",
    };

    if (!params.sourceVideoUrl) {
      return NextResponse.json(
        { ok: false, error: "sourceVideoUrl は必須です" },
        { status: 400 }
      );
    }

    // 冪等キー（将来の実装でも同じキーで扱える）
    const _idemKey = getIdempotencyKey(req, params);

    // STEP5-A：Mock
    if (USE_MOCK) {
      return NextResponse.json(mockMigrateVideo(params));
    }

    // STEP5-B：実API（後続STEPで実装）
    return NextResponse.json(
      { ok: false, error: "migrate-video (real) is not implemented yet" },
      { status: 501 }
    );
  } catch (err: any) {
    console.error("[migrate-video]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "動画の移行に失敗しました" },
      { status: 500 }
    );
  }
}