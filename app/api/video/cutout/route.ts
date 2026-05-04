// /app/api/video/cutout/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
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

function getCutoutApiUrl() {
  const envUrl = String(process.env.CUTOUT_API_URL || "").trim();
  return envUrl || "http://localhost:8080/cutout";
}

function resolveFfmpegPath() {
  const candidates = [
    process.env.FFMPEG_PATH,
    typeof ffmpegStaticPath === "string" ? ffmpegStaticPath : "",
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    "ffmpeg",
  ];

  for (const p of candidates) {
    if (!p) continue;
    if (p === "ffmpeg") return p;
    if (existsSync(p)) return p;
  }

  throw new Error("ffmpeg binary not found");
}

function parseSize(input: unknown): VideoSize {
  const raw = String(input || "720x1280").trim();
  const m = raw.match(/^(\d+)\s*x\s*(\d+)$/i);

  if (!m) {
    return { w: 720, h: 1280 };
  }

  return {
    w: Math.max(256, Math.min(1920, Number(m[1]))),
    h: Math.max(256, Math.min(1920, Number(m[2]))),
  };
}

async function runCommand(cmd: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (d) => {
      stderr += String(d);
    });

    child.on("error", (e) => {
      reject(e);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`ffmpeg failed code=${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function fetchToBuffer(url: string) {
  const res = await fetch(url, { cache: "no-store" as RequestCache });

  if (!res.ok) {
    throw new Error(`failed to fetch: ${res.status}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());

  if (!buf.length) {
    throw new Error("fetched file is empty");
  }

  return buf;
}

async function cutoutFrame(frameBuffer: Buffer) {
  const cutoutUrl = getCutoutApiUrl();

  const file = new File([new Uint8Array(frameBuffer)], "frame.png", {
    type: "image/png",
  });

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(cutoutUrl, {
    method: "POST",
    body: form,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`cutout failed: ${res.status} ${text}`);
  }

  const out = Buffer.from(await res.arrayBuffer());

  if (!out.length) {
    throw new Error("cutout result is empty");
  }

  return out;
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

async function compositeFrame(args: {
  foregroundPng: Buffer;
  backgroundPng: Buffer;
  size: VideoSize;
}) {
  const { foregroundPng, backgroundPng, size } = args;

  const fg = await sharp(foregroundPng, { failOn: "none" })
    .ensureAlpha()
    .resize(size.w, size.h, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return await sharp(backgroundPng, { failOn: "none" })
    .composite([
      {
        input: fg,
        gravity: "centre",
      },
    ])
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

    if (!draftId) {
      return NextResponse.json({ ok: false, error: "draftId is required" }, { status: 400 });
    }

    if (!sourceVideoUrl) {
      return NextResponse.json(
        { ok: false, error: "sourceVideoUrl is required" },
        { status: 400 }
      );
    }

    if (!backgroundImageUrl) {
      return NextResponse.json(
        { ok: false, error: "backgroundImageUrl is required" },
        { status: 400 }
      );
    }

    await fs.mkdir(workDir, { recursive: true });

    const inputVideoPath = path.join(workDir, "input.mp4");
    const backgroundPath = path.join(workDir, "background.png");
    const framesDir = path.join(workDir, "frames");
    const outFramesDir = path.join(workDir, "out_frames");
    const outputPath = path.join(workDir, "output.mp4");

    await fs.mkdir(framesDir, { recursive: true });
    await fs.mkdir(outFramesDir, { recursive: true });

    const [videoBuffer, backgroundBuffer] = await Promise.all([
      fetchToBuffer(sourceVideoUrl),
      fetchToBuffer(backgroundImageUrl),
    ]);

    await fs.writeFile(inputVideoPath, videoBuffer);

    const bgLayer = await makeBackgroundLayer(backgroundBuffer, size);
    await fs.writeFile(backgroundPath, bgLayer);

    const ffmpeg = resolveFfmpegPath();

    await runCommand(ffmpeg, [
      "-y",
      "-i",
      inputVideoPath,
      "-t",
      "10",
      "-vf",
      `fps=12,scale=${size.w}:${size.h}:force_original_aspect_ratio=decrease,pad=${size.w}:${size.h}:(ow-iw)/2:(oh-ih)/2`,
      path.join(framesDir, "frame_%05d.png"),
    ]);

    const frameFiles = (await fs.readdir(framesDir))
      .filter((name) => name.endsWith(".png"))
      .sort();

    if (!frameFiles.length) {
      throw new Error("no frames extracted");
    }

    for (let i = 0; i < frameFiles.length; i++) {
      const name = frameFiles[i];
      const framePath = path.join(framesDir, name);
      const outPath = path.join(outFramesDir, name);

      const frameBuffer = await fs.readFile(framePath);
      const cutoutPng = await cutoutFrame(frameBuffer);

      const composed = await compositeFrame({
        foregroundPng: cutoutPng,
        backgroundPng: bgLayer,
        size,
      });

      await fs.writeFile(outPath, composed);
    }

    await runCommand(ffmpeg, [
      "-y",
      "-framerate",
      "12",
      "-i",
      path.join(outFramesDir, "frame_%05d.png"),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      outputPath,
    ]);

    const mp4Buffer = await fs.readFile(outputPath);

    if (!mp4Buffer.length) {
      throw new Error("output mp4 is empty");
    }

    const bucket = getAdminBucket();
    const bucketName = String(bucket.name || "").trim();

    if (!bucketName) {
      throw new Error("storage bucket name is empty");
    }

    const token = crypto.randomUUID();
    const filePath = `users/${user.uid}/drafts/${draftId}/nonai/video_cutout_${Date.now()}.mp4`;

    await bucket.file(filePath).save(mp4Buffer, {
      contentType: "video/mp4",
      resumable: false,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
          source: "video-cutout",
        },
        cacheControl: "public,max-age=31536000",
      },
    });

    const videoUrl = storageDownloadUrl(bucketName, filePath, token);

    return NextResponse.json({
      ok: true,
      videoUrl,
      mp4Url: videoUrl,
      url: videoUrl,
      path: filePath,
      frameCount: frameFiles.length,
      fps: 12,
      size,
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