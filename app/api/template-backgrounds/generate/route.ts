// /app/api/template-backgrounds/generate/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getStorage } from "firebase-admin/storage";

import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminDb } from "@/firebaseAdmin";

/**
 * AOI FLOW
 * テンプレ背景 生成API
 *
 * このAPIの役割
 * - EC販売向けの「商品を主役にしやすいテンプレ背景」を生成する
 * - AI背景（キーワード空間生成）とは別物として扱う
 * - 商品切り抜き画像 / ブランド / Vision / Keywords を参照する
 * - 生成した画像を Storage に保存する
 * - draft に templateBgUrl / templateBgUrls を保存できるようにする
 *
 * 重要
 * - 人物、手、文字、ロゴ、看板は禁止
 * - 商品そのものは背景に描かない
 * - 中央に商品を置ける余白を強く要求する
 * - 販売向けの安定した「壁＋床 / 壁＋天板」構図を優先する
 *
 * 今回は STEP3
 * - まず生成と保存を成立させる
 * - おすすめロジックは STEP4 で別API化する
 */

/* -------------------------------------------------- */
/* 型 */
/* -------------------------------------------------- */

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

type TemplateBgRecommendation = {
  id: string;
  score: number;
  reason: string;
};

/* -------------------------------------------------- */
/* 小関数 */
/* -------------------------------------------------- */

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
      "Do not make the wall pure white; keep slight material realism.",
      "Use generous negative space in the center.",
    ];
  }

  if (category === "white") {
    return [
      "Use a clean white or near-white wall and white/very light floor or tabletop.",
      "Prioritize minimal EC product listing style.",
      "Keep shadows soft and controlled.",
      "Avoid decorative texture that competes with the product.",
      "The result should feel simple, clinical, and commercially usable.",
    ];
  }

  if (category === "dark") {
    return [
      "Use a darker premium wall tone with controlled contrast.",
      "Keep the center readable; do not crush shadows.",
      "Support high-end product presentation.",
      "Use elegant low-noise material surfaces.",
      "Maintain strong product separation from the background.",
    ];
  }

  if (category === "wood") {
    return [
      "Use a natural wood floor or wood tabletop with a calm neutral wall.",
      "Support furniture and goods presentation.",
      "Keep the wood tone believable and not too orange.",
      "Avoid rustic clutter and avoid lifestyle props.",
      "The center must remain wide and open for product placement.",
    ];
  }

  return [
    "Use a studio-like clean background with stable wall-plane and ground-plane.",
    "Prioritize compositing safety over atmosphere.",
    "Keep the scene neutral, balanced, and product-first.",
    "Avoid dramatic perspective.",
    "Keep the center area fully usable.",
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
    ];
  }

  if (category === "goods") {
    return [
      "Goods category.",
      "Prefer stable tabletop or shelf-top presentation when appropriate.",
      "Keep scale believable for a retail listing photo.",
      "Avoid clutter and decorative props.",
      "Support silhouette clarity.",
    ];
  }

  if (category === "apparel") {
    return [
      "Apparel category.",
      "Prefer clean wall presentation and generous whitespace.",
      "Do not create busy interiors.",
      "Keep the wall plane stable and front-facing.",
      "Maintain a retail-clean feeling.",
    ];
  }

  if (category === "small") {
    return [
      "Small product category.",
      "Use very clean minimal background.",
      "Protect silhouette readability strongly.",
      "Avoid over-textured surfaces.",
      "Keep composition extremely stable.",
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
    ];
  }

  if (direction === "trust") {
    return [
      "Selling direction is trust.",
      "Prioritize clarity, cleanliness, and honesty.",
      "Avoid dramatic light and excessive mood.",
      "The background must feel reliable and commercially safe.",
    ];
  }

  if (direction === "story") {
    return [
      "Selling direction is story.",
      "Allow subtle atmosphere only.",
      "Do not introduce props or narrative clutter.",
      "The product must remain the future hero.",
    ];
  }

  return [
    "Selling direction is sales.",
    "Prioritize conversion-friendly background design.",
    "Keep the scene simple, readable, and product-first.",
    "Do not distract from the future product.",
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
      "product-first",
    ],
    12
  );
}

/* -------------------------------------------------- */
/* 本体 */
/* -------------------------------------------------- */

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

    if (!draftId) {
      return bad("draftId is required");
    }

    if (!vision) {
      return bad("vision is required");
    }

    if (!referenceImageUrl) {
      return bad("referenceImageUrl is required");
    }

    const brand = await loadBrand(uid, brandId);
    if (!brand) {
      return bad("brand not found. /flow/brands で作成・保存してください", 400);
    }

    const db = getAdminDb();
    const draftRef = db.collection("drafts").doc(draftId);
    const draftSnap = await draftRef.get();

    if (!draftSnap.exists) {
      return bad("draft not found", 404);
    }

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

    const prompt = [
      "Generate a background image only for later product compositing.",
      "This is a template background for ecommerce product selling.",
      "Do not include the actual product in the output.",
      "Use the reference image only to infer product scale, category fit, grounding logic, and selling context.",
      "The final output must look like a clean sales template background where a product can be placed later.",
      "",
      `Brand: ${String((brand as any).name ?? brandId)}`,
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
      "The result must feel calm, professional, and commercially usable.",
      "The center area should be intentionally left open for a later product.",
      "Return one square image suitable for product listing use.",
    ]
      .filter(Boolean)
      .join("\n");

    const hash = stableHash({
      uid,
      draftId,
      brandId,
      vision,
      keywords,
      referenceImageUrl,
      templateCategory,
      productCategory,
      productSize,
      groundingType,
      sellDirection,
      styleText,
      hardRules,
      type: "template_background_generate_v1",
      size: "1024x1024",
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
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return bad("OPENAI_API_KEY missing", 500);
    }

    const referenceRes = await fetch(referenceImageUrl, {
      method: "GET",
      cache: "no-store" as RequestCache,
    });

    if (!referenceRes.ok) {
      return bad("failed to fetch reference image", 400);
    }

    const referenceBuf = Buffer.from(await referenceRes.arrayBuffer());
    const referenceType = referenceRes.headers.get("content-type") || "image/png";
    const referenceFile = new File([referenceBuf], "reference.png", { type: referenceType });

    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    form.append("size", "1024x1024");
    form.append("image", referenceFile);

    const openaiRes = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    const openaiJson = await openaiRes.json().catch(() => ({} as any));

    if (!openaiRes.ok) {
      return bad(openaiJson?.error?.message || "openai image generation error", 500);
    }

    const b64 = openaiJson?.data?.[0]?.b64_json;
    if (typeof b64 !== "string" || !b64) {
      return bad("no image returned", 500);
    }

    const buf = Buffer.from(b64, "base64");
    const token = crypto.randomUUID();

    await fileRef.save(buf, {
      contentType: "image/png",
      resumable: false,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
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
    });
  } catch (e: any) {
    console.error("[template-backgrounds/generate] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "template background generate failed" },
      { status: 500 }
    );
  }
}