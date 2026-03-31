export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";

import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminDb } from "@/firebaseAdmin";

/**
 * AOI FLOW
 * テンプレ背景 生成API
 *
 * 目的
 * - EC / メルカリ / marketplace 向けの「商品を際立たせる背景」を生成する
 * - 商品そのものは絶対に描かない
 * - 元写真の背景を引きずらない
 * - AI背景（使用イメージ背景）とは別責務
 *
 * 今回の修正
 * - referenceImageUrl は受け取るが、OpenAI へ画像として渡さない
 * - images/generations を使う
 * - 生成後の画像に対して暗さ判定を行う
 * - 必要なら軽い明度補正をかける
 * - 暗すぎる画像は弾く
 * - 黒背景キャッシュ再利用を避けるため version を更新
 */

type TemplateBgCategory = "light" | "white" | "dark" | "wood" | "studio";
type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";

type TemplateGenerateBody = {
  draftId?: unknown;
  brandId?: unknown;
  vision?: unknown;
  keywords?: unknown;
  referenceImageUrl?: unknown;
  templateCategory?: unknown;
  productCategory?: unknown;
  productSize?: unknown;
  groundingType?: unknown;
  sellDirection?: unknown;
};

const TEMPLATE_BG_VERSION = "v3_brightness_guard";

type ImageLightAnalysis = {
  mean: number;
  minChannelMean: number;
  darkPixelRatio: number;
  nearBlackPixelRatio: number;
  width: number;
  height: number;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function compactKeywords(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, 16);
}

function normalizeTemplateBgCategory(v: unknown): TemplateBgCategory {
  const s = String(v ?? "").trim();
  if (s === "light") return "light";
  if (s === "white") return "white";
  if (s === "dark") return "dark";
  if (s === "wood") return "wood";
  return "studio";
}

function normalizeProductCategory(v: unknown): ProductCategory {
  const s = String(v ?? "").trim();
  if (s === "furniture") return "furniture";
  if (s === "goods") return "goods";
  if (s === "apparel") return "apparel";
  if (s === "small") return "small";
  return "other";
}

function normalizeProductSize(v: unknown): ProductSize {
  const s = String(v ?? "").trim();
  if (s === "large") return "large";
  if (s === "small") return "small";
  return "medium";
}

function normalizeGroundingType(v: unknown): GroundingType {
  const s = String(v ?? "").trim();
  if (s === "table") return "table";
  if (s === "hanging") return "hanging";
  if (s === "wall") return "wall";
  return "floor";
}

function normalizeSellDirection(v: unknown): SellDirection {
  const s = String(v ?? "").trim();
  if (s === "branding") return "branding";
  if (s === "trust") return "trust";
  if (s === "story") return "story";
  return "sales";
}

function stableHash(input: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
}

function uniqKeepOrder(input: string[], limit = 30): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    const s = String(item ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= limit) break;
  }

  return out;
}

function buildDownloadUrl(bucketName: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;
}

async function loadBrand(uid: string, brandId: string) {
  const db = getAdminDb();
  const ref = db.doc(`users/${uid}/brands/${brandId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as Record<string, unknown>;
}

function readBrandTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
      .slice(0, 30);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n|,|、/g)
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 30);
  }

  return [];
}

function buildTemplateCategoryRules(category: TemplateBgCategory): string[] {
  if (category === "light") {
    return [
      "Use a bright neutral wall and calm floor.",
      "Prefer soft daylight feel.",
      "Keep the overall tone clean and sell-friendly.",
      "Use wide negative space in the center.",
      "Do not create lifestyle clutter.",
      "The image should feel marketplace-ready rather than magazine-like.",
    ];
  }

  if (category === "white") {
    return [
      "Use a clean white or near-white wall and very light floor or tabletop.",
      "Prioritize marketplace and ecommerce listing usability.",
      "Keep shadows soft and controlled.",
      "Avoid decorative textures that compete with the product.",
      "The output should feel simple, reliable, and commercially safe.",
      "Do not add visible room personality.",
    ];
  }

  if (category === "dark") {
    return [
      "Use a darker premium wall tone with controlled contrast.",
      "Keep the center readable and open.",
      "Support premium presentation without becoming dramatic.",
      "Use elegant and low-noise material surfaces.",
      "Maintain strong future product separation from the background.",
      "Avoid cinematic lighting.",
    ];
  }

  if (category === "wood") {
    return [
      "Use a natural wood floor or wood tabletop with a calm neutral wall.",
      "Support furniture and goods presentation.",
      "Keep the wood tone believable and not too orange.",
      "Avoid rustic clutter and avoid lifestyle props.",
      "The center must remain wide and open for product placement.",
      "The result should feel like a clean selling template, not a staged room photo.",
    ];
  }

  return [
    "Use a studio-like clean background with stable wall-plane and ground-plane.",
    "Prioritize compositing safety over atmosphere.",
    "Keep the scene neutral, balanced, and product-first.",
    "Avoid dramatic perspective.",
    "Keep the center area fully usable.",
    "Do not make the image look like a real-room snapshot.",
  ];
}

function buildProductCategoryRules(category: ProductCategory): string[] {
  if (category === "furniture") {
    return [
      "Furniture category.",
      "Background must feel spacious enough.",
      "Prefer readable wall-floor structure.",
      "Avoid cramped corners and tiny rooms.",
      "The center area must support larger product placement naturally.",
      "Do not create multiple furniture objects in the background.",
    ];
  }

  if (category === "goods") {
    return [
      "Goods category.",
      "Prefer stable tabletop or shelf-top presentation when appropriate.",
      "Keep scale believable for a retail listing photo.",
      "Avoid clutter and decorative props.",
      "Support silhouette clarity.",
      "Do not place hero objects near the center.",
    ];
  }

  if (category === "apparel") {
    return [
      "Apparel category.",
      "Prefer clean wall presentation and generous whitespace.",
      "Do not create busy interiors.",
      "Keep the wall plane stable and front-facing.",
      "Maintain a retail-clean feeling.",
      "Do not add visible mannequins, hangers, racks, or styling props unless extremely faint.",
    ];
  }

  if (category === "small") {
    return [
      "Small product category.",
      "Use very clean minimal background.",
      "Protect silhouette readability strongly.",
      "Avoid over-textured surfaces.",
      "Keep composition extremely stable.",
      "Avoid environmental storytelling.",
    ];
  }

  return [
    "Other product category.",
    "Keep the composition commercially safe and neutral.",
    "Center area must remain easy for product placement.",
    "Avoid strong storytelling props.",
  ];
}

function buildGroundingRules(groundingType: GroundingType): string[] {
  if (groundingType === "table") {
    return [
      "Grounding type is table.",
      "A believable horizontal tabletop plane must be clearly visible.",
      "The tabletop edge should not be diagonally aggressive.",
      "Keep a wide clear placement area in the center.",
      "Avoid clutter on the tabletop.",
    ];
  }

  if (groundingType === "hanging") {
    return [
      "Grounding type is hanging.",
      "A clean wall-oriented presentation area is required.",
      "No floor-contact expectation in the center.",
      "The center should remain open and vertically usable.",
      "Avoid strong prop presence.",
    ];
  }

  if (groundingType === "wall") {
    return [
      "Grounding type is wall.",
      "The wall plane must be stable and front-facing.",
      "The center should support wall-near product presentation.",
      "Do not force a visible table into the center.",
      "Keep the result clean and controlled.",
    ];
  }

  return [
    "Grounding type is floor.",
    "A believable floor plane must be visible and stable.",
    "The wall-floor boundary should be readable.",
    "Keep the center open for floor placement.",
    "Avoid strong diagonal perspective on the floor.",
  ];
}

function buildProductSizeRules(size: ProductSize): string[] {
  if (size === "large") {
    return [
      "Product size is large.",
      "Background must feel spacious and not cramped.",
      "Leave sufficient open area for a large subject.",
      "Use broad planes and stable perspective.",
    ];
  }

  if (size === "small") {
    return [
      "Product size is small.",
      "Do not overpower the subject with huge environmental cues.",
      "Keep scale cues subtle.",
      "Use cleaner and tighter minimal framing logic.",
    ];
  }

  return [
    "Product size is medium.",
    "Use balanced scale cues.",
    "Keep enough space for a medium-sized product in the center.",
  ];
}

function buildSellDirectionRules(direction: SellDirection): string[] {
  if (direction === "branding") {
    return [
      "Selling direction is branding.",
      "Allow refined atmosphere but keep the background secondary.",
      "Do not sacrifice selling clarity.",
      "Avoid noisy artistic decisions.",
      "Do not become editorial or lifestyle-first.",
    ];
  }

  if (direction === "trust") {
    return [
      "Selling direction is trust.",
      "Prioritize clarity, cleanliness, and honesty.",
      "Avoid dramatic light and excessive mood.",
      "The background must feel reliable and commercially safe.",
      "Prefer plain and clean presentation.",
    ];
  }

  if (direction === "story") {
    return [
      "Selling direction is story.",
      "Allow subtle atmosphere only.",
      "Do not introduce props or narrative clutter.",
      "The product must remain the future hero.",
      "Keep the background usable for marketplace sale.",
    ];
  }

  return [
    "Selling direction is sales.",
    "Prioritize conversion-friendly background design.",
    "Keep the scene simple, readable, and product-first.",
    "Do not distract from the future product.",
    "This should feel suitable for marketplaces like Mercari.",
  ];
}

function buildCoreHardRules(): string[] {
  return [
    "Do NOT include the actual product itself in the generated background.",
    "Do NOT include people, hands, arms, or body parts.",
    "Do NOT include text, logo, watermark, signage, or letters.",
    "Do NOT include strong props, decorations, or hero objects.",
    "Use a straight-on or near-straight-on view only.",
    "Avoid dramatic wide-angle perspective.",
    "Avoid diagonal room corners and diagonal furniture crossing the center.",
    "Keep the center area open for later product placement.",
    "Support a product occupying roughly 30 to 50 percent of frame width.",
    "This image is for ecommerce selling, not lifestyle storytelling.",
    "The background must stay secondary to the future product.",
    "Do not make the image look like a photo taken with the product already present.",
    "Do not inherit or reinterpret any original photo background.",
    "Lighting must be bright and clear.",
    "Avoid dark or moody lighting.",
    "Background should be well-lit for ecommerce use.",
    "No black or near-black backgrounds.",
  ];
}

function buildTemplateTags(args: {
  templateCategory: TemplateBgCategory;
  productCategory: ProductCategory;
  groundingType: GroundingType;
  sellDirection: SellDirection;
}) {
  const { templateCategory, productCategory, groundingType, sellDirection } = args;

  return uniqKeepOrder(
    [
      templateCategory,
      productCategory,
      groundingType,
      sellDirection,
      "template-background",
      "ec",
      "mercari",
      "product-first",
    ],
    12
  );
}

function buildPrompt(args: {
  brandId: string;
  brandName: string;
  vision: string;
  keywords: string[];
  styleText: string;
  templateCategory: TemplateBgCategory;
  productCategory: ProductCategory;
  productSize: ProductSize;
  groundingType: GroundingType;
  sellDirection: SellDirection;
  hardRules: string[];
}) {
  const {
    brandId,
    brandName,
    vision,
    keywords,
    styleText,
    templateCategory,
    productCategory,
    productSize,
    groundingType,
    sellDirection,
    hardRules,
  } = args;

  return [
    "Generate a clean template background only for later product compositing.",
    "This is NOT a usage-scene background.",
    "This is a selling background for ecommerce and marketplace listing use.",
    "The product itself must not appear.",
    "Do not reinterpret any original product photo background.",
    "Design the output as a controlled selling template where the future product is the hero.",
    "Prioritize readability, empty center space, grounding safety, and commercial usability.",
    "The result should work well for marketplaces such as Mercari.",
    "",
    `Brand: ${brandName || brandId}`,
    `Vision: ${vision}`,
    keywords.length ? `Keywords: ${keywords.join(", ")}` : "",
    styleText ? `Brand style: ${styleText}` : "",
    `Template category: ${templateCategory}`,
    `Product category: ${productCategory}`,
    `Product size: ${productSize}`,
    `Grounding type: ${groundingType}`,
    `Selling direction: ${sellDirection}`,
    "",
    "Strict rules:",
    ...hardRules.map((rule) => `- ${rule}`),
    "",
    "Return one square image suitable for later product listing compositing.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function analyzeImageLight(buf: Buffer): Promise<ImageLightAnalysis> {
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

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;

    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luminance;

    if (luminance < 58) darkCount += 1;
    if (luminance < 28) nearBlackCount += 1;
  }

  const stats = await image.removeAlpha().stats();
  const rMean = stats.channels[0]?.mean ?? 0;
  const gMean = stats.channels[1]?.mean ?? 0;
  const bMean = stats.channels[2]?.mean ?? 0;

  return {
    mean: sum / totalPixels,
    minChannelMean: Math.min(rMean, gMean, bMean),
    darkPixelRatio: darkCount / totalPixels,
    nearBlackPixelRatio: nearBlackCount / totalPixels,
    width,
    height,
  };
}

function isTooDarkImage(a: ImageLightAnalysis): boolean {
  return (
    a.mean < 88 ||
    a.minChannelMean < 72 ||
    a.darkPixelRatio > 0.42 ||
    a.nearBlackPixelRatio > 0.12
  );
}

async function brightenBackgroundImage(
  buf: Buffer,
  mode: "ai" | "template"
): Promise<Buffer> {
  const firstPass = await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .modulate({
      brightness: mode === "template" ? 1.2 : 1.16,
      saturation: mode === "template" ? 0.96 : 0.98,
    })
    .linear(1.05, 8)
    .png()
    .toBuffer();

  const firstAnalysis = await analyzeImageLight(firstPass);
  if (!isTooDarkImage(firstAnalysis)) return firstPass;

  return await sharp(firstPass, { failOn: "none" })
    .removeAlpha()
    .modulate({
      brightness: mode === "template" ? 1.12 : 1.1,
      saturation: 0.98,
    })
    .linear(1.03, 10)
    .png()
    .toBuffer();
}

async function ensureAcceptableBackground(
  buf: Buffer,
  mode: "ai" | "template"
): Promise<{
  buffer: Buffer;
  before: ImageLightAnalysis;
  after: ImageLightAnalysis;
}> {
  const before = await analyzeImageLight(buf);
  const fixed = await brightenBackgroundImage(buf, mode);
  const after = await analyzeImageLight(fixed);

  if (isTooDarkImage(after)) {
    throw new Error(
      `generated background too dark (mean=${after.mean.toFixed(
        1
      )}, darkRatio=${after.darkPixelRatio.toFixed(
        3
      )}, nearBlackRatio=${after.nearBlackPixelRatio.toFixed(3)})`
    );
  }

  return {
    buffer: fixed,
    before,
    after,
  };
}

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const uid = user.uid;

    const body = (await req.json().catch(() => ({}))) as TemplateGenerateBody;

    const draftId = asTrimmedString(body.draftId);
    const brandId = asTrimmedString(body.brandId) || "vento";
    const vision = asTrimmedString(body.vision);
    const keywords = compactKeywords(body.keywords);
    const referenceImageUrl = asTrimmedString(body.referenceImageUrl);

    const templateCategory = normalizeTemplateBgCategory(body.templateCategory);
    const productCategory = normalizeProductCategory(body.productCategory);
    const productSize = normalizeProductSize(body.productSize);
    const groundingType = normalizeGroundingType(body.groundingType);
    const sellDirection = normalizeSellDirection(body.sellDirection);

    if (!draftId) return bad("draftId is required");
    if (!vision) return bad("vision is required");

    const brand = await loadBrand(uid, brandId);
    if (!brand) {
      return bad("brand not found. /flow/brands で作成・保存してください", 400);
    }

    const db = getAdminDb();
    const draftRef = db.collection("drafts").doc(draftId);
    const draftSnap = await draftRef.get();

    if (!draftSnap.exists) return bad("draft not found", 404);

    const draftData = draftSnap.data() || {};
    if (String(draftData.userId || "") !== uid) {
      return bad("forbidden", 403);
    }

    const styleText = asTrimmedString((brand as any).styleText);
    const brandRules = readBrandTextArray((brand as any).rules);

    const hardRules = [
      ...buildCoreHardRules(),
      ...buildTemplateCategoryRules(templateCategory),
      ...buildProductCategoryRules(productCategory),
      ...buildGroundingRules(groundingType),
      ...buildProductSizeRules(productSize),
      ...buildSellDirectionRules(sellDirection),
      ...brandRules,
    ];

    const prompt = buildPrompt({
      brandId,
      brandName: String((brand as any).name ?? brandId),
      vision,
      keywords,
      styleText,
      templateCategory,
      productCategory,
      productSize,
      groundingType,
      sellDirection,
      hardRules,
    });

    const hash = stableHash({
      uid,
      draftId,
      brandId,
      vision,
      keywords,
      templateCategory,
      productCategory,
      productSize,
      groundingType,
      sellDirection,
      styleText,
      hardRules,
      type: "template_background_generate_v3_no_reference_image_brightness_guard",
      size: "1024x1024",
      version: TEMPLATE_BG_VERSION,
    });

    const bucket = getStorage().bucket();
    const objectPath = `users/${uid}/drafts/${draftId}/template-bg/${templateCategory}_${hash}.png`;
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

      const url = buildDownloadUrl(bucket.name, objectPath, token);

      const prevTemplateBgUrls = Array.isArray(draftData.templateBgUrls)
        ? draftData.templateBgUrls.map((v: unknown) => String(v ?? "").trim()).filter(Boolean)
        : [];

      const nextTemplateBgUrls = uniqKeepOrder([url, ...prevTemplateBgUrls], 30);
      const tags = buildTemplateTags({
        templateCategory,
        productCategory,
        groundingType,
        sellDirection,
      });

      await draftRef.set(
        {
          templateBgUrl: url,
          templateBgUrls: nextTemplateBgUrls,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      return NextResponse.json({
        ok: true,
        reused: true,
        url,
        imageUrl: url,
        templateCategory,
        tags,
        templateId: `${templateCategory}_${hash}`,
        meta: {
          purpose: "template_background",
          version: TEMPLATE_BG_VERSION,
          referenceImageAccepted: !!referenceImageUrl,
          referenceImageUsedForGeneration: false,
        },
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return bad("OPENAI_API_KEY missing", 500);

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
      return bad(openaiJson?.error?.message || "openai image generation error", 500);
    }

    const b64 = openaiJson?.data?.[0]?.b64_json;
    if (typeof b64 !== "string" || !b64) {
      return bad("no image returned", 500);
    }

    const rawBuf = Buffer.from(b64, "base64");
    const ensured = await ensureAcceptableBackground(rawBuf, "template");

    const token = crypto.randomUUID();

    await fileRef.save(ensured.buffer, {
      contentType: "image/png",
      resumable: false,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
          templateBackgroundVersion: TEMPLATE_BG_VERSION,
          referenceImageAccepted: String(!!referenceImageUrl),
          referenceImageUsedForGeneration: "false",
          lightMeanBefore: ensured.before.mean.toFixed(2),
          lightMeanAfter: ensured.after.mean.toFixed(2),
          darkPixelRatioBefore: ensured.before.darkPixelRatio.toFixed(4),
          darkPixelRatioAfter: ensured.after.darkPixelRatio.toFixed(4),
          nearBlackPixelRatioBefore: ensured.before.nearBlackPixelRatio.toFixed(4),
          nearBlackPixelRatioAfter: ensured.after.nearBlackPixelRatio.toFixed(4),
        },
      },
    });

    const url = buildDownloadUrl(bucket.name, objectPath, token);

    const prevTemplateBgUrls = Array.isArray(draftData.templateBgUrls)
      ? draftData.templateBgUrls.map((v: unknown) => String(v ?? "").trim()).filter(Boolean)
      : [];

    const nextTemplateBgUrls = uniqKeepOrder([url, ...prevTemplateBgUrls], 30);

    const tags = buildTemplateTags({
      templateCategory,
      productCategory,
      groundingType,
      sellDirection,
    });

    await draftRef.set(
      {
        templateBgUrl: url,
        templateBgUrls: nextTemplateBgUrls,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      reused: false,
      url,
      imageUrl: url,
      templateCategory,
      tags,
      templateId: `${templateCategory}_${hash}`,
      meta: {
        purpose: "template_background",
        version: TEMPLATE_BG_VERSION,
        referenceImageAccepted: !!referenceImageUrl,
        referenceImageUsedForGeneration: false,
        lightBefore: ensured.before,
        lightAfter: ensured.after,
      },
    });
  } catch (e: any) {
    console.error("[template-backgrounds/generate] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "template background generate failed" },
      { status: 500 }
    );
  }
}