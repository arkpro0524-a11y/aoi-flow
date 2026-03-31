// /app/api/cutout/route.ts
import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

/**
 * AOI FLOW
 * cutout API
 *
 * このAPIの目的
 * - クライアントから受けた画像を cutout サーバーへ渡す
 * - 成功時は透過PNGをそのまま返す
 * - 失敗時は「失敗した」と明確に返す
 *
 * 今回の重要ポイント
 * - もう「見た目は成功だが実際は透過されていない」を避ける
 * - upstream が失敗したら fallback PNG を返さず、エラーを返す
 * - これで UI 側でも本当に透過できたか / 失敗したか が分かる
 */

function getCutoutApiUrl() {
  const envUrl = String(process.env.CUTOUT_API_URL || "").trim();
  if (envUrl) return envUrl;

  /**
   * cutout サーバーの実URL
   * Swagger で確認した /cutout を既定値にする
   */
  return "http://localhost:8080/cutout";
}

/**
 * 入力画像を upstream 用に PNG 正規化
 * - HEIC / HEIF / JPEG / PNG を一旦 PNG に統一
 * - rotate() でスマホ画像の向きずれを補正
 */
async function normalizeInputForCutout(input: Buffer) {
  return await sharp(input, { failOn: "none" })
    .rotate()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/**
 * 透過画像かどうかを簡易チェック
 * - alpha チャンネルがあるか
 * - 完全不透明以外の画素があるか
 *
 * 目的
 * - upstream が「ただの PNG」を返してきた時に見抜く
 */
async function inspectAlphaState(input: Buffer) {
  const image = sharp(input, { failOn: "none" }).ensureAlpha();
  const meta = await image.metadata();

  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const alphaIndex = channels - 1;

  let hasTransparentPixel = false;

  for (let i = alphaIndex; i < data.length; i += channels) {
    if (data[i] < 255) {
      hasTransparentPixel = true;
      break;
    }
  }

  return {
    width: meta.width ?? info.width,
    height: meta.height ?? info.height,
    channels,
    hasTransparentPixel,
  };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "fileなし" },
        { status: 400 }
      );
    }

    const raw = Buffer.from(await file.arrayBuffer());

    if (!raw.length) {
      return NextResponse.json(
        { error: "empty file" },
        { status: 400 }
      );
    }

    let normalizedInput: Buffer;

    try {
      normalizedInput = await normalizeInputForCutout(raw);
    } catch (e) {
      console.error("[cutout] normalize failed:", e);

      return NextResponse.json(
        { error: "入力画像の正規化に失敗しました" },
        { status: 500 }
      );
    }

    const safeBaseName =
      String(file.name || "upload").replace(/\.[^.]+$/, "").trim() || "upload";

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

    let upstreamRes: Response;

    try {
      upstreamRes = await fetch(cutoutUrl, {
        method: "POST",
        body: fwd,
        cache: "no-store",
      });
    } catch (e) {
      console.error("[cutout] upstream connection failed:", e);

      return NextResponse.json(
        { error: "cutoutサーバーに接続できませんでした" },
        { status: 502 }
      );
    }

    if (!upstreamRes.ok) {
      const text = await upstreamRes.text().catch(() => "");

      console.error("[cutout] upstream bad response:", upstreamRes.status, text);

      return NextResponse.json(
        {
          error: `cutout upstream failed (${upstreamRes.status})`,
          detail: text || "upstream error",
        },
        { status: 502 }
      );
    }

    const upstreamArrayBuffer = await upstreamRes.arrayBuffer();
    const upstreamBuffer = Buffer.from(upstreamArrayBuffer);

    if (!upstreamBuffer.length) {
      return NextResponse.json(
        { error: "cutoutサーバーから空レスポンスが返りました" },
        { status: 502 }
      );
    }

    /**
     * 本当に透過されているか確認
     * - 透過画素が1つも無いなら失敗扱い
     */
    let alphaInfo: Awaited<ReturnType<typeof inspectAlphaState>>;

    try {
      alphaInfo = await inspectAlphaState(upstreamBuffer);
    } catch (e) {
      console.error("[cutout] alpha inspect failed:", e);

      return NextResponse.json(
        { error: "cutout結果の検証に失敗しました" },
        { status: 502 }
      );
    }

    if (!alphaInfo.hasTransparentPixel) {
      console.error("[cutout] upstream returned png but no transparent pixel");

      return NextResponse.json(
        {
          error: "透過画像ではありませんでした",
          detail: "cutoutサーバーは応答しましたが、背景が消えていません",
        },
        { status: 502 }
      );
    }

    return new Response(new Uint8Array(upstreamBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-Cutout-Verified": "true",
      },
    });
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