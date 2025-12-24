import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  brand: "vento" | "riva";
  vision: string;
  keywords?: string[];
  tone?: string;
};

function pickStyle(brand: "vento" | "riva") {
  if (brand === "riva") {
    return "moody, cinematic, classic car / mechanical texture, minimal, premium, calm, no text";
  }
  return "quiet, airy, vintage object mood, minimal, premium, calm, no text";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const brand = body.brand;
    const vision = (body.vision || "").trim();
    const keywords = Array.isArray(body.keywords) ? body.keywords : [];
    const tone = (body.tone || "").trim();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 500 });
    }
    if (!vision) {
      return NextResponse.json({ error: "vision required" }, { status: 400 });
    }

    const style = pickStyle(brand);
    const kw = keywords.length ? keywords.join(", ") : "";
    const prompt = `
Create a square (1:1) background image for an Instagram post.
Brand: ${brand.toUpperCase()}
Mood/style: ${style}
Vision: ${vision}
Keywords: ${kw}
Tone: ${tone || "calm, honest, concise"}
Rules: no text, no logos, no watermark, high quality, centered composition, usable as posting background.
`.trim();

    const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    });

    const j = await r.json();
    if (!r.ok) {
      return NextResponse.json({ error: "openai error", detail: j }, { status: 500 });
    }

    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) return NextResponse.json({ error: "no image" }, { status: 500 });

    return NextResponse.json({ b64 });
  } catch (e: any) {
    return NextResponse.json({ error: "server error", detail: String(e?.message || e) }, { status: 500 });
  }
}