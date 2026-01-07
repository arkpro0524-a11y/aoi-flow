// /app/api/generate-video/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/server/firebaseAdmin";
import { getIdempotencyKey } from "@/lib/server/idempotency";
import { PRICING } from "@/lib/server/pricing";
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

function compactKeywords(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return keys.map(String).slice(0, 12);
}

function normQuality(v: any): "standard" | "high" {
  return v === "high" ? "high" : "standard";
}

function normTemplate(v: any): string {
  const t = String(v ?? "");
  const ok = ["zoomIn", "zoomOut", "slideLeft", "slideRight", "fadeIn", "fadeOut", "slowZoomFade", "static"];
  return ok.includes(t) ? t : "slowZoomFade";
}

function normSize(v: any): string {
  const s = String(v ?? "");
  const ok = ["1024x1792", "720x1280", "1792x1024", "1280x720"];
  return ok.includes(s) ? s : "1024x1792";
}

function getBucket() {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  return getStorage().bucket(bucketName);
}

function makeDownloadUrl(bucketName: string, filePath: string, token: string) {
  const encPath = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encPath}?alt=media&token=${token}`;
}

async function saveMp4ToFirebaseStorage(uid: string, idemKey: string, mp4: Buffer) {
  const bucket = getBucket();
  const bucketName = bucket.name;
  const path = `users/${uid}/videos/${idemKey}/${Date.now()}.mp4`;
  const token = crypto.randomUUID();

  const file = bucket.file(path);
  await file.save(mp4, {
    contentType: "video/mp4",
    resumable: false,
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  return makeDownloadUrl(bucketName, path, token);
}

/** OpenAI REST */
async function openaiJson(path: string, apiKey: string, init?: RequestInit) {
  const url = `https://api.openai.com${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers ?? {}),
    },
  });
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

/**
 * OpenAI の戻り値は揺れる前提：
 * - data[0].b64_json / b64 / url
 * - output[].content[].(b64|url) 等
 * 取り得る形を吸収して “mp4 Buffer” を作る
 */
async function extractVideoAsBuffer(videoResp: any): Promise<Buffer> {
  const b64 =
    safeStr(videoResp?.b64) ||
    safeStr(videoResp?.data?.[0]?.b64) ||
    safeStr(videoResp?.data?.[0]?.b64_json) ||
    safeStr(videoResp?.output?.[0]?.b64) ||
    safeStr(videoResp?.output?.[0]?.b64_json) ||
    safeStr(videoResp?.output?.[0]?.content?.[0]?.b64) ||
    safeStr(videoResp?.output?.[0]?.content?.[0]?.b64_json);

  if (b64) return Buffer.from(b64, "base64");

  const url =
    safeStr(videoResp?.url) ||
    safeStr(videoResp?.data?.[0]?.url) ||
    safeStr(videoResp?.output?.[0]?.url) ||
    safeStr(videoResp?.output?.[0]?.content?.[0]?.url);

  if (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`failed to fetch video url: ${res.status}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  throw new Error("video result has no url/b64. OpenAI response shape changed.");
}

type ReqBody = {
  brandId?: string;
  vision?: string;
  keywords?: unknown;

  templateId?: string;
  seconds?: number | string;
  quality?: "standard" | "high" | string;
  size?: string;

  referenceImageUrl?: string;

  requestId?: string;
  idempotencyKey?: string;
};

export async function POST(req: Request) {
  let uid = "";
  try {
    uid = await requireUid(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as ReqBody;

  const brandId = typeof body.brandId === "string" ? body.brandId : "vento";
  const vision = safeStr(body.vision);
  const keywords = compactKeywords(body.keywords);

  if (!vision) return NextResponse.json({ ok: false, error: "vision is required" }, { status: 400 });

  // ✅ 秒数は pricing.ts で固定（B対策：勝手に長くならない）
  const seconds = PRICING.normalizeVideoSeconds(body.seconds); // 5 or 10
  const quality = normQuality(body.quality);
  const templateId = normTemplate(body.templateId);
  const size = normSize(body.size);
  const referenceImageUrl = safeStr(body.referenceImageUrl);

  // ✅ C対策：価格は pricing.ts の単一関数で確定
  const costYen = PRICING.calcVideoCostYen(seconds, quality);

  // ✅ A対策：冪等キーは “正規化済み入力” で固定 → 同一条件は同一キー
  const idemKey = getIdempotencyKey(req, {
    type: "video",
    uid,
    brandId,
    vision: vision.slice(0, PRICING.MAX_PROMPT_CHARS),
    keywords,
    seconds,
    quality,
    templateId,
    size,
    referenceImageUrl,
    requestId: body.requestId,
    idempotencyKey: body.idempotencyKey,
  });

  const db = getDb();
  const docRef = db.collection("generations").doc(idemKey);

  // ✅ 先に予約（同一条件は再利用）
  const reserved = await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (snap.exists) return { already: true, data: snap.data() as any };

    tx.set(docRef, {
      id: idemKey,
      type: "video",
      status: "running",
      uid,
      brandId,
      vision,
      keywords,
      seconds,
      quality,
      templateId,
      size,
      referenceImageUrl,
      costYen,
      createdAt: Date.now(),
    });

    return { already: false, data: null };
  });

  if (reserved.already) {
    // ✅ 既に完了済みなら同じ結果を返す（A対策：二重課金を潰す）
    return NextResponse.json({
      ok: true,
      reused: true,
      url: reserved.data?.url ?? null,
      generation: reserved.data,
    });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    const prompt = [
      "You are generating a short product video.",
      "Make it clean and premium.",
      "No logos. No watermark. No text overlays.",
      `Brand: ${brandId}`,
      `Vision: ${vision}`,
      keywords.length ? `Keywords: ${keywords.join(" / ")}` : "",
      `Style template hint: ${templateId}`,
      `Duration seconds: ${seconds}`,
      `Quality: ${quality}`,
      `Size: ${size}`,
    ]
      .filter(Boolean)
      .join("\n");

    // ✅ SDK依存を捨てて REST で固定（型エラー根治）
    const videoResp = await openaiJson("/v1/videos/generations", apiKey, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-video-1",
        prompt,
        size,
        duration: seconds,
      }),
    });

    const mp4 = await extractVideoAsBuffer(videoResp);
    const url = await saveMp4ToFirebaseStorage(uid, idemKey, mp4);

    const generation = {
      id: idemKey,
      type: "video",
      status: "succeeded",
      uid,
      brandId,
      vision,
      keywords,
      seconds,
      quality,
      templateId,
      size,
      referenceImageUrl,
      costYen,
      url,
      openaiVideoId: safeStr(videoResp?.id) || null,
      finishedAt: Date.now(),
    };

    await docRef.set(generation, { merge: true });
    return NextResponse.json({ ok: true, reused: false, url, generation });
  } catch (e: any) {
    await docRef.set({ status: "failed", error: String(e?.message ?? e), finishedAt: Date.now() }, { merge: true });
    return NextResponse.json({ ok: false, error: String(e?.message ?? e), id: idemKey }, { status: 500 });
  }
}