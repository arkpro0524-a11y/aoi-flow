// app/api/burn-text-video/route.ts
import { NextResponse } from "next/server";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import fs from "fs/promises";
import { existsSync } from "node:fs";
import path from "path";
import { tmpdir } from "os";
import { saveVideoToStorage } from "@/lib/storage/saveVideo";

export const runtime = "nodejs";

/**
 * ✅ ffmpeg 実体パスを堅牢に決定
 * - 1) env: FFMPEG_PATH
 * - 2) ffmpeg-static
 * - 3) PATH の "ffmpeg"（最後の手段）
 */
function resolveFfmpegPath(): string {
  const candidates: Array<string | null | undefined> = [
    process.env.FFMPEG_PATH,
    ffmpegStatic as unknown as string,
    "ffmpeg",
  ];

  for (const p of candidates) {
    if (!p) continue;
    if (p === "ffmpeg") return p;
    if (existsSync(p)) return p;
  }
  // ここまで来たら詰み
  throw new Error("ffmpeg binary not found (set FFMPEG_PATH or install ffmpeg-static)");
}

/**
 * ✅ font 探索（環境差を吸収）
 * - 見つかったら path を返す
 * - 見つからなければ null（fontfile指定なしで動かす）
 */
function resolveFontFile(): string | null {
  const list = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansJP-Regular.otf",
    "/usr/share/fonts/truetype/noto/NotoSansJP-Regular.ttf",
    "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc", // mac
    "/Library/Fonts/Arial Unicode.ttf", // mac fallback
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ];
  return list.find(existsSync) ?? null;
}

/**
 * ✅ drawtext 用に最低限エスケープ
 * - ':' や '\' や "'" が事故りやすい
 */
function escapeDrawText(s: string) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

export async function POST(req: Request) {
  let inputPath = "";
  let outputPath = "";

  try {
    const body = await req.json().catch(() => ({} as any));
    const videoUrl = String(body?.videoUrl ?? "").trim();
    const textRaw = String(body?.text ?? "");
    const fontSize = Number(body?.fontSize ?? 48);
    const y = Number(body?.y ?? 70);

    if (!videoUrl || !textRaw.trim()) {
      return NextResponse.json({ error: "invalid input" }, { status: 400 });
    }

    // ✅ ffmpeg パス確定（ここで死ぬなら設定不足）
    const ffmpegPath = resolveFfmpegPath();
    ffmpeg.setFfmpegPath(ffmpegPath);

    inputPath = path.join(tmpdir(), `aoi_in_${Date.now()}_${Math.random().toString(16).slice(2)}.mp4`);
    outputPath = path.join(tmpdir(), `aoi_out_${Date.now()}_${Math.random().toString(16).slice(2)}.mp4`);

    // ✅ 入力動画を取得（失敗を握り潰さない）
    const res = await fetch(videoUrl);
    if (!res.ok) {
      return NextResponse.json(
        { error: "failed to fetch videoUrl", status: res.status },
        { status: 502 }
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) {
      return NextResponse.json({ error: "empty video buffer" }, { status: 502 });
    }
    await fs.writeFile(inputPath, buf);

    // ✅ drawtext 設定
    const fontfile = resolveFontFile();
    const safeText = escapeDrawText(textRaw);

    const yClamped = Math.max(0, Math.min(100, y));
    const sizeClamped = Number.isFinite(fontSize) ? Math.max(10, Math.min(200, fontSize)) : 48;

    const drawtextOptions: any = {
      text: safeText,
      fontsize: sizeClamped,
      fontcolor: "white",
      x: "(w-text_w)/2",
      y: `(h*${yClamped / 100})`,
      box: 1,
      boxcolor: "black@0.45",
      boxborderw: 12,
    };

    // ✅ fontfile が見つかった時だけ指定（無い環境でも落とさない）
    if (fontfile) drawtextOptions.fontfile = fontfile;

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters([{ filter: "drawtext", options: drawtextOptions }])
        // ✅ mp4 として確実に出す（互換のため）
        .outputOptions([
          "-movflags +faststart",
          "-pix_fmt yuv420p",
          "-c:v libx264",
          "-crf 22",
          "-preset veryfast",
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (e) => reject(e))
        .run();
    });

    const burnedBuffer = await fs.readFile(outputPath);
    if (!burnedBuffer.length) {
      return NextResponse.json({ error: "burned video is empty" }, { status: 500 });
    }

    const burnedUrl = await saveVideoToStorage(burnedBuffer, {
      contentType: "video/mp4",
    });

    return NextResponse.json({ videoBurnedUrl: burnedUrl });
  } catch (e: any) {
    console.error("[/api/burn-text-video] failed:", e);
    return NextResponse.json(
      { error: "failed", message: String(e?.message ?? e ?? "unknown") },
      { status: 500 }
    );
  } finally {
    // ✅ tmp を必ず掃除
    if (inputPath) await fs.unlink(inputPath).catch(() => {});
    if (outputPath) await fs.unlink(outputPath).catch(() => {});
  }
}