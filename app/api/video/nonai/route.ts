// /app/api/video/nonai/route.ts
// ✅ 非AI動画の旧ルート（封印）
// - サーバ生成案の名残（ダミーURL返却など）を残すと、誤って叩いた時に事故る
// - 非AI(webm)は「クライアント生成 → /api/upload-video-webm」に一本化する
// - 必要なら後段で /api/finalize-mp4（任意）を使う

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