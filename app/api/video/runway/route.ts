// /app/api/video/runway/route.ts
// ✅ 互換ルート（UIからは叩かない）
// - 旧クライアント/旧実装が残っても “開始は常に /api/generate-video” に収束させる
// - ここ自身でRunwayを叩かない（＝二系統を物理的に封印）

export const runtime = "nodejs";

import { NextResponse } from "next/server";

async function forwardToGenerateVideo(req: Request) {
  const base = new URL(req.url);
  const url = new URL("/api/generate-video", base.origin);

  const bodyText = await req.text().catch(() => "");
  const r = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
      // 認証はそのまま引き継ぐ（Bearer idToken）
      Authorization: req.headers.get("authorization") || "",
    },
    body: bodyText || "{}",
  });

  const t = await r.text().catch(() => "");
  return new NextResponse(t, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  try {
    return await forwardToGenerateVideo(req);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "video/runway forward failed" }, { status: 500 });
  }
}