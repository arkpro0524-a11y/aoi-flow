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
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 32);
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
  return keys.map(String).slice(0, 12).join(", ");
}

function compactVoiceText(v: unknown): string {
  const s = String(v ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const MAX = 220;
  return s.length <= MAX ? s : s.slice(0, MAX) + "…";
}

async function loadBrand(uid: string, brandId: string) {
  const db = getAdminDb();
  const ref = db.doc(`users/${uid}/brands/${brandId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as any;
}

/* ========= main ========= */
export async function POST(req: Request) {
  try {
    const uid = await requireUid(req);
    const body = await req.json().catch(() => ({} as any));

    const brandId = typeof body.brandId === "string" ? body.brandId : "vento";
    const vision = typeof body.vision === "string" ? body.vision : "";
    const keywords = compactKeywords(body.keywords);

    // 互換：referenceImageUrl / sourceImageUrl
    const referenceImageUrl =
      typeof body.referenceImageUrl === "string"
        ? body.referenceImageUrl
        : typeof body.sourceImageUrl === "string"
          ? body.sourceImageUrl
          : "";

    if (!vision.trim()) {
      return NextResponse.json({ error: "vision is required" }, { status: 400 });
    }
    if (!referenceImageUrl) {
      return NextResponse.json({ error: "referenceImageUrl is required" }, { status: 400 });
    }

    const brand = await loadBrand(uid, brandId);
    if (!brand) {
      return NextResponse.json(
        { error: "brand not found. /flow/brands で作成・保存してください" },
        { status: 400 }
      );
    }

    const imagePolicy = brand.imagePolicy ?? {};
    const styleText = String(imagePolicy.styleText ?? "");
    const rules = Array.isArray(imagePolicy.rules) ? imagePolicy.rules.map(String) : [];

    const captionPolicy = brand.captionPolicy ?? {};
    const voiceText = compactVoiceText(captionPolicy.voiceText ?? "");

    // ✅ 背景生成は「必ず正方形」固定（UIのsizeは完全に無視）
    // 720x1280 を投げてもここでは使わない＝エラー＆課金事故が止まる
    const OUTPUT_SIZE = "1024x1024";

    const prompt = [
      "You will receive a product photo.",
      "Goal: Create a clean, attractive square background that matches the brand style.",
      "IMPORTANT: Keep the main subject (product) unchanged and sharp. Do NOT distort the product.",
      "If needed, extend / improve background, lighting, and composition.",
      `Brand: ${String(brand.name ?? brandId)}`,
      `Vision: ${vision}`,
      keywords ? `Keywords: ${keywords}` : "",
      voiceText ? `Brand Voice (short): ${voiceText}` : "",
      styleText ? `Style: ${styleText}` : "",
      rules.length ? `Rules: ${rules.join(" / ")}` : "",
      "No text. No logos. No watermark.",
      `Return a square image (${OUTPUT_SIZE}).`,
    ]
      .filter(Boolean)
      .join("\n");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    // ✅ 同条件の連打で課金しない（同一key→同一保存先→再利用）
    const key = stableHash({
      uid,
      brandId,
      vision: vision.trim(),
      keywords,
      referenceImageUrl,
      styleText,
      rules,
      voiceText,
      OUTPUT_SIZE,
    });

    const bucket = getStorage().bucket();
    const objectPath = `users/${uid}/drafts/_bg/${brandId}/${key}.png`;
    const fileRef = bucket.file(objectPath);

    // 既存があれば再利用（課金ゼロ）
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

      return NextResponse.json({
        url: buildDownloadUrl(bucket.name, objectPath, token),
        reused: true,
      });
    }

    // OpenAI（背景生成）
    const image = await fetchAsImage(referenceImageUrl);

    const fd = new FormData();
    fd.append("model", "gpt-image-1");
    fd.append("prompt", prompt);
    fd.append("size", OUTPUT_SIZE); // ★絶対固定
    fd.append("image", image);

    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });

    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "openai image edit error");

    const b64 = j?.data?.[0]?.b64_json;
    if (typeof b64 !== "string" || !b64) throw new Error("no image returned");

    const buf = Buffer.from(b64, "base64");

    // Storage保存（token付き）
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
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}