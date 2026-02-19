// /app/api/burn-video/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/app/api/_firebase/admin";
import admin from "firebase-admin";
import ffmpegPath from "ffmpeg-static";
import fs from "fs/promises";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpeg = require("fluent-ffmpeg");

ffmpeg.setFfmpegPath(ffmpegPath as string);

// ✅ 計画E: TextOverlay / TextOverlayBySlot に合わせた最小型（API内で完結）
type TextOverlay = {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  x: number; // 0-100（%）
  y: number; // 0-100（%）
  color: string; // "#fff" など
  background?: {
    enabled: boolean;
    padding: number;
    color: string; // "rgba(0,0,0,0.45)" など
    radius: number; // ※ffmpeg drawtext では使わない（将来用）
  };
};

type TextOverlayBySlot = {
  base?: TextOverlay;
  mood?: TextOverlay;
  composite?: TextOverlay;
};

// ✅ ffmpeg 用：文字エスケープ（最低限）
// - ' は \' に
// - : は \: に（フィルタ区切り対策）
// - \ は \\ に
function escText(s: string) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

// ✅ (0-100) → ffmpeg の式 (w*h) に変換
function pctX(p: number) {
  const v = Number.isFinite(p) ? p : 50;
  return `(w*${v}/100)`;
}
function pctY(p: number) {
  const v = Number.isFinite(p) ? p : 80;
  return `(h*${v}/100)`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      videoUrl?: string;
      draftId?: string;
      overlay?: TextOverlayBySlot;
      // size は今は受け取ってもよいが、ffmpeg側で必須ではない（動画の実寸で焼く）
      size?: string;
    };

    const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl : "";
    const draftId = typeof body.draftId === "string" ? body.draftId : "";
    const overlayBySlot = body.overlay as TextOverlayBySlot | undefined;

    if (!videoUrl) {
      return NextResponse.json({ error: "videoUrl is required" }, { status: 400 });
    }
    if (!draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    }

    // ✅ 計画E：焼き込み対象は composite のみ
    const overlay = overlayBySlot?.composite;
    const text = Array.isArray(overlay?.lines) ? overlay!.lines.map((x) => String(x ?? "")).filter((x) => x.trim()) : [];

    if (!overlay || !text.length) {
      return NextResponse.json(
        { error: "overlay.composite.lines is required" },
        { status: 400 }
      );
    }

    // ✅ フォントは環境変数で固定（端末依存禁止）
    // 例: BURN_FONT_PATH="/var/task/fonts/NotoSansJP-Regular.otf"
    const FONT_PATH = process.env.BURN_FONT_PATH;
    if (!FONT_PATH) {
      return NextResponse.json(
        { error: "BURN_FONT_PATH env is missing (fontfile path required)" },
        { status: 500 }
      );
    }

    const tmpIn = `/tmp/input-${Date.now()}.mp4`;
    const tmpOut = `/tmp/burned-${Date.now()}.mp4`;

    // 1) 動画を取得して /tmp に保存
    const res = await fetch(videoUrl);
    if (!res.ok) {
      return NextResponse.json(
        { error: `failed to fetch videoUrl (status ${res.status})` },
        { status: 400 }
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(tmpIn, buf);

    // 2) drawtext を lines 分生成（%→式で換算）
    const fontSize = Number.isFinite(overlay.fontSize) ? overlay.fontSize : 44;
    const lineHeight = Number.isFinite(overlay.lineHeight) ? overlay.lineHeight : 1.15;
    const color = typeof overlay.color === "string" ? overlay.color : "#FFFFFF";
    const x = Number.isFinite(overlay.x) ? overlay.x : 50;
    const y = Number.isFinite(overlay.y) ? overlay.y : 80;

    const bgEnabled = !!overlay.background?.enabled;
    const bgColor = typeof overlay.background?.color === "string" ? overlay.background!.color : "rgba(0,0,0,0.45)";
    const bgPad = Number.isFinite(overlay.background?.padding) ? overlay.background!.padding : 18;

    const drawFilters = text.map((line, i) => {
      const yExpr = `(${pctY(y)} + ${i}*${fontSize}*${lineHeight})`;
      return [
        "drawtext=",
        `fontfile=${FONT_PATH}:`,
        `text='${escText(line)}':`,
        `fontsize=${fontSize}:`,
        `fontcolor=${color}:`,
        `x=${pctX(x)}:`,
        `y=${yExpr}:`,
        `box=${bgEnabled ? 1 : 0}:`,
        `boxcolor=${bgColor}:`,
        `boxborderw=${bgPad}`,
      ].join("");
    });

    // 3) ffmpeg 実行（元動画は上書きしない）
    await new Promise<void>((ok, ng) => {
      ffmpeg(tmpIn)
        .videoFilters(drawFilters)
        .outputOptions([
          // 互換性寄り（必要なら調整可）
          "-c:v libx264",
          "-preset veryfast",
          "-crf 23",
          "-c:a copy",
          "-movflags +faststart",
        ])
        .output(tmpOut)
        .on("end", () => ok())
        .on("error", (e: Error) => ng(e))
        .run();
    });

    // 4) Storage に保存
    const burned = await fs.readFile(tmpOut);

    getAdminApp();
    const bucket = admin.storage().bucket();
    const file = bucket.file(`burned/${draftId}/${Date.now()}.mp4`);
    await file.save(burned, { contentType: "video/mp4" });

    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: "2100-01-01",
    });

    // 5) Firestore 更新（計画E）
    const db = getAdminDb();
    await db.collection("drafts").doc(draftId).update({
      videoBurnedUrl: signedUrl,
      videoBurnedAt: new Date(),
      videoTextOverlay: {
        composite: overlay,
      },
    });

    // 後片付け（失敗しても致命ではない）
    void fs.unlink(tmpIn).catch(() => {});
    void fs.unlink(tmpOut).catch(() => {});

    return NextResponse.json({ videoBurnedUrl: signedUrl });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "burn-video failed" },
      { status: 500 }
    );
  }
}