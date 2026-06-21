// /app/api/video/cutout/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";
import fs from "node:fs/promises";
import { accessSync, constants, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import ffmpegStaticPath from "ffmpeg-static";
import sharp from "sharp";

import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminBucket } from "@/firebaseAdmin";

type VideoSize = {
  w: number;
  h: number;
};

function storageDownloadUrl(bucketName: string, filePath: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    filePath
  )}?alt=media&token=${token}`;
}

function isExecutableFile(filePath: string) {
  try {
    if (!filePath) return false;
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveFfmpegPath() {
  // Macローカル開発では ffmpeg-static が spawn Unknown system error -88 を出すことがあります。
  // そのため Homebrew / system ffmpeg を最優先し、ffmpeg-static は最後の保険にします。
  const candidates = [
    String(process.env.FFMPEG_PATH || "").trim(),
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
    "ffmpeg",
    typeof ffmpegStaticPath === "string" ? ffmpegStaticPath : "",
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
  ];

  for (const candidate of candidates) {
    const cmd = String(candidate || "").trim();
    if (!cmd) continue;
    if (cmd === "ffmpeg") return cmd;
    if (existsSync(cmd) && isExecutableFile(cmd)) return cmd;
  }

  throw new Error("ffmpeg binary not found. Mac開発環境では `brew install ffmpeg` を実行してください。");
}

function parseSize(input: unknown): VideoSize {
  const raw = String(input || "720x1280").trim();
  const m = raw.match(/^(\d+)\s*x\s*(\d+)$/i);

  if (!m) return { w: 720, h: 1280 };

  return {
    w: Math.max(256, Math.min(1920, Number(m[1]))),
    h: Math.max(256, Math.min(1920, Number(m[2]))),
  };
}

function safeNumber(input: unknown, fallback: number, min: number, max: number) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function parseDuration(input: unknown) {
  return safeNumber(input, 10, 1, 20);
}

function normalizeChromaColor(input: unknown) {
  const raw = String(input || "").trim();

  if (/^0x[0-9a-fA-F]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return `0x${raw.slice(1)}`;

  return "0x38A88E";
}

async function runCommand(cmd: string, args: string[], timeoutMs = 90_000) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;
    let stderr = "";

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      finish(() => reject(new Error(`ffmpeg timeout ${Math.round(timeoutMs / 1000)}s / cmd=${cmd}`)));
    }, timeoutMs);

    child.stderr.on("data", (d) => {
      stderr += String(d);
    });

    child.on("error", (e: any) => {
      finish(() => reject(new Error(`ffmpeg spawn error: ${e?.message || e} / cmd=${cmd}`)));
    });

    child.on("close", (code) => {
      finish(() => {
        if (code === 0) return resolve();
        reject(new Error(`ffmpeg failed code=${code}: ${stderr.slice(-3000)}`));
      });
    });
  });
}

async function fetchToBuffer(url: string) {
  const res = await fetch(url, {
    cache: "no-store" as RequestCache,
  });

  if (!res.ok) {
    throw new Error(`failed to fetch: ${res.status}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());

  if (!buf.length) {
    throw new Error("fetched file is empty");
  }

  return buf;
}

async function makeBackgroundLayer(backgroundBuffer: Buffer, size: VideoSize) {
  return await sharp(backgroundBuffer, { failOn: "none" })
    .resize(size.w, size.h, {
      fit: "cover",
      position: "centre",
    })
    .png()
    .toBuffer();
}

async function cleanup(dir: string) {
  if (!dir) return;
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

export async function POST(req: Request) {
  const workDir = path.join(
    os.tmpdir(),
    `aoi_video_cutout_${Date.now()}_${Math.random().toString(16).slice(2)}`
  );

  try {
    const user = await requireUserFromAuthHeader(req);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const draftId = String(body.draftId || "").trim();
    const sourceVideoUrl = String(body.sourceVideoUrl || "").trim();
    const backgroundImageUrl = String(body.backgroundImageUrl || "").trim();
    const size = parseSize(body.size);
    const duration = parseDuration(body.duration ?? body.seconds);

    const chromaColor = normalizeChromaColor(body.chromaColor);

    const similarity = safeNumber(body.similarity, 0.42, 0.08, 0.62);
    const blend = safeNumber(body.blend, 0.10, 0.0, 0.22);

    if (!draftId) {
      return NextResponse.json({ ok: false, error: "draftId is required" }, { status: 400 });
    }

    if (!sourceVideoUrl) {
      return NextResponse.json({ ok: false, error: "sourceVideoUrl is required" }, { status: 400 });
    }

    if (!backgroundImageUrl) {
      return NextResponse.json({ ok: false, error: "backgroundImageUrl is required" }, { status: 400 });
    }

    await fs.mkdir(workDir, { recursive: true });

    const inputVideoPath = path.join(workDir, "input.mp4");
    const backgroundPath = path.join(workDir, "background.png");
    const outputPath = path.join(workDir, "output.mp4");
    const chromaPreviewPath = path.join(workDir, "chroma_preview.webm");

    const [videoBuffer, backgroundBuffer] = await Promise.all([
      fetchToBuffer(sourceVideoUrl),
      fetchToBuffer(backgroundImageUrl),
    ]);

    await fs.writeFile(inputVideoPath, videoBuffer);

    const bgLayer = await makeBackgroundLayer(backgroundBuffer, size);
    await fs.writeFile(backgroundPath, bgLayer);

    const ffmpeg = resolveFfmpegPath();

    const foregroundFilter = [
      `scale=${size.w}:${size.h}:force_original_aspect_ratio=increase`,
      `crop=${size.w}:${size.h}`,
      `format=rgba`,
      `colorkey=${chromaColor}:${similarity}:${blend}`,
      `despill=green`,
      `format=rgba`,
    ].join(",");

    await runCommand(ffmpeg, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x202020:s=${size.w}x${size.h}:r=30`,
      "-i",
      inputVideoPath,
      "-filter_complex",
      [
        `[1:v]${foregroundFilter}[fg]`,
        `[0:v]scale=${size.w}:${size.h}[previewbg]`,
        `[previewbg][fg]overlay=0:0:format=auto[outv]`,
      ].join(";"),
      "-map",
      "[outv]",
      "-an",
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuv420p",
      "-t",
      String(duration),
      "-shortest",
      chromaPreviewPath,
    ]);

    await runCommand(ffmpeg, [
      "-y",
      "-loop",
      "1",
      "-i",
      backgroundPath,
      "-i",
      inputVideoPath,
      "-filter_complex",
      [
        `[0:v]scale=${size.w}:${size.h},setsar=1[bg]`,
        `[1:v]${foregroundFilter},setsar=1[fg]`,
        `[bg][fg]overlay=0:0:format=auto,format=yuv420p[outv]`,
      ].join(";"),
      "-map",
      "[outv]",
      "-map",
      "1:a?",
      "-t",
      String(duration),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    const mp4Buffer = await fs.readFile(outputPath);
    const chromaPreviewBuffer = await fs.readFile(chromaPreviewPath);

    if (!mp4Buffer.length) throw new Error("output mp4 is empty");
    if (!chromaPreviewBuffer.length) throw new Error("chroma preview is empty");

    const bucket = getAdminBucket();
    const bucketName = String(bucket.name || "").trim();

    if (!bucketName) {
      throw new Error("storage bucket name is empty");
    }

    const token = crypto.randomUUID();

    const filePath = `users/${user.uid}/drafts/${draftId}/nonai/video_cutout_${Date.now()}.mp4`;
    const chromaPreviewStoragePath = `users/${user.uid}/drafts/${draftId}/nonai/chroma_preview_${Date.now()}.webm`;

    await bucket.file(filePath).save(mp4Buffer, {
      contentType: "video/mp4",
      resumable: false,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
          source: "video-cutout-colorkey-green-only",
        },
        cacheControl: "public,max-age=31536000",
      },
    });

    await bucket.file(chromaPreviewStoragePath).save(chromaPreviewBuffer, {
      contentType: "video/webm",
      resumable: false,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
          source: "video-cutout-preview-green-only",
        },
        cacheControl: "public,max-age=31536000",
      },
    });

    const videoUrl = storageDownloadUrl(bucketName, filePath, token);
    const chromaPreviewVideoUrl = storageDownloadUrl(bucketName, chromaPreviewStoragePath, token);

    return NextResponse.json({
      ok: true,
      videoUrl,
      mp4Url: videoUrl,
      url: videoUrl,
      chromaPreviewVideoUrl,
      path: filePath,
      chromaPreviewPath: chromaPreviewStoragePath,
      size,
      duration,
      chromaColor,
      similarity,
      blend,
    });
  } catch (e: any) {
    console.error("[/api/video/cutout] failed:", e);

    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "video cutout failed",
      },
      { status: 500 }
    );
  } finally {
    await cleanup(workDir);
  }
}