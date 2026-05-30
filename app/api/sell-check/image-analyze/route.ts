//app/api/sell-check/image-analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminAuth } from "@/app/api/_firebase/admin";

export const runtime = "nodejs";

type ImageAnalyzeResult = {
  brightnessScore: number;
  compositionScore: number;
  backgroundScore: number;
  damageRiskScore: number;
  overallImageScore: number;
  imageReasons: string[];
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeScore(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];

  return v
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeResult(v: any): ImageAnalyzeResult {
  const brightnessScore = safeScore(v?.brightnessScore, 50);
  const compositionScore = safeScore(v?.compositionScore, 50);
  const backgroundScore = safeScore(v?.backgroundScore, 50);
  const damageRiskScore = safeScore(v?.damageRiskScore, 50);

  const overallRaw =
    v?.overallImageScore ??
    Math.round(
      brightnessScore * 0.28 +
        compositionScore * 0.28 +
        backgroundScore * 0.22 +
        (100 - damageRiskScore) * 0.22
    );

  return {
    brightnessScore,
    compositionScore,
    backgroundScore,
    damageRiskScore,
    overallImageScore: safeScore(overallRaw, 50),
    imageReasons: safeStringArray(v?.imageReasons),
  };
}

function averageResults(results: ImageAnalyzeResult[]): ImageAnalyzeResult {
  if (results.length === 0) {
    return {
      brightnessScore: 50,
      compositionScore: 50,
      backgroundScore: 50,
      damageRiskScore: 50,
      overallImageScore: 50,
      imageReasons: [],
    };
  }

  const avg = (key: keyof Omit<ImageAnalyzeResult, "imageReasons">) =>
    Math.round(results.reduce((sum, item) => sum + item[key], 0) / results.length);

  return {
    brightnessScore: avg("brightnessScore"),
    compositionScore: avg("compositionScore"),
    backgroundScore: avg("backgroundScore"),
    damageRiskScore: avg("damageRiskScore"),
    overallImageScore: avg("overallImageScore"),
    imageReasons: results.flatMap((x) => x.imageReasons).slice(0, 12),
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

async function fileToDataUrl(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mime = file.type || "image/png";

  return `data:${mime};base64,${base64}`;
}

async function resolveImageInputs(req: NextRequest): Promise<string[]> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();

    const files = [
      ...form.getAll("images"),
      ...form.getAll("image"),
    ].filter((x): x is File => x instanceof File);

    const urls: string[] = [];

    for (const file of files.slice(0, 8)) {
      urls.push(await fileToDataUrl(file));
    }

    return urls;
  }

  const body = await req.json().catch(() => ({}));

  if (Array.isArray(body.imageUrls)) {
    return body.imageUrls.map(safeString).filter(Boolean).slice(0, 8);
  }

  const single = safeString(body.imageUrl);

  return single ? [single] : [];
}

async function analyzeOneImage(client: OpenAI, imageUrl: string) {
  const prompt = `
あなたは中古販売・フリマ商品画像の評価担当です。
画像を見て、売れる診断に使うための画像特徴を数値化してください。

必ずJSONだけを返してください。
説明文は不要です。

返す形式：
{
  "brightnessScore": 0,
  "compositionScore": 0,
  "backgroundScore": 0,
  "damageRiskScore": 0,
  "overallImageScore": 0,
  "imageReasons": ["短い理由"]
}

採点基準：
- brightnessScore：明るく、商品細部が見やすいほど高い。
- compositionScore：商品全体が見え、中央に近く、余白が適切なら高い。
- backgroundScore：背景が清潔で商品を邪魔しないほど高い。
- damageRiskScore：傷、汚れ、破損、使用感、色褪せが目立つほど高い。
- overallImageScore：売れやすい商品画像としての総合点。

注意：
- 実際に売れる保証はしない。
- 画像から分からないことは断定しない。
- 傷や汚れが不明な場合は、damageRiskScoreを中間寄りにする。
`.trim();

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "あなたは中古販売の商品画像をJSONで数値評価する補助エンジンです。必ず有効なJSONだけを返します。",
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content || "";
  const jsonText = extractJsonText(content);
  const parsed = JSON.parse(jsonText);

  return normalizeResult(parsed);
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

    const imageUrls = await resolveImageInputs(req);

    if (imageUrls.length === 0) {
      return NextResponse.json(
        { ok: false, error: "画像URLまたは画像ファイルが空です" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY が設定されていません" },
        { status: 500 }
      );
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const results: ImageAnalyzeResult[] = [];

    for (const imageUrl of imageUrls) {
      results.push(await analyzeOneImage(client, imageUrl));
    }

    return NextResponse.json({
      ok: true,
      result: averageResults(results),
      results,
      analyzedCount: results.length,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { ok: false, error: "画像解析に失敗しました" },
      { status: 500 }
    );
  }
}