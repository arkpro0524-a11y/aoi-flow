// /app/api/sell-check/import/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/api/_firebase/admin";
import {
  normalizeCategory,
  normalizeCondition,
  normalizeListingStatus,
  normalizePrice,
  normalizeSellCheckSource,
} from "@/lib/sellCheck/rules";

export const runtime = "nodejs";

type CleanObject = Record<string, any>;

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeNumber(v: unknown): number | undefined {
  const raw = String(v ?? "").replace(/[^\d.]/g, "");
  const n = Number(raw);

  if (!Number.isFinite(n) || n < 0) return undefined;

  return Math.round(n);
}

function safeScore(v: unknown): number | undefined {
  const n = safeNumber(v);

  if (n === undefined) return undefined;

  return Math.max(0, Math.min(100, n));
}

function safeBoolean(v: unknown): boolean {
  return (
    v === true ||
    v === "true" ||
    v === "1" ||
    v === 1 ||
    v === "売却済み" ||
    v === "販売済み" ||
    v === "落札済み" ||
    v === "sold"
  );
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
      .split(/[,\n、]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  return [];
}

function cleanObject(obj: CleanObject): CleanObject {
  const out: CleanObject = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      out[key] = value.filter((x) => x !== undefined && x !== null);
      continue;
    }

    if (value && typeof value === "object" && !(value instanceof Date)) {
      out[key] = cleanObject(value);
      continue;
    }

    out[key] = value;
  }

  return out;
}

function getAdminUidList(): string[] {
  const raw = process.env.ADMIN_UIDS || process.env.NEXT_PUBLIC_ADMIN_UIDS || "";

  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
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

export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);

    if (!uid) {
      return NextResponse.json(
        { ok: false, error: "ログイン確認が必要です" },
        { status: 401 }
      );
    }

    if (!getAdminUidList().includes(uid)) {
      return NextResponse.json(
        { ok: false, error: "管理者のみ実行できます" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "保存するデータがありません" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const batch = db.batch();
    const now = new Date();

    let savedCount = 0;
    let skippedCount = 0;

    rows.slice(0, 200).forEach((row: any) => {
      const title = safeString(row.title);
      const memo = safeString(row.memo);

      const rawPrice = safeNumber(row.price);
      const rawSoldPrice = safeNumber(row.soldPrice);
      const basePrice = rawPrice ?? rawSoldPrice;

      if (basePrice === undefined) {
        skippedCount += 1;
        return;
      }

      const category = normalizeCategory(row.category);
      const condition = normalizeCondition(row.condition);
      const price = normalizePrice(basePrice);

      const listingStatus = normalizeListingStatus({
        sold: row.sold,
        listingStatus: row.listingStatus,
      });

      const sold = listingStatus === "sold" || safeBoolean(row.sold);
      const soldPrice = sold ? rawSoldPrice ?? price : rawSoldPrice;

      const source = normalizeSellCheckSource(row.source || row.imageSource);

      const imageUrl = safeString(row.imageUrl);
      const imageFileName = safeString(row.imageFileName);
      const imageFileSize = safeNumber(row.imageFileSize);

      const brightnessScore = safeScore(row.brightnessScore);
      const compositionScore = safeScore(row.compositionScore);
      const backgroundScore = safeScore(row.backgroundScore);
      const damageRiskScore = safeScore(row.damageRiskScore);
      const overallImageScore = safeScore(row.overallImageScore);

      const hasImage =
        row.hasImage === true ||
        Boolean(imageUrl) ||
        imageFileSize !== undefined ||
        overallImageScore !== undefined;

      const payload = cleanObject({
        uid,
        title: title || undefined,
        memo: memo || undefined,

        price,
        soldPrice,
        category,
        condition,
        sold,
        listingStatus,

        views: safeNumber(row.views),
        likes: safeNumber(row.likes),

        brandName: safeString(row.brandName) || undefined,
        modelName: safeString(row.modelName) || undefined,
        material: safeString(row.material) || undefined,

        /**
         * 少数判定強化用
         */
        productType: safeString(row.productType) || undefined,
        characterName: safeString(row.characterName) || undefined,
        seriesName: safeString(row.seriesName) || undefined,
        maker: safeString(row.maker) || undefined,
        era: safeString(row.era) || undefined,
        collectorGenre: safeString(row.collectorGenre) || undefined,
        materialType: safeString(row.materialType) || undefined,

        extractedKeywords: safeStringArray(row.extractedKeywords),

        conditionRiskScore: safeScore(row.conditionRiskScore),
        descriptionQualityScore: safeScore(row.descriptionQualityScore),

        rarityScore: safeScore(row.rarityScore),
        demandScore: safeScore(row.demandScore),
        brandPowerScore: safeScore(row.brandPowerScore),
        collectorScore: safeScore(row.collectorScore),
        ageValueScore: safeScore(row.ageValueScore),
        trendScore: safeScore(row.trendScore),
        marketSupplyScore: safeScore(row.marketSupplyScore),
        keywordStrength: safeScore(row.keywordStrength),
        rareReasons: safeStringArray(row.rareReasons),

        brightnessScore,
        compositionScore,
        backgroundScore,
        damageRiskScore,
        overallImageScore,

        hasImage,
        imageUrl: imageUrl || undefined,
        imageFileName: imageFileName || undefined,
        imageFileSize,
        imageSource: source,
        source,

        importedBy: uid,
        importedAt: now,

        createdAt: now,
        updatedAt: now,
      });

      const ref = db.collection("sellCheckLogs").doc();
      batch.set(ref, payload);
      savedCount += 1;
    });

    if (savedCount === 0) {
      return NextResponse.json(
        { ok: false, error: "有効な価格データがありません", skippedCount },
        { status: 400 }
      );
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      savedCount,
      skippedCount,
    });
  } catch (e) {
    console.error(e);

    return NextResponse.json(
      { ok: false, error: "学習データの保存に失敗しました" },
      { status: 500 }
    );
  }
}