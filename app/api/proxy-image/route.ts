// /app/api/proxy-image/route.ts
// Firebase Storageなど外部URL画像をCanvasで安全に使うため、サーバー経由で画像として返します。

export const runtime = "nodejs";

import { NextResponse } from "next/server";

function isAllowedImageUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({} as any))) as any;
    const url = String(body?.url ?? "").trim();

    if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });
    if (!isAllowedImageUrl(url)) return NextResponse.json({ error: "invalid image url" }, { status: 400 });

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: `image fetch failed (${res.status})` }, { status: 502 });
    }

    const contentType = String(res.headers.get("content-type") || "image/png");
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: `not image content-type: ${contentType}` }, { status: 400 });
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return NextResponse.json({ error: "image is empty" }, { status: 502 });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "proxy-image failed" }, { status: 500 });
  }
}
