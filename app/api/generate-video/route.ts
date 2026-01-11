// /app/api/generate-video/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import sharp from "sharp";
import os from "os";
import path from "path";
import { promises as fs } from "fs";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

import { getDb } from "@/lib/server/firebaseAdmin";
import { getIdempotencyKey } from "@/lib/server/idempotency";
import { PRICING } from "@/lib/server/pricing";
import { getAdminAuth } from "@/firebaseAdmin";
import { getStorage } from "firebase-admin/storage";

export const runtime = "nodejs";

/**
 * ✅ “Uint8Array<ArrayBufferLike> vs Uint8Array<ArrayBuffer>” を物理的に回避する版（現行維持）
 * - バイト列の型を自前で Bytes として扱う（ジェネリクスの衝突を避ける）
 * - arrayBuffer() の結果は必ずコピーして「普通のUint8Array」に落とす
 * - file.save は渡す瞬間だけ型を捨てる（as any）
 *
 * ✅ 今回の修正（課金事故＆背景未変更を止める）
 * 1) bgImageUrl が無い場合は 409 で停止（OpenAIへ投げない＝課金させない）
 * 2) idemKey の材料から requestId を除外（毎回別課金になる事故を止める）
 */

type Bytes = Uint8Array | Buffer;

function toBytes(ab: ArrayBuffer): Uint8Array {
  const out = new Uint8Array(ab.byteLength);
  out.set(new Uint8Array(ab));
  return out;
}

function bytesToBuffer(b: Bytes): Buffer {
  return Buffer.isBuffer(b) ? b : Buffer.from(b);
}

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

function getBucket() {
  const bucketName = requiredEnv("FIREBASE_STORAGE_BUCKET", ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"]);
  return getStorage().bucket(bucketName);
}

function makeDownloadUrl(bucketName: string, filePath: string, token: string) {
  const encPath = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encPath}?alt=media&token=${token}`;
}

async function saveMp4ToFirebaseStorage(uid: string, idemKey: string, mp4Bytes: Bytes) {
  const bucket = getBucket();
  const bucketName = bucket.name;

  const pathKey = `${Date.now()}_${crypto.randomUUID()}.mp4`;
  const pathFull = `users/${uid}/videos/${idemKey}/${pathKey}`;
  const token = crypto.randomUUID();

  const file = bucket.file(pathFull);

  await file.save(mp4Bytes as any, {
    contentType: "video/mp4",
    resumable: false,
    metadata: {
      metadata: { firebaseStorageDownloadTokens: token },
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  return makeDownloadUrl(bucketName, pathFull, token);
}

async function fetchAsBuffer(url: string) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`failed to fetch reference image: ${res.status}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const ab = await res.arrayBuffer();
  return { buf: Buffer.from(ab), contentType };
}

async function toExactSizePng(input: Buffer, size: OpenAISize) {
  const { w, h } = parseSize(size);
  const out = await sharp(input)
    .rotate()
    .resize(w, h, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return { buf: out, filename: `reference_${w}x${h}.png`, contentType: "image/png", w, h };
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

function isSuccessStatus(s: string) {
  const st = s.toLowerCase();
  return st === "completed" || st === "succeeded" || st === "success";
}
function isFailedStatus(s: string) {
  const st = s.toLowerCase();
  return st === "failed" || st === "canceled" || st === "cancelled" || st === "error";
}

type Overlay = {
  text?: string;
  fontSizePx?: number;
  yPercent?: number;
  barOpacity?: number;
  paddingPx?: number;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function escXml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function makeOverlayPng(w: number, h: number, overlay: Overlay) {
  const text = safeStr(overlay.text);
  if (!text) return null;

  const fontSize = clamp(Number(overlay.fontSizePx ?? 54), 18, 120);
  const yPct = clamp(Number(overlay.yPercent ?? 70), 0, 100);
  const barOpacity = clamp(Number(overlay.barOpacity ?? 0.45), 0, 1);
  const pad = clamp(Number(overlay.paddingPx ?? 36), 0, 200);

  const lines = text.split("\n").map((x) => x.trim()).filter(Boolean);
  const safeLines = lines.slice(0, 6);

  const lineH = Math.round(fontSize * 1.25);
  const barH = clamp(safeLines.length * lineH + pad * 2, 80, Math.floor(h * 0.55));
  const y = clamp(Math.round((h * yPct) / 100) - Math.round(barH / 2), 0, h - barH);

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="0" y="0" width="${w}" height="${h}" fill="transparent"/>
    <rect x="0" y="${y}" width="${w}" height="${barH}" fill="black" opacity="${barOpacity}"/>
    ${safeLines
      .map((ln, i) => {
        const yy = y + pad + lineH * (i + 0.8);
        return `<text x="${Math.round(w * 0.06)}" y="${yy}" font-size="${fontSize}" fill="white" font-family="sans-serif">${escXml(
          ln
        )}</text>`;
      })
      .join("\n")}
  </svg>`.trim();

  return sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

async function burnInTextToMp4(inputMp4: Bytes, w: number, h: number, overlay: Overlay): Promise<Bytes> {
  const text = safeStr(overlay.text);
  if (!text) return inputMp4;

  if (!ffmpegPath) throw new Error("ffmpeg-static not found (install ffmpeg-static)");

  const tmpDir = os.tmpdir();
  const inPath = path.join(tmpDir, `in_${crypto.randomUUID()}.mp4`);
  const outPath = path.join(tmpDir, `out_${crypto.randomUUID()}.mp4`);
  const overlayPath = path.join(tmpDir, `ov_${crypto.randomUUID()}.png`);

  try {
    await fs.writeFile(inPath, bytesToBuffer(inputMp4));

    const overlayPng = await makeOverlayPng(w, h, overlay);
    if (!overlayPng) return inputMp4;

    await fs.writeFile(overlayPath, overlayPng);

    await new Promise<void>((resolve, reject) => {
      const args = [
        "-y",
        "-i",
        inPath,
        "-i",
        overlayPath,
        "-filter_complex",
        "overlay=0:0:format=auto",
        "-c:a",
        "copy",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        outPath,
      ];

      const p = spawn(String(ffmpegPath), args, { stdio: ["ignore", "pipe", "pipe"] });

      let err = "";
      p.stderr.on("data", (d) => (err += String(d)));
      p.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg failed: ${code}\n${err}`));
      });
    });

    return await fs.readFile(outPath);
  } finally {
    fs.unlink(inPath).catch(() => {});
    fs.unlink(outPath).catch(() => {});
    fs.unlink(overlayPath).catch(() => {});
  }
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
  bgImageUrl?: string;

  overlay?: Overlay;

  requestId?: string; // 受け取るが idemKey には使わない
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

  const referenceImageUrl = safeStr(body.referenceImageUrl);
  if (!referenceImageUrl) {
    return NextResponse.json({ ok: false, error: "referenceImageUrl is required" }, { status: 400 });
  }

  const bgImageUrl = safeStr(body.bgImageUrl);

  // ✅ bgImageUrl 無しは「課金が起きる処理」を開始しない
  if (!bgImageUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "bgImageUrl is required. Please generate/prepare background-changed image first. Video generation is blocked to prevent charges without background change.",
      },
      { status: 409 }
    );
  }

  const usingImageUrl = bgImageUrl;

  const seconds = PRICING.normalizeVideoSeconds(body.seconds); // 5 or 10
  const openaiSeconds = toOpenAIVideoSeconds(seconds); // 4 or 8
  const quality = normQuality(body.quality);
  const templateId = normTemplate(body.templateId);

  const uiSize = normUiSize(body.size);
  const openaiSize = toOpenAISize(uiSize);

  const costYen = PRICING.calcVideoCostYen(seconds, quality);
  const overlayKey = body.overlay?.text ? safeStr(body.overlay.text).slice(0, 280) : "";

  const idemKey = getIdempotencyKey(req, {
    type: "video",
    uid,
    brandId,
    vision: vision.slice(0, PRICING.MAX_PROMPT_CHARS),
    keywords,
    seconds,
    quality,
    templateId,
    size: openaiSize,
    referenceImageUrl,
    bgImageUrl,
    overlayKey,
    // ✅ requestId は使わない（課金暴発防止）
    idempotencyKey: body.idempotencyKey,
  });

  const db = getDb();
  const docRef = db.collection("generations").doc(idemKey);

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
          uiSize,
          openaiSize,
          referenceImageUrl,
          bgImageUrl,
          usingImageUrl,
          costYen,
          overlay: body.overlay?.text ? body.overlay : null,
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
      uiSize,
      openaiSize,
      referenceImageUrl,
      bgImageUrl,
      usingImageUrl,
      costYen,
      overlay: body.overlay?.text ? body.overlay : null,
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

  try {
    const apiKey = requiredEnv("OPENAI_API_KEY");
    requiredEnv("FIREBASE_STORAGE_BUCKET", ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"]);

    const fetched = await fetchAsBuffer(usingImageUrl);
    const exact = await toExactSizePng(fetched.buf, openaiSize);

    const staticGuard =
      templateId === "static"
        ? ["No camera motion.", "No rotation, no panning, no zoom.", "Keep the scene perfectly still."].join("\n")
        : "";

    const prompt = [
      "Create a short product video based on the reference image.",
      "Keep the product identity consistent with the reference.",
      "CHANGE THE BACKGROUND to match the vision, premium and clean.",
      "No logos. No watermark. No text overlays.",
      staticGuard,
      `Brand: ${brandId}`,
      `Vision: ${vision}`,
      keywords.length ? `Keywords: ${keywords.join(" / ")}` : "",
      `Template hint: ${templateId}`,
      `Quality hint: ${quality}`,
      `UI size: ${uiSize}`,
      `OpenAI size: ${openaiSize}`,
      `UI seconds: ${seconds}`,
      `OpenAI seconds: ${openaiSeconds}`,
      "Reference is background-replaced image (bgImageUrl).",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, PRICING.MAX_PROMPT_CHARS);

    const fd = new FormData();
    fd.set("prompt", prompt);
    fd.set("size", openaiSize);
    fd.set("seconds", openaiSeconds);

    const model = quality === "high" ? "sora-2-pro" : "sora-2";
    fd.set("model", model);

    const blob = new Blob([exact.buf as any], { type: exact.contentType });
    fd.set("input_reference", blob, exact.filename);

    const created = await openaiJson(apiKey, "/v1/videos", { method: "POST", body: fd });

    const videoId = safeStr(created?.id);
    if (!videoId) throw new Error("video id missing");

    let last = created;
    const startedAt = Date.now();
    const TIMEOUT_MS = 180_000;

    while (true) {
      const status = safeStr(last?.status);

      if (isSuccessStatus(status)) break;
      if (isFailedStatus(status)) throw new Error(`video job ${status}`);

      if (Date.now() - startedAt > TIMEOUT_MS) throw new Error("video generation timeout");

      await new Promise((r) => setTimeout(r, 1500));
      last = await openaiJson(apiKey, `/v1/videos/${encodeURIComponent(videoId)}`, { method: "GET" });
    }

    const contentRes = await openaiFetch(apiKey, `/v1/videos/${encodeURIComponent(videoId)}/content`, { method: "GET" });
    if (!contentRes.ok) {
      const t = await contentRes.text().catch(() => "");
      throw new Error(`failed to fetch video content: ${contentRes.status} ${t}`);
    }

    const ab = await contentRes.arrayBuffer();
    let mp4: Bytes = toBytes(ab);

    if (body.overlay?.text && safeStr(body.overlay.text)) {
      mp4 = await burnInTextToMp4(mp4, exact.w, exact.h, body.overlay);
    }

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
      uiSize,
      openaiSize,
      referenceImageUrl,
      bgImageUrl,
      usingImageUrl,
      costYen,
      url,
      openaiVideoId: videoId,
      finishedAt: Date.now(),
      burnedText: Boolean(body.overlay?.text && safeStr(body.overlay.text)),
    };

    await docRef.set(generation, { merge: true });
    return NextResponse.json({ ok: true, reused: false, url, generation });
  } catch (e: any) {
    await docRef.set({ status: "failed", error: String(e?.message ?? e), finishedAt: Date.now() }, { merge: true });
    return NextResponse.json({ ok: false, error: String(e?.message ?? e), id: idemKey }, { status: 500 });
  }
}