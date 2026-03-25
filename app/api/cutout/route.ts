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
 * - HEIC / HEIF を含む入力画像を、先にサーバー側で PNG に正規化してから upstream へ渡す
 * - localhost:8080 に接続できない時でも、そのまま 500 で落とさず PNG を返す
 * - これにより、新規下書きの最初の1枚アップロード停止を避ける
 *
 * 注意
 * - fallback 時は「透過」ではなく「PNG化」です
 * - つまり背景は消えません
 * - ただし作業が完全停止するより安全です
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
 * 受け取った画像を upstream 用に PNG 正規化する
 *
 * 重要
 * - HEIC / HEIF / JPEG / PNG などを一旦 PNG にそろえる
 * - rotate() でスマホ撮影の向き崩れを防ぐ
 * - alpha が無い画像でも、そのまま PNG 化して upstream に渡す
 */
async function normalizeInputForCutout(input: Buffer) {
  return await sharp(input, { failOn: "none" })
    .rotate()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/**
 * 受け取った画像を最低限 PNG に正規化して返す
 *
 * 用途
 * - cutout サーバーが死んでいる時のフォールバック
 * - upstream に渡す前の入力正規化が済んでいれば、その PNG をそのまま返してもよい
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

    /**
     * ここが今回の本命修正
     * - クライアント側 canvas/JPEG 変換に頼らず
     * - サーバー側で HEIC を含む入力を PNG に正規化する
     *
     * これで
     * - HEIC のまま upstream に渡して失敗
     * - JPEG 化で境界が崩れる
     * という問題を減らす
     */
    let normalizedInput: Buffer;

    try {
      normalizedInput = await normalizeInputForCutout(raw);
    } catch (e) {
      console.error("[cutout] normalize failed, fallback to raw:", e);
      normalizedInput = raw;
    }

    /**
     * upstream には PNG として送る
     * - ファイル名は見た目上わかりやすく .png にしておく
     * - MIME も image/png に固定
     */
    const safeBaseName = String(file.name || "upload")
      .replace(/\.[^.]+$/, "")
      .trim() || "upload";

const upstreamFile = new File(
  [new Uint8Array(normalizedInput)],
  `${safeBaseName}.png`,
  {
    type: "image/png",
  }
);

    const fwd = new FormData();
    fwd.append("file", upstreamFile);

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
       * upstream が死んでいても、PNG を返して先へ進める
       *
       * 重要
       * - まずは normalizedInput をそのまま返せば十分
       * - ただし safety のため fallbackAsPng() を通して再度 PNG 保証する
       */
      const fallbackPng = await fallbackAsPng(normalizedInput);

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