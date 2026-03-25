// /app/api/cutout/route.ts
import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

/**
 * AOI FLOW
 * cutout API
 *
 * このAPIの役割
 * - 画像ファイルを受け取る
 * - 外部 cutout サーバーへ転送する
 * - 成功時は透過PNGを返す
 *
 * 今回の重要修正
 * - localhost:8080 に接続できない時でも
 *   そのまま 500 で落とさず、元画像を PNG 化して返す
 *
 * これにより
 * - 新規下書きの最初の1枚アップロードが止まらない
 * - cutout サーバーが未起動でも作業継続できる
 *
 * 注意
 * - フォールバック時は「透過」ではなく「PNG化」です
 * - つまり背景は消えません
 * - ただし新規作成フローが完全停止するよりは安全です
 */

/**
 * cutout サーバーURL
 *
 * 優先順
 * 1. CUTOUT_API_URL
 * 2. localhost:8080/cutout
 */
function getCutoutApiUrl() {
  const envUrl = String(process.env.CUTOUT_API_URL || "").trim();
  if (envUrl) return envUrl;
  return "http://localhost:8080/cutout";
}

/**
 * 受け取った画像を最低限 PNG に正規化して返す
 *
 * 用途
 * - cutout サーバーが死んでいる時のフォールバック
 */
async function fallbackAsPng(input: Buffer) {
  return await sharp(input, { failOn: "none" })
    .rotate()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "fileなし" }, { status: 400 });
    }

    const raw = Buffer.from(await file.arrayBuffer());
    if (!raw.length) {
      return NextResponse.json({ error: "empty file" }, { status: 400 });
    }

    const fwd = new FormData();
    fwd.append("file", new File([raw], file.name, { type: file.type || "application/octet-stream" }));

    const cutoutUrl = getCutoutApiUrl();

    try {
      const res = await fetch(cutoutUrl, {
        method: "POST",
        body: fwd,
      });

      if (!res.ok) {
        throw new Error(`cutout upstream failed (${res.status})`);
      }

const buf = await res.arrayBuffer();

return new Response(new Uint8Array(buf), {
  status: 200,
  headers: {
    "Content-Type": "image/png",
    "Cache-Control": "no-store",
  },
});

    } catch (e) {
      console.error("[cutout] upstream unavailable, fallback to png:", e);

      /**
       * 重要
       * - upstream が死んでいても、元画像PNGを返して先へ進める
       */
const fallbackPng = await fallbackAsPng(raw);

return new Response(new Uint8Array(fallbackPng), {
  status: 200,
  headers: {
    "Content-Type": "image/png",
    "X-Cutout-Fallback": "true",
    "Cache-Control": "no-store",
  },
});

    }
  } catch (e: any) {
    console.error("[cutout] fatal:", e);

    return NextResponse.json(
      {
        error: e?.message || "cutout失敗",
      },
      { status: 500 }
    );
  }
}