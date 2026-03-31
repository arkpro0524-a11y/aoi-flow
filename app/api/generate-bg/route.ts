import { NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import crypto from "crypto";
import sharp from "sharp";

import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminDb } from "@/firebaseAdmin";

export const runtime = "nodejs";

/**
 * AOI FLOW
 * AI背景生成API
 *
 * 目的
 * - 使用シーンを想起しやすい背景を生成する
 * - 商品そのものは絶対に描かない
 * - テンプレ背景よりは文脈を持たせる
 * - ただし元写真の背景を引きずらない
 *
 * 今回の方針
 * - 昼/夜は固定しない
 * - ただし「背景の面が読める」「中央設置帯が読める」「接地面が読める」を最優先
 * - 黒を絶対禁止ではなく、黒つぶれ・中央つぶれ・接地面つぶれを防ぐ
 * - 正面寄り / 水平接地面 / 中央配置向け / 背景は脇役 を強制
 * - ボヤけを抑えるため prompt と sharp の両方で補正
 * - キャッシュ再利用を避けるため version を更新
 */

type BgScene = "studio" | "lifestyle" | "scale" | "detail";
type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";

const AI_BG_VERSION = "v12_visibility_first_center_band_ground_band";

type ZoneLightStats = {
  mean: number;
  darkPixelRatio: number;
  nearBlackPixelRatio: number;
  blownPixelRatio: number;
};

type ImageVisibilityAnalysis = {
  width: number;
  height: number;
  mean: number;
  minChannelMean: number;
  darkPixelRatio: number;
  nearBlackPixelRatio: number;
  blownPixelRatio: number;
  centerBand: ZoneLightStats;
  lowerBand: ZoneLightStats;
};

function stableHash(input: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 32);
}

function buildDownloadUrl(bucketName: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;
}

function compactKeywords(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function compactConstraints(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeKeyword(input: unknown): string {
  return String(input ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function normalizeScene(input: unknown): BgScene {
  const v = String(input ?? "").trim();
  if (v === "studio") return "studio";
  if (v === "lifestyle") return "lifestyle";
  if (v === "scale") return "scale";
  if (v === "detail") return "detail";
  return "studio";
}

function normalizeProductCategory(input: unknown): ProductCategory {
  const v = String(input ?? "").trim();
  if (v === "furniture") return "furniture";
  if (v === "goods") return "goods";
  if (v === "apparel") return "apparel";
  if (v === "small") return "small";
  return "other";
}

function normalizeProductSize(input: unknown): ProductSize {
  const v = String(input ?? "").trim();
  if (v === "large") return "large";
  if (v === "small") return "small";
  return "medium";
}

function normalizeGroundingType(input: unknown): GroundingType {
  const v = String(input ?? "").trim();
  if (v === "table") return "table";
  if (v === "hanging") return "hanging";
  if (v === "wall") return "wall";
  return "floor";
}

function normalizeSellDirection(input: unknown): SellDirection {
  const v = String(input ?? "").trim();
  if (v === "branding") return "branding";
  if (v === "trust") return "trust";
  if (v === "story") return "story";
  return "sales";
}

async function loadBrand(uid: string, brandId: string) {
  const db = getAdminDb();
  const snap = await db.doc(`users/${uid}/brands/${brandId}`).get();
  if (!snap.exists) return null;
  return snap.data() as Record<string, unknown>;
}

function readBrandTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? "").trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n|,|、/g)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return [];
}

function buildBaseHardRules(): string[] {
  return [
    "Do NOT include the actual product itself in the generated image.",
    "Do NOT include any people, hands, fingers, arms, or body parts.",
    "Do NOT include any text, watermark, logo, signage, brand mark, or letters.",
    "Do NOT include excessive props or attention-grabbing objects.",
    "The background exists only to support the future product.",
    "The product must remain the future visual hero.",
    "Do not make the background more visually important than the product will be.",
    "The composition must feel natural when a product is placed in the exact center.",
    "Keep the central placement zone wide, clean, readable, and unobstructed.",
    "Leave room for a product occupying roughly 30 to 45 percent of frame width.",
    "Use a front-facing or near-front-facing sales composition.",
    "Avoid dramatic angle views, diagonal perspective, and cinematic framing.",
    "Prefer balanced left-right composition.",
    "Use a clearly readable horizontal contact plane when grounding requires it.",
    "The surface for placement must feel stable and level, not tilted.",
    "Do not reinterpret or inherit the original product photo background.",
    "Day or night is allowed, but the background must remain readable across the whole frame.",
    "Wall, floor, table, shelf, and main surfaces must remain visible.",
    "Do not create crushed blacks.",
    "Do not hide the center placement zone in darkness.",
    "Do not hide the lower grounding zone in darkness.",
    "Do not use spotlight-only lighting with the rest falling into darkness.",
    "Maintain natural scene readability across the full frame.",
    "Avoid dark corners that swallow background detail.",
    "Avoid pure black empty zones behind the future product.",
    "Avoid strong vignette.",
    "Keep props minimal and away from the center.",
    "Any contextual objects must stay secondary, sparse, and peripheral.",
    "Use clear, crisp, and sharp visual details.",
    "Avoid blur, haze, fog, mist, or soft-focus effects.",
    "Avoid shallow depth of field.",
    "Keep the full scene as sharp as possible.",
    "Do not simulate bokeh or cinematic blur.",
    "Edges and surfaces must appear clean and well-defined.",
    "This is a product-selling background, not an artistic photograph.",
    "Clarity and visibility are more important than mood.",
  ];
}

function buildSceneRules(scene: BgScene): string[] {
  if (scene === "studio") {
    return [
      "Use a controlled studio-like selling background.",
      "Keep composition front-facing, stable, and simple.",
      "The center area must remain open for product placement.",
      "Prefer symmetry or near-symmetry.",
      "No clutter.",
      "Low-noise background.",
      "This scene should feel safest for centered product placement.",
      "Keep the entire scene crisp and in focus.",
    ];
  }

  if (scene === "lifestyle") {
    return [
      "Create a believable use-context background for selling.",
      "Keep the composition front-facing or near-front-facing.",
      "The center must remain open for later product placement.",
      "Context should stay subtle and secondary.",
      "Do not create a busy real-room snapshot.",
      "Do not let lifestyle objects dominate the frame.",
      "The result must still feel like a product-selling background.",
      "Do not blur the scene for mood.",
      "Keep surfaces and edges readable.",
    ];
  }

  if (scene === "scale") {
    return [
      "Create a subtle scale-supporting background.",
      "Keep the composition stable, balanced, and front-oriented.",
      "Keep the center area open and usable.",
      "Use environmental cues only if subtle and peripheral.",
      "Do not overpower the future product.",
      "Stay commercially usable.",
      "The scene must still support centered product placement naturally.",
      "Keep the whole background visually clear.",
    ];
  }

  return [
    "Create a detail-supportive background.",
    "Support texture and material imagination without adding hero objects.",
    "Use a calm, low-noise, front-oriented composition.",
    "Open center area for later product placement.",
    "No distracting hero objects.",
    "The result must still feel like a selling background.",
    "Do not soften the image with blur.",
    "Keep the background evenly visible.",
  ];
}

function buildCategoryRules(category: ProductCategory): string[] {
  if (category === "furniture") {
    return [
      "Furniture category.",
      "Prefer floor grounding.",
      "Prefer calm spaces with modest depth.",
      "Avoid cramped corners and narrow staged areas.",
      "Keep the center area broad enough for a furniture product.",
      "Do not place extra furniture near the center.",
      "The result must support centered product placement naturally.",
      "Keep the main wall and floor relationship stable and front-oriented.",
    ];
  }

  if (category === "goods") {
    return [
      "Goods category.",
      "Prefer tabletop, shelf, or stable small-object environment.",
      "Support material texture visibility.",
      "Do not place props near the center.",
      "Keep the hero area organized.",
      "Avoid overly decorative scenes.",
      "The center area must support a centered product naturally.",
      "Keep contextual objects sparse and near the edges only.",
    ];
  }

  if (category === "apparel") {
    return [
      "Apparel category.",
      "Prefer clean wall-oriented environments.",
      "Allow subtle lifestyle atmosphere only.",
      "Use generous whitespace.",
      "Do not create busy interiors.",
      "Do not add mannequins, people, or fashion props as main objects.",
      "Keep the composition front-facing and clean.",
    ];
  }

  if (category === "small") {
    return [
      "Small product category.",
      "Prefer minimal and clean environments.",
      "Protect silhouette visibility strongly.",
      "Do not overpower the subject with huge environmental cues.",
      "Keep composition stable.",
      "Avoid visual noise.",
      "Prefer sharper, simpler surfaces.",
    ];
  }

  return [
    "Other product category.",
    "Keep the scene commercially usable and calm.",
    "Maintain open center area.",
    "Support later product placement naturally.",
  ];
}

function buildGroundingRules(groundingType: GroundingType): string[] {
  if (groundingType === "floor") {
    return [
      "Grounding type is floor.",
      "A believable floor plane must exist in the center area.",
      "The floor must visually support natural centered product contact.",
      "The floor line must feel level and stable.",
      "Avoid steps, benches, or objects crossing the center area.",
      "Do not use aggressive perspective on the floor plane.",
      "The lower part of the image must remain readable enough for product grounding.",
    ];
  }

  if (groundingType === "table") {
    return [
      "Grounding type is table.",
      "A believable tabletop or shelf plane must exist in the center area.",
      "The tabletop must be wide, stable, and visually level.",
      "The table surface must support natural centered product placement.",
      "Avoid clutter around the future contact area.",
      "Do not use diagonal or tilted tabletop perspective.",
      "The lower-middle area must remain readable for product grounding.",
    ];
  }

  if (groundingType === "hanging") {
    return [
      "Grounding type is hanging.",
      "Leave a clean central hanging area.",
      "No table or floor contact is required in the center.",
      "Keep the wall plane front-facing and stable.",
      "Avoid clutter and avoid strong surrounding props.",
      "The composition must still feel centered and balanced.",
    ];
  }

  return [
    "Grounding type is wall.",
    "Leave a clean central wall-facing placement area.",
    "The scene should support wall-near presentation.",
    "Keep the wall plane front-facing and stable.",
    "Do not force a floor-contact look in the center area.",
    "Keep surrounding context minimal and peripheral.",
  ];
}

function buildSizeRules(productSize: ProductSize): string[] {
  if (productSize === "large") {
    return [
      "Product size is large.",
      "Background scale must feel spacious enough.",
      "Avoid tiny or cramped-looking environments.",
      "The center area should support a large subject naturally.",
    ];
  }

  if (productSize === "small") {
    return [
      "Product size is small.",
      "Avoid oversized environmental cues that dwarf the future product.",
      "Keep scale cues subtle and controlled.",
      "The center area should suit a compact subject.",
    ];
  }

  return [
    "Product size is medium.",
    "Use balanced environmental scale.",
    "The center area should support a medium-sized subject naturally.",
  ];
}

function buildSellDirectionRules(direction: SellDirection): string[] {
  if (direction === "branding") {
    return [
      "Selling direction is branding.",
      "Allow a stronger world view than template backgrounds.",
      "Still keep the future product as the hero.",
      "Avoid excessive art-direction that harms sellability.",
      "Do not reduce visibility for mood.",
      "Do not darken the empty background for atmosphere.",
    ];
  }

  if (direction === "trust") {
    return [
      "Selling direction is trust.",
      "Prioritize clarity, cleanliness, and believability.",
      "Avoid dramatic lighting and excessive mood.",
      "Make the result feel honest and commercially reliable.",
      "Keep the image clear and crisp.",
    ];
  }

  if (direction === "story") {
    return [
      "Selling direction is story.",
      "Support a subtle narrative context.",
      "Do not let the environment become the main subject.",
      "Maintain commercial usability.",
      "Do not add cinematic blur.",
      "Story must not reduce readability of the background.",
    ];
  }

  return [
    "Selling direction is sales.",
    "Prioritize conversion-friendly commercial clarity.",
    "Keep the scene readable and product-supportive.",
    "The image should help users imagine ownership or use.",
    "Sharpness and readability are critical.",
    "Usability is more important than mood.",
  ];
}

function buildKeywordAssistRules(keyword: string): string[] {
  const k = keyword.toLowerCase();
  if (!k) return [];

  if (k.includes("玄関") || k.includes("entry")) {
    return [
      "If entryway context is used, keep it calm and minimal.",
      "Avoid clutter, shoes, signage, or strong decorative items.",
      "Keep the center placement area open.",
      "Keep walls and floor visible and readable.",
    ];
  }

  if (k.includes("書斎") || k.includes("study") || k.includes("desk")) {
    return [
      "If study context is used, keep desk or shelf lines stable and clean.",
      "Avoid messy workspaces.",
      "Keep the center area usable for product placement.",
      "Keep books and desk items sparse and peripheral.",
      "Do not let the back wall disappear into darkness.",
    ];
  }

  if (k.includes("薬局") || k.includes("clinic") || k.includes("受付")) {
    return [
      "If pharmacy or reception context is used, keep it clean, minimal, and trustworthy.",
      "Avoid signage and counters crossing the center area.",
      "Avoid deep busy interiors.",
      "Prefer clear, readable commercial indoor visibility.",
    ];
  }

  return [
    `The background should express this keyword context naturally: ${keyword}`,
    "Use the keyword as scene guidance only, not as text in the image.",
  ];
}

function validateReferenceImageUrl(input: unknown): string {
  const v = String(input ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return "";
}

function buildPrompt(args: {
  brandId: string;
  brandName: string;
  vision: string;
  keywords: string[];
  keyword: string;
  scene: BgScene;
  productCategory: ProductCategory;
  productSize: ProductSize;
  groundingType: GroundingType;
  sellDirection: SellDirection;
  styleText: string;
  mergedRules: string[];
}) {
  const {
    brandId,
    brandName,
    vision,
    keywords,
    keyword,
    scene,
    productCategory,
    productSize,
    groundingType,
    sellDirection,
    styleText,
    mergedRules,
  } = args;

  return [
    "Generate a background image only for later product compositing.",
    "Do not include the product itself in the output.",
    "This is an AI-generated selling background, not a hero artwork.",
    "The future product will be placed in the center and must look natural there.",
    "Use a front-facing or near-front-facing composition.",
    "Make the contact plane horizontal, stable, and visually believable.",
    "Keep the background secondary so the product becomes the strongest focal point.",
    "Do not reinterpret any original product photo background.",
    "Day or night is allowed.",
    "However, the full background must remain readable as a selling image.",
    "Wall, floor, table, shelf, and main surfaces must remain visible.",
    "The center placement zone must remain visible.",
    "The lower grounding zone must remain visible.",
    "Do not create crushed blacks.",
    "Do not create dark corners or empty black zones.",
    "Do not use spotlight-only lighting with the rest falling into darkness.",
    "Use only a small amount of contextual storytelling.",
    "Do not add too many props.",
    "Any props must stay sparse, subtle, and away from the center.",
    "Keep the whole scene crisp and in focus.",
    "Avoid blur, haze, soft-focus, bokeh, or cinematic depth-of-field.",
    "The final image must feel commercially usable, believable, sharp, naturally readable, and product-supportive.",
    "",
    `Brand: ${brandName || brandId}`,
    `Vision: ${vision}`,
    `Background keyword: ${keyword}`,
    `Scene type: ${scene}`,
    `Product category: ${productCategory}`,
    `Product size: ${productSize}`,
    `Grounding type: ${groundingType}`,
    `Selling direction: ${sellDirection}`,
    keywords.length ? `Keywords: ${keywords.join(", ")}` : "",
    styleText ? `Style: ${styleText}` : "",
    "",
    "Strict rules:",
    ...mergedRules.map((r) => `- ${r}`),
    "",
    "The background must help buyers imagine the product in context while keeping the product as the clear future hero.",
    "Return one square image suitable for later compositing with a protected real product.",
  ]
    .filter(Boolean)
    .join("\n");
}

function calcZoneStats(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  channels: number,
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number
): ZoneLightStats {
  let sum = 0;
  let darkCount = 0;
  let nearBlackCount = 0;
  let blownCount = 0;
  let count = 0;

  const xs = Math.max(0, Math.min(width, xStart));
  const xe = Math.max(xs, Math.min(width, xEnd));
  const ys = Math.max(0, Math.min(height, yStart));
  const ye = Math.max(ys, Math.min(height, yEnd));

  for (let y = ys; y < ye; y++) {
    for (let x = xs; x < xe; x++) {
      const i = (y * width + x) * channels;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;

      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += luminance;

      if (luminance < 58) darkCount += 1;
      if (luminance < 28) nearBlackCount += 1;
      if (luminance > 245) blownCount += 1;

      count += 1;
    }
  }

  const safeCount = Math.max(1, count);

  return {
    mean: sum / safeCount,
    darkPixelRatio: darkCount / safeCount,
    nearBlackPixelRatio: nearBlackCount / safeCount,
    blownPixelRatio: blownCount / safeCount,
  };
}

async function analyzeImageVisibility(buf: Buffer): Promise<ImageVisibilityAnalysis> {
  const image = sharp(buf, { failOn: "none" });
  const meta = await image.metadata();

  const { data, info } = await image
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = Number(info.width || meta.width || 0);
  const height = Number(info.height || meta.height || 0);
  const channels = Number(info.channels || 3);
  const totalPixels = Math.max(1, width * height);

  let sum = 0;
  let darkCount = 0;
  let nearBlackCount = 0;
  let blownCount = 0;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;

    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luminance;

    if (luminance < 58) darkCount += 1;
    if (luminance < 28) nearBlackCount += 1;
    if (luminance > 245) blownCount += 1;
  }

  const stats = await image.removeAlpha().stats();
  const rMean = stats.channels[0]?.mean ?? 0;
  const gMean = stats.channels[1]?.mean ?? 0;
  const bMean = stats.channels[2]?.mean ?? 0;

  const centerBand = calcZoneStats(
    data,
    width,
    height,
    channels,
    Math.round(width * 0.22),
    Math.round(width * 0.78),
    Math.round(height * 0.28),
    Math.round(height * 0.72)
  );

  const lowerBand = calcZoneStats(
    data,
    width,
    height,
    channels,
    Math.round(width * 0.18),
    Math.round(width * 0.82),
    Math.round(height * 0.62),
    Math.round(height * 0.92)
  );

  return {
    width,
    height,
    mean: sum / totalPixels,
    minChannelMean: Math.min(rMean, gMean, bMean),
    darkPixelRatio: darkCount / totalPixels,
    nearBlackPixelRatio: nearBlackCount / totalPixels,
    blownPixelRatio: blownCount / totalPixels,
    centerBand,
    lowerBand,
  };
}

function shouldApplyVisibilityLift(a: ImageVisibilityAnalysis): boolean {
  return (
    a.mean < 112 ||
    a.minChannelMean < 84 ||
    a.centerBand.mean < 108 ||
    a.lowerBand.mean < 96 ||
    a.centerBand.nearBlackPixelRatio > 0.01 ||
    a.lowerBand.nearBlackPixelRatio > 0.02 ||
    a.nearBlackPixelRatio > 0.03
  );
}

function isUnacceptablyInvisible(a: ImageVisibilityAnalysis): boolean {
  return (
    a.mean < 76 ||
    a.minChannelMean < 54 ||
    a.centerBand.mean < 82 ||
    a.lowerBand.mean < 72 ||
    a.centerBand.nearBlackPixelRatio > 0.08 ||
    a.lowerBand.nearBlackPixelRatio > 0.12 ||
    a.nearBlackPixelRatio > 0.16 ||
    a.blownPixelRatio > 0.22
  );
}

async function applyVisibilityLift(
  buf: Buffer,
  strength: 1 | 2 | 3
): Promise<Buffer> {
  const brightness = strength === 1 ? 1.08 : strength === 2 ? 1.15 : 1.22;
  const gamma = strength === 1 ? 1.12 : strength === 2 ? 1.2 : 1.28;
  const gain = strength === 1 ? 1.02 : strength === 2 ? 1.04 : 1.06;
  const offset = strength === 1 ? 8 : strength === 2 ? 14 : 20;
  const sharpenSigma = strength === 1 ? 0.7 : strength === 2 ? 0.85 : 0.95;

  return await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .resize(1024, 1024, { fit: "cover", position: "centre" })
    .gamma(gamma)
    .modulate({
      brightness,
      saturation: 0.99,
    })
    .linear(gain, offset)
    .sharpen(sharpenSigma)
    .png()
    .toBuffer();
}

async function ensureAcceptableBackground(buf: Buffer): Promise<{
  buffer: Buffer;
  before: ImageVisibilityAnalysis;
  after: ImageVisibilityAnalysis;
}> {
  const before = await analyzeImageVisibility(buf);

  let out = await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .resize(1024, 1024, { fit: "cover", position: "centre" })
    .sharpen(0.7)
    .png()
    .toBuffer();

  let current = await analyzeImageVisibility(out);

  if (shouldApplyVisibilityLift(current)) {
    out = await applyVisibilityLift(out, 1);
    current = await analyzeImageVisibility(out);
  }

  if (shouldApplyVisibilityLift(current)) {
    out = await applyVisibilityLift(out, 2);
    current = await analyzeImageVisibility(out);
  }

  if (shouldApplyVisibilityLift(current)) {
    out = await applyVisibilityLift(out, 3);
    current = await analyzeImageVisibility(out);
  }

  if (isUnacceptablyInvisible(current)) {
    throw new Error(
      `generated background visibility failed (mean=${current.mean.toFixed(
        1
      )}, centerMean=${current.centerBand.mean.toFixed(
        1
      )}, lowerMean=${current.lowerBand.mean.toFixed(
        1
      )}, nearBlack=${current.nearBlackPixelRatio.toFixed(
        3
      )}, centerNearBlack=${current.centerBand.nearBlackPixelRatio.toFixed(
        3
      )}, lowerNearBlack=${current.lowerBand.nearBlackPixelRatio.toFixed(3)})`
    );
  }

  return {
    buffer: out,
    before,
    after: current,
  };
}

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const uid = user.uid;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const draftId = String(body.draftId ?? "").trim();
    const brandId = String(body.brandId ?? "vento").trim();
    const vision = String(body.vision ?? "").trim();
    const keywords = compactKeywords(body.keywords);
    const keyword = normalizeKeyword(body.keyword);

    const scene = normalizeScene(body.scene);
    const productCategory = normalizeProductCategory(body.productCategory);
    const productSize = normalizeProductSize(body.productSize);
    const groundingType = normalizeGroundingType(body.groundingType);
    const sellDirection = normalizeSellDirection(body.sellDirection);

    const hardConstraints = compactConstraints(body.hardConstraints);
    const referenceImageUrl = validateReferenceImageUrl(body.referenceImageUrl);

    if (!draftId) {
      return NextResponse.json({ ok: false, error: "draftId is required" }, { status: 400 });
    }

    if (!vision) {
      return NextResponse.json({ ok: false, error: "vision is required" }, { status: 400 });
    }

    if (!keyword) {
      return NextResponse.json({ ok: false, error: "keyword is required" }, { status: 400 });
    }

    const brand = await loadBrand(uid, brandId);
    if (!brand) {
      return NextResponse.json({ ok: false, error: "brand not found" }, { status: 400 });
    }

    const db = getAdminDb();
    const draftSnap = await db.collection("drafts").doc(draftId).get();

    if (!draftSnap.exists) {
      return NextResponse.json({ ok: false, error: "draft not found" }, { status: 404 });
    }

    const draftData = draftSnap.data() || {};
    if (String(draftData.userId || "") !== uid) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const styleText = String(brand.styleText ?? "").trim();
    const brandRules = readBrandTextArray(brand.rules);

    const mergedRules = [
      ...buildBaseHardRules(),
      ...buildSceneRules(scene),
      ...buildCategoryRules(productCategory),
      ...buildGroundingRules(groundingType),
      ...buildSizeRules(productSize),
      ...buildSellDirectionRules(sellDirection),
      ...buildKeywordAssistRules(keyword),
      ...brandRules,
      ...hardConstraints,
    ].filter(Boolean);

    const prompt = buildPrompt({
      brandId,
      brandName: String((brand as any).displayName || brandId),
      vision,
      keywords,
      keyword,
      scene,
      productCategory,
      productSize,
      groundingType,
      sellDirection,
      styleText,
      mergedRules,
    });

    const hash = stableHash({
      uid,
      draftId,
      brandId,
      vision,
      keywords,
      keyword,
      scene,
      productCategory,
      productSize,
      groundingType,
      sellDirection,
      styleText,
      mergedRules,
      type: "bg_usage_context_v12_visibility_first_center_band_ground_band",
      size: "1024x1024",
      version: AI_BG_VERSION,
    });

    const bucket = getStorage().bucket();
    const objectPath = `users/${uid}/drafts/${draftId}/bg/${hash}.png`;
    const fileRef = bucket.file(objectPath);

    const [exists] = await fileRef.exists();
    if (exists) {
      const [meta] = await fileRef.getMetadata().catch(() => [null as any]);

      const existingToken =
        meta?.metadata?.firebaseStorageDownloadTokens ||
        meta?.metadata?.firebaseStorageDownloadToken ||
        "";

      const token =
        typeof existingToken === "string" && existingToken.trim()
          ? existingToken.split(",")[0].trim()
          : crypto.randomUUID();

      if (!existingToken) {
        await fileRef.setMetadata({
          metadata: {
            firebaseStorageDownloadTokens: token,
          },
          contentType: meta?.contentType || "image/png",
        });
      }

      return NextResponse.json({
        ok: true,
        url: buildDownloadUrl(bucket.name, objectPath, token),
        reused: true,
        draftId,
        scene,
        keyword,
        productCategory,
        productSize,
        groundingType,
        sellDirection,
        meta: {
          purpose: "ai_background",
          version: AI_BG_VERSION,
          referenceImageAccepted: !!referenceImageUrl,
          referenceImageUsedForGeneration: false,
        },
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY missing");
    }

    const openaiRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
      }),
    });

    const openaiJson = await openaiRes.json().catch(() => ({} as any));
    if (!openaiRes.ok) {
      throw new Error(openaiJson?.error?.message || "openai image generation error");
    }

    const b64 = openaiJson?.data?.[0]?.b64_json;
    if (typeof b64 !== "string" || !b64) {
      throw new Error("no image returned");
    }

    const rawBuf = Buffer.from(b64, "base64");
    const ensured = await ensureAcceptableBackground(rawBuf);

    const token = crypto.randomUUID();

    await fileRef.save(ensured.buffer, {
      contentType: "image/png",
      resumable: false,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
          aiBackgroundVersion: AI_BG_VERSION,
          referenceImageAccepted: String(!!referenceImageUrl),
          referenceImageUsedForGeneration: "false",

          meanBefore: ensured.before.mean.toFixed(2),
          meanAfter: ensured.after.mean.toFixed(2),

          minChannelMeanBefore: ensured.before.minChannelMean.toFixed(2),
          minChannelMeanAfter: ensured.after.minChannelMean.toFixed(2),

          darkPixelRatioBefore: ensured.before.darkPixelRatio.toFixed(4),
          darkPixelRatioAfter: ensured.after.darkPixelRatio.toFixed(4),

          nearBlackPixelRatioBefore: ensured.before.nearBlackPixelRatio.toFixed(4),
          nearBlackPixelRatioAfter: ensured.after.nearBlackPixelRatio.toFixed(4),

          blownPixelRatioBefore: ensured.before.blownPixelRatio.toFixed(4),
          blownPixelRatioAfter: ensured.after.blownPixelRatio.toFixed(4),

          centerMeanBefore: ensured.before.centerBand.mean.toFixed(2),
          centerMeanAfter: ensured.after.centerBand.mean.toFixed(2),

          lowerMeanBefore: ensured.before.lowerBand.mean.toFixed(2),
          lowerMeanAfter: ensured.after.lowerBand.mean.toFixed(2),

          centerNearBlackBefore: ensured.before.centerBand.nearBlackPixelRatio.toFixed(4),
          centerNearBlackAfter: ensured.after.centerBand.nearBlackPixelRatio.toFixed(4),

          lowerNearBlackBefore: ensured.before.lowerBand.nearBlackPixelRatio.toFixed(4),
          lowerNearBlackAfter: ensured.after.lowerBand.nearBlackPixelRatio.toFixed(4),
        },
      },
    });

    return NextResponse.json({
      ok: true,
      url: buildDownloadUrl(bucket.name, objectPath, token),
      reused: false,
      draftId,
      scene,
      keyword,
      productCategory,
      productSize,
      groundingType,
      sellDirection,
      meta: {
        purpose: "ai_background",
        version: AI_BG_VERSION,
        referenceImageAccepted: !!referenceImageUrl,
        referenceImageUsedForGeneration: false,
        visibilityBefore: ensured.before,
        visibilityAfter: ensured.after,
      },
    });
  } catch (e: any) {
    console.error("[generate-bg] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "generate bg failed" },
      { status: 500 }
    );
  }
}