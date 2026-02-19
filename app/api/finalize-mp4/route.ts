// /app/api/finalize-mp4/route.ts
// ✅ 旧 finalize ルート（封印）
// - Firestore更新までやる別系統が残ると、誤って叩いた時に“一本道”が崩れる
// - 非AIのmp4化は /app/api/finalize-nonai-mp4/route.ts に統一（唯一の脳）
//
// 返却：410 Gone（フロントが誤って叩いても即わかる）

export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "deprecated",
      message:
        "このルートは封印されました。非AI動画のmp4化は /api/finalize-nonai-mp4 に統一してください。",
      next: {
        finalizeNonAiMp4: "/api/finalize-nonai-mp4",
      },
    },
    { status: 410 }
  );
}