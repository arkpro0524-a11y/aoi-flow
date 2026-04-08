//app/api/compose-product-stage/route.ts
import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

/**
 * AOI FLOW
 * 商品 + 背景 合成API
 *
 * 今回の整理
 * - 背景生成の主犯ではないが、
 *   テンプレ背景時は「商品を主役に見せる」寄せ方を少し強める
 * - AI背景時は世界観を少し残す
 */

type LightDirection = "left" | "center" | "right";
type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType =
  | "floor"
  | "table"
  | "shelf"
  | "display"
  | "hanging"
  | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";
type BgScene = "studio" | "lifestyle" | "scale" | "detail";
type ProductPhotoMode = "template" | "ai_bg";

type PlacementInput = {
  scale: number;
  x: number;
  y: number;
  shadow?: {
    opacity: number;
    blur: number;
    scale: number;
    offsetX: number;
    offsetY: number;
  };
};

type Matrix3x3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" as RequestCache });
  if (!res.ok) {
    throw new Error(`failed to fetch image: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function normalizeProductWidthRatio(input: unknown): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return 0.5;
  return clamp(n, 0.36, 0.62);
}

function normalizePlacement(input: unknown): PlacementInput {
  const raw = input && typeof input === "object" ? (input as Record<string, any>) : {};

  const shadowRaw =
    raw.shadow && typeof raw.shadow === "object" ? (raw.shadow as Record<string, any>) : {};

  return {
    scale: clamp(Number(raw.scale ?? 1), 0.4, 2.2),
    x: clamp(Number(raw.x ?? 0.5), 0, 1),
    y: clamp(Number(raw.y ?? 0.5), 0, 1),
    shadow: {
      opacity: clamp(Number(shadowRaw.opacity ?? 0.2), 0, 1),
      blur: clamp(Number(shadowRaw.blur ?? 14), 0, 100),
      scale: clamp(Number(shadowRaw.scale ?? 1.05), 0.5, 2),
      offsetX: clamp(Number(shadowRaw.offsetX ?? 0), -1, 1),
      offsetY: clamp(Number(shadowRaw.offsetY ?? 0.03), -1, 1),
    },
  };
}

function normalizeLight(input: unknown): LightDirection {
  const s = String(input ?? "").trim();
  if (s === "left") return "left";
  if (s === "right") return "right";
  return "center";
}

function normalizeProductCategory(input: unknown): ProductCategory {
  const s = String(input ?? "").trim();
  if (s === "furniture") return "furniture";
  if (s === "goods") return "goods";
  if (s === "apparel") return "apparel";
  if (s === "small") return "small";
  return "other";
}

function normalizeProductSize(input: unknown): ProductSize {
  const s = String(input ?? "").trim();
  if (s === "large") return "large";
  if (s === "small") return "small";
  return "medium";
}

function normalizeGroundingType(input: unknown): GroundingType {
  const s = String(input ?? "").trim();
  if (s === "table") return "table";
  if (s === "shelf") return "shelf";
  if (s === "display") return "display";
  if (s === "hanging") return "hanging";
  if (s === "wall") return "wall";
  return "floor";
}

function normalizeSellDirection(input: unknown): SellDirection {
  const s = String(input ?? "").trim();
  if (s === "branding") return "branding";
  if (s === "trust") return "trust";
  if (s === "story") return "story";
  return "sales";
}

function normalizeBgScene(input: unknown): BgScene {
  const s = String(input ?? "").trim();
  if (s === "lifestyle") return "lifestyle";
  if (s === "scale") return "scale";
  if (s === "detail") return "detail";
  return "studio";
}

function normalizePhotoMode(input: unknown): ProductPhotoMode {
  const s = String(input ?? "").trim();
  if (s === "template") return "template";
  return "ai_bg";
}

async function tuneBackground(
  buf: Buffer,
  mode: ProductPhotoMode,
  sellDirection: SellDirection
): Promise<Buffer> {
  const brightness =
    mode === "template" ? 0.97 : sellDirection === "branding" ? 0.96 : 0.95;

  const saturation =
    mode === "template" ? 0.94 : sellDirection === "branding" ? 1.0 : 0.98;

  return await sharp(buf, { failOn: "none" })
    .resize(1024, 1024, {
      fit: "cover",
      position: "centre",
    })
    .modulate({
      brightness,
      saturation,
    })
    .linear(mode === "template" ? 1.015 : 1.02, mode === "template" ? -3 : -4)
    .png()
    .toBuffer();
}

async function tuneForeground(
  buf: Buffer,
  targetWidth: number,
  productSize: ProductSize,
  mode: ProductPhotoMode
): Promise<Buffer> {
  const maxHeight =
    productSize === "large" ? 840 : productSize === "small" ? 680 : 780;

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
      brightness: mode === "template" ? 1.04 : 1.03,
      saturation: mode === "template" ? 1.0 : 1.01,
    })
    .linear(mode === "template" ? 1.035 : 1.03, -2)
    .png()
    .toBuffer();
}

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

async function makeGroundShadow(
  canvasSize: number,
  shadowWidth: number,
  centerX: number,
  contactY: number,
  light: LightDirection,
  groundingType: GroundingType,
  shadow: PlacementInput["shadow"],
  mode: ProductPhotoMode
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

  const baseScale =
    groundingType === "wall"
      ? 0.35
      : groundingType === "table"
        ? 0.5
        : groundingType === "shelf"
          ? 0.42
          : groundingType === "display"
            ? 0.4
            : 0.6;

  const scale = shadow?.scale ?? 1;

  const w = Math.max(60, Math.round(shadowWidth * baseScale * scale));
  const h =
    groundingType === "shelf" || groundingType === "display"
      ? Math.max(10, Math.round(w * 0.06))
      : Math.max(8, Math.round(w * 0.08));

  const lightShiftX = light === "left" ? 8 : light === "right" ? -8 : 0;
  const cx = Math.round(centerX + lightShiftX + (shadow?.offsetX ?? 0) * 40);
  const cy =
    groundingType === "shelf" || groundingType === "display"
      ? Math.round(contactY + 1 + (shadow?.offsetY ?? 0.03) * 30)
      : Math.round(contactY + 2 + (shadow?.offsetY ?? 0.02) * 40);

  const baseOpacity =
    groundingType === "shelf" || groundingType === "display"
      ? mode === "template"
        ? 0.16
        : 0.18
      : mode === "template"
        ? 0.10
        : 0.12;

  const maxOpacity =
    groundingType === "shelf" || groundingType === "display"
      ? mode === "template"
        ? 0.42
        : 0.56
      : mode === "template"
        ? 0.34
        : 0.5;

  const opacity = clamp(baseOpacity + (shadow?.opacity ?? 0.2) * 0.5, 0, maxOpacity);

  const blurStd =
    groundingType === "shelf" || groundingType === "display"
      ? Math.max(1, (shadow?.blur ?? 14) * (mode === "template" ? 0.58 : 0.66))
      : Math.max(1, (shadow?.blur ?? 10) * (mode === "template" ? 0.72 : 0.8));

  const svg = `
    <svg width="${canvasSize}" height="${canvasSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="blur">
          <feGaussianBlur stdDeviation="${blurStd}" />
        </filter>
      </defs>
      <ellipse
        cx="${cx}"
        cy="${cy}"
        rx="${w / 2}"
        ry="${h / 2}"
        fill="rgba(0,0,0,${opacity})"
        filter="url(#blur)"
      />
    </svg>
  `;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

async function makeDepthOverlay(width: number, height: number): Promise<Buffer> {
  return await sharp({
    create: {
      width: Math.max(1, width),
      height: Math.max(1, height),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
}

async function makeEmptyLayer(canvasSize: number): Promise<Buffer> {
  return await sharp({
    create: {
      width: Math.max(1, canvasSize),
      height: Math.max(1, canvasSize),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
}

function toPngDataUrl(buf: Buffer) {
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function resolveBottomMargin(
  groundingType: GroundingType,
  productCategory: ProductCategory,
  productSize: ProductSize,
  bgScene: BgScene
) {
  if (groundingType === "table") return 208;
  if (groundingType === "shelf") return 250;
  if (groundingType === "display") return 262;
  if (groundingType === "hanging") return 220;
  if (groundingType === "wall") return 165;

  const base =
    productCategory === "furniture" ? 118 : productSize === "large" ? 122 : productSize === "small" ? 136 : 130;

  return bgScene === "studio" ? base - 4 : base;
}

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

  const baseBottomMargin = resolveBottomMargin(groundingType, productCategory, productSize, bgScene);

  const defaultLeft = Math.round((canvas - fgWidth) / 2);

  const defaultTop =
    groundingType === "shelf"
      ? Math.max(30, canvas - fgHeight - baseBottomMargin)
      : groundingType === "display"
        ? Math.max(30, canvas - fgHeight - baseBottomMargin)
        : Math.max(30, canvas - fgHeight - baseBottomMargin);

  let left = Math.round(placement.x * canvas - fgWidth / 2);
  let top = Math.round(placement.y * canvas - fgHeight / 2);

  if (groundingType === "shelf" || groundingType === "display") {
    left = Math.round(defaultLeft + (placement.x - 0.5) * 120);
  }

  left = clamp(left, 0, Math.max(0, canvas - fgWidth));

  const maxTop =
    groundingType === "hanging"
      ? canvas - fgHeight - 20
      : groundingType === "wall"
        ? canvas - fgHeight - 40
        : canvas - fgHeight - 10;

  top = clamp(top, 0, Math.max(0, maxTop));

  const isNearDefaultX =
    groundingType === "shelf" || groundingType === "display"
      ? Math.abs(placement.x - 0.5) <= 0.08
      : Math.abs(placement.x - 0.5) <= 0.03;

  const isNearDefaultY =
    groundingType === "shelf" || groundingType === "display"
      ? Math.abs(placement.y - 0.5) <= 0.08
      : Math.abs(placement.y - 0.5) <= 0.03;

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
  const insideCanvas = left >= 0 && top >= 0 && left + fgWidth <= canvas && top + fgHeight <= canvas;

  const groundingLikelyOk =
    groundingType === "hanging"
      ? true
      : groundingType === "wall"
        ? top + fgHeight <= canvas - 20
        : groundingType === "shelf" || groundingType === "display"
          ? top + fgHeight <= canvas - 40
          : top + fgHeight <= canvas - 4;

  const score = (centered ? 20 : 0) + (ratioOk ? 30 : 0) + (insideCanvas ? 30 : 0) + (groundingLikelyOk ? 20 : 0);

  return {
    score,
    centered,
    ratioOk,
    insideCanvas,
    groundingLikelyOk,
    verdict: score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 50 ? "fair" : "weak",
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const foregroundUrl = typeof body.foregroundUrl === "string" ? body.foregroundUrl.trim() : "";
    const backgroundUrl = typeof body.backgroundUrl === "string" ? body.backgroundUrl.trim() : "";

    if (!foregroundUrl) {
      return NextResponse.json({ ok: false, error: "foregroundUrl is required" }, { status: 400 });
    }

    if (!backgroundUrl) {
      return NextResponse.json({ ok: false, error: "backgroundUrl is required" }, { status: 400 });
    }

    const light = normalizeLight(body.light);
    const baseProductWidthRatio = normalizeProductWidthRatio(body.productWidthRatio);

    const productCategory = normalizeProductCategory(body.productCategory);
    const productSize = normalizeProductSize(body.productSize);
    const groundingType = normalizeGroundingType(body.groundingType);
    const sellDirection = normalizeSellDirection(body.sellDirection);
    const bgScene = normalizeBgScene(body.bgScene);
    const activePhotoMode = normalizePhotoMode(body.activePhotoMode);

    const placement = normalizePlacement(body.placement);

    const CANVAS = 1024;

    const [foregroundRaw, backgroundRaw] = await Promise.all([
      fetchImageBuffer(foregroundUrl),
      fetchImageBuffer(backgroundUrl),
    ]);

    const backgroundTuned = await tuneBackground(backgroundRaw, activePhotoMode, sellDirection);

    const effectiveProductWidthRatio = clamp(
      baseProductWidthRatio *
        placement.scale *
        (groundingType === "shelf" ? 1.18 : groundingType === "display" ? 1.22 : 1),
      0.18,
      0.82
    );
    const productTargetWidth = Math.round(CANVAS * effectiveProductWidthRatio);

    let foregroundTuned = await tuneForeground(
      foregroundRaw,
      productTargetWidth,
      productSize,
      activePhotoMode
    );

    const colorMatched = await applyWeakColorTemperatureMatch(foregroundTuned, backgroundTuned);
    foregroundTuned = colorMatched.buffer;

    const fgMeta = await sharp(foregroundTuned).metadata();
    const fgWidth = fgMeta.width || productTargetWidth;
    const fgHeight = fgMeta.height || productTargetWidth;

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

    const depthOverlay = await makeDepthOverlay(fgWidth, fgHeight);
    const foregroundWithDepth = await sharp(foregroundTuned)
      .composite([{ input: depthOverlay, top: 0, left: 0 }])
      .png()
      .toBuffer();

    const groundShadow = await makeGroundShadow(
      CANVAS,
      fgWidth * (groundingType === "shelf" || groundingType === "display" ? 0.72 : 0.82),
      rect.centerX,
      rect.contactY,
      light,
      groundingType,
      placement.shadow,
      activePhotoMode
    );

    const contactShadow = await makeEmptyLayer(CANVAS);
    const ambientGroundBand = await makeEmptyLayer(CANVAS);

    const composed = await sharp(backgroundTuned)
      .composite([
        { input: ambientGroundBand, top: 0, left: 0 },
        { input: groundShadow, top: 0, left: 0 },
        { input: contactShadow, top: 0, left: 0 },
        { input: foregroundWithDepth, top, left },
      ])
      .png()
      .toBuffer();

    const finalBrightness =
      activePhotoMode === "template"
        ? 1.01
        : sellDirection === "trust"
          ? 1.005
          : sellDirection === "branding"
            ? 1.0
            : 1.0;

    const finalSaturation =
      activePhotoMode === "template"
        ? 0.995
        : sellDirection === "branding"
          ? 1.01
          : sellDirection === "trust"
            ? 0.995
            : 1.0;

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
        activePhotoMode,
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