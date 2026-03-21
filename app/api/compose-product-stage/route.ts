// app/api/compose-product-stage/route.ts
import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

/**
 * AOI FLOW
 * 商品 + 背景 合成API（placement反映版）
 *
 * このAPIの役割
 * - 前景（商品透過PNG）と背景画像を受け取る
 * - placement.scale / x / y を完成画像に反映する
 * - 商品サイズと位置を決定する
 * - 接地影を生成する
 * - 背景 -5% 明度
 * - 商品 +3% 明度
 * - 色温度ズレを軽く補正する
 * - 浮き感を減らすための接地補助を入れる
 *
 * 今回の重要修正
 * - 以前は placement を受け取っても実際の合成に使っていなかった
 * - 今回は placement を left / top / 商品サイズに反映する
 * - これで「配置を保存」→「合成を作り直す」で AI背景完成画像に反映される
 *
 * 重要
 * - 商品形状は変えない
 * - 強い変形や強演出はしない
 * - 自然に置いて見えることを優先する
 */

/* =========================
 * 型
 * ========================= */

type LightDirection = "left" | "center" | "right";
type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";
type BgScene = "studio" | "lifestyle" | "scale" | "detail";

type PlacementInput = {
  scale: number;
  x: number;
  y: number;
};

/**
 * sharp.recomb() 用の 3x3 行列型
 * - TypeScript が「ただの配列」と誤認しないように固定長タプルで定義
 */
type Matrix3x3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

/* =========================
 * 小関数
 * ========================= */

/**
 * 数値を範囲内に収める
 */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * 画像取得
 */
async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" as RequestCache });
  if (!res.ok) {
    throw new Error(`failed to fetch image: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * 商品横幅比率
 * - AOI FLOW仕様の基準値
 */
function normalizeProductWidthRatio(input: unknown): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return 0.42;
  return clamp(n, 0.3, 0.45);
}

/**
 * placement を正規化する
 *
 * 保存単位
 * - scale: 0.4〜2.2
 * - x/y  : 0〜1
 */
function normalizePlacement(input: unknown): PlacementInput {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  return {
    scale: clamp(Number(raw.scale ?? 1), 0.4, 2.2),
    x: clamp(Number(raw.x ?? 0.5), 0, 1),
    y: clamp(Number(raw.y ?? 0.5), 0, 1),
  };
}

/**
 * 光方向
 */
function normalizeLight(input: unknown): LightDirection {
  const s = String(input ?? "").trim();
  if (s === "left") return "left";
  if (s === "right") return "right";
  return "center";
}

/**
 * 商品カテゴリ
 */
function normalizeProductCategory(input: unknown): ProductCategory {
  const s = String(input ?? "").trim();
  if (s === "furniture") return "furniture";
  if (s === "goods") return "goods";
  if (s === "apparel") return "apparel";
  if (s === "small") return "small";
  return "other";
}

/**
 * 商品サイズ
 */
function normalizeProductSize(input: unknown): ProductSize {
  const s = String(input ?? "").trim();
  if (s === "large") return "large";
  if (s === "small") return "small";
  return "medium";
}

/**
 * 接地タイプ
 */
function normalizeGroundingType(input: unknown): GroundingType {
  const s = String(input ?? "").trim();
  if (s === "table") return "table";
  if (s === "hanging") return "hanging";
  if (s === "wall") return "wall";
  return "floor";
}

/**
 * 売り方向
 */
function normalizeSellDirection(input: unknown): SellDirection {
  const s = String(input ?? "").trim();
  if (s === "branding") return "branding";
  if (s === "trust") return "trust";
  if (s === "story") return "story";
  return "sales";
}

/**
 * 背景方向
 */
function normalizeBgScene(input: unknown): BgScene {
  const s = String(input ?? "").trim();
  if (s === "lifestyle") return "lifestyle";
  if (s === "scale") return "scale";
  if (s === "detail") return "detail";
  return "studio";
}

/**
 * 背景を少し暗くして、彩度を少し整える
 * - 仕様: 背景 -5% 明度
 */
async function tuneBackground(buf: Buffer): Promise<Buffer> {
  return await sharp(buf, { failOn: "none" })
    .resize(1024, 1024, {
      fit: "cover",
      position: "centre",
    })
    .modulate({
      brightness: 0.95,
      saturation: 0.98,
    })
    .linear(1.02, -4)
    .png()
    .toBuffer();
}

/**
 * 商品の見え方を少し持ち上げる
 * - 仕様: 商品 +3% 明度
 * - 軽いコントラスト補正
 */
async function tuneForeground(
  buf: Buffer,
  targetWidth: number,
  productSize: ProductSize
): Promise<Buffer> {
  const maxHeight =
    productSize === "large" ? 840 :
    productSize === "small" ? 680 :
    780;

  return await sharp(buf, { failOn: "none" })
    .ensureAlpha()
    .trim()
    .resize({
      width: targetWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .modulate({
      brightness: 1.03,
      saturation: 1.01,
    })
    .linear(1.03, -2)
    .png()
    .toBuffer();
}

/**
 * 背景の平均色をざっくり取る
 * - 色温度補正のために使う
 */
async function getBackgroundAverageColor(buf: Buffer) {
  const stats = await sharp(buf, { failOn: "none" })
    .resize(32, 32, { fit: "cover", position: "centre" })
    .removeAlpha()
    .stats();

  return {
    r: stats.channels[0]?.mean ?? 128,
    g: stats.channels[1]?.mean ?? 128,
    b: stats.channels[2]?.mean ?? 128,
  };
}

/**
 * 商品の平均色をざっくり取る
 */
async function getForegroundAverageColor(buf: Buffer) {
  const stats = await sharp(buf, { failOn: "none" })
    .resize(32, 32, { fit: "inside" })
    .ensureAlpha()
    .removeAlpha()
    .stats();

  return {
    r: stats.channels[0]?.mean ?? 128,
    g: stats.channels[1]?.mean ?? 128,
    b: stats.channels[2]?.mean ?? 128,
  };
}

/**
 * 色温度ズレを弱く補正する
 */
async function applyWeakColorTemperatureMatch(
  fgBuf: Buffer,
  bgBuf: Buffer
): Promise<{ buffer: Buffer; warmthShift: number }> {
  const bg = await getBackgroundAverageColor(bgBuf);
  const fg = await getForegroundAverageColor(fgBuf);

  const bgWarmth = bg.r - bg.b;
  const fgWarmth = fg.r - fg.b;
  const diff = bgWarmth - fgWarmth;

  const warmthShift = clamp(diff * 0.08, -12, 12);

  let rMult = 1.0;
  let gMult = 1.0;
  let bMult = 1.0;

  if (warmthShift > 0) {
    rMult += warmthShift / 2550;
    bMult -= warmthShift / 2550;
  } else if (warmthShift < 0) {
    rMult += warmthShift / 2550;
    bMult -= warmthShift / 2550;
  }

  const matrix: Matrix3x3 = [
    [rMult, 0, 0],
    [0, gMult, 0],
    [0, 0, bMult],
  ];

  const out = await sharp(fgBuf, { failOn: "none" })
    .recomb(matrix)
    .png()
    .toBuffer();

  return {
    buffer: out,
    warmthShift,
  };
}

/**
 * 接地影を作る
 * - 商品の実配置に合わせて出す
 */
async function makeGroundShadow(
  canvasSize: number,
  shadowWidth: number,
  centerX: number,
  contactY: number,
  light: LightDirection,
  groundingType: GroundingType,
  bgScene: BgScene
): Promise<Buffer> {
  const effectiveWidth =
    groundingType === "hanging" ? shadowWidth * 0.18 :
    groundingType === "wall" ? shadowWidth * 0.35 :
    groundingType === "table" ? shadowWidth * 0.74 :
    shadowWidth * 0.86;

  const w = Math.max(60, Math.round(effectiveWidth));
  const h = Math.max(12, Math.round(w * 0.11));

  const shiftX = light === "left" ? 8 : light === "right" ? -8 : 0;

  const baseOpacity =
    groundingType === "hanging" ? 0.12 :
    groundingType === "wall" ? 0.18 :
    groundingType === "table" ? 0.22 :
    0.27;

  const opacity = bgScene === "studio" ? baseOpacity + 0.01 : baseOpacity;

  const cy =
    groundingType === "table" ? contactY - 8 :
    groundingType === "hanging" ? contactY + 22 :
    groundingType === "wall" ? contactY + 14 :
    contactY + 10;

  const cx = clamp(Math.round(centerX + shiftX), 0, canvasSize);

  const svg = `
    <svg width="${canvasSize}" height="${canvasSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="blur">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <ellipse
        cx="${cx}"
        cy="${clamp(Math.round(cy), 0, canvasSize)}"
        rx="${w / 2}"
        ry="${h / 2}"
        fill="rgba(0,0,0,${opacity})"
        filter="url(#blur)"
      />
    </svg>
  `;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * depth 補助
 * - 商品の下半分側にごく弱い陰影を足して背景との分離感を上げる
 */
async function makeDepthOverlay(
  width: number,
  height: number,
  groundingType: GroundingType
): Promise<Buffer> {
  const opacity =
    groundingType === "hanging" ? 0.04 :
    groundingType === "wall" ? 0.05 :
    0.08;

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0)" />
          <stop offset="70%" stop-color="rgba(0,0,0,0)" />
          <stop offset="100%" stop-color="rgba(0,0,0,${opacity})" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#g)" />
    </svg>
  `;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * 接地感補助
 * - 商品の実配置に合わせて出す
 */
async function makeContactShadow(
  canvasSize: number,
  fgWidth: number,
  centerX: number,
  contactY: number,
  light: LightDirection,
  groundingType: GroundingType,
  bgScene: BgScene
): Promise<Buffer> {
  if (groundingType === "hanging") {
    return await sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
  }

  const shiftX = light === "left" ? 6 : light === "right" ? -6 : 0;

  const baseOpacity =
    groundingType === "wall" ? 0.08 :
    groundingType === "table" ? 0.12 :
    0.13;

  const opacity = bgScene === "studio" ? baseOpacity + 0.01 : baseOpacity;

  const rx = Math.max(40, Math.round(fgWidth * 0.30));
  const ry = Math.max(6, Math.round(fgWidth * 0.03));
  const cy =
    groundingType === "table" ? contactY - 11 : contactY + 6;

  const cx = clamp(Math.round(centerX + shiftX), 0, canvasSize);

  const svg = `
    <svg width="${canvasSize}" height="${canvasSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="blur2">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <ellipse
        cx="${cx}"
        cy="${clamp(Math.round(cy), 0, canvasSize)}"
        rx="${rx}"
        ry="${ry}"
        fill="rgba(0,0,0,${opacity})"
        filter="url(#blur2)"
      />
    </svg>
  `;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * 床・卓上の薄い接地帯
 * - 浮き感を少し減らすための補助
 * - hanging / wall では使わない
 */
async function makeAmbientGroundBand(
  canvasSize: number,
  groundingType: GroundingType,
  bgScene: BgScene
): Promise<Buffer> {
  if (groundingType === "hanging" || groundingType === "wall") {
    return await sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
  }

  const opacity =
    bgScene === "studio"
      ? groundingType === "table"
        ? 0.045
        : 0.055
      : groundingType === "table"
        ? 0.035
        : 0.045;

  const y =
    groundingType === "table" ? canvasSize - 244 : canvasSize - 168;

  const h = groundingType === "table" ? 34 : 44;

  const svg = `
    <svg width="${canvasSize}" height="${canvasSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="band" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0)" />
          <stop offset="100%" stop-color="rgba(0,0,0,${opacity})" />
        </linearGradient>
      </defs>
      <rect x="0" y="${y}" width="${canvasSize}" height="${h}" fill="url(#band)" />
    </svg>
  `;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * data URL 化
 */
function toPngDataUrl(buf: Buffer) {
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/**
 * bottom margin を接地タイプごとに調整
 *
 * placement が初期値に近い時の自然位置用
 */
function resolveBottomMargin(
  groundingType: GroundingType,
  productCategory: ProductCategory,
  productSize: ProductSize,
  bgScene: BgScene
) {
  if (groundingType === "table") return 208;
  if (groundingType === "hanging") return 220;
  if (groundingType === "wall") return 165;

  const base =
    productCategory === "furniture" ? 118 :
    productSize === "large" ? 122 :
    productSize === "small" ? 136 :
    130;

  return bgScene === "studio" ? base - 4 : base;
}

/**
 * placement から left / top を解決する
 */
function resolvePlacementRect(args: {
  canvas: number;
  fgWidth: number;
  fgHeight: number;
  placement: PlacementInput;
  groundingType: GroundingType;
  productCategory: ProductCategory;
  productSize: ProductSize;
  bgScene: BgScene;
}) {
  const {
    canvas,
    fgWidth,
    fgHeight,
    placement,
    groundingType,
    productCategory,
    productSize,
    bgScene,
  } = args;

  const baseBottomMargin = resolveBottomMargin(
    groundingType,
    productCategory,
    productSize,
    bgScene
  );

  /**
   * 従来の自然位置
   */
  const defaultLeft = Math.round((canvas - fgWidth) / 2);
  const defaultTop = Math.max(30, canvas - fgHeight - baseBottomMargin);

  /**
   * ユーザー指定位置
   * - x / y は商品の中心位置として扱う
   */
  let left = Math.round(placement.x * canvas - fgWidth / 2);
  let top = Math.round(placement.y * canvas - fgHeight / 2);

  left = clamp(left, 0, Math.max(0, canvas - fgWidth));

  const maxTop =
    groundingType === "hanging"
      ? canvas - fgHeight - 20
      : groundingType === "wall"
        ? canvas - fgHeight - 40
        : canvas - fgHeight - 10;

  top = clamp(top, 0, Math.max(0, maxTop));

  /**
   * 初期値付近なら従来位置を優先
   */
  const isNearDefaultX = Math.abs(placement.x - 0.5) <= 0.03;
  const isNearDefaultY = Math.abs(placement.y - 0.5) <= 0.03;

  if (isNearDefaultX) {
    left = clamp(defaultLeft, 0, Math.max(0, canvas - fgWidth));
  }

  if (isNearDefaultY) {
    top = clamp(defaultTop, 0, Math.max(0, maxTop));
  }

  const centerX = left + fgWidth / 2;
  const centerY = top + fgHeight / 2;
  const contactY = top + fgHeight;

  return {
    left,
    top,
    centerX,
    centerY,
    contactY,
    bottomMarginBase: baseBottomMargin,
    usedDefaultLeft: isNearDefaultX,
    usedDefaultTop: isNearDefaultY,
  };
}

/**
 * 品質判定を返す
 * - placement 対応後は許容範囲を広げる
 */
function evaluateCompositeQuality(args: {
  productWidthRatio: number;
  left: number;
  top: number;
  fgWidth: number;
  fgHeight: number;
  canvas: number;
  groundingType: GroundingType;
}) {
  const { productWidthRatio, left, top, fgWidth, fgHeight, canvas, groundingType } = args;

  const centered = Math.abs(left - Math.round((canvas - fgWidth) / 2)) <= 6;
  const ratioOk = productWidthRatio >= 0.18 && productWidthRatio <= 0.82;
  const insideCanvas =
    left >= 0 && top >= 0 && left + fgWidth <= canvas && top + fgHeight <= canvas;

  const groundingLikelyOk =
    groundingType === "hanging"
      ? true
      : groundingType === "wall"
        ? top + fgHeight <= canvas - 20
        : top + fgHeight <= canvas - 4;

  const score =
    (centered ? 20 : 0) +
    (ratioOk ? 30 : 0) +
    (insideCanvas ? 30 : 0) +
    (groundingLikelyOk ? 20 : 0);

  return {
    score,
    centered,
    ratioOk,
    insideCanvas,
    groundingLikelyOk,
    verdict:
      score >= 90 ? "excellent" :
      score >= 75 ? "good" :
      score >= 50 ? "fair" :
      "weak",
  };
}

/* =========================
 * 本体
 * ========================= */

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const foregroundUrl =
      typeof body.foregroundUrl === "string" ? body.foregroundUrl.trim() : "";
    const backgroundUrl =
      typeof body.backgroundUrl === "string" ? body.backgroundUrl.trim() : "";

    if (!foregroundUrl) {
      return NextResponse.json(
        { ok: false, error: "foregroundUrl is required" },
        { status: 400 }
      );
    }

    if (!backgroundUrl) {
      return NextResponse.json(
        { ok: false, error: "backgroundUrl is required" },
        { status: 400 }
      );
    }

    const light = normalizeLight(body.light);

    /**
     * 基本サイズ
     */
    const baseProductWidthRatio = normalizeProductWidthRatio(body.productWidthRatio);

    const productCategory = normalizeProductCategory(body.productCategory);
    const productSize = normalizeProductSize(body.productSize);
    const groundingType = normalizeGroundingType(body.groundingType);
    const sellDirection = normalizeSellDirection(body.sellDirection);
    const bgScene = normalizeBgScene(body.bgScene);

    /**
     * 今回の本丸
     * - 保存済み placement を読み取る
     */
    const placement = normalizePlacement(body.placement);

    const CANVAS = 1024;

    /**
     * 画像取得
     */
    const [foregroundRaw, backgroundRaw] = await Promise.all([
      fetchImageBuffer(foregroundUrl),
      fetchImageBuffer(backgroundUrl),
    ]);

    /**
     * 背景調整
     */
    const backgroundTuned = await tuneBackground(backgroundRaw);

    /**
     * 商品サイズ決定
     * - placement.scale を実際の完成画像に反映
     */
    const effectiveProductWidthRatio = clamp(
      baseProductWidthRatio * placement.scale,
      0.18,
      0.82
    );

    const productTargetWidth = Math.round(CANVAS * effectiveProductWidthRatio);

    /**
     * 商品調整
     */
    let foregroundTuned = await tuneForeground(
      foregroundRaw,
      productTargetWidth,
      productSize
    );

    /**
     * 色温度補正
     */
    const colorMatched = await applyWeakColorTemperatureMatch(
      foregroundTuned,
      backgroundTuned
    );
    foregroundTuned = colorMatched.buffer;

    /**
     * 商品メタ
     */
    const fgMeta = await sharp(foregroundTuned).metadata();
    const fgWidth = fgMeta.width || productTargetWidth;
    const fgHeight = fgMeta.height || productTargetWidth;

    /**
     * placement 反映
     */
    const rect = resolvePlacementRect({
      canvas: CANVAS,
      fgWidth,
      fgHeight,
      placement,
      groundingType,
      productCategory,
      productSize,
      bgScene,
    });

    const left = rect.left;
    const top = rect.top;

    /**
     * depth 補助
     */
    const depthOverlay = await makeDepthOverlay(fgWidth, fgHeight, groundingType);
    const foregroundWithDepth = await sharp(foregroundTuned)
      .composite([{ input: depthOverlay, top: 0, left: 0 }])
      .png()
      .toBuffer();

    /**
     * 接地影
     */
    const groundShadow = await makeGroundShadow(
      CANVAS,
      fgWidth * 0.82,
      rect.centerX,
      rect.contactY,
      light,
      groundingType,
      bgScene
    );

    /**
     * 接地点補助
     */
    const contactShadow = await makeContactShadow(
      CANVAS,
      fgWidth,
      rect.centerX,
      rect.contactY,
      light,
      groundingType,
      bgScene
    );

    /**
     * 浮き感を減らす薄い接地帯
     */
    const ambientGroundBand = await makeAmbientGroundBand(
      CANVAS,
      groundingType,
      bgScene
    );

    /**
     * 合成
     */
    const composed = await sharp(backgroundTuned)
      .composite([
        {
          input: ambientGroundBand,
          top: 0,
          left: 0,
        },
        {
          input: groundShadow,
          top: 0,
          left: 0,
        },
        {
          input: contactShadow,
          top: 0,
          left: 0,
        },
        {
          input: foregroundWithDepth,
          top,
          left,
        },
      ])
      .png()
      .toBuffer();

    /**
     * 最終微調整
     */
    const finalBrightness =
      sellDirection === "trust" ? 1.005 :
      sellDirection === "branding" ? 1.0 :
      1.0;

    const finalSaturation =
      sellDirection === "branding" ? 1.01 :
      sellDirection === "trust" ? 0.995 :
      1.0;

    const finalPng = await sharp(composed)
      .modulate({
        brightness: finalBrightness,
        saturation: finalSaturation,
      })
      .linear(1.01, -1)
      .png()
      .toBuffer();

    const quality = evaluateCompositeQuality({
      productWidthRatio: effectiveProductWidthRatio,
      left,
      top,
      fgWidth,
      fgHeight,
      canvas: CANVAS,
      groundingType,
    });

    const dataUrl = toPngDataUrl(finalPng);

    return NextResponse.json({
      ok: true,
      dataUrl,
      contentType: "image/png",
      suggestedFileName: `product_stage_${Date.now()}.png`,
      meta: {
        canvas: CANVAS,
        productWidthRatioBase: baseProductWidthRatio,
        productWidthRatioUsed: effectiveProductWidthRatio,
        light,
        productCategory,
        productSize,
        groundingType,
        sellDirection,
        bgScene,
        colorTemperature: {
          warmthShift: colorMatched.warmthShift,
        },
        placementInput: placement,
        placement: {
          left,
          top,
          width: fgWidth,
          height: fgHeight,
          centerX: rect.centerX,
          centerY: rect.centerY,
          contactY: rect.contactY,
          bottomMarginBase: rect.bottomMarginBase,
          usedDefaultLeft: rect.usedDefaultLeft,
          usedDefaultTop: rect.usedDefaultTop,
        },
        quality,
      },
    });
  } catch (e: any) {
    console.error("[compose-product-stage] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "compose product stage failed" },
      { status: 500 }
    );
  }
}