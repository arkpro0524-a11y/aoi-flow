// /app/api/cutout/route.ts
import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

/**
 * AOI FLOW / 商品画像切り抜き API
 *
 * このファイルは「100点に近づける」ために、切り抜き処理を3段階にしました。
 *
 * 1. 高精度AI切り抜きサーバー（任意）
 *    - AI_CUTOUT_API_URL または CUTOUT_PROVIDER_URL があれば最優先で使用します。
 *    - BRIA / BiRefNet / RMBG / SAM系の自前APIをここにつなげられます。
 *
 * 2. 既存cutoutサーバー（任意）
 *    - CUTOUT_API_URL があれば使用します。
 *    - 未設定時は従来通り http://localhost:8080/cutout を短時間だけ試します。
 *
 * 3. Next.jsローカル救済
 *    - AIサーバーが無い環境でも、白/薄灰/黒/緑/単色背景をかなり綺麗に抜くための処理です。
 *    - 端の背景色を「平均」ではなく「優勢色クラスタ」で推定します。
 *    - 端とつながった背景だけを抜くため、商品内部の同系色を壊しにくくしています。
 *    - 輪郭は半透明マットで少しだけ自然にします。
 *
 * 注意
 * - 透明ガラス、鏡、レース、毛、網目などは人間でも境界判断が難しいため、
 *   本当の95〜99点を狙う場合は AI_CUTOUT_API_URL に高精度AIを接続してください。
 * - 既存のAPIパス /api/cutout は維持しています。
 */

type Rgb = {
  r: number;
  g: number;
  b: number;
};

type CutoutBuffer = {
  buffer: Buffer;
  verifiedBy: string;
};

function numberOrZero(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getPixel(data: Buffer | Uint8Array, index: number): Rgb {
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
  return c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
}

function saturation(c: Rgb) {
  return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
}

function getExistingCutoutApiUrl() {
  const envUrl = String(process.env.CUTOUT_API_URL || "").trim();
  if (envUrl) return envUrl;
  return "http://localhost:8080/cutout";
}

function getHighPrecisionCutoutApiUrl() {
  return String(
    process.env.AI_CUTOUT_API_URL || process.env.CUTOUT_PROVIDER_URL || ""
  ).trim();
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

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const alphaIndex = channels - 1;

  let transparent = 0;
  let semiTransparent = 0;
  const total = info.width * info.height;

  for (let i = alphaIndex; i < data.length; i += channels) {
    const alpha = data[i] ?? 255;
    if (alpha < 255) transparent += 1;
    if (alpha > 0 && alpha < 255) semiTransparent += 1;
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

async function assertUsableCutout(buffer: Buffer, sourceName: string) {
  if (!buffer.length) return false;

  const alpha = await inspectAlphaState(buffer);

  // 透明画素が少なすぎる場合は「ただPNGを返しただけ」と判断して採用しません。
  if (
    !alpha.hasTransparentPixel ||
    alpha.transparentPixels < Math.max(20, alpha.totalPixels * 0.002)
  ) {
    console.warn(`[cutout] ${sourceName} returned weak/no alpha. fallback`);
    return false;
  }

  return true;
}

function collectEdgeSamples(data: Buffer, width: number, height: number) {
  const samples: Rgb[] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 180));

  for (let x = 0; x < width; x += step) {
    samples.push(getPixel(data, x));
    samples.push(getPixel(data, (height - 1) * width + x));
  }

  for (let y = 0; y < height; y += step) {
    samples.push(getPixel(data, y * width));
    samples.push(getPixel(data, y * width + (width - 1)));
  }

  return samples;
}

function quantizeColor(c: Rgb, size: number) {
  return `${Math.floor(c.r / size)}:${Math.floor(c.g / size)}:${Math.floor(c.b / size)}`;
}

function averageColors(colors: Rgb[]): Rgb {
  if (!colors.length) return { r: 255, g: 255, b: 255 };

  const sum = colors.reduce(
    (acc, c) => {
      acc.r += c.r;
      acc.g += c.g;
      acc.b += c.b;
      return acc;
    },
    { r: 0, g: 0, b: 0 }
  );

  return {
    r: Math.round(sum.r / colors.length),
    g: Math.round(sum.g / colors.length),
    b: Math.round(sum.b / colors.length),
  };
}

function estimateDominantEdgeBackgrounds(data: Buffer, width: number, height: number) {
  const samples = collectEdgeSamples(data, width, height);

  if (!samples.length) {
    return {
      colors: [{ r: 255, g: 255, b: 255 }],
      edgeVariance: 0,
      edgeIsComplex: false,
    };
  }

  // 粗い量子化で「端に多い色」を拾う。
  // 平均だけだと、商品が端に触れた写真で背景色が濁るためクラスタ方式にします。
  const bucketSize = 18;
  const buckets = new Map<string, Rgb[]>();

  for (const sample of samples) {
    const key = quantizeColor(sample, bucketSize);
    const list = buckets.get(key) ?? [];
    list.push(sample);
    buckets.set(key, list);
  }

  const ranked = [...buckets.values()].sort((a, b) => b.length - a.length);
  const colors = ranked.slice(0, 4).map(averageColors);
  const bg = colors[0] ?? averageColors(samples);

  const distances = samples.map((sample) => colorDistance(sample, bg));
  const avgDistance =
    distances.reduce((sum, value) => sum + value, 0) / Math.max(1, distances.length);

  const edgeIsComplex = avgDistance >= 54;

  return {
    colors: colors.length ? colors : [bg],
    edgeVariance: avgDistance,
    edgeIsComplex,
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

function detectGreenBackgroundMode(data: Buffer, width: number, height: number) {
  const total = width * height;
  if (!total) return false;

  let sampled = 0;
  let green = 0;

  const step = Math.max(1, Math.floor(Math.sqrt(total) / 280));
  for (let idx = 0; idx < total; idx += step) {
    sampled += 1;
    if (isGreenScreenPixel(getPixel(data, idx))) green += 1;
  }

  let edgeSampled = 0;
  let edgeGreen = 0;
  const edgeStep = Math.max(1, Math.floor(Math.min(width, height) / 220));

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

  return greenRatio >= 0.01 || edgeRatio >= 0.045;
}

function alphaForGreenPixel(pixel: Rgb) {
  if (!isGreenScreenPixel(pixel)) return 255;

  const strengthA = pixel.g - pixel.r;
  const strengthB = pixel.g - pixel.b;
  const strength = Math.min(strengthA, strengthB);

  if (strength >= 25 && pixel.g >= 75) return 0;
  if (strength >= 16 && pixel.g >= 58) return 28;
  return 88;
}

function isNeutralColor(pixel: Rgb) {
  return Math.abs(pixel.r - pixel.g) <= 35 && Math.abs(pixel.g - pixel.b) <= 35;
}

function isNearAnyBackgroundColor(
  pixel: Rgb,
  backgroundColors: Rgb[],
  edgeVariance: number
) {
  const pixelLuma = luma(pixel);
  const pixelSat = saturation(pixel);

  for (const bg of backgroundColors) {
    const dist = colorDistance(pixel, bg);
    const bgLuma = luma(bg);
    const bgSat = saturation(bg);

    // 単色背景の通常判定。端が少し複雑な場合は広げすぎない。
    const baseThreshold = edgeVariance >= 54 ? 48 : 68;
    if (dist <= baseThreshold) return true;

    // 白・薄灰色背景 + 影。
    // 商品の白色部分を壊さないため、端連結の候補としてだけ使います。
    if (
      bgLuma >= 172 &&
      pixelLuma >= 142 &&
      isNeutralColor(pixel) &&
      dist <= 112
    ) {
      return true;
    }

    // 黒〜濃いグレー背景。
    if (
      bgLuma <= 92 &&
      pixelLuma <= 118 &&
      pixelSat <= 48 &&
      dist <= 104
    ) {
      return true;
    }

    // ベージュ/薄茶系の無地背景。木目全体を無理に抜くと壊れるため控えめ。
    const bgLooksWarmLight = bg.r >= bg.g && bg.g >= bg.b && bgLuma >= 145 && bgSat <= 58;
    if (bgLooksWarmLight && pixelLuma >= 130 && dist <= 58) {
      return true;
    }

    // 低彩度グレー背景。
    if (bgSat <= 34 && pixelSat <= 48 && Math.abs(pixelLuma - bgLuma) <= 55 && dist <= 88) {
      return true;
    }
  }

  return false;
}

function countVisitedNeighbors(mask: Uint8Array, width: number, height: number, idx: number) {
  const x = idx % width;
  const y = Math.floor(idx / width);
  let count = 0;

  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) continue;
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (mask[ny * width + nx]) count += 1;
    }
  }

  return count;
}

function hasVisitedNeighbor(mask: Uint8Array, width: number, height: number, idx: number) {
  return countVisitedNeighbors(mask, width, height, idx) > 0;
}

function floodFillEdgeBackground(candidate: Uint8Array, width: number, height: number) {
  const total = width * height;
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

  return visited;
}

function softenMatteEdges(data: Buffer, width: number, height: number, backgroundMask: Uint8Array) {
  const total = width * height;
  const alpha = new Uint8Array(total);

  for (let idx = 0; idx < total; idx += 1) {
    alpha[idx] = backgroundMask[idx] ? 0 : 255;
  }

  // 背景に隣接した前景ピクセルだけ少し半透明にして、ギザギザを軽減します。
  // 強くやりすぎると商品輪郭が痩せるので控えめです。
  for (let idx = 0; idx < total; idx += 1) {
    if (backgroundMask[idx]) continue;

    const nearBackground = countVisitedNeighbors(backgroundMask, width, height, idx);
    if (nearBackground >= 5) {
      alpha[idx] = 210;
    } else if (nearBackground >= 3) {
      alpha[idx] = 230;
    } else if (nearBackground >= 1) {
      alpha[idx] = 242;
    }
  }

  // 背景側でも前景に隣接する場所だけ、完全透明ではなく薄く残すことで自然な境界にします。
  for (let idx = 0; idx < total; idx += 1) {
    if (!backgroundMask[idx]) continue;

    const nearForeground = 8 - countVisitedNeighbors(backgroundMask, width, height, idx);
    if (nearForeground >= 5) {
      alpha[idx] = 28;
    } else if (nearForeground >= 3) {
      alpha[idx] = 14;
    }
  }

  for (let idx = 0; idx < total; idx += 1) {
    data[idx * 4 + 3] = alpha[idx];
  }
}

async function localBackgroundCutout(input: Buffer): Promise<CutoutBuffer> {
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

  const background = estimateDominantEdgeBackgrounds(data, width, height);
  const greenMode = detectGreenBackgroundMode(data, width, height);
  const candidate = new Uint8Array(total);

  for (let idx = 0; idx < total; idx += 1) {
    const pixel = getPixel(data, idx);
    const edgeBackground = isNearAnyBackgroundColor(
      pixel,
      background.colors,
      background.edgeVariance
    );
    const greenBackground = greenMode && isGreenScreenPixel(pixel);
    candidate[idx] = edgeBackground || greenBackground ? 1 : 0;
  }

  const connectedBackground = floodFillEdgeBackground(candidate, width, height);

  // 端連結から外れた緑だけは追加で抜く。
  // クロマキー撮影では、商品で背景が分断されることがあるためです。
  if (greenMode) {
    for (let idx = 0; idx < total; idx += 1) {
      if (connectedBackground[idx]) continue;

      const greenAlpha = alphaForGreenPixel(getPixel(data, idx));
      if (greenAlpha < 255) {
        const a = idx * 4 + 3;
        data[a] = Math.min(data[a] ?? 255, greenAlpha);

        // 強い緑は背景扱いにして、輪郭補正の対象にします。
        if (greenAlpha <= 28) connectedBackground[idx] = 1;
      }
    }
  }

  // 孤立した背景ノイズを少しだけ除去します。
  // ここで大きな形態学処理をすると商品を削るため、最小限にしています。
  for (let idx = 0; idx < total; idx += 1) {
    if (!connectedBackground[idx]) continue;
    const neighbors = countVisitedNeighbors(connectedBackground, width, height, idx);
    if (neighbors <= 1 && !hasVisitedNeighbor(connectedBackground, width, height, idx)) {
      connectedBackground[idx] = 0;
    }
  }

  let transparentCount = 0;
  for (let idx = 0; idx < total; idx += 1) {
    if (connectedBackground[idx]) transparentCount += 1;
  }

  if (transparentCount < Math.max(32, total * 0.003)) {
    throw new Error("背景領域を十分に検出できませんでした");
  }

  softenMatteEdges(data, width, height, connectedBackground);

  const out = await sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  return {
    buffer: out,
    verifiedBy: greenMode ? "local-advanced-green" : "local-advanced-edge-bg",
  };
}

async function readInputImage(req: Request) {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();

  // 既存フロントの一部はJSONで imageUrl を送るため、FormDataだけでなくJSONも受けます。
  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => null);
    const imageUrl = String(json?.imageUrl || json?.url || "").trim();

    if (!imageUrl) {
      throw new Error("imageUrlなし");
    }

    const res = await fetch(imageUrl, {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`画像URLの取得に失敗しました (${res.status})`);
    }

    const raw = Buffer.from(await res.arrayBuffer());

    if (!raw.length) {
      throw new Error("画像URLから空データが返りました");
    }

    return {
      raw,
      safeBaseName: `image_url_${Date.now()}`,
    };
  }

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

    const raw = Buffer.from(await res.arrayBuffer());

    if (!raw.length) {
      throw new Error("画像URLから空データが返りました");
    }

    return {
      raw,
      safeBaseName: `image_url_${Date.now()}`,
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

async function postToCutoutServer(
  url: string,
  normalizedInput: Buffer,
  safeBaseName: string,
  sourceName: string,
  timeoutMs: number
) {
  if (!url) return null;

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
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      body: fwd,
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[cutout] ${sourceName} bad response. fallback:`, res.status, text);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    if (!(await assertUsableCutout(buffer, sourceName))) {
      return null;
    }

    return buffer;
  } catch (e) {
    console.warn(`[cutout] ${sourceName} connection failed. fallback:`, e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function tryHighPrecisionCutout(normalizedInput: Buffer, safeBaseName: string) {
  const url = getHighPrecisionCutoutApiUrl();
  if (!url) return null;

  return await postToCutoutServer(
    url,
    normalizedInput,
    safeBaseName,
    "high-precision-ai",
    45000
  );
}

async function tryExistingCutoutServer(normalizedInput: Buffer, safeBaseName: string) {
  return await postToCutoutServer(
    getExistingCutoutApiUrl(),
    normalizedInput,
    safeBaseName,
    "existing-cutout-server",
    12000
  );
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

    const highPrecisionBuffer = await tryHighPrecisionCutout(
      normalizedInput,
      input.safeBaseName
    );

    if (highPrecisionBuffer) {
      return pngResponse(highPrecisionBuffer, "high-precision-ai");
    }

    const existingServerBuffer = await tryExistingCutoutServer(
      normalizedInput,
      input.safeBaseName
    );

    if (existingServerBuffer) {
      return pngResponse(existingServerBuffer, "existing-cutout-server");
    }

    try {
      const local = await localBackgroundCutout(normalizedInput);
      const alpha = await inspectAlphaState(local.buffer);

      if (!alpha.hasTransparentPixel) {
        throw new Error("ローカル透過でも透明画素を作れませんでした");
      }

      return pngResponse(local.buffer, local.verifiedBy);
    } catch (e: any) {
      console.error("[cutout] local fallback failed:", e?.message || e);

      return NextResponse.json(
        {
          error: "透過に失敗しました",
          detail:
            e?.message ||
            "AI切り抜き・既存cutoutサーバー・ローカル救済処理のすべてで透過できませんでした",
          advice:
            "白い紙・薄グレー・緑背景など、商品と背景の色差が大きい写真で再実行してください。高精度化する場合は AI_CUTOUT_API_URL にBRIA/BiRefNet/RMBG/SAM系APIを接続してください。",
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
