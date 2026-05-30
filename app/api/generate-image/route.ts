// /app/api/generate-image/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import crypto from "crypto";
import { getStorage } from "firebase-admin/storage";
import { getIdempotencyKey } from "@/lib/server/idempotency";
import { PRICING } from "@/lib/server/pricing";
import { getAdminAuth, getAdminDb } from "@/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 画像生成APIの入力型
 *
 * 今回の重要追加
 * - referenceImageUrl:
 *   元画像を参照して「商品も背景もまとめてAI再生成」するために使う
 * - generationMode:
 *   用か、ストーリー用かを区別するために使う
 * - draftId:
 *   将来の保存先整理やログ参照で使えるように受け取る
 */
type ReqBody = {
  brandId?: string;
  vision?: string;
  keywords?: unknown;
  tone?: string;

  // 旧来互換
  prompt?: string;

  requestId?: string;
  idempotencyKey?: string;

  imageSize?: "1024x1024" | "1024x1536" | "1536x1024";
  model?: string;

  // 今回追加
  referenceImageUrl?: string;
  generationMode?: string;
  productCategory?: string;
  productSize?: string;
  groundingType?: string;
  sellDirection?: string;
  bgScene?: string;
  draftId?: string;
};

/**
 * Authorization ヘッダーから Bearer token を抜き出す
 */
function bearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/**
 * Firebase ID token を検証して uid を返す
 */
async function requireUid(req: Request): Promise<string> {
  const token = bearerToken(req);
  if (!token) throw new Error("missing token");

  const decoded = await getAdminAuth().verifyIdToken(token);
  if (!decoded?.uid) throw new Error("invalid token");

  return decoded.uid;
}

/**
 * Firebase Storage の公開URLを組み立てる
 */
function buildDownloadUrl(bucket: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;
}

/**
 * キーワード配列を安全に整える
 */
function compactKeywords(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];

  return keys
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * 文字列入力を安全に整える
 */
function safeText(v: unknown, max = 5000) {
  return String(v ?? "").trim().slice(0, max);
}

/**
 * 参照画像URLが最低限有効か確認する
 */
function validateReferenceImageUrl(input: unknown): string {
  const v = String(input ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return "";
}

/**
 * 画像サイズを安全に正規化する
 */
function normalizeImageSize(
  input: unknown
): "1024x1024" | "1024x1536" | "1536x1024" {
  const s = String(input ?? "").trim();

  if (s === "1024x1536") return "1024x1536";
  if (s === "1536x1024") return "1536x1024";
  return "1024x1024";
}

/**
 * generationMode を安全に整える
 *
 * 今回は UI 側から
 * - usage_scene_regeneration
 * - story_regeneration
 * のような値が来る想定
 */
function normalizeGenerationMode(input: unknown): string {
  const v = String(input ?? "").trim().toLowerCase();

  if (!v) return "";
  if (v === "usage_scene_regeneration") return "usage_scene_regeneration";
  if (v === "story_regeneration") return "story_regeneration";

  return v.slice(0, 100);
}

/**
 *  / ストーリー向けの prompt を作る
 *
 * 重要
 * - referenceImageUrl がある時はこちらを優先する
 * - 商品も背景も丸ごとAI再生成する前提
 * - ただし「売れる商品画像」の範囲から外れないように制限する
 */
function buildRegenerationPrompt(args: {
  brandId: string;
  vision: string;
  keywords: string[];
  generationMode: string;
  productCategory: string;
  productSize: string;
  groundingType: string;
  sellDirection: string;
  bgScene: string;
  tone: string;
}) {
  const {
    brandId,
    vision,
    keywords,
    generationMode,
    productCategory,
    productSize,
    groundingType,
    sellDirection,
    bgScene,
    tone,
  } = args;

  const modeLabel =
    generationMode === "story_regeneration"
      ? "story scene"
      : generationMode === "usage_scene_regeneration"
        ? "usage scene"
        : "commercial scene";

  const lines = [
    "Regenerate the uploaded product photo into a polished commercial product image.",
    `Create a ${modeLabel} that still feels sellable and believable.`,
    "Keep the product recognizable and commercially usable.",
    "You may redesign the background, space, light, and surrounding environment.",
    "Improve lighting, framing, clarity, and overall scene quality.",
    "Do not add text, watermark, logo, signage, labels, or captions.",
    "Do not add extra products that compete with the main product.",
    "Prefer no people, no hands, no fingers, and no body parts.",
    "The final result must still feel like an e-commerce or marketplace-ready product photo.",
    "Avoid fantasy styling, surreal distortion, and excessive artistic effects.",
    "Preserve realism, believable materials, and natural lighting.",
    "",
    generationMode ? `Generation mode: ${generationMode}` : "",
    brandId ? `Brand: ${brandId}` : "",
    vision ? `Vision: ${vision}` : "",
    keywords.length ? `Keywords: ${keywords.join(" / ")}` : "",
    tone ? `Tone: ${tone}` : "",
    productCategory ? `Product category: ${productCategory}` : "",
    productSize ? `Product size: ${productSize}` : "",
    groundingType ? `Grounding type: ${groundingType}` : "",
    sellDirection ? `Selling direction: ${sellDirection}` : "",
    bgScene ? `Scene type: ${bgScene}` : "",
    "",
    generationMode === "story_regeneration"
      ? "Create subtle narrative atmosphere, but keep the product as the visual hero."
      : "Create a clear product-use or lifestyle context, but keep the product readable.",
    "Avoid over-stylization.",
    "The image must remain commercially trustworthy.",
  ];

  return lines.filter(Boolean).join("\n").slice(0, PRICING.MAX_PROMPT_CHARS);
}

export async function POST(req: Request) {
  let uid = "";

  try {
    uid = await requireUid(req);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 401 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as ReqBody;

  const directPrompt = safeText(body.prompt, 3000);
  const vision = safeText(body.vision, 2000);
  const brandId = safeText(body.brandId, 200);
  const keywords = compactKeywords(body.keywords);
  const tone = safeText(body.tone, 500);

  const referenceImageUrl = validateReferenceImageUrl(body.referenceImageUrl);
  const generationMode = normalizeGenerationMode(body.generationMode);

  const productCategory = safeText(body.productCategory, 100);
  const productSize = safeText(body.productSize, 100);
  const groundingType = safeText(body.groundingType, 100);
  const sellDirection = safeText(body.sellDirection, 100);
  const bgScene = safeText(body.bgScene, 100);
  const draftId = safeText(body.draftId, 200);

  /**
   * prompt 決定ルール
   *
   * 優先順位
   * 1. 明示 prompt
   * 2. referenceImageUrl があるなら再生成用 prompt
   * 3. 旧来の通常画像生成 prompt
   */
  const prompt = (
    directPrompt ||
    (referenceImageUrl
      ? buildRegenerationPrompt({
          brandId,
          vision,
          keywords,
          generationMode,
          productCategory,
          productSize,
          groundingType,
          sellDirection,
          bgScene,
          tone,
        })
      : [
          "You are generating a clean, premium product photo style image.",
          "No text. No watermark. No logos.",
          brandId ? `Brand: ${brandId}` : "",
          vision ? `Vision: ${vision}` : "",
          keywords.length ? `Keywords: ${keywords.join(" / ")}` : "",
          tone ? `Tone: ${tone}` : "",
        ]
          .filter(Boolean)
          .join("\n"))
  )
    .slice(0, PRICING.MAX_PROMPT_CHARS)
    .trim();

  if (!prompt) {
    return NextResponse.json(
      { ok: false, error: "prompt is required" },
      { status: 400 }
    );
  }

  const size = normalizeImageSize(body.imageSize);
  const model = safeText(body.model, 100) || "gpt-image-1";

  /**
   * 冪等化キー
   *
   * referenceImageUrl や generationMode を含めることで、
   * 同条件なら同一結果を再利用しやすくする
   */
  const idemKey = getIdempotencyKey(req, {
    ...body,
    type: "image",
    uid,
    prompt,
    referenceImageUrl,
    generationMode,
    draftId,
  });

  const db = getAdminDb();
  const docRef = db.collection("generations").doc(idemKey);

  /**
   * 保存先
   *
   * 今回は既存仕様に合わせて generations/images に保存する
   * 既存画面との互換性を壊さないため
   */
  const bucket = getStorage().bucket();
let objectPath = `users/${uid}/generations/images/${idemKey}.png`;

if (draftId && generationMode === "usage_scene_regeneration") {
  objectPath = `users/${uid}/drafts/${draftId}/idea/${idemKey}.png`;
}

if (draftId && generationMode === "story_regeneration") {
  objectPath = `users/${uid}/drafts/${draftId}/story/${idemKey}.png`;
}

const fileRef = bucket.file(objectPath);

  /**
   * まず Storage 実体を見て再利用
   */
  {
    const [exists] = await fileRef.exists();

    if (exists) {
      const [meta] = await fileRef.getMetadata().catch(() => [null as any]);

      const existingToken =
        meta?.metadata?.firebaseStorageDownloadTokens ||
        meta?.metadata?.firebaseStorageDownloadToken ||
        "";

      const token =
        typeof existingToken === "string" && existingToken
          ? existingToken.split(",")[0].trim()
          : crypto.randomUUID();

      if (!existingToken) {
        await fileRef.setMetadata({
          metadata: { firebaseStorageDownloadTokens: token },
          contentType: meta?.contentType || "image/png",
        });
      }

      const url = buildDownloadUrl(bucket.name, objectPath, token);

      await docRef.set(
        {
          id: idemKey,
          type: "image",
          status: "succeeded",
          uid,
          prompt,
          imageUrl: url,
          costYen: PRICING.calcImageCostYen(),
          finishedAt: Date.now(),
          referenceImageUrl: referenceImageUrl || null,
          generationMode: generationMode || null,
          productCategory: productCategory || null,
          productSize: productSize || null,
          groundingType: groundingType || null,
          sellDirection: sellDirection || null,
          bgScene: bgScene || null,
          draftId: draftId || null,
        },
        { merge: true }
      );

      return NextResponse.json({
        ok: true,
        reused: true,
        url,
        generation: { id: idemKey },
      });
    }
  }

  /**
   * Firestore だけ残っている場合も確認
   */
  const snap = await docRef.get().catch(() => null as any);

  if (snap?.exists) {
    const gen = snap.data() as any;
    const status = String(gen?.status ?? "");
    const imageUrl = String(gen?.imageUrl ?? "");

    if (status === "succeeded" && imageUrl) {
      return NextResponse.json({
        ok: true,
        reused: true,
        url: imageUrl,
        generation: gen,
      });
    }

    if (status === "running") {
      const createdAt = Number(gen?.createdAt ?? 0);

      if (createdAt && Date.now() - createdAt < 60_000) {
        return NextResponse.json(
          { ok: false, status: "running", error: "generation is running" },
          { status: 202 }
        );
      }
    }
  }

  /**
   * 実行予約
   */
  await docRef.set(
    {
      id: idemKey,
      type: "image",
      status: "running",
      uid,
      prompt,
      createdAt: Date.now(),
      costYen: PRICING.calcImageCostYen(),
      referenceImageUrl: referenceImageUrl || null,
      generationMode: generationMode || null,
      productCategory: productCategory || null,
      productSize: productSize || null,
      groundingType: groundingType || null,
      sellDirection: sellDirection || null,
      bgScene: bgScene || null,
      draftId: draftId || null,
    },
    { merge: true }
  );

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    let buf: Buffer;

    /**
     * referenceImageUrl がある時
     * - 元画像を見ながら再生成する
     * - OpenAI images edits を使う
     */
    if (referenceImageUrl) {
      const referenceRes = await fetch(referenceImageUrl, {
        cache: "no-store" as RequestCache,
      });

      if (!referenceRes.ok) {
        throw new Error("failed to fetch reference image");
      }

      const referenceBuf = Buffer.from(await referenceRes.arrayBuffer());
      const referenceType = referenceRes.headers.get("content-type") || "image/png";
      const referenceFile = new File([referenceBuf], "reference.png", {
        type: referenceType,
      });

      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append("size", size);
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
        throw new Error(openaiJson?.error?.message || "openai image edit error");
      }

      const b64 = openaiJson?.data?.[0]?.b64_json;
      if (!b64) {
        throw new Error("Image generation failed (no b64_json)");
      }

      buf = Buffer.from(b64, "base64");
    } else {
      /**
       * 旧来の通常生成
       */
      const client = new OpenAI({ apiKey });
      const res = await client.images.generate({ model, prompt, size });
      const b64 = res.data?.[0]?.b64_json;

      if (!b64) {
        throw new Error("Image generation failed (no b64_json)");
      }

      buf = Buffer.from(b64, "base64");
    }

    /**
     * Storage 保存
     */
    const token = crypto.randomUUID();

    await fileRef.save(buf, {
      contentType: "image/png",
      resumable: false,
      metadata: {
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const url = buildDownloadUrl(bucket.name, objectPath, token);

    const generation = {
      id: idemKey,
      type: "image",
      status: "succeeded",
      uid,
      prompt,
      imageUrl: url,
      costYen: PRICING.calcImageCostYen(),
      finishedAt: Date.now(),
      referenceImageUrl: referenceImageUrl || null,
      generationMode: generationMode || null,
      productCategory: productCategory || null,
      productSize: productSize || null,
      groundingType: groundingType || null,
      sellDirection: sellDirection || null,
      bgScene: bgScene || null,
      draftId: draftId || null,
    };

    await docRef.set(generation, { merge: true });

    return NextResponse.json({
      ok: true,
      reused: false,
      url,
      generation,
    });
  } catch (e: any) {
    await docRef.set(
      {
        status: "failed",
        error: String(e?.message ?? e),
        finishedAt: Date.now(),
      },
      { merge: true }
    );

    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e), id: idemKey },
      { status: 500 }
    );
  }
}