// /app/api/compose-product-stage/route.ts
import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

/**
 * AOI FLOW
 * 商品 + 背景 合成API
 *
 * このファイルの役割
 * - 背景画像と商品画像を受け取る
 * - 背景のズーム / 位置を反映する
 * - 商品の大きさ / 位置を反映する
 * - 商品に付随する影を生成する
 * - 最終合成画像を PNG で返す
 *
 * 今回の修正方針
 * - 既存機能は削除しない
 * - ただし「影を自由物体として動かす」思想を弱める
 * - 影はあくまで商品に従属する補助表現として扱う
 *
 * 今回の重要修正
 * 1. shadow offset の保存値受け幅を縮小
 * 2. API内部の offset 反映係数を縮小
 * 3. shadow scale の効き方を少し弱める
 * 4. ProductPlacementEditor 側の思想と一致するように、影の扱いを整理
 *
 * これにより
 * - UIで微調整にした思想
 * - API側の実処理
 * のズレを減らす
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
  background?: {
    scale: number;
    x: number;
    y: number;
  };
};

type Matrix3x3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

/**
 * 影制御用定数
 *
 * 重要
 * - UI側では「微調整」にしたので、
 *   API側もその思想に合わせる
 * - 将来また微調整したい時はこの定数を見ればよい
 */

/**
 * 影の左右ズレ
 * - ProductPlacementEditor 側に合わせる
 */
const SHADOW_OFFSET_X_EFFECTIVE_MIN = -0.25;
const SHADOW_OFFSET_X_EFFECTIVE_MAX = 0.25;

/**
 * 影の上下ズレ
 * - ProductPlacementEditor 側に合わせる
 */
const SHADOW_OFFSET_Y_EFFECTIVE_MIN = -0.25;
const SHADOW_OFFSET_Y_EFFECTIVE_MAX = 0.25;

/**
 * UIで微調整にしたので、実ピクセル移動量も弱める
 * - 以前は 80 相当で強すぎた
 * - 今回は preview 側の思想に寄せる
 */
const SHADOW_OFFSET_X_PIXELS = 24;
const SHADOW_OFFSET_Y_PIXELS = 24;

/**
 * grounding別の影スケール補正
 * - 影は商品従属なので、床/机/壁/棚で少し差を出す
 */
function softenShadowScale(input: number) {
  const safe = clamp(input, 0.25, 4);

  if (safe <= 1) {
    return safe;
  }

  /**
   * 1を超えた分を 70% だけ効かせる
   * 例:
   * - 1.0 -> 1.0
   * - 2.0 -> 1.7
   * - 4.0 -> 3.1
   */
  return 1 + (safe - 1) * 0.7;
}

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
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  const shadowRaw =
    raw.shadow && typeof raw.shadow === "object"
      ? (raw.shadow as Record<string, unknown>)
      : {};

  const backgroundRaw =
    raw.background && typeof raw.background === "object"
      ? (raw.background as Record<string, unknown>)
      : {};

  /**
   * 重要
   * - 商品位置 / 商品サイズは既存の広い可動域を維持する
   * - 背景も既存のまま維持する
   * - 影だけは「自由移動」ではなく「微調整」に寄せる
   */
  return {
    scale: clamp(Number(raw.scale ?? 1), 0.2, 4.4),

    /**
     * フロントと一致
     */
    x: clamp(Number(raw.x ?? 0.5), -0.75, 1.75),
    y: clamp(Number(raw.y ?? 0.5), -0.75, 1.75),

    shadow: {
      opacity: clamp(Number(shadowRaw.opacity ?? 0.2), 0, 1),
      blur: clamp(Number(shadowRaw.blur ?? 14), 0, 200),

      /**
       * 影の scale 自体は既存レンジを維持する
       * 実際の効き方は makeGroundShadow 内で少し弱める
       */
      scale: clamp(Number(shadowRaw.scale ?? 1.05), 0.25, 4),

      /**
       * ここが今回の重要修正
       * - 左右は -0.25〜0.25
       * - 上下は -0.25〜0.25
       *
       * ProductPlacementEditor 側と一致させる
       */
      offsetX: clamp(
        Number(shadowRaw.offsetX ?? 0),
        SHADOW_OFFSET_X_EFFECTIVE_MIN,
        SHADOW_OFFSET_X_EFFECTIVE_MAX
      ),
      offsetY: clamp(
        Number(shadowRaw.offsetY ?? 0.03),
        SHADOW_OFFSET_Y_EFFECTIVE_MIN,
        SHADOW_OFFSET_Y_EFFECTIVE_MAX
      ),
    },

    background: {
      scale: clamp(Number(backgroundRaw.scale ?? 1), 0.5, 3),
      x: clamp(Number(backgroundRaw.x ?? 0), -1, 1),
      y: clamp(Number(backgroundRaw.y ?? 0), -1, 1),
    },
  };
}

async function transformBackground(
  buf: Buffer,
  mode: ProductPhotoMode,
  sellDirection: SellDirection,
  background?: {
    scale: number;
    x: number;
    y: number;
  }
): Promise<Buffer> {
  const brightness =
    mode === "template" ? 0.97 : sellDirection === "branding" ? 0.96 : 0.95;

  const saturation =
    mode === "template" ? 0.94 : sellDirection === "branding" ? 1.0 : 0.98;

  /**
   * まず色味だけ整える
   */
  const base = await sharp(buf, { failOn: "none" })
    .modulate({
      brightness,
      saturation,
    })
    .linear(mode === "template" ? 1.015 : 1.02, mode === "template" ? -3 : -4)
    .png()
    .toBuffer();

  const meta = await sharp(base).metadata();
  const srcW = Math.max(1, meta.width || 1024);
  const srcH = Math.max(1, meta.height || 1024);

  const canvas = 1024;
  const bgScale = clamp(Number(background?.scale ?? 1), 0.5, 3);
  const bgX = clamp(Number(background?.x ?? 0), -1, 1);
  const bgY = clamp(Number(background?.y ?? 0), -1, 1);

  /**
   * object-fit: cover と同じ基準サイズ
   */
  const coverScale = Math.max(canvas / srcW, canvas / srcH);
  const drawW = Math.max(1, Math.round(srcW * coverScale * bgScale));
  const drawH = Math.max(1, Math.round(srcH * coverScale * bgScale));

  /**
   * 背景を一度拡大し、その後 1024x1024 を切り出す
   * preview 側の意味に揃える
   */
  const resized = await sharp(base, { failOn: "none" })
    .resize(drawW, drawH, {
      fit: "fill",
    })
    .png()
    .toBuffer();

  const overflowX = Math.max(0, drawW - canvas);
  const overflowY = Math.max(0, drawH - canvas);

  const extractLeft = clamp(
    Math.round(overflowX / 2 + bgX * (overflowX / 2)),
    0,
    Math.max(0, drawW - canvas)
  );

  const extractTop = clamp(
    Math.round(overflowY / 2 + bgY * (overflowY / 2)),
    0,
    Math.max(0, drawH - canvas)
  );

  return await sharp(resized, { failOn: "none" })
    .extract({
      left: extractLeft,
      top: extractTop,
      width: canvas,
      height: canvas,
    })
    .png()
    .toBuffer();
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

/**
 * 既存機能維持のため残す
 * 現在は transformBackground() を使っているが、
 * 将来比較や切り戻しで使えるため削除しない
 */
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

  /**
   * ここが今回の重要修正
   * - 保存値のレンジは維持しつつ、
   *   実際の影広がりへの効き方を少し丸める
   * - 影が商品の存在感を食わないようにする
   */
  const scale = softenShadowScale(shadow?.scale ?? 1);

  const safeOffsetX = clamp(
    Number(shadow?.offsetX ?? 0),
    SHADOW_OFFSET_X_EFFECTIVE_MIN,
    SHADOW_OFFSET_X_EFFECTIVE_MAX
  );

  const safeOffsetY = clamp(
    Number(shadow?.offsetY ?? 0.03),
    SHADOW_OFFSET_Y_EFFECTIVE_MIN,
    SHADOW_OFFSET_Y_EFFECTIVE_MAX
  );

  const w = Math.max(60, Math.round(shadowWidth * baseScale * scale));
  const h =
    groundingType === "shelf" || groundingType === "display"
      ? Math.max(10, Math.round(w * 0.06))
      : Math.max(8, Math.round(w * 0.08));

  const lightShiftX = light === "left" ? 8 : light === "right" ? -8 : 0;

  /**
   * ここが今回の最重要修正
   *
   * 以前:
   * - offsetX * 80
   * - offsetY * 80 / * 60
   *
   * 今回:
   * - offsetX * 24
   * - offsetY * 24
   *
   * これで影が「別物のように飛ぶ」現象を大きく減らす
   * ProductPlacementEditor の preview 側とも思想を揃える
   */
  const cx = Math.round(
    centerX + lightShiftX + safeOffsetX * SHADOW_OFFSET_X_PIXELS
  );

  const cy =
    groundingType === "shelf" || groundingType === "display"
      ? Math.round(contactY + 1 + safeOffsetY * SHADOW_OFFSET_Y_PIXELS)
      : Math.round(contactY + 2 + safeOffsetY * SHADOW_OFFSET_Y_PIXELS);

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
    productCategory === "furniture"
      ? 118
      : productSize === "large"
        ? 122
        : productSize === "small"
          ? 136
          : 130;

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

  const baseBottomMargin = resolveBottomMargin(
    groundingType,
    productCategory,
    productSize,
    bgScene
  );

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

  /**
   * 商品側の既存可動域は維持する
   */
  const overflowX = Math.round(fgWidth * 0.75);
  const overflowY = Math.round(fgHeight * 0.75);

  left = clamp(left, -overflowX, Math.max(-overflowX, canvas - fgWidth + overflowX));

  const maxTop =
    groundingType === "hanging"
      ? canvas - fgHeight - 20
      : groundingType === "wall"
        ? canvas - fgHeight - 40
        : canvas - fgHeight - 10;

  top = clamp(top, -overflowY, Math.max(-overflowY, maxTop + overflowY));

  const isNearDefaultX =
    groundingType === "shelf" || groundingType === "display"
      ? Math.abs(placement.x - 0.5) <= 0.08
      : Math.abs(placement.x - 0.5) <= 0.03;

  const isNearDefaultY =
    groundingType === "shelf" || groundingType === "display"
      ? Math.abs(placement.y - 0.5) <= 0.08
      : Math.abs(placement.y - 0.5) <= 0.03;

  if (isNearDefaultX) {
    left = clamp(defaultLeft, -overflowX, Math.max(-overflowX, canvas - fgWidth + overflowX));
  }

  if (isNearDefaultY) {
    top = clamp(defaultTop, -overflowY, Math.max(-overflowY, maxTop + overflowY));
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

  const insideCanvas =
    left >= -Math.round(fgWidth * 0.75) &&
    top >= -Math.round(fgHeight * 0.75) &&
    left + fgWidth <= canvas + Math.round(fgWidth * 0.75) &&
    top + fgHeight <= canvas + Math.round(fgHeight * 0.75);

  const groundingLikelyOk =
    groundingType === "hanging"
      ? true
      : groundingType === "wall"
        ? top + fgHeight <= canvas + Math.round(fgHeight * 0.75)
        : groundingType === "shelf" || groundingType === "display"
          ? top + fgHeight <= canvas + Math.round(fgHeight * 0.75)
          : top + fgHeight <= canvas + Math.round(fgHeight * 0.75);

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
      score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 50 ? "fair" : "weak",
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

    const backgroundTuned = await transformBackground(
      backgroundRaw,
      activePhotoMode,
      sellDirection,
      placement.background
    );

    /**
     * 🔥 フロントと完全一致させる
     *
     * 重要
     * - 以前の effectiveProductWidthRatio ベース計算を消した結果、
     *   下の quality/meta 参照だけ残って TS エラーになっていた
     * - ここでは preview と同じく「元画像サイズ × scale」の思想を優先しつつ、
     *   既存の meta / quality 互換のために ratio も再計算して残す
     */
/**
 * 重要
 * - preview 側は trimmed 後の見た目サイズを基準にしている
 * - server 側も同じ基準にそろえる
 * - 先に trim 後メタデータを取り、その trimmed 幅高を基準に targetWidth を計算する
 */
const trimmedMeta = await sharp(foregroundRaw, { failOn: "none" })
  .ensureAlpha()
  .trim()
  .metadata();

const trimmedIw = Math.max(1, trimmedMeta.width || 1024);
const trimmedIh = Math.max(1, trimmedMeta.height || 1024);

const baseScale = Math.min(CANVAS / trimmedIw, CANVAS / trimmedIh);
const finalScale = baseScale * placement.scale;

/**
 * 実際に resize に渡す幅
 * - trim 後の見た目幅を基準にする
 * - preview と server の基準を一致させる
 */
const productTargetWidth = Math.max(1, Math.round(trimmedIw * finalScale));

/**
 * 互換維持用
 * - quality / meta でまだ使っているため残す
 */
const effectiveProductWidthRatio = clamp(
  productTargetWidth / CANVAS,
  0.18,
  0.82
);

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
  } catch (e: unknown) {
    console.error("[compose-product-stage] error:", e);

    const message =
      e instanceof Error ? e.message : "compose product stage failed";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}