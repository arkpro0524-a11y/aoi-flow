// /app/api/finalize-nonai-mp4/route.ts
// ✅ 非AI広告動画 WEBM → MP4 変換ルート
// - Cloud Render: SaaS利用者向け。Cloud Run側のFFmpegで変換する。
// - Local Render: 開発者向け。ローカルPCのFFmpegで変換する。
// - 一般ユーザーの端末性能には依存させない。SaaS本番は Cloud Render を使う。

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import { spawn, spawnSync } from "child_process";
import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminBucket } from "@/firebaseAdmin";
import ffmpegStaticPath from "ffmpeg-static";

type RenderMode = "auto" | "cloud" | "local";

function storageDownloadUrl(bucketName: string, filePath: string, token: string) {
  const encoded = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

function normalizeRenderMode(input: unknown): RenderMode {
  const s = String(input ?? "auto").trim().toLowerCase();
  if (s === "cloud") return "cloud";
  if (s === "local") return "local";
  return "auto";
}

function isLocalRenderAllowed() {
  // 本番SaaSでは、明示的に許可しない限りローカルFFmpegは使わない。
  // 開発中は npm run dev で検証できるように許可する。
  return process.env.AOI_FLOW_ALLOW_LOCAL_RENDER === "true" || process.env.NODE_ENV !== "production";
}

function isExecutableFile(p: string) {
  try {
    if (!p) return false;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandExists(command: string) {
  try {
    const result = spawnSync(command, ["-version"], { stdio: "ignore" });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

function resolveFfmpegCommand() {
  // 重要：ffmpeg-static は Mac で EACCES / system error -88 が出ることがある。
  // そのため Homebrew / system ffmpeg を優先し、ffmpeg-static は実行可能な時だけ使う。
  const candidates = [
    String(process.env.FFMPEG_PATH || "").trim(),
    "/opt/homebrew/bin/ffmpeg", // Apple Silicon Mac Homebrew
    "/usr/local/bin/ffmpeg",    // Intel Mac Homebrew
    "/usr/bin/ffmpeg",          // Linux系
    typeof ffmpegStaticPath === "string" ? ffmpegStaticPath : "",
  ].filter(Boolean);

  for (const cmd of candidates) {
    if (cmd === "ffmpeg") {
      if (commandExists("ffmpeg")) return "ffmpeg";
      continue;
    }

    if (isExecutableFile(cmd)) return cmd;
  }

  if (commandExists("ffmpeg")) return "ffmpeg";

  return "";
}

async function runFfmpeg(inputPath: string, outputPath: string) {
  const cmd = resolveFfmpegCommand();

  if (!cmd) {
    throw new Error(
      "Local Render用のffmpegが見つかりません。Mac開発環境では `brew install ffmpeg` 後に再実行してください。本番SaaSではCloud Renderを使ってください。"
    );
  }

  const args = [
    "-y",
    "-i",
    inputPath,
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
    "-an",
    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });

    let err = "";
    p.stderr.on("data", (d) => (err += String(d)));

    p.on("error", (e: any) => {
      reject(new Error(`ffmpeg spawn error: ${e?.message || e} / cmd=${cmd}`));
    });

    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (code=${code}) / cmd=${cmd} / ${err.slice(0, 1600)}`));
    });
  });
}

async function finalizeWithCloudRun(input: {
  cloudUrl: string;
  idToken: string;
  uid: string;
  draftId: string;
  webmPath: string;
  bucketName: string;
}) {
  const res = await fetch(input.cloudUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.idToken}`,
    },
    body: JSON.stringify({
      uid: input.uid,
      draftId: input.draftId,
      webmPath: input.webmPath,
      bucketName: input.bucketName,
      outputFolder: "nonai",
      audio: false,
    }),
  });

  const json: any = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      String(json?.error || json?.message || `Cloud Render failed (${res.status})`).slice(0, 1200)
    );
  }

  const mp4Url = String(json?.mp4Url || json?.url || json?.videoUrl || "").trim();
  const mp4Path = String(json?.mp4Path || json?.path || "").trim();

  if (!mp4Url) {
    throw new Error("Cloud Renderは完了しましたが mp4Url が返っていません");
  }

  return { mp4Url, mp4Path };
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const user = await requireUserFromAuthHeader(req);

    const body = (await req.json().catch(() => ({} as any))) as any;
    const draftId = String(body?.draftId ?? "").trim();
    const webmPath = String(body?.webmPath ?? "").trim();
    const requestedMode = normalizeRenderMode(body?.renderMode);

    if (!draftId) return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    if (!webmPath) return NextResponse.json({ error: "webmPath is required" }, { status: 400 });

    if (!webmPath.startsWith(`users/${user.uid}/drafts/${draftId}/nonai/`)) {
      return NextResponse.json({ error: "forbidden (path mismatch)" }, { status: 403 });
    }

    const bucket = getAdminBucket();
    const bucketName = String(bucket?.name || "").trim();
    if (!bucketName) {
      return NextResponse.json({ error: "storage bucket name is empty" }, { status: 500 });
    }

    const cloudUrl = String(process.env.CLOUD_RUN_VIDEO_RENDER_URL || "").trim();
    const localAllowed = isLocalRenderAllowed();

    const effectiveMode: RenderMode =
      requestedMode === "cloud" ? "cloud" :
      requestedMode === "local" ? "local" :
      cloudUrl ? "cloud" : "local";

    if (effectiveMode === "cloud") {
      if (!cloudUrl) {
        return NextResponse.json(
          {
            error:
              "Cloud Render URL が未設定です。CLOUD_RUN_VIDEO_RENDER_URL を .env.local / 本番環境変数に設定してください。開発者だけLocal Renderを使う場合は動画生成設定でLocal Renderを選んでください。",
            renderMode: "cloud",
          },
          { status: 500 }
        );
      }

      const result = await finalizeWithCloudRun({
        cloudUrl,
        idToken: authHeader.replace(/^Bearer\s+/i, ""),
        uid: user.uid,
        draftId,
        webmPath,
        bucketName,
      });

      return NextResponse.json(
        {
          ok: true,
          renderMode: "cloud",
          draftId,
          webmPath,
          mp4Url: result.mp4Url,
          mp4Path: result.mp4Path,
          url: result.mp4Url,
          videoUrl: result.mp4Url,
        },
        { status: 200 }
      );
    }

    if (!localAllowed) {
      return NextResponse.json(
        {
          error:
            "Local Render は開発者専用です。本番SaaSではCloud Renderを使用してください。",
          renderMode: "local",
        },
        { status: 403 }
      );
    }

    const inTmp = `/tmp/nonai_in_${Date.now()}_${Math.random().toString(16).slice(2)}.webm`;
    const outTmp = `/tmp/nonai_out_${Date.now()}_${Math.random().toString(16).slice(2)}.mp4`;

    await bucket.file(webmPath).download({ destination: inTmp });
    await runFfmpeg(inTmp, outTmp);

    const token = crypto.randomUUID();
    const ts = Date.now();
    const mp4Path = `users/${user.uid}/drafts/${draftId}/nonai/${ts}.mp4`;
    const mp4File = bucket.file(mp4Path);

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

    try { fs.unlinkSync(inTmp); } catch {}
    try { fs.unlinkSync(outTmp); } catch {}

    const mp4Url = storageDownloadUrl(bucketName, mp4Path, token);

    return NextResponse.json(
      {
        ok: true,
        renderMode: "local",
        ffmpeg: resolveFfmpegCommand(),
        draftId,
        webmPath,
        mp4Url,
        mp4Path,
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
