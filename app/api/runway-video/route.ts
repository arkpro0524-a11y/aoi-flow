// /app/api/runway-video/route.ts
// ✅ 互換ルート（UIからは叩かない）
// - 旧「完了待ち→URL即返却」思想を廃止
// - 開始は /api/generate-video に一本化（非同期taskへ）
// - 完了確認は /api/check-video-task（2️⃣で固定）

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
    return NextResponse.json({ error: e?.message || "runway-video forward failed" }, { status: 500 });
  }
}