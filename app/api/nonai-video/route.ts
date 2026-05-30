// /app/api/nonai-video/route.ts
// ✅ 非AI動画の旧ルート（封印）
// - Node.js で MediaRecorder/canvas は使えず事故るので意図的に無効化
// - 非AI(webm)は「クライアント生成 → /api/upload-video-webm」に一本化する

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "deprecated",
      message:
        "非AI動画(webm)はクライアントで生成し、/api/upload-video-webm にアップロードしてください。",
      next: {
        uploadEndpoint: "/api/upload-video-webm",
        finalizeEndpoint: "/api/finalize-mp4 (optional)",
      },
    },
    { status: 410 } // Gone
  );
}