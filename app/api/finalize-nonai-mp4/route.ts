// /app/api/finalize-nonai-mp4/route.ts
// ✅ 4️⃣ 非AI webm → mp4 変換（唯一ルート）
// - input: draftId, webmPath（upload-video-webm の返却 path）
// - output: mp4Url
// - drafts は「このAPIでは更新しない」：更新は UIの saveNonAiVideoToDraft に統一（唯一の脳）

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminBucket } from "@/firebaseAdmin";
import { spawn } from "child_process";
import ffmpegStaticPath from "ffmpeg-static";

function storageDownloadUrl(bucketName: string, filePath: string, token: string) {
  const encoded = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

// ✅ ffmpeg 実行（ffmpeg-static を優先）
// - 環境に ffmpeg が無くても動く設計に固定
// - ✅ 事故防止：出力を軽量固定（24fps / veryfast / crf28 / 音無し）
async function runFfmpeg(inputPath: string, outputPath: string) {
  const cmd =
    (process.env.FFMPEG_PATH && String(process.env.FFMPEG_PATH).trim()) ||
    (typeof ffmpegStaticPath === "string" && ffmpegStaticPath ? ffmpegStaticPath : "") ||
    "ffmpeg";

  if (!cmd) throw new Error("ffmpeg path is empty (ffmpeg-static not resolved)");

  const args = [
    "-y",
    "-i",
    inputPath,

    // ✅ 軽量寄せ（落ちにくくする）
    // - 変換で死ぬのは「入力が重い」「変換が重い」が主因なので、ここで固定して保険をかける
    "-vf",
    "scale=iw:ih:force_original_aspect_ratio=decrease",
    "-r",
    "24",

    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",

    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",

    // ✅ 音無し前提：aac絡みの事故も消す + 軽量化
    "-an",

    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });

    let err = "";
    p.stderr.on("data", (d) => (err += String(d)));

    p.on("error", (e) => reject(new Error(`ffmpeg spawn error: ${e?.message || e}`)));

    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (code=${code}) ${err.slice(0, 1600)}`));
    });
  });
}

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);

    const body = (await req.json().catch(() => ({} as any))) as any;
    const draftId = String(body?.draftId ?? "").trim();
    const webmPath = String(body?.webmPath ?? "").trim();

    if (!draftId) return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    if (!webmPath) return NextResponse.json({ error: "webmPath is required" }, { status: 400 });

    // ✅ 所有者整合（最低限）：パスが user.uid 配下であること
    // 例: users/{uid}/drafts/{draftId}/nonai/{ts}.webm
    if (!webmPath.startsWith(`users/${user.uid}/drafts/${draftId}/nonai/`)) {
      return NextResponse.json({ error: "forbidden (path mismatch)" }, { status: 403 });
    }

    const bucket = getAdminBucket();
    const bucketName = String(bucket?.name || "").trim();
    if (!bucketName) {
      return NextResponse.json({ error: "storage bucket name is empty" }, { status: 500 });
    }

    // ✅ webm を /tmp に落とす（nodejs runtime）
    const inTmp = `/tmp/nonai_in_${Date.now()}_${Math.random().toString(16).slice(2)}.webm`;
    const outTmp = `/tmp/nonai_out_${Date.now()}_${Math.random().toString(16).slice(2)}.mp4`;

    // Storage → /tmp
    await bucket.file(webmPath).download({ destination: inTmp });

    // ffmpeg 実行（ffmpeg-static）
    await runFfmpeg(inTmp, outTmp);

    // mp4 を Storage へ保存
    const token = crypto.randomUUID();
    const ts = Date.now();
    const mp4Path = `users/${user.uid}/drafts/${draftId}/nonai/${ts}.mp4`;

    const mp4File = bucket.file(mp4Path);

    const fs = await import("fs");
    const buf = fs.readFileSync(outTmp);
    if (!buf.length) {
      return NextResponse.json({ error: "mp4 output is empty" }, { status: 500 });
    }

    await mp4File.save(buf, {
      contentType: "video/mp4",
      resumable: false,
      metadata: {
        metadata: { firebaseStorageDownloadTokens: token },
        cacheControl: "public,max-age=31536000",
      },
    });

    const mp4Url = storageDownloadUrl(bucketName, mp4Path, token);

    return NextResponse.json(
      {
        ok: true,
        draftId,
        webmPath,
        mp4Url,
        mp4Path,
        // 互換
        url: mp4Url,
        videoUrl: mp4Url,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "finalize-nonai-mp4 failed" },
      { status: 500 }
    );
  }
}