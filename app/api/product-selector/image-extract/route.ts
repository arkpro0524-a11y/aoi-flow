// /app/api/product-selector/image-extract/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import type { ProductSelectorInput } from "@/lib/productSelector/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImageExtractResult = {
  observationTheme: string;
  sourceText: string;
  visualNotes: string;
  candidateHint: string;
  category: string;
  keywords: string[];
  memo: string;
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];

  return v
    .map((item) => safeString(item))
    .filter((item) => item.length > 0)
    .slice(0, 18);
}

function normalizeInput(raw: unknown): ProductSelectorInput {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    name: safeString(obj.name),
    sourceTypes: safeString(obj.sourceTypes),
    sourceText: safeString(obj.sourceText),
    visualNotes: safeString(obj.visualNotes),
    candidateHint: safeString(obj.candidateHint),
    budget: Math.max(0, Number(obj.budget || 0)),
    category: safeString(obj.category),
    keywords: safeString(obj.keywords),
    memo: safeString(obj.memo),
  };
}

function normalizeResult(raw: unknown): ImageExtractResult {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    observationTheme: safeString(obj.observationTheme),
    sourceText: safeString(obj.sourceText),
    visualNotes: safeString(obj.visualNotes),
    candidateHint: safeString(obj.candidateHint),
    category: safeString(obj.category),
    keywords: safeStringArray(obj.keywords),
    memo: safeString(obj.memo),
  };
}

function extractJsonText(text: string): string {
  const cleaned = safeString(text);
  const fenced = cleaned.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) return cleaned.slice(first, last + 1);

  return cleaned || "{}";
}

function isSafeImageDataUrl(value: string): boolean {
  if (!value.startsWith("data:image/")) return false;
  if (!value.includes(";base64,")) return false;

  // 約10MBの画像をbase64化すると文字数が増えるため、少し余裕を持たせます。
  return value.length <= 16_000_000;
}

export async function POST(req: Request) {
  try {
    await requireUserFromAuthHeader(req);

    const body = (await req.json()) as {
      imageDataUrl?: unknown;
      imageFileName?: unknown;
      input?: unknown;
    };

    const imageDataUrl = safeString(body.imageDataUrl);
    const imageFileName = safeString(body.imageFileName);
    const input = normalizeInput(body.input);

    if (!isSafeImageDataUrl(imageDataUrl)) {
      return NextResponse.json(
        { ok: false, error: "画像データを確認できませんでした。10MB以下の画像を選び直してください。" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY が未設定のため、スクショ画像解析を実行できません。" },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `
PRODUCT SELECTORの入力欄へ反映するため、スクショ画像から観測情報を抽出してください。
必ずJSONだけを返してください。

返すキー：
{
  "observationTheme": "短い観測テーマ",
  "sourceText": "画像内の文字・投稿内容・商品名らしき情報の要約",
  "visualNotes": "色味、素材、古さ、構図、世界観、売れそうな空気感",
  "candidateHint": "候補ジャンルまたは商品候補",
  "category": "electronics / fashion / interior / hobby / kids / other のどれか",
  "keywords": ["検索に使う短い語句"],
  "memo": "注意点。断定できないことは断定しない"
}

既存入力：${JSON.stringify(input)}
画像ファイル名：${imageFileName}
`.trim();

    const completion = await client.chat.completions.create({
      model: process.env.PRODUCT_SELECTOR_VISION_MODEL || "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "あなたは中古販売・文化文脈観測用の画像解析補助AIです。価格断定や購入煽りをせず、観測情報だけをJSONで返します。",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
                detail: "low",
              },
            },
          ],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const result = normalizeResult(JSON.parse(extractJsonText(content)));

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[PRODUCT_SELECTOR_IMAGE_EXTRACT_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "PRODUCT SELECTOR のスクショ画像解析に失敗しました。",
      },
      { status: 500 }
    );
  }
}
