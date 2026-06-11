// /app/api/cutout/route.ts
import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

/**
 * AOI FLOW
 * cutout API
 *
 * 目的
 * - 既存の cutout サーバーが動く場合はその結果を使う
 * - cutout サーバーが 500 / timeout / 接続不可でも、緑背景・単色背景は Next 側で救済する
 * - 5分待ちのような UX 破壊を避けるため、upstream は短時間で打ち切る
 *
 * 注意
 * - 新しい分析ロジックではなく、既存の「透過」実行時安定化です
 * - 既存APIや保存処理は削除しません
 */

type Rgb = {
  r: number;
  g: number;
  b: number;
};

function getCutoutApiUrl() {
  const envUrl = String(process.env.CUTOUT_API_URL || "").trim();
  if (envUrl) return envUrl;
  return "http://localhost:8080/cutout";
}

function numberOrZero(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getPixel(data: Buffer, index: number): Rgb {
  const i = index * 4;
  return {
    r: numberOrZero(data[i]),
    g: numberOrZero(data[i + 1]),
    b: numberOrZero(data[i + 2]),
  };
}

function colorDistance(a: Rgb, b: Rgb) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function luma(c: Rgb) {
  return (c.r + c.g + c.b) / 3;
}

function saturation(c: Rgb) {
  return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
}

async function normalizeInputForCutout(input: Buffer) {
  return await sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: 2400,
      height: 2400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function inspectAlphaState(input: Buffer) {
  const image = sharp(input, { failOn: "none" }).ensureAlpha();
  const meta = await image.metadata();

  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const alphaIndex = channels - 1;

  let transparent = 0;
  let semiTransparent = 0;
  const total = info.width * info.height;

  for (let i = alphaIndex; i < data.length; i += channels) {
    const alpha = data[i] ?? 255;
    if (alpha < 255) {
      transparent += 1;
    }
    if (alpha > 0 && alpha < 255) {
      semiTransparent += 1;
    }
  }

  return {
    width: meta.width ?? info.width,
    height: meta.height ?? info.height,
    channels,
    transparentPixels: transparent,
    semiTransparentPixels: semiTransparent,
    totalPixels: total,
    hasTransparentPixel: transparent > 0,
  };
}

function estimateEdgeBackground(data: Buffer, width: number, height: number): Rgb {
  const samples: Rgb[] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 120));

  for (let x = 0; x < width; x += step) {
    samples.push(getPixel(data, x));
    samples.push(getPixel(data, (height - 1) * width + x));
  }

  for (let y = 0; y < height; y += step) {
    samples.push(getPixel(data, y * width));
    samples.push(getPixel(data, y * width + (width - 1)));
  }

  if (!samples.length) {
    return { r: 255, g: 255, b: 255 };
  }

  // 背景色が端の大半を占める前提で、外れ値を落として平均する
  const sorted = [...samples].sort((a, b) => luma(a) - luma(b));
  const start = Math.floor(sorted.length * 0.08);
  const end = Math.max(start + 1, Math.floor(sorted.length * 0.92));
  const trimmed = sorted.slice(start, end);

  const sum = trimmed.reduce(
    (acc, c) => {
      acc.r += c.r;
      acc.g += c.g;
      acc.b += c.b;
      return acc;
    },
    { r: 0, g: 0, b: 0 }
  );

  const n = Math.max(1, trimmed.length);

  return {
    r: Math.round(sum.r / n),
    g: Math.round(sum.g / n),
    b: Math.round(sum.b / n),
  };
}

function isGreenScreenPixel(pixel: Rgb) {
  const sat = saturation(pixel);
  const greenDominant =
    pixel.g >= 55 &&
    pixel.g - pixel.r >= 8 &&
    pixel.g - pixel.b >= 3 &&
    pixel.g >= pixel.r * 1.04 &&
    pixel.g >= pixel.b * 1.02 &&
    sat >= 14;

  const yellowGreen =
    pixel.g >= 85 &&
    pixel.r >= 40 &&
    pixel.g - pixel.b >= 14 &&
    pixel.g >= pixel.r * 0.78 &&
    pixel.g > pixel.b * 1.12 &&
    sat >= 22;

  const darkGreenShadow =
    pixel.g >= 42 &&
    pixel.g - pixel.r >= 7 &&
    pixel.g - pixel.b >= 2 &&
    pixel.g >= pixel.r * 1.06 &&
    pixel.g >= pixel.b * 1.02 &&
    sat >= 12;

  return greenDominant || yellowGreen || darkGreenShadow;
}

function isNearEdgeBackground(pixel: Rgb, bg: Rgb) {
  const dist = colorDistance(pixel, bg);
  const pixelLuma = luma(pixel);
  const bgLuma = luma(bg);
  const pixelSat = saturation(pixel);

  // 端から推定した単色背景
  if (dist <= 64) return true;

  // 白・薄灰色の背景と影
  if (
    bgLuma >= 178 &&
    pixelLuma >= 145 &&
    Math.abs(pixel.r - pixel.g) <= 34 &&
    Math.abs(pixel.g - pixel.b) <= 34
  ) {
    return true;
  }

  // 黒〜グレー背景
  if (
    bgLuma <= 90 &&
    pixelLuma <= 112 &&
    pixelSat <= 44 &&
    dist <= 92
  ) {
    return true;
  }

  // 緑背景の場合は近似色を広めに拾う
  const bgIsGreen = bg.g >= 55 && bg.g >= bg.r * 1.05 && bg.g >= bg.b * 1.02;
  if (bgIsGreen && isGreenScreenPixel(pixel) && dist <= 145) {
    return true;
  }

  return false;
}

function detectGreenBackgroundMode(data: Buffer, width: number, height: number) {
  const total = width * height;
  if (!total) return false;

  let sampled = 0;
  let green = 0;

  const step = Math.max(1, Math.floor(Math.sqrt(total) / 260));
  for (let idx = 0; idx < total; idx += step) {
    sampled += 1;
    if (isGreenScreenPixel(getPixel(data, idx))) green += 1;
  }

  let edgeSampled = 0;
  let edgeGreen = 0;
  const edgeStep = Math.max(1, Math.floor(Math.min(width, height) / 180));

  for (let x = 0; x < width; x += edgeStep) {
    edgeSampled += 2;
    if (isGreenScreenPixel(getPixel(data, x))) edgeGreen += 1;
    if (isGreenScreenPixel(getPixel(data, (height - 1) * width + x))) edgeGreen += 1;
  }

  for (let y = 0; y < height; y += edgeStep) {
    edgeSampled += 2;
    if (isGreenScreenPixel(getPixel(data, y * width))) edgeGreen += 1;
    if (isGreenScreenPixel(getPixel(data, y * width + (width - 1)))) edgeGreen += 1;
  }

  const greenRatio = sampled ? green / sampled : 0;
  const edgeRatio = edgeSampled ? edgeGreen / edgeSampled : 0;

  return greenRatio >= 0.012 || edgeRatio >= 0.055;
}

function alphaForGreenPixel(pixel: Rgb) {
  if (!isGreenScreenPixel(pixel)) return 255;

  const strengthA = pixel.g - pixel.r;
  const strengthB = pixel.g - pixel.b;
  const strength = Math.min(strengthA, strengthB);

  // 強い緑は完全透過
  if (strength >= 22 && pixel.g >= 75) return 0;

  // 境界の黄緑・影は半透過
  if (strength >= 12 && pixel.g >= 58) return 36;

  return 96;
}

async function localBackgroundCutout(input: Buffer) {
  const image = sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: 2400,
      height: 2400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha();

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const total = width * height;

  if (!width || !height || total <= 0) {
    throw new Error("ローカル透過用の画像サイズを取得できませんでした");
  }

  const bg = estimateEdgeBackground(data, width, height);
  const greenMode = detectGreenBackgroundMode(data, width, height);

  const candidate = new Uint8Array(total);

  for (let idx = 0; idx < total; idx += 1) {
    const pixel = getPixel(data, idx);
    const edgeBackground = isNearEdgeBackground(pixel, bg);
    const greenBackground = greenMode && isGreenScreenPixel(pixel);
    candidate[idx] = edgeBackground || greenBackground ? 1 : 0;
  }

  // 端と繋がっている背景候補だけを基本透過する。
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  function push(idx: number) {
    if (idx < 0 || idx >= total) return;
    if (visited[idx] || !candidate[idx]) return;
    visited[idx] = 1;
    queue[tail] = idx;
    tail += 1;
  }

  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }

  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + (width - 1));
  }

  while (head < tail) {
    const idx = queue[head];
    head += 1;

    const x = idx % width;
    const y = Math.floor(idx / width);

    if (x > 0) push(idx - 1);
    if (x < width - 1) push(idx + 1);
    if (y > 0) push(idx - width);
    if (y < height - 1) push(idx + width);
  }

  let transparentCount = 0;

  for (let idx = 0; idx < total; idx += 1) {
    const a = idx * 4 + 3;

    if (visited[idx]) {
      data[a] = 0;
      transparentCount += 1;
      continue;
    }

    // 緑背景だけは、商品で分断されて端連結から外れることが多いので画像内の緑も抜く。
    if (greenMode) {
      const greenAlpha = alphaForGreenPixel(getPixel(data, idx));
      if (greenAlpha < 255) {
        data[a] = Math.min(data[a] ?? 255, greenAlpha);
        transparentCount += 1;
      }
    }
  }

  if (transparentCount < Math.max(32, total * 0.003)) {
    throw new Error("背景領域を十分に検出できませんでした");
  }

  // 境界を少しだけ自然にする
  const out = await sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  return out;
}

async function readInputImage(req: Request) {
  const form = await req.formData();

  const imageUrl = String(form.get("imageUrl") || form.get("url") || "").trim();
  if (imageUrl) {
    const res = await fetch(imageUrl, {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`画像URLの取得に失敗しました (${res.status})`);
    }

    const contentType = String(res.headers.get("content-type") || "image/jpeg");
    const raw = Buffer.from(await res.arrayBuffer());

    if (!raw.length) {
      throw new Error("画像URLから空データが返りました");
    }

    const ext = contentType.includes("png") ? "png" : "jpg";

    return {
      raw,
      safeBaseName: `image_url.${ext}`,
    };
  }

  const file = form.get("file") || form.get("image");

  if (!file || !(file instanceof File)) {
    throw new Error("fileなし");
  }

  const raw = Buffer.from(await file.arrayBuffer());

  if (!raw.length) {
    throw new Error("empty file");
  }

  const safeBaseName =
    String(file.name || "upload").replace(/\.[^.]+$/, "").trim() || "upload";

  return {
    raw,
    safeBaseName,
  };
}

function pngResponse(buffer: Buffer, verifiedBy: string) {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Cutout-Verified": verifiedBy,
    },
  });
}

async function tryUpstreamCutout(normalizedInput: Buffer, safeBaseName: string) {
  const upstreamFile = new File(
    [new Uint8Array(normalizedInput)],
    `${safeBaseName || "upload"}.png`,
    {
      type: "image/png",
    }
  );

  const fwd = new FormData();
  fwd.append("file", upstreamFile);
  fwd.append("image", upstreamFile);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(getCutoutApiUrl(), {
      method: "POST",
      body: fwd,
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[cutout] upstream bad response. local fallback:", res.status, text);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) return null;

    const alpha = await inspectAlphaState(buffer);

    // ただのPNGや透明画素が少なすぎるものは採用しない
    if (!alpha.hasTransparentPixel || alpha.transparentPixels < Math.max(20, alpha.totalPixels * 0.002)) {
      console.warn("[cutout] upstream returned weak/no alpha. local fallback");
      return null;
    }

    return buffer;
  } catch (e) {
    console.warn("[cutout] upstream connection failed. local fallback:", e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  try {
    let input: { raw: Buffer; safeBaseName: string };

    try {
      input = await readInputImage(req);
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "入力画像がありません" },
        { status: 400 }
      );
    }

    let normalizedInput: Buffer;

    try {
      normalizedInput = await normalizeInputForCutout(input.raw);
    } catch (e) {
      console.error("[cutout] normalize failed:", e);

      return NextResponse.json(
        { error: "入力画像の正規化に失敗しました" },
        { status: 500 }
      );
    }

    const upstreamBuffer = await tryUpstreamCutout(
      normalizedInput,
      input.safeBaseName
    );

    if (upstreamBuffer) {
      return pngResponse(upstreamBuffer, "upstream");
    }

    try {
      const localBuffer = await localBackgroundCutout(normalizedInput);
      const alpha = await inspectAlphaState(localBuffer);

      if (!alpha.hasTransparentPixel) {
        throw new Error("ローカル透過でも透明画素を作れませんでした");
      }

      return pngResponse(localBuffer, "local-green-background");
    } catch (e: any) {
      console.error("[cutout] local fallback failed:", e?.message || e);

      return NextResponse.json(
        {
          error: "透過に失敗しました",
          detail:
            e?.message ||
            "cutoutサーバーとローカル救済処理の両方で透過できませんでした",
        },
        { status: 502 }
      );
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
