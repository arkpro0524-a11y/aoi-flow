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
      imageDataUrls?: unknown;
      imageFileName?: unknown;
      imageFileNames?: unknown;
      input?: unknown;
    };

    // 既存の単一画像呼び出しを壊さず、複数スクショにも対応します。
    const imageDataUrls = Array.isArray(body.imageDataUrls)
      ? body.imageDataUrls.map((item) => safeString(item)).filter(Boolean).slice(0, 6)
      : [safeString(body.imageDataUrl)].filter(Boolean);

    const imageFileNames = Array.isArray(body.imageFileNames)
      ? body.imageFileNames.map((item) => safeString(item)).filter(Boolean).slice(0, 6)
      : [safeString(body.imageFileName)].filter(Boolean);

    const imageFileName = imageFileNames.join(", ");
    const input = normalizeInput(body.input);

    if (imageDataUrls.length === 0 || imageDataUrls.some((url) => !isSafeImageDataUrl(url))) {
      return NextResponse.json(
        { ok: false, error: "画像データを確認できませんでした。各10MB以下の画像を選び直してください。" },
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
PRODUCT SELECTORの入力欄へ反映するため、1枚または複数のスクショ画像から観測情報を統合抽出してください。
必ずJSONだけを返してください。

返すキー：
{
  "observationTheme": "短い観測テーマ",
  "sourceText": "画像内の文字・投稿内容・商品名らしき情報の要約",
  "visualNotes": "色味、素材、古さ、構図、世界観、売れそうな空気感",
  "candidateHint": "画像内に見える商品群を大分類1つに潰さず、文具/シール/メモ帳/キャラ雑貨/ぬいぐるみ/家電/アパレル/スニーカー等に分解した候補",
  "category": "electronics / fashion / interior / hobby / kids / other のどれか",
  "keywords": ["検索に使う短い語句"],
  "memo": "注意点。断定できないことは断定しない"
}

既存入力：${JSON.stringify(input)}
画像ファイル名：${imageFileName}
画像枚数：${imageDataUrls.length}

重要：
- 複数スクショは同じ観測テーマの別サンプルとして統合し、共通して見える売れ筋特徴と例外を分けてください。
- スクショに複数の商品群がある場合、必ず複数の候補名を candidateHint / keywords / memo に残してください。
- 「レトロ」や「アパレル」だけでまとめず、平成レトロ文具、メモ帳、シール、キャラクター雑貨、ぬいぐるみ、卓上家電、高額スニーカーなど具体的に分解してください。
- 画像から読み取れない価格上昇や人気拡大は断定しないでください。
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
            ...imageDataUrls.map((url) => ({
              type: "image_url" as const,
              image_url: {
                url,
                detail: "low" as const,
              },
            })),
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
