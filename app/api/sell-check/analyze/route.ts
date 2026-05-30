// /app/api/sell-check/analyze/route.ts

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminDb } from "@/app/api/_firebase/admin";
import {
  normalizeCategory,
  normalizeCondition,
  normalizeListingStatus,
  normalizePrice,
  normalizeSellCheckSource,
} from "@/lib/sellCheck/rules";
import { calculateSellCheckResult } from "@/lib/sellCheck/scoring";
import type {
  SellCheckImageAnalysis,
  SellCheckImageMeta,
  SellCheckLog,
  SellCheckTextAnalysis,
} from "@/lib/types/sellCheck";

export const runtime = "nodejs";

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeNumber(v: unknown): number | undefined {
  const raw = String(v ?? "").replace(/[^\d.]/g, "");
  const n = Number(raw);

  if (!Number.isFinite(n) || n <= 0) return undefined;

  return Math.round(n);
}

function safeScore(v: unknown, fallback = 50): number {
  const n = Number(v);

  if (!Number.isFinite(n)) return fallback;

  return Math.max(0, Math.min(100, Math.round(n)));
}

function safeStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  if (typeof v === "string") {
    return v
      .split(/[,\n、\s]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  return [];
}

function extractJsonText(text: string): string {
  const s = safeString(text);

  if (!s) return "{}";

  const fenced = s.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");

  if (first >= 0 && last > first) {
    return s.slice(first, last + 1).trim();
  }

  return s;
}

async function fileToDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mime = file.type || "image/png";

  return `data:${mime};base64,${base64}`;
}

async function analyzeImageAndText(args: {
  imageDataUrl: string;
  title: string;
  memo: string;
  keywords: string;
  category: string;
  condition: string;
}): Promise<any> {
  if (!process.env.OPENAI_API_KEY) {
    return {};
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = `
あなたは中古市場分析AIです。

目的：
売れる診断用に、画像・商品名・説明文・キーワード・市場価値を推定してください。

重要：
- category に依存しすぎないこと
- 商品名・ブランド・型番・年代・素材・コレクター語句を重視すること
- 同じメーカーでも、作品名・シリーズ・商品種別・素材・年代が違えば別価格帯として扱うこと
- 販売中の高値を売却価格として扱わないこと
- 実際に売れる保証はしないこと
- 分からないことは空文字にすること

抽出したい属性：
- productType: 商品種別。例：ソフビ、ブリキ、超合金、フィギュア、ミニカー、家具、食器
- characterName: キャラクター名・作品IP。例：鉄人28号、アトム、ウルトラマン
- seriesName: シリーズ名・作品シリーズ。例：帰ってきたウルトラマン、昭和ウルトラシリーズ
- maker: メーカー名。例：ポピー、ブルマァク、バンダイ、タカラ、トミー
- era: 年代。例：昭和、1970年代、1980年代、平成初期
- collectorGenre: コレクター分類。例：特撮、昭和レトロ玩具、アニメ、旧車、ヴィンテージ雑貨
- materialType: 素材分類。例：ブリキ、ソフビ、金属、プラスチック、木製、陶器

特に評価する語句：
昭和レトロ、当時物、ブリキ、ソフビ、円谷、ブルマァク、ポピー、特撮、怪獣、限定、廃盤、初版、旧ロゴ、非売品、デッドストック、箱付き

必ずJSONだけを返してください。

{
  "brandName": "",
  "modelName": "",
  "material": "",
  "productType": "",
  "characterName": "",
  "seriesName": "",
  "maker": "",
  "era": "",
  "collectorGenre": "",
  "materialType": "",
  "extractedKeywords": [],
  "conditionRiskScore": 0,
  "descriptionQualityScore": 0,
  "textReasons": [],
  "rarityScore": 0,
  "demandScore": 0,
  "brandPowerScore": 0,
  "collectorScore": 0,
  "ageValueScore": 0,
  "trendScore": 0,
  "marketSupplyScore": 0,
  "keywordStrength": 0,
  "rareReasons": [],
  "brightnessScore": 0,
  "compositionScore": 0,
  "backgroundScore": 0,
  "damageRiskScore": 0,
  "overallImageScore": 0,
  "imageReasons": []
}

商品名：
${args.title}

説明文：
${args.memo}

キーワード：
${args.keywords}

カテゴリ：
${args.category}

状態：
${args.condition}
`.trim();

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "あなたは中古販売データをJSONで評価する補助エンジンです。必ず有効なJSONだけを返します。",
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: args.imageDataUrl,
            },
          },
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content || "{}";
  const jsonText = extractJsonText(content);

  return JSON.parse(jsonText);
}

function buildTextAnalysis(args: {
  ai: any;
  title: string;
  memo: string;
  keywords: string;
}): SellCheckTextAnalysis {
  const manualWords = safeStringArray(
    [args.title, args.memo, args.keywords].filter(Boolean).join(" ")
  );

  const aiWords = safeStringArray(args.ai.extractedKeywords);

  const attributeWords = [
    args.ai.brandName,
    args.ai.modelName,
    args.ai.material,
    args.ai.productType,
    args.ai.characterName,
    args.ai.seriesName,
    args.ai.maker,
    args.ai.era,
    args.ai.collectorGenre,
    args.ai.materialType,
  ]
    .map((x) => safeString(x))
    .filter(Boolean);

  const extractedKeywords = [...manualWords, ...aiWords, ...attributeWords]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .filter((x, index, arr) => arr.indexOf(x) === index)
    .slice(0, 20);

  const conditionRiskFromText = /ジャンク|破損|欠品|動作未確認|汚れ|傷|サビ|割れ|劣化|不動/.test(
    `${args.title} ${args.memo}`
  )
    ? 72
    : 42;

  const descriptionQuality =
    args.memo.length >= 220
      ? 82
      : args.memo.length >= 100
      ? 70
      : args.memo.length >= 30
      ? 58
      : 45;

  return {
    brandName: safeString(args.ai.brandName),
    modelName: safeString(args.ai.modelName),
    material: safeString(args.ai.material),

    productType: safeString(args.ai.productType),
    characterName: safeString(args.ai.characterName),
    seriesName: safeString(args.ai.seriesName),
    maker: safeString(args.ai.maker),
    era: safeString(args.ai.era),
    collectorGenre: safeString(args.ai.collectorGenre),
    materialType: safeString(args.ai.materialType),

    extractedKeywords,
    conditionRiskScore: safeScore(args.ai.conditionRiskScore, conditionRiskFromText),
    descriptionQualityScore: safeScore(args.ai.descriptionQualityScore, descriptionQuality),
    textReasons: [
      args.title ? "商品名を診断キーワードとして反映しました" : "",
      args.memo ? "説明文を診断キーワードとして反映しました" : "",
      args.keywords ? "手入力キーワードを診断に反映しました" : "",
      safeString(args.ai.productType)
        ? `商品種別「${safeString(args.ai.productType)}」を類似判定に使います`
        : "",
      safeString(args.ai.characterName)
        ? `作品名・キャラクター「${safeString(args.ai.characterName)}」を類似判定に使います`
        : "",
      safeString(args.ai.seriesName)
        ? `シリーズ「${safeString(args.ai.seriesName)}」を類似判定に使います`
        : "",
      safeString(args.ai.maker)
        ? `メーカー「${safeString(args.ai.maker)}」を類似判定に使います`
        : "",
      safeString(args.ai.era)
        ? `年代「${safeString(args.ai.era)}」を類似判定に使います`
        : "",
      safeString(args.ai.collectorGenre)
        ? `コレクター分類「${safeString(args.ai.collectorGenre)}」を類似判定に使います`
        : "",
      safeString(args.ai.materialType)
        ? `素材分類「${safeString(args.ai.materialType)}」を類似判定に使います`
        : "",
      ...safeStringArray(args.ai.textReasons),
    ]
      .filter(Boolean)
      .slice(0, 20),
    rarityScore: safeScore(args.ai.rarityScore),
    demandScore: safeScore(args.ai.demandScore),
    brandPowerScore: safeScore(args.ai.brandPowerScore),
    collectorScore: safeScore(args.ai.collectorScore),
    ageValueScore: safeScore(args.ai.ageValueScore),
    trendScore: safeScore(args.ai.trendScore),
    marketSupplyScore: safeScore(args.ai.marketSupplyScore),
    keywordStrength: safeScore(args.ai.keywordStrength),
    rareReasons: safeStringArray(args.ai.rareReasons),
  };
}

function buildImageAnalysis(ai: any): SellCheckImageAnalysis {
  const brightnessScore = safeScore(ai.brightnessScore);
  const compositionScore = safeScore(ai.compositionScore);
  const backgroundScore = safeScore(ai.backgroundScore);
  const damageRiskScore = safeScore(ai.damageRiskScore);

  const overallImageScore = safeScore(
    ai.overallImageScore,
    Math.round(
      brightnessScore * 0.28 +
        compositionScore * 0.28 +
        backgroundScore * 0.22 +
        (100 - damageRiskScore) * 0.22
    )
  );

  return {
    brightnessScore,
    compositionScore,
    backgroundScore,
    damageRiskScore,
    overallImageScore,
    imageReasons: safeStringArray(ai.imageReasons),
  };
}

function toMillis(v: any): number | undefined {
  if (typeof v?.toMillis === "function") return v.toMillis();

  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return Math.round(n);

  return undefined;
}

async function loadLearningLogs(): Promise<SellCheckLog[]> {
  const db = getAdminDb();

  const snap = await db
    .collection("sellCheckLogs")
    .orderBy("createdAt", "desc")
    .limit(3000)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data();

    const listingStatus = normalizeListingStatus({
      sold: data.sold,
      listingStatus: data.listingStatus,
    });

    const listedPrice = safeNumber(data.price) ?? 0;
    const soldPrice = safeNumber(data.soldPrice);

    return {
      id: doc.id,
      title: safeString(data.title),
      price: listedPrice,
      soldPrice,
      category: normalizeCategory(data.category),
      condition: normalizeCondition(data.condition),
      sold: listingStatus === "sold",
      listingStatus,

      views: safeNumber(data.views),
      likes: safeNumber(data.likes),

      brandName: safeString(data.brandName),
      modelName: safeString(data.modelName),
      material: safeString(data.material),

      productType: safeString(data.productType),
      characterName: safeString(data.characterName),
      seriesName: safeString(data.seriesName),
      maker: safeString(data.maker),
      era: safeString(data.era),
      collectorGenre: safeString(data.collectorGenre),
      materialType: safeString(data.materialType),

      extractedKeywords: safeStringArray(data.extractedKeywords),

      conditionRiskScore: safeScore(data.conditionRiskScore),
      descriptionQualityScore: safeScore(data.descriptionQualityScore),

      brightnessScore: safeScore(data.brightnessScore),
      compositionScore: safeScore(data.compositionScore),
      backgroundScore: safeScore(data.backgroundScore),
      damageRiskScore: safeScore(data.damageRiskScore),
      overallImageScore: safeScore(data.overallImageScore),

      rarityScore: safeScore(data.rarityScore),
      demandScore: safeScore(data.demandScore),
      brandPowerScore: safeScore(data.brandPowerScore),
      collectorScore: safeScore(data.collectorScore),
      ageValueScore: safeScore(data.ageValueScore),
      trendScore: safeScore(data.trendScore),
      marketSupplyScore: safeScore(data.marketSupplyScore),
      keywordStrength: safeScore(data.keywordStrength),
      rareReasons: safeStringArray(data.rareReasons),

      createdAt: toMillis(data.createdAt),

      hasImage: data.hasImage === true || Boolean(safeString(data.imageUrl)),
      imageUrl: safeString(data.imageUrl),
      imageFileName: safeString(data.imageFileName),
      imageFileSize: safeNumber(data.imageFileSize),

      memo: safeString(data.memo),
      source: normalizeSellCheckSource(data.source || data.imageSource),
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const image = form.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "画像がありません" },
        { status: 400 }
      );
    }

    const price = normalizePrice(form.get("price"));
    const category = normalizeCategory(form.get("category"));
    const condition = normalizeCondition(form.get("condition"));

    const purchasePrice = safeNumber(form.get("purchasePrice"));
    const estimatedShippingCost = safeNumber(form.get("estimatedShippingCost"));
    const estimatedPackagingCost = safeNumber(form.get("estimatedPackagingCost"));
    const platformFeeRateRaw = Number(form.get("platformFeeRate"));
    const platformFeeRate =
      Number.isFinite(platformFeeRateRaw) && platformFeeRateRaw >= 0
        ? platformFeeRateRaw
        : undefined;

    const title = safeString(form.get("title") || form.get("targetTitle"));
    const memo = safeString(form.get("memo") || form.get("targetDescription"));
    const keywords = safeString(form.get("keywords") || form.get("targetKeywords"));

    const imageMeta: SellCheckImageMeta = {
      hasImage: true,
      fileName: image.name || "uploaded-image",
      fileSize: image.size || 0,
    };

    const imageDataUrl = await fileToDataUrl(image);

    const ai = await analyzeImageAndText({
      imageDataUrl,
      title,
      memo,
      keywords,
      category,
      condition,
    });

    const imageAnalysis = buildImageAnalysis(ai);
    const textAnalysis = buildTextAnalysis({
      ai,
      title,
      memo,
      keywords,
    });

    const logs = await loadLearningLogs();

    const soldLogs = logs.filter((x) => x.sold === true);
    const soldPrices = soldLogs
      .map((x) => x.soldPrice ?? x.price)
      .filter((x): x is number => typeof x === "number" && x > 0);

    const averageSoldPrice =
      soldPrices.length > 0
        ? Math.round(soldPrices.reduce((sum, n) => sum + n, 0) / soldPrices.length)
        : undefined;

    const result = calculateSellCheckResult({
      price,
      category,
      condition,
      imageMeta,
      learned: {
        averageSoldPrice,
        soldCount: soldPrices.length,
        totalCount: logs.length,
        logs,
      },
      imageAnalysis,
      textAnalysis,

      purchasePrice,
      estimatedShippingCost,
      estimatedPackagingCost,
      platformFeeRate,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { ok: false, error: "診断失敗" },
      { status: 500 }
    );
  }
}