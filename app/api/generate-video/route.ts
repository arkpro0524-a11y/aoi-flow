// /app/api/generate-video/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import sharp from "sharp";
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
  return keys.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 12);
}

function requiredEnv(name: string, fallbackNames: string[] = []) {
  const names = [name, ...fallbackNames];
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  throw new Error(`${name} missing`);
}

type VideoSize = "1024x1792" | "720x1280" | "1792x1024" | "1280x720";
function normSize(v: any): VideoSize {
  const s = String(v ?? "");
  const ok: VideoSize[] = ["1024x1792", "720x1280", "1792x1024", "1280x720"];
  return ok.includes(s as VideoSize) ? (s as VideoSize) : "1024x1792";
}
function parseSize(size: VideoSize) {
  const [w, h] = String(size).split("x").map((n) => parseInt(n, 10));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error("invalid size");
  return { w, h };
}

function normQuality(v: any): "standard" | "high" {
  return v === "high" ? "high" : "standard";
}

function normTemplate(v: any): string {
  const t = String(v ?? "");
  const ok = ["zoomIn", "zoomOut", "slideLeft", "slideRight", "fadeIn", "fadeOut", "slowZoomFade", "static"];
  return ok.includes(t) ? t : "slowZoomFade";
}

type OpenAIVideoSeconds = "4" | "8" | "12";
function toOpenAIVideoSeconds(sec: 5 | 10): OpenAIVideoSeconds {
  return sec === 10 ? "8" : "4";
}

type OpenAIVideoModel = "sora-2" | "sora-2-pro";

function allowedSizesForModel(model: OpenAIVideoModel) {
  if (model === "sora-2") return ["720x1280", "1280x720"] as const;
  return ["1024x1792", "1792x1024", "720x1280", "1280x720"] as const;
}

function coerceSizeForModel(model: OpenAIVideoModel, requested: VideoSize): VideoSize {
  const allowed = allowedSizesForModel(model);
  if (allowed.includes(requested as any)) return requested;

  const isPortrait = requested === "1024x1792" || requested === "720x1280";
  return (isPortrait ? "720x1280" : "1280x720") as VideoSize;
}

function getBucket() {
  const bucketName = requiredEnv("FIREBASE_STORAGE_BUCKET", ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"]);
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
      metadata: { firebaseStorageDownloadTokens: token },
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  return makeDownloadUrl(bucketName, path, token);
}

async function fetchAsBuffer(url: string) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`failed to fetch reference image: ${res.status}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const ab = await res.arrayBuffer();
  return { buf: Buffer.from(ab), contentType };
}

async function toExactSizePng(input: Buffer, size: VideoSize) {
  const { w, h } = parseSize(size);
  const out = await sharp(input)
    .rotate()
    .resize(w, h, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return { buf: out, filename: `reference_${w}x${h}.png`, contentType: "image/png" as const };
}

async function openaiFetch(apiKey: string, path: string, init?: RequestInit) {
  const url = `https://api.openai.com${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers ?? {}),
    },
  });
}

async function openaiJson(apiKey: string, path: string, init?: RequestInit) {
  const res = await openaiFetch(apiKey, path, init);

  const text = await res.text().catch(() => "");
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg = json?.error?.message || json?.error || text || `OpenAI error ${res.status}`;
    const err = new Error(msg);
    (err as any).openai = json;
    (err as any).httpStatus = res.status;
    throw err;
  }

  return json;
}

function isRunningStatus(s: string) {
  const st = s.toLowerCase();
  return st === "running" || st === "queued" || st === "in_progress" || st === "processing" || st === "pending";
}
function isSuccessStatus(s: string) {
  const st = s.toLowerCase();
  return st === "completed" || st === "succeeded" || st === "success";
}
function isFailedStatus(s: string) {
  const st = s.toLowerCase();
  return st === "failed" || st === "canceled" || st === "cancelled" || st === "error";
}

function pickOpenaiFailureDetails(obj: any) {
  // できる限り「原因」を拾う（プロパティ名が揺れる前提で保険）
  const status = safeStr(obj?.status);
  const message =
    safeStr(obj?.error?.message) ||
    safeStr(obj?.error?.details) ||
    safeStr(obj?.error) ||
    safeStr(obj?.message) ||
    safeStr(obj?.detail);

  const code =
    safeStr(obj?.error?.code) ||
    safeStr(obj?.code) ||
    safeStr(obj?.error?.type) ||
    safeStr(obj?.type);

  return {
    status,
    code: code || null,
    message: message || null,
    raw: obj ?? null,
  };
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
  // 1) 認証
  let uid = "";
  try {
    uid = await requireUid(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 401 });
  }

  // 2) body
  const body = (await req.json().catch(() => ({}))) as ReqBody;

  const brandId = typeof body.brandId === "string" ? body.brandId : "vento";
  const vision = safeStr(body.vision);
  const keywords = compactKeywords(body.keywords);

  if (!vision) return NextResponse.json({ ok: false, error: "vision is required" }, { status: 400 });

  const referenceImageUrl = safeStr(body.referenceImageUrl);
  if (!referenceImageUrl) {
    return NextResponse.json({ ok: false, error: "referenceImageUrl is required" }, { status: 400 });
  }

  // 3) 入力正規化
  const seconds = PRICING.normalizeVideoSeconds(body.seconds); // 5 or 10
  const openaiSeconds = toOpenAIVideoSeconds(seconds); // 4 or 8
  const quality = normQuality(body.quality);
  const templateId = normTemplate(body.templateId);

  const requestedSize: VideoSize = normSize(body.size);
  const model: OpenAIVideoModel = quality === "high" ? "sora-2-pro" : "sora-2";
  const size: VideoSize = coerceSizeForModel(model, requestedSize);

  // 4) 価格
  const costYen = PRICING.calcVideoCostYen(seconds, quality);

  // 5) 冪等キー（final size を固定）
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

  // 6) 予約
  const reserved = await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);

    if (snap.exists) {
      const data = snap.data() as any;
      const status = String(data?.status ?? "");

      if (status === "succeeded") return { mode: "reused_succeeded" as const, data };
      if (status === "running") return { mode: "reused_running" as const, data };

      tx.set(
        docRef,
        {
          status: "running",
          error: null,
          restartedAt: Date.now(),
          uid,
          brandId,
          vision,
          keywords,
          seconds,
          quality,
          templateId,
          model,
          requestedSize,
          finalSize: size,
          referenceImageUrl,
          costYen,
        },
        { merge: true }
      );

      return { mode: "restarted" as const, data };
    }

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
      model,
      requestedSize,
      finalSize: size,
      referenceImageUrl,
      costYen,
      createdAt: Date.now(),
    });

    return { mode: "created" as const, data: null };
  });

  if (reserved.mode === "reused_succeeded") {
    return NextResponse.json({ ok: true, reused: true, url: reserved.data?.url ?? null, generation: reserved.data });
  }

  if (reserved.mode === "reused_running") {
    return NextResponse.json(
      {
        ok: true,
        reused: true,
        running: true,
        url: reserved.data?.url ?? null,
        generation: reserved.data,
        message: "generation is already running; not re-triggering to prevent double charge",
      },
      { status: 202 }
    );
  }

  let lastOpenai: any = null;

  try {
    // 7) env
    const apiKey = requiredEnv("OPENAI_API_KEY");
    requiredEnv("FIREBASE_STORAGE_BUCKET", ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"]);

    // 8) 参照画像 → final size 一致PNG
    const fetched = await fetchAsBuffer(referenceImageUrl);
    const exact = await toExactSizePng(fetched.buf, size);

    // 9) prompt
    const prompt = [
      "Create a short product video based on the reference image.",
      "Keep the product identity consistent with the reference.",
      "Change the background to match the vision, keeping it premium and clean.",
      "No logos. No watermark. No text overlays.",
      `Brand: ${brandId}`,
      `Vision: ${vision}`,
      keywords.length ? `Keywords: ${keywords.join(" / ")}` : "",
      `Template hint: ${templateId}`,
      `Quality hint: ${quality}`,
      `Model: ${model}`,
      `Requested size: ${requestedSize}`,
      `Final size: ${size}`,
      `UI seconds: ${seconds}`,
      `OpenAI seconds: ${openaiSeconds}`,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, PRICING.MAX_PROMPT_CHARS);

    // 10) OpenAIへ multipart
    const fd = new FormData();
    fd.set("prompt", prompt);
    fd.set("model", model);
    fd.set("size", size);
    fd.set("seconds", openaiSeconds);

    // ✅ Buffer(ArrayBufferLike) -> Uint8Array(ArrayBuffer) へ確実コピーして Blob 化
    const bytes = new Uint8Array(exact.buf.byteLength);
    bytes.set(exact.buf);

    const blob = new Blob([bytes], { type: exact.contentType });
    fd.set("input_reference", blob, exact.filename);

    const created = await openaiJson(apiKey, "/v1/videos", {
      method: "POST",
      body: fd,
    });

    lastOpenai = created;

    const videoId = safeStr(created?.id);
    if (!videoId) throw new Error("video id missing");

    // 11) 完了までポーリング
    let last = created;
    const startedAt = Date.now();
    const TIMEOUT_MS = 180_000;

    while (true) {
      const status = safeStr(last?.status);
      lastOpenai = last;

      if (isSuccessStatus(status)) break;

      if (isFailedStatus(status)) {
        const details = pickOpenaiFailureDetails(last);
        throw new Error(`video job failed: ${details.message || details.code || details.status || "unknown"}`);
      }

      if (!status || isRunningStatus(status)) {
        // ok
      }

      if (Date.now() - startedAt > TIMEOUT_MS) throw new Error("video generation timeout");

      await new Promise((r) => setTimeout(r, 1500));
      last = await openaiJson(apiKey, `/v1/videos/${encodeURIComponent(videoId)}`, { method: "GET" });
    }

    // 12) mp4取得
    const contentRes = await openaiFetch(apiKey, `/v1/videos/${encodeURIComponent(videoId)}/content`, { method: "GET" });
    if (!contentRes.ok) {
      const t = await contentRes.text().catch(() => "");
      throw new Error(`failed to fetch video content: ${contentRes.status} ${t}`);
    }

    const ab = await contentRes.arrayBuffer();
    const mp4 = Buffer.from(ab);

    // 13) Storageへ保存
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
      model,
      requestedSize,
      finalSize: size,
      referenceImageUrl,
      costYen,
      url,
      openaiVideoId: safeStr(created?.id),
      finishedAt: Date.now(),
    };

    await docRef.set({ ...generation, openaiLast: lastOpenai ?? null }, { merge: true });
    return NextResponse.json({ ok: true, reused: false, url, generation });
  } catch (e: any) {
    const openaiFromErr = (e as any)?.openai ?? null;
    const details = pickOpenaiFailureDetails(lastOpenai ?? openaiFromErr);

    const msg = String(e?.message ?? e);
    await docRef.set(
      {
        status: "failed",
        error: msg,
        openaiLast: lastOpenai ?? null,
        openaiDetails: details,
        finishedAt: Date.now(),
      },
      { merge: true }
    );

    return NextResponse.json(
      {
        ok: false,
        error: msg,
        id: idemKey,
        details, // ✅ フロントで見える
      },
      { status: 500 }
    );
  }
}