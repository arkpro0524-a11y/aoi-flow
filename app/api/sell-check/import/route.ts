// app/api/sell-check/import/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/api/_firebase/admin";
import {
  normalizeCategory,
  normalizeCondition,
  normalizePrice,
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
    v === "sold"
  );
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];

  return v
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function cleanObject(obj: CleanObject): CleanObject {
  const out: CleanObject = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      out[key] = value.filter((x) => x !== undefined);
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
        {
          ok: false,
          error: "ログイン確認が必要です",
        },
        { status: 401 }
      );
    }

    const adminUids = getAdminUidList();

    if (!adminUids.includes(uid)) {
      return NextResponse.json(
        {
          ok: false,
          error: "管理者のみ実行できます",
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (rows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "保存するデータがありません",
        },
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
      const sold = safeBoolean(row.sold);
      const soldPrice = rawSoldPrice ?? (sold ? price : undefined);

      const views = safeNumber(row.views);
      const likes = safeNumber(row.likes);

      const brandName = safeString(row.brandName);
      const modelName = safeString(row.modelName);
      const material = safeString(row.material);
      const extractedKeywords = safeStringArray(row.extractedKeywords);

      const conditionRiskScore = safeScore(row.conditionRiskScore);
      const descriptionQualityScore = safeScore(row.descriptionQualityScore);

      const brightnessScore = safeScore(row.brightnessScore);
      const compositionScore = safeScore(row.compositionScore);
      const backgroundScore = safeScore(row.backgroundScore);
      const damageRiskScore = safeScore(row.damageRiskScore);
      const overallImageScore = safeScore(row.overallImageScore);

      const imageUrl = safeString(row.imageUrl);
      const imageFileName = safeString(row.imageFileName);
      const imageFileSize = safeNumber(row.imageFileSize);

      const sourceRaw = safeString(row.source);
      const source =
        sourceRaw === "manual" || sourceRaw === "draft" || sourceRaw === "import"
          ? sourceRaw
          : "import";

      const hasImage =
        row.hasImage === true ||
        Boolean(imageUrl) ||
        imageFileSize !== undefined ||
        overallImageScore !== undefined;

      const payload = cleanObject({
        uid,
        title: title || undefined,

        price,
        soldPrice,
        category,
        condition,
        sold,

        views,
        likes,

        brandName: brandName || undefined,
        modelName: modelName || undefined,
        material: material || undefined,
        extractedKeywords,

        conditionRiskScore,
        descriptionQualityScore,

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

        memo: memo || undefined,

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
        {
          ok: false,
          error: "有効な価格データがありません",
          skippedCount,
        },
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
      {
        ok: false,
        error: "学習データの保存に失敗しました",
      },
      { status: 500 }
    );
  }
}