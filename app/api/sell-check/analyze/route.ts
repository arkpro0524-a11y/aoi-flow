// /app/api/sell-check/analyze/route.ts

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminDb } from "@/app/api/_firebase/admin";
import type {
  SellCheckImageMeta,
  SellCheckImageAnalysis,
  SellCheckLog,
  SellCheckTextAnalysis,
} from "@/lib/types/sellCheck";
import {
  normalizeCategory,
  normalizeCondition,
  normalizePrice,
} from "@/lib/sellCheck/rules";
import { calculateSellCheckResult } from "@/lib/sellCheck/scoring";

export const runtime = "nodejs";

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

function safeScore(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function safeBoolean(v: unknown): boolean {
  return v === true || v === "true" || v === "1" || v === 1;
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];

  return v
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function parseJsonObject(value: unknown): any {
  const text = safeString(value);
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeImageAnalysis(value: unknown): SellCheckImageAnalysis | undefined {
  const v = parseJsonObject(value) ?? value;

  if (!v || typeof v !== "object") return undefined;

  const brightnessScore = safeScore((v as any).brightnessScore);
  const compositionScore = safeScore((v as any).compositionScore);
  const backgroundScore = safeScore((v as any).backgroundScore);
  const damageRiskScore = safeScore((v as any).damageRiskScore);
  const overallImageScore = safeScore((v as any).overallImageScore);

  if (
    brightnessScore === undefined &&
    compositionScore === undefined &&
    backgroundScore === undefined &&
    damageRiskScore === undefined &&
    overallImageScore === undefined
  ) {
    return undefined;
  }

  return {
    brightnessScore: brightnessScore ?? 50,
    compositionScore: compositionScore ?? 50,
    backgroundScore: backgroundScore ?? 50,
    damageRiskScore: damageRiskScore ?? 50,
    overallImageScore: overallImageScore ?? 50,
    imageReasons: safeStringArray((v as any).imageReasons),
  };
}

function normalizeTextAnalysis(value: unknown): SellCheckTextAnalysis | undefined {
  const v = parseJsonObject(value);
  if (!v) return undefined;

  const brandName = safeString(v.brandName);
  const modelName = safeString(v.modelName);
  const material = safeString(v.material);
  const extractedKeywords = safeStringArray(v.extractedKeywords);
  const conditionRiskScore = safeScore(v.conditionRiskScore);
  const descriptionQualityScore = safeScore(v.descriptionQualityScore);
  const textReasons = safeStringArray(v.textReasons);

  if (
    !brandName &&
    !modelName &&
    !material &&
    extractedKeywords.length === 0 &&
    conditionRiskScore === undefined &&
    descriptionQualityScore === undefined
  ) {
    return undefined;
  }

  return {
    brandName,
    modelName,
    material,
    extractedKeywords,
    conditionRiskScore: conditionRiskScore ?? 50,
    descriptionQualityScore: descriptionQualityScore ?? 50,
    textReasons,
  };
}

function toMillis(v: any): number | undefined {
  if (typeof v?.toMillis === "function") return v.toMillis();

  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return Math.round(n);

  return undefined;
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

/**
 * 通常診断用の画像解析
 *
 * 重要：
 * - /api/sell-check/image-analyze は管理者用
 * - こちらは通常診断の中で画像スコアを反映するための内部処理
 * - 失敗しても診断全体は止めず、undefined のまま既存診断を継続する
 */
async function analyzeImageFileForSellCheck(
  file: File
): Promise<SellCheckImageAnalysis | undefined> {
  try {
    if (!process.env.OPENAI_API_KEY) return undefined;

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mime = file.type || "image/png";

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

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
- brightnessScore：
  明るく、商品細部が見やすいほど高い。
  暗い、影が強い、色が潰れている場合は低い。

- compositionScore：
  商品全体が見え、中央に近く、余白が適切なら高い。
  見切れ、傾き、遠すぎる、近すぎる場合は低い。

- backgroundScore：
  背景が清潔で商品を邪魔しないほど高い。
  生活感、散らかり、強い柄、余計な物がある場合は低い。

- damageRiskScore：
  傷、汚れ、破損、使用感、色褪せが目立つほど高い。
  新品に近く見えるほど低い。

- overallImageScore：
  売れやすい商品画像としての総合点。
  明るさ・構図・背景・傷リスクを総合してください。

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
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mime};base64,${base64}`,
              },
            },
          ],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || "";
    const jsonText = extractJsonText(content);
    const parsed = JSON.parse(jsonText);

    return normalizeImageAnalysis(parsed);
  } catch (error) {
    console.error("sell-check image analysis skipped:", error);
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const price = normalizePrice(form.get("price"));
    const condition = normalizeCondition(form.get("condition"));
    const category = normalizeCategory(form.get("category"));

    const draftId = safeString(form.get("draftId"));
    const autoSave = safeBoolean(form.get("autoSave"));

    const file = form.get("image");

    const imageMeta: SellCheckImageMeta =
      file instanceof File
        ? {
            hasImage: true,
            fileName: file.name || "uploaded-image",
            fileSize: file.size || 0,
          }
        : {
            hasImage: false,
            fileName: "",
            fileSize: 0,
          };

    const receivedImageAnalysis = normalizeImageAnalysis(form.get("imageAnalysis"));
    const imageAnalysis =
      receivedImageAnalysis ??
      (file instanceof File ? await analyzeImageFileForSellCheck(file) : undefined);

    const textAnalysis = normalizeTextAnalysis(form.get("textAnalysis"));

    const db = getAdminDb();

    const learnedSnap = await db.collection("sellCheckLogs").limit(500).get();

    const soldPrices: number[] = [];

    const learnedLogs: SellCheckLog[] = learnedSnap.docs.map((doc) => {
      const data = doc.data();

      const soldPrice = safeNumber(data.soldPrice);
      const fallbackPrice = safeNumber(data.price);
      const learnedPrice = soldPrice ?? fallbackPrice ?? 0;

      const logCategory = normalizeCategory(data.category);
      const logCondition = normalizeCondition(data.condition);

      if (logCategory === category && data.sold === true && learnedPrice > 0) {
        soldPrices.push(learnedPrice);
      }

      return {
        id: doc.id,

        price: learnedPrice,
        soldPrice,
        category: logCategory,
        condition: logCondition,
        sold: data.sold === true,

        title: safeString(data.title),
        brandName: safeString(data.brandName),
        modelName: safeString(data.modelName),
        material: safeString(data.material),
        extractedKeywords: safeStringArray(data.extractedKeywords),

        views: safeNumber(data.views),
        likes: safeNumber(data.likes),
        score: safeNumber(data.score),

        conditionRiskScore: safeScore(data.conditionRiskScore),
        descriptionQualityScore: safeScore(data.descriptionQualityScore),

        brightnessScore: safeScore(data.brightnessScore),
        compositionScore: safeScore(data.compositionScore),
        backgroundScore: safeScore(data.backgroundScore),
        damageRiskScore: safeScore(data.damageRiskScore),
        overallImageScore: safeScore(data.overallImageScore),

        createdAt: toMillis(data.createdAt),

        hasImage: data.hasImage === true,
        imageUrl: safeString(data.imageUrl),
        imageFileName: safeString(data.imageFileName),
        imageFileSize: safeNumber(data.imageFileSize),

        memo: safeString(data.memo),
        source:
          data.source === "manual" || data.source === "draft" || data.source === "import"
            ? data.source
            : "import",
      };
    });

    const averageSoldPrice =
      soldPrices.length > 0
        ? soldPrices.reduce((sum, n) => sum + n, 0) / soldPrices.length
        : undefined;

    const result = calculateSellCheckResult({
      price,
      condition,
      category,
      imageMeta,
      learned: {
        averageSoldPrice,
        soldCount: soldPrices.length,
        totalCount: learnedSnap.size,
        logs: learnedLogs,
      },
      imageAnalysis,
      textAnalysis,
    } as any);

    if (autoSave) {
      await db.collection("sellCheckLogs").add({
        draftId,
        category,
        condition,
        price,

        score: result.score,
        rank: result.rank,
        action: result.action,
        suggestedPriceMin: result.suggestedPriceMin,
        suggestedPriceMax: result.suggestedPriceMax,
        improvements: result.improvements,
        reasons: result.reasons,
        learnedSampleCount: result.learnedSampleCount,
        targetSummary: result.targetSummary,

        imageFileName: imageMeta.fileName || "",
        imageFileSize: imageMeta.fileSize || 0,
        hasImage: imageMeta.hasImage === true,

        brandName: textAnalysis?.brandName || "",
        modelName: textAnalysis?.modelName || "",
        material: textAnalysis?.material || "",
        extractedKeywords: textAnalysis?.extractedKeywords || [],
        conditionRiskScore: textAnalysis?.conditionRiskScore,
        descriptionQualityScore: textAnalysis?.descriptionQualityScore,

        brightnessScore: imageAnalysis?.brightnessScore,
        compositionScore: imageAnalysis?.compositionScore,
        backgroundScore: imageAnalysis?.backgroundScore,
        damageRiskScore: imageAnalysis?.damageRiskScore,
        overallImageScore: imageAnalysis?.overallImageScore,

        sold: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: "売れる診断に失敗しました",
      },
      { status: 500 }
    );
  }
}