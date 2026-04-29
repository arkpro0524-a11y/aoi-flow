// app/api/sell-check/extract/route.ts
// 売れる診断：商品ページ本文 → 学習データ抽出API
//
// 目的：
// - メルカリ等の商品ページ本文を貼り付ける
// - OpenAIで学習データ形式に変換する
// - ここでは保存しない
// - 保存は既存の /api/sell-check/import が担当する
//
// 重要：
// - 管理者だけが実行できる
// - ユーザー一般には見せない管理者用AI補助
// - null / undefined を返さないように整形する
// - 商品名 / ブランド / 型番 / 素材 / 状態リスク / キーワードも抽出する

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminAuth } from "@/app/api/_firebase/admin";

export const runtime = "nodejs";

type ExtractRow = {
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

function normalizeRow(v: any): ExtractRow {
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
  };
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

export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);

    if (!uid) {
      return NextResponse.json(
        {
          ok: false,
          error: "ログイン確認が必要です",
        },
        { status: 401 }
      );
    }

    if (!isAdminUid(uid)) {
      return NextResponse.json(
        {
          ok: false,
          error: "管理者のみ実行できます",
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const text = safeString(body.text);

    if (!text) {
      return NextResponse.json(
        {
          ok: false,
          error: "商品ページ本文が空です",
        },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error: "OPENAI_API_KEY が設定されていません",
        },
        { status: 500 }
      );
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `
あなたは中古販売データの整理担当です。
以下の商品ページ本文から、売れる診断の学習データを抽出してください。

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
      "memo": "判断根拠やブランド名など短いメモ",

      "brandName": "ブランド名。なければ空文字",
      "modelName": "型番・モデル名。なければ空文字",
      "material": "素材。なければ空文字",
      "extractedKeywords": ["検索・類似判定に使えるキーワード"],
      "conditionRiskScore": "状態リスクを0〜100で数字だけ。高いほどリスク大",
      "descriptionQualityScore": "説明文の情報量を0〜100で数字だけ。高いほど説明が十分"
    }
  ]
}

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

状態リスク判断：
- 新品・未使用に近い → 0〜20
- 目立つ傷汚れなし → 20〜40
- 使用感あり → 40〜70
- 破損、欠品、ジャンク、動作未確認 → 70〜100

説明文品質判断：
- ブランド、型番、サイズ、状態、付属品、注意点が明確 → 80〜100
- 一通り説明あり → 60〜79
- 情報が少ない → 30〜59
- かなり不足 → 0〜29

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
            "あなたは中古販売データをJSON化する補助エンジンです。必ず有効なJSONだけを返します。",
        },
        {
          role: "user",
          content: prompt,
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
        {
          ok: false,
          error: "AI抽出結果のJSON解析に失敗しました",
        },
        { status: 500 }
      );
    }

    const rows = Array.isArray(parsed.rows)
      ? parsed.rows.map(normalizeRow).filter((row: ExtractRow) => {
          return Boolean(row.title || row.price || row.soldPrice);
        })
      : [];

    return NextResponse.json({
      ok: true,
      rows,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: "商品ページ本文のデータ化に失敗しました",
      },
      { status: 500 }
    );
  }
}