// app/api/images/composite/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";

async function fetchBuffer(url: string) {
  const r = await fetch(url, { cache: "no-store" as any });
  if (!r.ok) throw new Error(`image fetch failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  try {
    // ✅ 認証必須
    await requireUserFromAuthHeader(req);

    const body = await req.json().catch(() => ({} as any));
    const foregroundUrl = String(body?.foregroundUrl || "").trim();
    const backgroundUrl = String(body?.backgroundUrl || "").trim();

    // light: "left" | "center" | "right" など想定（なければ center）
    const light = String(body?.light || "center").trim();

    // productWidthRatio: 0.42〜0.52（指定が無ければ0.48）
    const ratioRaw = Number(body?.productWidthRatio);
    const productWidthRatio =
      Number.isFinite(ratioRaw) ? Math.min(0.52, Math.max(0.42, ratioRaw)) : 0.48;

    if (!foregroundUrl || !backgroundUrl) return bad("missing images");

    const fgBuf = await fetchBuffer(foregroundUrl);
    const bgBuf = await fetchBuffer(backgroundUrl);

    const baseSize = 1080;

    // ① 背景を正方形へ（不透明でOK）
    const bg = await sharp(bgBuf)
      .resize(baseSize, baseSize, { fit: "cover" })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    // ② 前景：余白カット + alpha付与（四角を消す本丸）
    let fgFixed = await sharp(fgBuf, { failOn: "none" })
      .ensureAlpha()
      .trim({ threshold: 10 })
      .png()
      .toBuffer();

    // ③ 前景リサイズ（横幅比率を 0.42〜0.52 に合わせる）
    const meta = await sharp(fgFixed).metadata();
    const fgW0 = meta.width || 800;
    const fgH0 = meta.height || 800;

    const targetW = Math.floor(baseSize * productWidthRatio);
    const scale = Math.min(targetW / fgW0, 1); // でかい時だけ縮小
    const fgW = Math.max(1, Math.round(fgW0 * scale));
    const fgH = Math.max(1, Math.round(fgH0 * scale));

    const resizedFg = await sharp(fgFixed).resize(fgW, fgH, { fit: "fill" }).png().toBuffer();

    // ④ 配置（下寄せ）
    const left = Math.round((baseSize - fgW) / 2);
    const marginBottom = 120;
    const top = Math.max(0, Math.round(baseSize - fgH - marginBottom));

    // ⑤ 接地影（楕円っぽく：弱め 18〜28% 目安 → 初期0.22）
    const shadowAlpha = 0.22;
    const shadowH = Math.max(60, Math.round(fgH * 0.12));
    const shadow = await sharp({
      create: {
        width: fgW,
        height: shadowH,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: shadowAlpha },
      },
    })
      .blur(38)
      .png()
      .toBuffer();

    // ⑥ 合成
    const outPng = await sharp(bg)
      .composite([
        { input: shadow, top: top + fgH - Math.round(shadowH * 0.65), left, blend: "multiply" },
        { input: resizedFg, top, left, blend: "over" },
      ])
      .modulate({
        brightness: light === "center" ? 1.02 : 1.0,
        saturation: 1.03,
      })
      .sharpen(0.6)
      .png()
      .toBuffer();

    const dataUrl = `data:image/png;base64,${outPng.toString("base64")}`;
    return NextResponse.json({ ok: true, dataUrl }, { status: 200 });
  } catch (e: any) {
    console.error("[images/composite]", e);
    return NextResponse.json({ ok: false, error: e?.message || "compose failed" }, { status: 500 });
  }
}