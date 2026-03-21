//app/api/generate-bg/route.ts
import { NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import crypto from "crypto";

import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminDb } from "@/firebaseAdmin";

export const runtime = "nodejs";

/**
 * AOI FLOW
 * 背景生成API（正面背景固定 強化版）
 *
 * このAPIの役割
 * - 背景画像だけを生成する
 * - 商品そのものは絶対に含めない
 * - 商品画像を参照しながら、商品に合う背景を生成する
 * - 生成結果は draft 単位で保存する
 * - 同条件なら再利用する
 *
 * 今回の重要改善
 * - 背景の自由度を下げる
 * - 正面固定 / 低パース / 中央空き をかなり強く要求する
 * - 家具や雑貨でズレやすい「斜め空間」を出にくくする
 */

type BgScene = "studio" | "lifestyle" | "scale" | "detail";
type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";

function stableHash(input: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
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

function buildFrontFixedRules(): string[] {
  return [
    "Use a straight-on front-facing composition.",
    "Use only low perspective distortion.",
    "Avoid strong vanishing lines.",
    "Avoid dramatic room depth.",
    "Avoid corner-room composition.",
    "Avoid diagonal walls, diagonal shelves, diagonal benches, and diagonal tables.",
    "Keep the center placement zone unobstructed.",
    "Do not let furniture cross through the center placement zone.",
    "Prefer balanced left-right composition.",
    "The wall-floor or wall-table boundary should feel stable and readable.",
    "Do not create cinematic wide-angle perspective.",
    "This must feel like a stable front product-photo background.",
  ];
}

function buildSceneRules(scene: BgScene): string[] {
  if (scene === "studio") {
    return [
      "Use a front-facing studio-like background.",
      "Keep composition clean and simple.",
      "Center area must remain open for product placement.",
      "Stable horizontal surface is required when grounding is floor or table.",
      "No clutter.",
      "Low-noise background.",
      "This should be the safest compositing background.",
    ];
  }

  if (scene === "lifestyle") {
    return [
      "Use a front-facing calm interior background.",
      "Allow only light lifestyle context around the edges.",
      "The center must remain open for later product placement.",
      "Do not add attention-grabbing props.",
      "Keep the scene calm and believable.",
      "Do not use dramatic angle views.",
    ];
  }

  if (scene === "scale") {
    return [
      "Create a front-facing background that helps communicate scale subtly.",
      "Keep the center area open and usable.",
      "Provide a clear floor or tabletop plane when grounding requires it.",
      "Do not overpower the future product.",
      "Use environmental cues for scale only if subtle.",
      "Avoid dramatic perspective.",
    ];
  }

  return [
    "Use a front-facing background that supports detail presentation.",
    "Simple, clean, low-noise composition.",
    "Open center area for later product placement.",
    "Controlled light and soft depth.",
    "No distracting objects.",
    "Support texture visibility without overpowering the product.",
  ];
}

function buildCategoryRules(category: ProductCategory): string[] {
  if (category === "furniture") {
    return [
      "Furniture category.",
      "Prefer floor grounding.",
      "Prefer calm residential or commercial spaces only if front-facing.",
      "Use natural light feel.",
      "Keep depth modest, not dramatic.",
      "Prioritize stability and commercial believability.",
      "Avoid narrow staged corners and stepped furniture near the center area.",
    ];
  }

  if (category === "goods") {
    return [
      "Goods category.",
      "Prefer tabletop grounding.",
      "Prefer wood, stone, or fabric surfaces.",
      "Do not place props near the center subject area.",
      "Keep the hero area well organized.",
      "Support material texture visibility.",
      "Avoid diagonal tabletop edges.",
    ];
  }

  if (category === "apparel") {
    return [
      "Apparel category.",
      "Prefer wall background.",
      "Allow hanger or hook style context only if subtle and not central.",
      "Use generous whitespace.",
      "Prioritize cleanliness and clarity.",
      "Do not make the environment feel busy.",
      "Keep the wall plane front-facing.",
    ];
  }

  if (category === "small") {
    return [
      "Small product category.",
      "Prefer minimal studio style.",
      "Prefer clean gradient or simple minimal background.",
      "Prioritize silhouette visibility.",
      "Keep the center area extremely clean.",
      "Avoid visual noise.",
    ];
  }

  return [
    "Other product category.",
    "Keep the scene commercially usable and calm.",
    "Maintain open center area.",
    "Support later product placement naturally.",
    "Keep the overall view front-facing.",
  ];
}

function buildGroundingRules(groundingType: GroundingType): string[] {
  if (groundingType === "floor") {
    return [
      "Grounding type is floor.",
      "A believable floor plane must exist in the center area.",
      "The floor must visually support natural contact with the product.",
      "Camera height should feel product-eye-level, not top-down.",
      "Avoid benches, steps, and raised furniture in the center area.",
    ];
  }

  if (groundingType === "table") {
    return [
      "Grounding type is table.",
      "A believable tabletop or shelf plane must exist in the center area.",
      "The tabletop must be sufficiently wide and calm.",
      "Avoid clutter around the future contact area.",
      "Avoid diagonal tabletop perspective.",
    ];
  }

  if (groundingType === "hanging") {
    return [
      "Grounding type is hanging.",
      "Leave a clean central hanging area.",
      "No table or floor contact is required in the center.",
      "The background should support suspended presentation.",
      "Keep the wall plane clean and front-facing.",
    ];
  }

  return [
    "Grounding type is wall.",
    "Leave a clean central wall-facing placement area.",
    "The scene should support wall-near presentation.",
    "Do not force a floor-contact look in the center area.",
    "Keep the wall plane front-facing and stable.",
  ];
}

function buildSizeRules(productSize: ProductSize): string[] {
  if (productSize === "large") {
    return [
      "Product size is large.",
      "Background scale must feel spacious enough.",
      "Avoid tiny or cramped-looking environments.",
      "The center area should support a large subject naturally.",
      "Use broad stable planes.",
    ];
  }

  if (productSize === "small") {
    return [
      "Product size is small.",
      "Avoid oversized environmental cues that dwarf the future product.",
      "Keep scale cues subtle and controlled.",
      "The center area should suit a compact subject.",
      "Prefer simpler staging.",
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
      "Prioritize world-building and refined atmosphere.",
      "Still keep the future product as the visual hero.",
      "Avoid overly noisy artistic expression.",
      "Do not break front-facing stability for atmosphere.",
    ];
  }

  if (direction === "trust") {
    return [
      "Selling direction is trust.",
      "Prioritize clarity, cleanliness, and believability.",
      "Avoid dramatic lighting and excessive mood.",
      "Make the result feel honest and commercially reliable.",
      "Keep the view stable and plain.",
    ];
  }

  if (direction === "story") {
    return [
      "Selling direction is story.",
      "Support a subtle narrative context.",
      "Do not let the environment become the main subject.",
      "Maintain commercial usability.",
      "Keep story cues away from the center placement area.",
    ];
  }

  return [
    "Selling direction is sales.",
    "Prioritize conversion-friendly commercial clarity.",
    "Keep the scene clean, readable, and product-supportive.",
    "Avoid distractions.",
    "Favor stability over atmosphere.",
  ];
}

function buildKeywordAssistRules(keyword: string): string[] {
  const k = keyword.toLowerCase();

  if (!k) return [];

  if (k.includes("玄関") || k.includes("entry")) {
    return [
      "If entryway context is used, keep it front-facing and calm.",
      "Do not use corner entry composition.",
      "Do not place benches or shelves across the center area.",
    ];
  }

  if (k.includes("書斎") || k.includes("study") || k.includes("desk")) {
    return [
      "If study context is used, keep desk or shelf lines front-facing.",
      "Do not use diagonal desk perspective.",
      "Keep the center area flat and open.",
    ];
  }

  if (k.includes("薬局") || k.includes("clinic") || k.includes("受付")) {
    return [
      "If pharmacy or reception context is used, keep it clean, front-facing, and minimal.",
      "Avoid signage and counters crossing the center area.",
      "Avoid deep interior perspective.",
    ];
  }

  return [];
}

function validateReferenceImageUrl(input: unknown): string {
  const v = String(input ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return "";
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

    if (!referenceImageUrl) {
      return NextResponse.json(
        { ok: false, error: "referenceImageUrl is required" },
        { status: 400 }
      );
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

    const baseHardRules = [
      "Do NOT include the actual product itself in the generated image.",
      "Do NOT include any people, hands, fingers, arms, or body parts.",
      "Do NOT include any text, watermark, logo, signage, brand mark, or letters.",
      "Do NOT include excessive props or attention-grabbing objects.",
      "The center area must remain open for later product placement.",
      "The center must support a natural contact area according to grounding type.",
      "Background exists only to support the future product.",
      "The final background must be commercially usable for product listing.",
      "Do not make the background more visually important than the product will be.",
      "Leave room for a product occupying roughly 30 to 45 percent of frame width.",
    ];

    const frontFixedRules = buildFrontFixedRules();
    const sceneRules = buildSceneRules(scene);
    const categoryRules = buildCategoryRules(productCategory);
    const groundingRules = buildGroundingRules(groundingType);
    const sizeRules = buildSizeRules(productSize);
    const sellDirectionRules = buildSellDirectionRules(sellDirection);
    const keywordAssistRules = buildKeywordAssistRules(keyword);

    const mergedRules = [
      ...baseHardRules,
      ...frontFixedRules,
      ...sceneRules,
      ...categoryRules,
      ...groundingRules,
      ...sizeRules,
      ...sellDirectionRules,
      ...keywordAssistRules,
      ...brandRules,
      ...hardConstraints,
    ].filter(Boolean);

    const prompt = [
      "Generate a background image only for later product compositing.",
      "Do not include the product itself in the output.",
      "Use the reference image only to infer appropriate scale, grounding, commercial context, and scene fit.",
      "The output must be a product-supportive background, not a standalone hero image.",
      "This background must feel front-facing, stable, and safe for compositing.",
      "",
      `Brand: ${brand.displayName || brandId}`,
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
      "The background must look natural, clean, believable, and commercially usable.",
      "Return one square image suitable for later compositing with a protected real product.",
    ]
      .filter(Boolean)
      .join("\n");

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
      referenceImageUrl,
      type: "bg_product_referenced_front_fixed_v4",
      size: "1024x1024",
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
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY missing");
    }

    const referenceRes = await fetch(referenceImageUrl, { cache: "no-store" as RequestCache });
    if (!referenceRes.ok) {
      throw new Error("failed to fetch reference image");
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
      throw new Error(openaiJson?.error?.message || "openai image generation error");
    }

    const b64 = openaiJson?.data?.[0]?.b64_json;
    if (typeof b64 !== "string" || !b64) {
      throw new Error("no image returned");
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
    });
  } catch (e: any) {
    console.error("[generate-bg] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "generate bg failed" },
      { status: 500 }
    );
  }
}