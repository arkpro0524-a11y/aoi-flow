// /app/api/replace-background/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import sharp from "sharp";
import { getAdminAuth } from "@/firebaseAdmin";
import { getStorage } from "firebase-admin/storage";

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
function safeStr(v: any) {
  return String(v ?? "").trim();
}
function requiredEnv(name: string, fallbackNames: string[] = []) {
  const names = [name, ...fallbackNames];
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  throw new Error(`${name} missing`);
}

type UiSize = "1024x1792" | "720x1280" | "1792x1024" | "1280x720";
type OpenAISize = "720x1280" | "1280x720";
function normUiSize(v: any): UiSize {
  const s = String(v ?? "");
  const ok: UiSize[] = ["1024x1792", "720x1280", "1792x1024", "1280x720"];
  return ok.includes(s as UiSize) ? (s as UiSize) : "1024x1792";
}
function toOpenAISize(ui: UiSize): OpenAISize {
  if (ui === "1792x1024" || ui === "1280x720") return "1280x720";
  return "720x1280";
}
function parseSize(size: OpenAISize) {
  const [w, h] = size.split("x").map((n) => parseInt(n, 10));
  if (!Number.isFinite(w) || !Number.isFinite(h)) throw new Error("invalid size");
  return { w, h };
}

async function fetchAsBuffer(url: string) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`failed to fetch image: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
async function toExactSizePng(input: Buffer, size: OpenAISize) {
  const { w, h } = parseSize(size);
  const out = await sharp(input)
    .rotate()
    .resize(w, h, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { buf: out, w, h, filename: `bgsrc_${w}x${h}.png`, contentType: "image/png" as const };
}

function getBucket() {
  const bucketName = requiredEnv("FIREBASE_STORAGE_BUCKET", ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"]);
  return getStorage().bucket(bucketName);
}
function makeDownloadUrl(bucketName: string, filePath: string, token: string) {
  const encPath = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encPath}?alt=media&token=${token}`;
}
async function savePng(uid: string, draftId: string, png: Buffer) {
  const bucket = getBucket();
  const bucketName = bucket.name;

  const token = crypto.randomUUID();
  const pathKey = `${Date.now()}_${crypto.randomUUID()}.png`;
  const fullPath = `users/${uid}/bg/${draftId}/${pathKey}`;

  const file = bucket.file(fullPath);
  await file.save(png, {
    contentType: "image/png",
    resumable: false,
    metadata: {
      metadata: { firebaseStorageDownloadTokens: token },
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  return makeDownloadUrl(bucketName, fullPath, token);
}

type ReqBody = {
  draftId?: string; // ✅ 必須
  vision?: string;
  size?: string;
  referenceImageUrl?: string;
};

export async function POST(req: Request) {
  let uid = "";
  try {
    uid = await requireUid(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as ReqBody;

  const draftId = safeStr(body.draftId);
  if (!draftId) return NextResponse.json({ ok: false, error: "draftId is required" }, { status: 400 });

  const vision = safeStr(body.vision);
  if (!vision) return NextResponse.json({ ok: false, error: "vision is required" }, { status: 400 });

  const referenceImageUrl = safeStr(body.referenceImageUrl);
  if (!referenceImageUrl) {
    return NextResponse.json({ ok: false, error: "referenceImageUrl is required" }, { status: 400 });
  }

  const uiSize = normUiSize(body.size);
  const openaiSize = toOpenAISize(uiSize);

  try {
    const apiKey = requiredEnv("OPENAI_API_KEY");
    requiredEnv("FIREBASE_STORAGE_BUCKET", ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"]);

    const raw = await fetchAsBuffer(referenceImageUrl);
    const exact = await toExactSizePng(raw, openaiSize);

    const fd = new FormData();
    fd.set("model", "gpt-image-1");
    fd.set("size", openaiSize);
    fd.set(
      "prompt",
      [
        "Replace ONLY the background of the product photo.",
        "Keep the product exactly the same. Do not change the product shape, color, or details.",
        "Create a clean, premium, minimalist background that matches the vision.",
        "No text. No logo. No watermark.",
        `Vision: ${vision}`,
        `Output size: ${openaiSize}`,
      ].join("\n")
    );

    const bytes = new Uint8Array(exact.buf.byteLength);
    bytes.set(exact.buf);
    const blob = new Blob([bytes], { type: exact.contentType });
    fd.set("image", blob, exact.filename);

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });

    const j = await res.json().catch(() => ({} as any));
    if (!res.ok) throw new Error(j?.error?.message || "openai image edit error");

    const b64 = j?.data?.[0]?.b64_json;
    if (typeof b64 !== "string" || !b64) throw new Error("no image returned");

    const png = Buffer.from(b64, "base64");
    const bgImageUrl = await savePng(uid, draftId, png);

    return NextResponse.json({ ok: true, draftId, bgImageUrl, uiSize, openaiSize });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}