//app/api/sell-check/extract-rich/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminAuth } from "@/app/api/_firebase/admin";

export const runtime = "nodejs";

type ExtractRichRow = {
  title: string;
  price: string;
  soldPrice: string;
  category: string;
  condition: string;
  sold: boolean;
  views: string;
  likes: string;
  memo: string;

  brandName: string;
  modelName: string;
  material: string;
  extractedKeywords: string[];

  conditionRiskScore: string;
  descriptionQualityScore: string;

  brightnessScore: string;
  compositionScore: string;
  backgroundScore: string;
  damageRiskScore: string;
  overallImageScore: string;
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeNumberString(v: unknown): string {
  return String(v ?? "").replace(/[^\d]/g, "");
}

function safeScoreString(v: unknown): string {
  const raw = safeNumberString(v);
  const n = Number(raw);

  if (!Number.isFinite(n)) return "";

  return String(Math.max(0, Math.min(100, Math.round(n))));
}

function safeBoolean(v: unknown): boolean {
  return v === true || v === "true" || v === "sold" || v === "売却済み";
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];

  return v
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeCategory(v: unknown): string {
  const s = safeString(v);

  if (s === "interior") return "interior";
  if (s === "fashion") return "fashion";
  if (s === "hobby") return "hobby";
  if (s === "kids") return "kids";
  if (s === "electronics") return "electronics";
  if (s === "other") return "other";

  return "other";
}

function normalizeCondition(v: unknown): string {
  const s = safeString(v);

  if (s === "excellent") return "excellent";
  if (s === "good") return "good";
  if (s === "fair") return "fair";
  if (s === "poor") return "poor";

  return "good";
}

function normalizeRow(v: any): ExtractRichRow {
  const price = safeNumberString(v?.price);
  const soldPrice = safeNumberString(v?.soldPrice) || price;

  return {
    title: safeString(v?.title),
    price,
    soldPrice,
    category: normalizeCategory(v?.category),
    condition: normalizeCondition(v?.condition),
    sold: safeBoolean(v?.sold),
    views: safeNumberString(v?.views),
    likes: safeNumberString(v?.likes),
    memo: safeString(v?.memo),

    brandName: safeString(v?.brandName),
    modelName: safeString(v?.modelName),
    material: safeString(v?.material),
    extractedKeywords: safeStringArray(v?.extractedKeywords),

    conditionRiskScore: safeScoreString(v?.conditionRiskScore),
    descriptionQualityScore: safeScoreString(v?.descriptionQualityScore),

    brightnessScore: safeScoreString(v?.brightnessScore),
    compositionScore: safeScoreString(v?.compositionScore),
    backgroundScore: safeScoreString(v?.backgroundScore),
    damageRiskScore: safeScoreString(v?.damageRiskScore),
    overallImageScore: safeScoreString(v?.overallImageScore),
  };
}

function extractJsonText(text: string): string {
  const s = safeString(text);

  if (!s) return "";

  const fenced = s.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");

  if (first >= 0 && last > first) {
    return s.slice(first, last + 1).trim();
  }

  return s;
}

function isAdminUid(uid: string | null): boolean {
  const raw = process.env.ADMIN_UIDS || process.env.NEXT_PUBLIC_ADMIN_UIDS || "";

  const ids = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (!uid) return false;
  return ids.includes(uid);
}

async function getUidFromRequest(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid || null;
  } catch {
    return null;
  }
}

async function fileToImagePart(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mime = file.type || "image/png";

  return {
    type: "image_url" as const,
    image_url: {
      url: `data:${mime};base64,${base64}`,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);

    if (!uid) {
      return NextResponse.json(
        { ok: false, error: "ログイン確認が必要です" },
        { status: 401 }
      );
    }

    if (!isAdminUid(uid)) {
      return NextResponse.json(
        { ok: false, error: "管理者のみ実行できます" },
        { status: 403 }
      );
    }

    const form = await req.formData();
    const text = safeString(form.get("text"));

    const files = [
      ...form.getAll("images"),
      ...form.getAll("image"),
    ].filter((x): x is File => x instanceof File);

    if (!text) {
      return NextResponse.json(
        { ok: false, error: "商品ページ本文が空です" },
        { status: 400 }
      );
    }

    if (files.length === 0) {
      return NextResponse.json(
        { ok: false, error: "商品画像が必要です" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY が設定されていません" },
        { status: 500 }
      );
    }

    const imageParts = [];

    for (const file of files.slice(0, 8)) {
      imageParts.push(await fileToImagePart(file));
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `
あなたは中古販売・フリマ商品の学習データ作成担当です。
商品ページ本文と複数の商品画像を同時に見て、売れる診断の学習データを1行に整理してください。

必ずJSONだけを返してください。
説明文は不要です。

返す形式：
{
  "rows": [
    {
      "title": "商品名",
      "price": "出品価格の数字だけ",
      "soldPrice": "売却価格の数字だけ。なければpriceと同じ",
      "category": "interior | fashion | hobby | kids | electronics | other",
      "condition": "excellent | good | fair | poor",
      "sold": true,
      "views": "閲覧数の数字だけ。なければ空文字",
      "likes": "いいね数の数字だけ。なければ空文字",
      "memo": "本文と画像を見た判断根拠。矛盾・注意点も短く入れる",

      "brandName": "ブランド名。なければ空文字",
      "modelName": "型番・モデル名。なければ空文字",
      "material": "素材。なければ空文字",
      "extractedKeywords": ["検索・類似判定に使えるキーワード"],

      "conditionRiskScore": "本文と画像を合わせた状態リスク 0〜100。高いほどリスク大",
      "descriptionQualityScore": "説明文品質 0〜100。高いほど説明が十分",

      "brightnessScore": "複数画像全体の明るさ 0〜100",
      "compositionScore": "複数画像全体の構図 0〜100",
      "backgroundScore": "複数画像全体の背景の良さ 0〜100",
      "damageRiskScore": "画像上の傷・汚れ・破損リスク 0〜100。高いほどリスク大",
      "overallImageScore": "商品画像としての総合点 0〜100"
    }
  ]
}

重要：
- 複数画像は同じ商品の別角度として扱う
- 傷・汚れ・欠品が1枚でも見える場合はmemoに書く
- 本文と画像の状態説明がズレる場合、conditionRiskScoreを上げる
- 分からないことは断定しない
- 実際に売れる保証はしない

カテゴリ判断：
- バッグ、服、靴、アクセサリー → fashion
- 家具、雑貨、インテリア小物 → interior
- フィギュア、カード、玩具、コレクション → hobby
- 子ども服、育児用品 → kids
- 家電、ガジェット、電子機器 → electronics
- 判断できない → other

状態判断：
- 新品、未使用、新品同様 → excellent
- 目立った傷汚れなし、良好 → good
- やや傷汚れあり、使用感あり → fair
- 全体的に状態が悪い、ジャンク、破損あり → poor

本文：
${text}
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "あなたは中古販売データを本文と複数画像からJSON化する補助エンジンです。必ず有効なJSONだけを返します。",
        },
        {
          role: "user",
          content: [{ type: "text", text: prompt }, ...imageParts],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || "";
    const jsonText = extractJsonText(content);

    let parsed: any = {};

    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json(
        { ok: false, error: "統合解析結果のJSON解析に失敗しました" },
        { status: 500 }
      );
    }

    const rows = Array.isArray(parsed.rows)
      ? parsed.rows.map(normalizeRow).filter((row: ExtractRichRow) => {
          return Boolean(row.title || row.price || row.soldPrice);
        })
      : [];

    return NextResponse.json({
      ok: true,
      rows,
      analyzedImageCount: imageParts.length,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { ok: false, error: "本文＋画像の統合解析に失敗しました" },
      { status: 500 }
    );
  }
}