// app/api/composite-video-background/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { spawn } from "child_process";
import fs from "fs/promises";
import { existsSync } from "node:fs";
import path from "path";
import { tmpdir } from "os";
import ffmpegStaticPath from "ffmpeg-static";
import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminBucket } from "@/firebaseAdmin";

/**
 * Firebase Storage の公開URLを作る関数
 */
function storageDownloadUrl(bucketName: string, filePath: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    filePath
  )}?alt=media&token=${token}`;
}

/**
 * ffmpeg の実行場所を探す
 *
 * 優先順位:
 * 1. .env.local の FFMPEG_PATH
 * 2. ffmpeg-static
 * 3. node_modules 直下
 * 4. PC / サーバーに入っている ffmpeg
 */
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

/**
 * UIから来た動画サイズを安全に数値化する
 */
function parseSize(size: unknown) {
  const s = String(size || "720x1280");
  const m = s.match(/^(\d+)\s*x\s*(\d+)$/i);

  const w = m ? Number(m[1]) : 720;
  const h = m ? Number(m[2]) : 1280;

  return {
    w: Math.max(240, Math.min(1920, Number.isFinite(w) ? w : 720)),
    h: Math.max(240, Math.min(1920, Number.isFinite(h) ? h : 1280)),
  };
}

/**
 * URLからファイルを一時保存する
 */
async function downloadToFile(url: string, filePath: string) {
  const r = await fetch(url, { cache: "no-store" as RequestCache });

  if (!r.ok) {
    throw new Error(`failed to fetch media: ${r.status}`);
  }

  const buf = Buffer.from(await r.arrayBuffer());

  if (!buf.length) {
    throw new Error("downloaded media is empty");
  }

  await fs.writeFile(filePath, buf);
}

/**
 * ffmpeg を実行する
 */
async function runFfmpeg(args: string[]) {
  const cmd = resolveFfmpegPath();

  await new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });

    let err = "";

    p.stderr.on("data", (d) => {
      err += String(d);
    });

    p.on("error", (e) => {
      reject(new Error(`ffmpeg spawn error: ${e?.message || e}`));
    });

    p.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`ffmpeg failed (code=${code}) ${err.slice(-2200)}`));
    });
  });
}

export async function POST(req: Request) {
  const tmpFiles: string[] = [];

  try {
    /**
     * Firebase IDトークン認証
     */
    const user = await requireUserFromAuthHeader(req);

    const body = (await req.json().catch(() => ({} as any))) as any;

    const draftId = String(body?.draftId || "").trim();
    const videoUrl = String(body?.videoUrl || "").trim();
    const backgroundImageUrl = String(body?.backgroundImageUrl || "").trim();
    const quality = String(body?.quality || "standard") === "high" ? "high" : "standard";

    if (!draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    }

    if (!videoUrl) {
      return NextResponse.json({ error: "videoUrl is required" }, { status: 400 });
    }

    if (!backgroundImageUrl) {
      return NextResponse.json({ error: "backgroundImageUrl is required" }, { status: 400 });
    }

    const { w, h } = parseSize(body?.size);

    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const inputVideoPath = path.join(tmpdir(), `aoi_source_${id}.mp4`);
    const inputBgPath = path.join(tmpdir(), `aoi_bg_${id}.png`);
    const outputPath = path.join(tmpdir(), `aoi_composite_${id}.mp4`);

    tmpFiles.push(inputVideoPath, inputBgPath, outputPath);

    /**
     * 元動画と背景画像を一時保存
     */
    await Promise.all([
      downloadToFile(videoUrl, inputVideoPath),
      downloadToFile(backgroundImageUrl, inputBgPath),
    ]);

    const crf = quality === "high" ? "22" : "27";

    /**
     * クロマキー合成
     *
     * 重要:
     * - 撮影動画は「緑背景」で撮る前提
     * - colorkey で緑を透明化
     * - 透明化した商品動画を背景画像の上に重ねる
     *
     * colorkey の意味:
     * - 0x00ff00 = 緑
     * - 0.32 = どれくらい緑に近い色を消すか
     * - 0.12 = 境界をどれくらいなじませるか
     *
     * 数値を強くすると商品まで消えやすい
     * 数値を弱くすると緑が残りやすい
     */
    const filter = [
      `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},format=rgba[bg]`,
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,format=rgba,colorkey=0x00ff00:0.32:0.12[fg]`,
      `[bg][fg]overlay=0:0:format=auto,format=yuv420p[outv]`,
    ].join(";");

    await runFfmpeg([
      "-y",
      "-i",
      inputVideoPath,
      "-loop",
      "1",
      "-i",
      inputBgPath,
      "-filter_complex",
      filter,
      "-map",
      "[outv]",
      "-t",
      "10",
      "-r",
      "24",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      crf,
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    const outBuf = await fs.readFile(outputPath);

    if (!outBuf.length) {
      return NextResponse.json({ error: "composite video output is empty" }, { status: 500 });
    }

    const bucket = getAdminBucket();
    const bucketName = String(bucket?.name || "").trim();

    if (!bucketName) {
      return NextResponse.json({ error: "storage bucket name is empty" }, { status: 500 });
    }

    const token = crypto.randomUUID();
    const mp4Path = `users/${user.uid}/drafts/${draftId}/nonai/${Date.now()}_chromakey_composite.mp4`;

    await bucket.file(mp4Path).save(outBuf, {
      contentType: "video/mp4",
      resumable: false,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
          source: "source-video-chromakey-background-composite",
        },
        cacheControl: "public,max-age=31536000",
      },
    });

    const mp4Url = storageDownloadUrl(bucketName, mp4Path, token);

    return NextResponse.json({
      ok: true,
      mp4Url,
      url: mp4Url,
      videoUrl: mp4Url,
      mp4Path,
      mode: "chromakey",
      keyColor: "green",
    });
  } catch (e: any) {
    console.error("[composite-video-background] error:", e);

    return NextResponse.json(
      { error: e?.message || "composite-video-background failed" },
      { status: 500 }
    );
  } finally {
    await Promise.all(tmpFiles.map((f) => fs.unlink(f).catch(() => {})));
  }
}