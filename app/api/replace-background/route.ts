/**
 * app/api/replace-background/route.ts
 * ─────────────────────────────────────────────
 * 役割：
 * - 「商品（前景）＋ 背景画像」を合成して最終画像を生成
 * - mock → 実API を ENV で切替
 *
 * 切替：
 * - USE_REPLACE_BG_MOCK=true  → mock JSON
 * - USE_REPLACE_BG_MOCK=false → sharp で実合成
 *
 * 注意：
 * - lib/server/runway.ts は「動画生成専用」なので、ここから import しない
 */

import { NextResponse } from "next/server";
import { PRICING } from "@/lib/server/pricing";
import { getIdempotencyKey } from "@/lib/server/idempotency";
import sharp from "sharp";

/* =========================================================
   Next.js runtime（sharpはnode runtime必須）
========================================================= */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================================================
   型（このAPI内だけで完結 / UIは触らない）
========================================================= */
export type ReplaceBackgroundParams = {
  foregroundImage: string;
  backgroundImage: string;
  ratio: string; // "1280:720" 等
  fit: "contain" | "cover";
};

/* =========================================================
   ENV 切替
========================================================= */
const USE_MOCK = process.env.USE_REPLACE_BG_MOCK === "true";

/* =========================================================
   Utils
========================================================= */

function parseRatioToSize(ratio: string): { w: number; h: number } {
  // ratio は "1280:720" のように "W:H" を想定
  const s = String(ratio || "").trim();
  const m = s.match(/^(\d{2,5})\s*:\s*(\d{2,5})$/);
  if (!m) return { w: 1280, h: 720 };

  const w = Number(m[1]);
  const h = Number(m[2]);

  // 安全策：極端な値は丸める（サーバ負荷防止）
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const ww = clamp(Number.isFinite(w) ? w : 1280, 256, 2048);
  const hh = clamp(Number.isFinite(h) ? h : 720, 256, 2048);

  return { w: ww, h: hh };
}

function isDataUrl(s: string) {
  return /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(String(s || ""));
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const idx = dataUrl.indexOf("base64,");
  if (idx < 0) throw new Error("Invalid data URL");
  const b64 = dataUrl.slice(idx + "base64,".length);
  return Buffer.from(b64, "base64");
}

async function fetchUrlToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { method: "GET", cache: "no-store" as any });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function readImageInputToBuffer(input: string): Promise<Buffer> {
  const s = String(input || "").trim();
  if (!s) throw new Error("Empty image input");
  if (isDataUrl(s)) return dataUrlToBuffer(s);
  // URL想定
  return await fetchUrlToBuffer(s);
}

function pickYenEstimateForReplaceBackground(): number | null {
  // あなたの pricing.ts の public() に openai.estimateYen.background がある前提
  // なければ null（UI側は出せるなら出す、出せないなら無視できる）
  try {
    const pub = PRICING.public?.();
    const n = pub?.openai?.estimateYen?.background;
    const yen = Number(n);
    return Number.isFinite(yen) && yen > 0 ? yen : null;
  } catch {
    return null;
  }
}

/* =========================================================
   Mock 実装（UI接続確認用）
========================================================= */
function mockReplaceBackground(params: ReplaceBackgroundParams) {
  const yen = pickYenEstimateForReplaceBackground();

  return {
    ok: true,
    mock: true,
    // mock はURL返しのままでも良いが、UI側が dataUrl を期待するならここも dataUrl に合わせられる
    imageUrl: "https://example.com/mock-composited.png",
    foregroundUrl: params.foregroundImage,
    backgroundUrl: params.backgroundImage,
    ratio: params.ratio,
    fit: params.fit,
    yen,
  };
}

/* =========================================================
   Real 合成（sharp）
========================================================= */

async function composeWithSharp(params: ReplaceBackgroundParams) {
  const { w, h } = parseRatioToSize(params.ratio);

  const fgBuf = await readImageInputToBuffer(params.foregroundImage);
  const bgBuf = await readImageInputToBuffer(params.backgroundImage);

  // 背景は常に canvas 全面（cover）
  const bg = await sharp(bgBuf)
    .resize(w, h, { fit: "cover" })
    .png()
    .toBuffer();

  // 前景は contain / cover を選択
  // - contain: 全体が入る（上下左右に余白が出ることがある）
  // - cover: 余白が出ない（はみ出しは切れる）
  const fgFit = params.fit === "cover" ? "cover" : "contain";

  // 前景のリサイズ結果をpng化
  const fg = await sharp(fgBuf)
    .resize(w, h, { fit: fgFit, position: "center" })
    .png()
    .toBuffer();

  // 背景に前景を重ねる
  const out = await sharp(bg)
    .composite([{ input: fg, top: 0, left: 0 }])
    .png()
    .toBuffer();

  const b64 = out.toString("base64");
  const dataUrl = `data:image/png;base64,${b64}`;

  return { w, h, dataUrl };
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
        { ok: false, error: "foregroundImage と backgroundImage は必須です" },
        { status: 400 }
      );
    }

    const idemKey = getIdempotencyKey(req, params);

    // STEP4-A：Mock
    if (USE_MOCK) {
      return NextResponse.json({
        ...mockReplaceBackground(params),
        idemKey,
      });
    }

    // STEP4-B：実合成
    const out = await composeWithSharp(params);
    const yen = pickYenEstimateForReplaceBackground();

    return NextResponse.json({
      ok: true,
      mock: false,
      ratio: params.ratio,
      fit: params.fit,
      size: { w: out.w, h: out.h },
      dataUrl: out.dataUrl, // ✅ UI側でそのまま Storage 保存できる
      yen, // 目安（出せるなら）
      idemKey,
    });
  } catch (err: any) {
    console.error("[replace-background]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "背景合成に失敗しました" },
      { status: 500 }
    );
  }
}