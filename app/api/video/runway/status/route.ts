// /app/api/video/runway/status/route.ts
// ✅ 互換ルート（UIからは叩かない）
// - 旧クライアントが残っても “同じ挙動” になるように /api/check-video-task に委譲する
export const runtime = "nodejs";

import { NextResponse } from "next/server";

// ここで同居させる（Next route から別route handler を直接importするより安全）
async function forwardToCheckVideoTask(req: Request) {
  const base = new URL(req.url);
  const url = new URL("/api/check-video-task", base.origin);

  const body = await req.text().catch(() => "");
  const r = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
      Authorization: req.headers.get("authorization") || "",
    },
    body: body || "{}",
  });

  const t = await r.text().catch(() => "");
  return new NextResponse(t, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  try {
    return await forwardToCheckVideoTask(req);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "runway/status failed" }, { status: 500 });
  }
}