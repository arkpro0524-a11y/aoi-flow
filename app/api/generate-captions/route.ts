// /app/api/generate-captions/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  brand: "vento" | "riva";
  vision: string;
  keywords?: string[];
  tone?: string;
};

function pickBrandVoice(brand: "vento" | "riva") {
  if (brand === "riva") {
    return "RIVA: クラシック/旧車・機械美・手触り・誠実。売り込み臭は避け、静かに格好良く。";
  }
  return "VENTO: ビンテージ/一点物・文脈・手仕事・静けさ。押し売りしない。";
}

// ✅ Responses API の output からテキストを安全に抽出
function extractOutputText(j: any): string {
  if (typeof j?.output_text === "string" && j.output_text.trim()) return j.output_text.trim();

  let out = "";
  const output = Array.isArray(j?.output) ? j.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") out += c.text;
    }
  }
  return (out || "").trim();
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

    const voice = pickBrandVoice(brand);
    const kw = keywords.length ? `Keywords: ${keywords.join(", ")}` : "Keywords: (none)";
    const toneLine = tone ? `Tone(任意): ${tone}` : "Tone(任意): 指定なし（静か・誠実・端的で固定）";

    const prompt = `
あなたはSNS投稿の「完成キャプション」を作る装置です。会話しません。

【条件】
- ブランド: ${brand.toUpperCase()}
- ボイス: ${voice}
- Vision: ${vision}
- ${kw}
- ${toneLine}

【目的】
- IG: 納得→投稿できる本文（長すぎない、誠実、文脈）
- X: 注意→興味（短く、広告臭を避ける）

【禁止】
- 解説、前置き、理論名、箇条書きの説明
`.trim();

    const model = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        input: prompt,
        temperature: 0.7,

        // ✅ ここが安定化の要：必ずこのJSONで返せ
        text: {
          format: {
            type: "json_schema",
            name: "captions",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["instagram", "x", "ig3"],
              properties: {
                instagram: { type: "string" },
                x: { type: "string" },
                ig3: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 3,
                  maxItems: 3,
                },
              },
            },
          },
        },
      }),
    });

    const j = await r.json();
    if (!r.ok) {
      return NextResponse.json({ error: "openai error", detail: j }, { status: 500 });
    }

    const text = extractOutputText(j);
    if (!text) {
      // ✅ 調査しやすいように raw に全体も返す
      return NextResponse.json({ error: "empty output", raw: j }, { status: 500 });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}$/);
      if (!m) return NextResponse.json({ error: "bad format", raw: text }, { status: 500 });
      parsed = JSON.parse(m[0]);
    }

    if (!parsed?.instagram || !parsed?.x || !Array.isArray(parsed?.ig3)) {
      return NextResponse.json({ error: "bad format", raw: text }, { status: 500 });
    }

    return NextResponse.json({
      instagram: String(parsed.instagram),
      x: String(parsed.x),
      ig3: parsed.ig3.map(String).slice(0, 3),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}