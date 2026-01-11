// /app/api/generate-bg/route.ts
import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/firebaseAdmin";
import { getStorage } from "firebase-admin/storage";
import crypto from "crypto";

export const runtime = "nodejs";

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

async function loadBrand(uid: string, brandId: string) {
  const db = getAdminDb();
  const ref = db.doc(`users/${uid}/brands/${brandId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as any;
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

async function fetchAsImageFile(url: string): Promise<{ file: File; mime: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("failed to fetch source image");
  const ct = r.headers.get("content-type") || "image/png";
  const ab = await r.arrayBuffer();
  const blob = new Blob([ab], { type: ct });
  const file = new File([blob], "source.png", { type: ct });
  return { file, mime: ct };
}

function stableHash(input: unknown): string {
  const json = JSON.stringify(input);
  return crypto.createHash("sha256").update(json).digest("hex").slice(0, 32);
}

function buildDownloadUrl(bucketName: string, objectPath: string, token: string) {
  // Firebase Storage の token 付きDL URL（client SDK の getDownloadURL と同系統）
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

export async function POST(req: Request) {
  try {
    const uid = await requireUid(req);
    const body = await req.json().catch(() => ({} as any));

    const brandId = typeof body.brandId === "string" ? body.brandId : "vento";
    const vision = typeof body.vision === "string" ? body.vision : "";
    const keywords = compactKeywords(body.keywords);
    const size = typeof body.size === "string" ? body.size : "1024x1792"; // 参考として受け取る（プロンプトに反映）
    // 互換：referenceImageUrl / sourceImageUrl の両対応
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
      `Output usage note: This background will be used for a video size like ${size}.`,
      "No text. No logos. No watermark.",
      "Return a square image (1024x1024).",
    ]
      .filter(Boolean)
      .join("\n");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    // ✅ 同条件の押し直しでも「同じ保存先」になる（課金事故対策の土台）
    // ※ Storage に同名が既にあれば、それを返す（OpenAIを呼ばない）
    const key = stableHash({
      uid,
      brandId,
      vision: vision.trim(),
      keywords,
      size,
      referenceImageUrl,
      styleText,
      rules,
      voiceText,
    });

    const bucket = getStorage().bucket();
    const objectPath = `users/${uid}/drafts/_bg/${brandId}/${key}.png`;
    const fileRef = bucket.file(objectPath);

    // 既存があればそれを返す（ここで課金を増やさない）
    const [exists] = await fileRef.exists();
    if (exists) {
      // 既存ファイルの token を読み出してURL化（なければ新規付与）
      const [meta] = await fileRef.getMetadata().catch(() => [null as any]);
      const bucketName = bucket.name;

      const existingToken =
        meta?.metadata?.firebaseStorageDownloadTokens ||
        meta?.metadata?.firebaseStorageDownloadToken ||
        "";

      if (typeof existingToken === "string" && existingToken) {
        const token = existingToken.split(",")[0].trim();
        const url = buildDownloadUrl(bucketName, objectPath, token);
        return NextResponse.json({ url, reused: true });
      }

      // token が無い場合：付与して返す
      const token = crypto.randomUUID();
      await fileRef.setMetadata({
        metadata: { firebaseStorageDownloadTokens: token },
        contentType: meta?.contentType || "image/png",
      });
      const url = buildDownloadUrl(bucketName, objectPath, token);
      return NextResponse.json({ url, reused: true });
    }

    // OpenAI へ編集（背景生成）
    const { file } = await fetchAsImageFile(referenceImageUrl);

    const fd = new FormData();
    fd.append("model", "gpt-image-1");
    fd.append("prompt", prompt);
    fd.append("size", "1024x1024");
    fd.append("image", file);

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

    // Storage 保存（token付きDL URL を作る）
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
    return NextResponse.json({ url });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}