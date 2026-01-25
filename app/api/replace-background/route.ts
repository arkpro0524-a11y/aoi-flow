/**
 * app/api/replace-background/route.ts
 * ─────────────────────────────────────────────
 * 【最終完成版 / Bルート前提（改）】
 *
 * ✅ 返却に「b64」「suggestedFileName」「sha256」を追加
 *   → UIが Storage に保存する時の “ファイル名が確定できる”
 * ✅ dataUrl は従来通り返す（互換維持）
 */

import { NextResponse } from "next/server";
import sharp from "sharp";
import crypto from "crypto";
import { PRICING } from "@/lib/server/pricing";
import { getIdempotencyKey } from "@/lib/server/idempotency";

/* =========================================================
   Next.js runtime
========================================================= */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================================================
   型（このAPI内で完結）
========================================================= */
export type ReplaceBackgroundParams = {
  foregroundImage: string; // 透過PNG（URL or dataURL）
  backgroundImage: string; // 背景画像（URL or dataURL）
  ratio: string; // "1280:720" / "720:1280" / "1080:1080"
  fit: "contain" | "cover";
};

/* =========================================================
   ENV（Mock切替）
========================================================= */
const USE_MOCK = process.env.USE_REPLACE_BG_MOCK === "false";

/* =========================================================
   Utils
========================================================= */

function parseRatioToSize(ratio: string): { w: number; h: number } {
  const s = String(ratio || "").trim();
  const m = s.match(/^(\d{2,5})\s*:\s*(\d{2,5})$/);
  if (!m) return { w: 1280, h: 720 };

  const w = Number(m[1]);
  const h = Number(m[2]);

  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, n));

  return {
    w: clamp(Number.isFinite(w) ? w : 1280, 256, 2048),
    h: clamp(Number.isFinite(h) ? h : 720, 256, 2048),
  };
}

function isDataUrl(s: string) {
  return /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(String(s || ""));
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const idx = dataUrl.indexOf("base64,");
  if (idx < 0) throw new Error("Invalid data URL");
  return Buffer.from(dataUrl.slice(idx + 7), "base64");
}

async function fetchUrlToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" as any });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function readImage(input: string): Promise<Buffer> {
  if (!input) throw new Error("empty image input");
  if (isDataUrl(input)) return dataUrlToBuffer(input);
  return await fetchUrlToBuffer(input);
}

function pickYenEstimate(): number | null {
  try {
    const pub = PRICING.public?.();
    const n = pub?.openai?.estimateYen?.background;
    const yen = Number(n);
    return Number.isFinite(yen) && yen > 0 ? yen : null;
  } catch {
    return null;
  }
}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex"); // 64桁
}

/* =========================================================
   Mock（UI確認用）
   ※「0byte保存」を誘発しないよう、最低限のダミーPNGを返す
========================================================= */
function tiny1x1PngBase64(): string {
  // 1x1 PNG（透明）のbase64
  // これなら dataUrl / b64 としてアップロードしても 0byte にはならない
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axm6o8AAAAASUVORK5CYII=";
}

function mockReplaceBackground(params: ReplaceBackgroundParams) {
  const b64 = tiny1x1PngBase64();
  const dataUrl = `data:image/png;base64,${b64}`;
  const full = sha256Hex(Buffer.from(b64, "base64"));
  const short = full.slice(0, 16);

  return {
    ok: true,
    mock: true,

    // 互換
    dataUrl,

    // 追加（保存用）
    b64,
    sha256: full, // ✅ フル64桁
    sha256Short: short, // ✅ ファイル名用
    suggestedFileName: `composite_${short}.png`,

    foregroundUrl: params.foregroundImage,
    backgroundUrl: params.backgroundImage,
    ratio: params.ratio,
    fit: params.fit,
    yen: pickYenEstimate(),
  };
}

/* =========================================================
   Real compose（sharp）
========================================================= */
async function composeWithSharp(params: ReplaceBackgroundParams) {
  const { w, h } = parseRatioToSize(params.ratio);

  const fgBuf = await readImage(params.foregroundImage);
  const bgBuf = await readImage(params.backgroundImage);

  // 背景：常に全面 cover（PNG化して安定）
  const bg = await sharp(bgBuf).resize(w, h, { fit: "cover" }).png().toBuffer();

  // 前景：contain / cover を選択（透過維持）
  const fgFit = params.fit === "cover" ? "cover" : "contain";
  const fg = await sharp(fgBuf)
    .resize(w, h, {
      fit: fgFit,
      position: "center",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const outBuf = await sharp(bg)
    .composite([{ input: fg, top: 0, left: 0 }])
    .png()
    .toBuffer();

  const b64 = outBuf.toString("base64");
  const full = sha256Hex(outBuf); // 64桁
  const short = full.slice(0, 16);

  return {
    w,
    h,
    b64,
    sha256: full,
    sha256Short: short,
    suggestedFileName: `composite_${short}.png`,
    dataUrl: `data:image/png;base64,${b64}`,
  };
}

/* =========================================================
   POST Handler
========================================================= */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const params: ReplaceBackgroundParams = {
      foregroundImage: String(body?.foregroundImage || ""),
      backgroundImage: String(body?.backgroundImage || ""),
      ratio: String(body?.ratio || "1280:720"),
      fit: body?.fit === "cover" ? "cover" : "contain",
    };

    if (!params.foregroundImage || !params.backgroundImage) {
      return NextResponse.json(
        { ok: false, error: "foregroundImage / backgroundImage is required" },
        { status: 400 }
      );
    }

    const idemKey = getIdempotencyKey(req, params);

    // Mock
    if (USE_MOCK) {
      return NextResponse.json({
        ...mockReplaceBackground(params),
        idemKey,
      });
    }

    // Real compose
    const out = await composeWithSharp(params);

    return NextResponse.json({
      ok: true,
      mock: false,
      ratio: params.ratio,
      fit: params.fit,
      size: { w: out.w, h: out.h },

      // ✅ 互換維持：UIは dataUrl で従来通り upload できる
      dataUrl: out.dataUrl,

      // ✅ 追加：UI側が “確定名” で Storage に保存できる
      b64: out.b64,
      sha256: out.sha256, // ✅ フル
      sha256Short: out.sha256Short, // ✅ ファイル名用
      suggestedFileName: out.suggestedFileName,

      yen: pickYenEstimate(),
      idemKey,
    });
  } catch (err: any) {
    console.error("[replace-background]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "replace background failed" },
      { status: 500 }
    );
  }
}