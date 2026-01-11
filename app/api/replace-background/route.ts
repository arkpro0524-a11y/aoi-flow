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
  return { buf: out, w, h, filename: `bgsrc_${w}x${h}.png` };
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

async function openaiFetch(apiKey: string, path0: string, init?: RequestInit) {
  const url = `https://api.openai.com${path0}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers ?? {}),
    },
  });
}

async function openaiJson(apiKey: string, path0: string, init?: RequestInit) {
  const res = await openaiFetch(apiKey, path0, init);
  const text = await res.text().catch(() => "");
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error?.message || json?.error || text || `OpenAI error ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

type ReqBody = {
  brandId?: string;
  vision?: string;
  size?: string; // UI size
  referenceImageUrl?: string;

  // フロントで draftId を渡せるなら渡す（無ければ timestampで代替）
  draftId?: string;
};

export async function POST(req: Request) {
  let uid = "";
  try {
    uid = await requireUid(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as ReqBody;

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

    // ✅ OpenAIへ multipart（入力画像 + prompt）
    const fd = new FormData();
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

    // ここは OpenAIの画像生成モデル。プロジェクトに合わせて調整OK
    fd.set("model", "gpt-image-1");
    fd.set("size", openaiSize);

    const bytes = new Uint8Array(exact.buf.byteLength);
    bytes.set(exact.buf);
    const blob = new Blob([bytes], { type: "image/png" });

    // API側の仕様に合わせて "image" を使う（もし既存があるならそれに合わせる）
    fd.set("image", blob, exact.filename);

    const j = await openaiJson(apiKey, "/v1/images", { method: "POST", body: fd });

    // 返り値の形式差を吸収（b64 or url）
    const b64 =
      typeof j?.data?.[0]?.b64_json === "string"
        ? j.data[0].b64_json
        : typeof j?.b64 === "string"
          ? j.b64
          : "";

    let png: Buffer | null = null;

    if (b64) {
      png = Buffer.from(b64, "base64");
    } else {
      const url = typeof j?.data?.[0]?.url === "string" ? j.data[0].url : "";
      if (!url) throw new Error("no image output");
      const res = await fetch(url);
      if (!res.ok) throw new Error("failed to fetch generated image");
      const ab = await res.arrayBuffer();
      png = Buffer.from(ab);
    }

    const draftId = safeStr(body.draftId) || `draft_${Date.now()}`;
    const bgImageUrl = await savePng(uid, draftId, png);

    return NextResponse.json({ ok: true, bgImageUrl, uiSize, openaiSize });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}