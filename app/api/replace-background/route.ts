/**
 * app/api/replace-background/route.ts
 * ─────────────────────────────────────────────
 * 【STEP4 安定化版 / 完全置換（trim + 商品補正）】
 *
 * ✔ 背景：cover + 微ブラー（境界安定）
 * ✔ 前景：透明余白 trim → contain で適正サイズ化 → 中央配置（商品消失対策の本丸）
 * ✔ 前景：売れるための“軽い商品補正”を追加（過補正なし/崩壊なし）
 *    - gamma / modulate / sharpen を最小構成で適用
 * ✔ 自然な影生成（接地感）
 * ✔ sha256 / suggestedFileName 維持
 * ✔ dataUrl 互換維持
 */

import { NextResponse } from "next/server";
import sharp from "sharp";
import crypto from "crypto";
import { PRICING } from "@/lib/server/pricing";
import { getIdempotencyKey } from "@/lib/server/idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ReplaceBackgroundParams = {
  foregroundImage: string;
  backgroundImage: string;
  ratio: string;
  fit: "contain" | "cover";
};

const USE_MOCK = process.env.USE_REPLACE_BG_MOCK === "true";

/* =========================
   Utils
========================= */

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
  const r = await fetch(url, { cache: "no-store" as any });
  if (!r.ok) throw new Error(`image fetch failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function readImage(input: string): Promise<Buffer> {
  if (!input) throw new Error("empty image input");
  if (isDataUrl(input)) return dataUrlToBuffer(input);
  return await fetchUrlToBuffer(input);
}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function pickYenEstimate(): number | null {
  try {
    const n = PRICING.public?.()?.openai?.estimateYen?.background;
    const yen = Number(n);
    return Number.isFinite(yen) && yen > 0 ? yen : null;
  } catch {
    return null;
  }
}

/* =========================
   Mock
========================= */

function mockImage(): string {
  // 1x1 PNG（透明）
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axm6o8AAAAASUVORK5CYII=";
}

/* =========================
   商品補正（前景のみ）
   - 崩壊しない“最小”補正
   - 形は変えない（幾何は触らない）
========================= */
async function enhanceProductLooks(fgBuf: Buffer): Promise<Buffer> {
  // ✅ 過補正を防ぐために「弱め固定」
  // - gamma: ほんの少し持ち上げ
  // - modulate: 明るさ/彩度を軽く
  // - sharpen: ほんの少し
  // - clamp（最終は png）
  return await sharp(fgBuf)
    .png()
    .gamma(1.06)
    .modulate({
      brightness: 1.03,
      saturation: 1.04,
    })
    .sharpen(0.4, 0.4, 0.3)
    .png()
    .toBuffer();
}

/* =========================
   Real compose（安定版：trim + 商品補正）
========================= */

async function composeWithSharp(params: ReplaceBackgroundParams) {
  const { w, h } = parseRatioToSize(params.ratio);

  const fgBufRaw = await readImage(params.foregroundImage);
  const bgBuf = await readImage(params.backgroundImage);

  // 背景：全面cover + 微ブラー
  const bg = await sharp(bgBuf)
    .resize(w, h, { fit: "cover" })
    .blur(1)
    .png()
    .toBuffer();

  // ✅ 前景：まず商品補正（透明含むPNGのまま）
  const fgBufEnhanced = await enhanceProductLooks(fgBufRaw);

  // ✅ 前景：透明余白を trim → contain で適正サイズ化（商品消失の根本対策）
  const targetW = Math.floor(w * 0.82);
  const targetH = Math.floor(h * 0.82);

  let fgTrimmed: Buffer;
  try {
    // threshold は 8〜12 が安定（低すぎるとゴミ拾い、高すぎると欠ける）
    fgTrimmed = await sharp(fgBufEnhanced).png().trim({ threshold: 10 }).toBuffer();
  } catch {
    fgTrimmed = await sharp(fgBufEnhanced).png().toBuffer();
  }

  const fg = await sharp(fgTrimmed)
    .resize(targetW, targetH, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  // ✅ 中央配置（left/top を計算）
  const left = Math.floor((w - targetW) / 2);
  const top = Math.floor((h - targetH) / 2);

  // 影生成（fg と同位置）
  const shadow = await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: fg, left, top }])
    .blur(12)
    .modulate({ brightness: 0.6 })
    .png()
    .toBuffer();

  const outBuf = await sharp(bg)
    .composite([
      { input: shadow, blend: "multiply" },
      { input: fg, left, top },
    ])
    .png()
    .toBuffer();

  const b64 = outBuf.toString("base64");
  const full = sha256Hex(outBuf);
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

/* =========================
   POST
========================= */

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

    if (USE_MOCK) {
      const b64 = mockImage();
      const full = sha256Hex(Buffer.from(b64, "base64"));
      return NextResponse.json({
        ok: true,
        mock: true,
        dataUrl: `data:image/png;base64,${b64}`,
        b64,
        sha256: full,
        sha256Short: full.slice(0, 16),
        suggestedFileName: `composite_${full.slice(0, 16)}.png`,
        idemKey,
      });
    }

    const out = await composeWithSharp(params);

    return NextResponse.json({
      ok: true,
      mock: false,
      ratio: params.ratio,
      fit: params.fit,
      size: { w: out.w, h: out.h },
      dataUrl: out.dataUrl,
      b64: out.b64,
      sha256: out.sha256,
      sha256Short: out.sha256Short,
      suggestedFileName: out.suggestedFileName,
      yen: pickYenEstimate(),
      idemKey,
    });
  } catch (e: any) {
    console.error("[replace-background]", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "replace background failed" },
      { status: 500 }
    );
  }
}