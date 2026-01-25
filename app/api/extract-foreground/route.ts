// /app/api/extract-foreground/route.ts
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
    const referenceImageUrl =
      typeof body.referenceImageUrl === "string"
        ? body.referenceImageUrl
        : typeof body.sourceImageUrl === "string"
          ? body.sourceImageUrl
          : "";

    if (!referenceImageUrl) {
      return NextResponse.json({ error: "referenceImageUrl is required" }, { status: 400 });
    }

    // brand は任意（styleText等を将来使える）
    const brand = await loadBrand(uid, brandId);

    // ✅ 透過前景PNGを作る
    // - 背景を完全に削除
    // - 商品の形は変えない
    // - 透過PNGで返す
    const prompt = [
      "Remove the background completely and return a transparent PNG (alpha).",
      "Keep the product (main subject) unchanged and sharp. Do not distort shape.",
      "No text. No logo. No watermark.",
      brand?.name ? `Brand: ${String(brand.name)}` : "",
      "Output: a clean cut-out of the product only, transparent background.",
    ]
      .filter(Boolean)
      .join("\n");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    // ✅ 同条件連打で再利用（課金事故防止）
    const key = stableHash({
      uid,
      brandId,
      referenceImageUrl,
      prompt,
      size: "1024x1024",
      type: "extract-foreground",
    });

    const bucket = getStorage().bucket();
    const objectPath = `users/${uid}/drafts/_fg/${brandId}/${key}.png`;
    const fileRef = bucket.file(objectPath);

    // 既存があれば再利用
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

    // OpenAI edits（透過切り抜き）
    const image = await fetchAsImage(referenceImageUrl);

    const fd = new FormData();
    fd.append("model", "gpt-image-1");
    fd.append("prompt", prompt);
    fd.append("size", "1024x1024");
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
      reused: false,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}