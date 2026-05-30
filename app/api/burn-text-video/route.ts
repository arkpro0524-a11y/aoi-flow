//app/api/burn-text-video/route.ts
import { NextResponse } from "next/server";
import { saveVideoToStorage } from "@/lib/storage/saveVideo";

export const runtime = "nodejs";

function safeText(v: unknown): string {
  return String(v ?? "").trim();
}

function safeNumber(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);

  if (!Number.isFinite(n)) return fallback;

  return Math.max(min, Math.min(max, n));
}

function getBurnApiBaseUrl(): string {
  const url = safeText(process.env.BURN_VIDEO_API_URL);

  if (!url) {
    throw new Error(
      "BURN_VIDEO_API_URL が未設定です。例: http://localhost:8088 または Cloud Run のURL"
    );
  }

  return url.replace(/\/+$/, "");
}

async function callBurnApi(body: {
  videoUrl: string;
  text: string;
  fontSize: number;
  y: number;
  seconds: number;
}) {
  const apiUrl = `${getBurnApiBaseUrl()}/burn-text-video`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(`burn-api failed (${res.status}): ${message || "unknown"}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  if (!buffer.length) {
    throw new Error("burn-api returned empty video");
  }

  return buffer;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const videoUrl = safeText(body?.videoUrl);
    const text = safeText(body?.text);
    const fontSize = Math.round(safeNumber(body?.fontSize, 48, 10, 200));
    const y = safeNumber(body?.y, 70, 0, 100);
    const seconds = safeNumber(body?.seconds, 6, 1, 20);

    if (!videoUrl || !text) {
      return NextResponse.json(
        {
          error: "invalid input",
          message: "videoUrl と text は必須です",
        },
        { status: 400 }
      );
    }

    const burnedBuffer = await callBurnApi({
      videoUrl,
      text,
      fontSize,
      y,
      seconds,
    });

    const burnedUrl = await saveVideoToStorage(burnedBuffer, {
      contentType: "video/mp4",
    });

    return NextResponse.json({
      ok: true,
      videoBurnedUrl: burnedUrl,
    });
  } catch (e: any) {
    console.error("[/api/burn-text-video] failed:", e);

    return NextResponse.json(
      {
        error: "failed",
        message: String(e?.message ?? e ?? "unknown"),
      },
      { status: 500 }
    );
  }
}