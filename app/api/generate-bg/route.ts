// /app/api/generate-bg/route.ts

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/firebaseAdmin";
import { getStorage } from "firebase-admin/storage";
import crypto from "crypto";

export const runtime = "nodejs";

/* ========= auth ========= */
function bearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function requireUid(req: Request): Promise<string> {
  const token = bearerToken(req);
  if (!token) throw new Error("missing token");
  const decoded = await getAdminAuth().verifyIdToken(token);
  if (!decoded?.uid) throw new Error("invalid token");
  return decoded.uid;
}

/* ========= helpers ========= */
function stableHash(input: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
}

function buildDownloadUrl(bucket: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;
}

async function fetchAsImage(url: string): Promise<File> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("failed to fetch source image");
  const ct = r.headers.get("content-type") || "image/png";
  const ab = await r.arrayBuffer();
  return new File([ab], "source.png", { type: ct });
}

function compactKeywords(keys: unknown): string {
  if (!Array.isArray(keys)) return "";
  return keys.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 12).join(", ");
}

function compactConstraints(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 20);
}

/* ========= main ========= */
export async function POST(req: Request) {
  try {
    const uid = await requireUid(req);
    const body = await req.json().catch(() => ({} as any));

    // ✅ draftId 必須（下書き隔離）
    const draftId = String(body.draftId || "").trim();
    if (!draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    }

    const brandId = String(body.brandId || "vento").trim();
    const vision = String(body.vision || "").trim();
    const keywords = compactKeywords(body.keywords);
    const referenceImageUrl = String(body.referenceImageUrl || body.sourceImageUrl || "").trim();

    // ✅ 追加：AIが決めた bgPrompt / scene を受ける
    const bgPrompt = typeof body.bgPrompt === "string" ? body.bgPrompt.trim() : "";
    const scene = String(body.scene || "studio").trim();
    const sceneHint = String(body.sceneHint || "").trim();

    // （任意）フロントから来る硬い制約
    const hardConstraints = compactConstraints(body.hardConstraints);

    if (!vision) {
      return NextResponse.json({ error: "vision is required" }, { status: 400 });
    }
    if (!referenceImageUrl) {
      return NextResponse.json({ error: "referenceImageUrl is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const brandSnap = await db.doc(`users/${uid}/brands/${brandId}`).get();
    if (!brandSnap.exists) {
      return NextResponse.json({ error: "brand not found" }, { status: 400 });
    }

    const brand = brandSnap.data() || {};
    const styleText = String(brand?.imagePolicy?.styleText || "");
    const rules = Array.isArray(brand?.imagePolicy?.rules) ? brand.imagePolicy.rules.map(String) : [];

    const OUTPUT_SIZE = "1024x1024";

    /* =========================
       ✅ 崩壊防止：常時適用する hard rules
       - 既存 + フロントhardConstraints(任意) を合成
    ========================== */
    const hardRulesBase = [
      "The product must remain 100% unchanged.",
      "Do NOT modify shape, structure, handles, wood grain, edges, or logo.",
      "Do NOT add hands, people, fingers, arms, or new objects.",
      "Do NOT place decorative props.",
      "Background must create atmosphere using light, shadow, blur only.",
      "No text. No watermark. No logo.",
    ];

    // ✅ 日本語制約が来た場合も prompt に入れる（安全側で効く）
    const hardRules = [
      ...hardRulesBase,
      ...hardConstraints.map((s) => `(${s})`),
    ];

    /* =========================
       ✅ prompt：bgPrompt が最優先
       - bgPrompt が来たら sceneHint は補助扱い
       - bgPrompt が無ければ従来通り sceneHint を使う
    ========================== */
    const prompt = [
      "You will receive a product photo.",
      "Your task: Replace or enhance ONLY the background.",
      "IMPORTANT: Keep the main subject (product) unchanged and sharp. Do NOT distort the product.",
      "Do NOT add text/logos/watermarks. Do NOT add hands/people.",
      "",
      bgPrompt ? `SCENE (decided by AI): ${bgPrompt}` : "",
      `SCENE TYPE: ${scene}`,
      !bgPrompt && sceneHint ? `SCENE DESCRIPTION: ${sceneHint}` : "",
      bgPrompt && sceneHint ? `SCENE NOTE: ${sceneHint}` : "",
      "",
      `Brand: ${brand.name || brandId}`,
      `Vision: ${vision}`,
      keywords ? `Keywords: ${keywords}` : "",
      styleText ? `Style: ${styleText}` : "",
      rules.length ? `Brand Rules: ${rules.join(" / ")}` : "",
      "",
      "STRICT RULES:",
      ...hardRules.map((r) => `- ${r}`),
      "",
      `Return a square image (${OUTPUT_SIZE}).`,
    ]
      .filter(Boolean)
      .join("\n");

    // ✅ 冪等キー：bgPrompt も含める（同条件連打で課金しない）
    const key = stableHash({
      uid,
      draftId,
      brandId,
      vision,
      keywords,
      referenceImageUrl,
      scene,
      sceneHint,
      bgPrompt,
      styleText,
      rules,
      hardConstraints,
      OUTPUT_SIZE,
    });

    const bucket = getStorage().bucket();
    const objectPath = `users/${uid}/drafts/${draftId}/bg/${key}.png`;
    const fileRef = bucket.file(objectPath);

    // ✅ 既存があれば再利用（課金ゼロ）
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

      // tokenが無ければ付与
      if (!existingToken) {
        await fileRef.setMetadata({
          metadata: { firebaseStorageDownloadTokens: token },
          contentType: meta?.contentType || "image/png",
        });
      }

      return NextResponse.json({
        url: buildDownloadUrl(bucket.name, objectPath, token),
        reused: true,
        draftId,
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    const image = await fetchAsImage(referenceImageUrl);

    const fd = new FormData();
    fd.append("model", "gpt-image-1");
    fd.append("prompt", prompt);
    fd.append("size", OUTPUT_SIZE);
    fd.append("image", image);

    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });

    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "openai image edit error");

    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image returned");

    const buf = Buffer.from(b64, "base64");
    const token = crypto.randomUUID();

    await fileRef.save(buf, {
      contentType: "image/png",
      resumable: false,
      metadata: {
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    return NextResponse.json({
      url: buildDownloadUrl(bucket.name, objectPath, token),
      reused: false,
      draftId,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}