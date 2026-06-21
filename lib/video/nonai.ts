// /lib/video/nonai.ts
// =========================
// ✅ 非AI動画（サーバ側 / ffmpeg-static）
// - 入力：画像URL1枚 + motion + 秒数 + サイズ
// - 出力：WEBM(Buffer)
// =========================

import "server-only";

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static"; // ★追加（唯一の本質変更）

type Motion = {
  tempo: "slow" | "normal" | "sharp";
  reveal: "early" | "delayed" | "last";
  intensity: "calm" | "balanced" | "strong";
  attitude: "humble" | "neutral" | "assertive";
  rhythm: "with_pause" | "continuous";
};

export type GenerateNonAiVideoWebmArgs = {
  imageUrl: string;
  motion: Motion;
  seconds: 5 | 10;
  size: string;
  textLines?: string[];
};

function parseSize(size: string): { w: number; h: number } {
  const m = /^(\d+)\s*x\s*(\d+)$/i.exec(String(size || ""));
  if (!m) return { w: 1024, h: 1792 };
  return {
    w: Math.max(64, Math.min(4096, Number(m[1]))),
    h: Math.max(64, Math.min(4096, Number(m[2]))),
  };
}

function pickOverlayAlpha(i: Motion["intensity"]) {
  if (i === "calm") return 0.06;
  if (i === "balanced") return 0.1;
  return 0.16;
}

function pickZoomRate(t: Motion["tempo"]) {
  if (t === "slow") return 0.0012;
  if (t === "normal") return 0.002;
  return 0.003;
}

function pickRevealStart(r: Motion["reveal"], sec: number) {
  return sec * (r === "early" ? 0 : r === "delayed" ? 0.25 : 0.6);
}

function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function findFont(): string | null {
  const list = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansJP-Regular.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ];
  return list.find(existsSync) ?? null;
}

async function downloadToTemp(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`failed to fetch image: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const file = path.join(os.tmpdir(), `aoi_${Date.now()}.png`);
  await fs.writeFile(file, buf);
  return file;
}

function runFfmpegToBuffer(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // ✅ ここだけ：ffmpeg の実在パスを決める（/ROOT事故を吸収）
    const candidates: string[] = [];

    // 1) env 優先（将来Vercel等でも逃げ道になる）
    if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);

    // 2) ffmpeg-static（importしてるならそれ）
    try {
      // 既に import ffmpegPath from "ffmpeg-static" がある前提でもOK
      // （無い場合でも落ちないようにガード）
      // @ts-ignore
      if (typeof ffmpegPath === "string" && ffmpegPath) candidates.push(ffmpegPath);
    } catch {}

    // 3) ✅ もっとも効く：実プロジェクトの node_modules を直接参照（Macで確実）
    candidates.push(path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"));

    // 4) 最後の手段：PATHの ffmpeg
    candidates.push("ffmpeg");

    const cmd = candidates.find((p) => p === "ffmpeg" || existsSync(p));
    if (!cmd) return reject(new Error("ffmpeg binary not found"));

    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });

    const out: Buffer[] = [];
    const err: Buffer[] = [];

    p.stdout.on("data", (d) => out.push(Buffer.from(d)));
    p.stderr.on("data", (d) => err.push(Buffer.from(d)));

    p.on("error", (e) => reject(e));
    p.on("close", (code) => {
      if (code === 0) return resolve(Buffer.concat(out));
      const msg = Buffer.concat(err).toString("utf8").slice(-4000);
      reject(new Error(`ffmpeg failed (code=${code}): ${msg}`));
    });
  });
}

export async function generateNonAiVideoWebm(
  input: GenerateNonAiVideoWebmArgs
): Promise<Buffer> {
  const { w, h } = parseSize(input.size);
  const seconds = input.seconds === 10 ? 10 : 5;
  const fps = 30;

  const img = await downloadToTemp(input.imageUrl);

  try {
    const overlayAlpha = pickOverlayAlpha(input.motion.intensity);
    const zoomRate = pickZoomRate(input.motion.tempo);
    const revealStart = pickRevealStart(input.motion.reveal, seconds);
    const font = findFont();

    const drawtexts =
      input.textLines?.slice(0, 3).map((t, i) => {
        const txt = escapeText(t);
        return `drawtext=text='${txt}'${
          font ? `:fontfile='${font}'` : ""
        }:fontsize=48:fontcolor=white:x=40:y=${h - 120 + i * 52}:alpha='if(lt(t,${revealStart}),0,1)'`;
      }) ?? [];

    const filter = [
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},zoompan=z='1+${zoomRate}*on':d=1:s=${w}x${h}:fps=${fps}[v]`,
      `color=c=black@${overlayAlpha}:s=${w}x${h}:d=${seconds}[shade]`,
      `[v][shade]overlay${drawtexts.length ? "," + drawtexts.join(",") : ""}`,
    ].join(";");

    const args = [
      "-loop",
      "1",
      "-i",
      img,
      "-t",
      String(seconds),
      "-filter_complex",
      filter,
      "-an",
      "-c:v",
      "libvpx-vp9",
      "-crf",
      "34",
      "-pix_fmt",
      "yuv420p",
      "-f",
      "webm",
      "pipe:1",
    ];

const buf = await runFfmpegToBuffer(args);
    if (!buf.length) throw new Error("empty video buffer");
    return buf;
  } finally {
    await fs.unlink(img).catch(() => {});
  }
}