//app/api/sell-check/logs/route.ts
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
  if (Array.isArray(v)) {
    return v
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  return String(v ?? "")
    .split(/[,\n、]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);
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

async function assertAdmin(req: NextRequest) {
  const uid = await getUidFromRequest(req);

  if (!uid) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "ログイン確認が必要です" },
        { status: 401 }
      ),
    };
  }

  if (!getAdminUidList().includes(uid)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "管理者のみ実行できます" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, uid };
}

function toMillis(v: any): number {
  if (typeof v?.toMillis === "function") return v.toMillis();

  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return Math.round(n);

  return 0;
}

function normalizeLog(id: string, data: any) {
  return {
    id,

    title: safeString(data.title),
    price: safeNumber(data.price) ?? 0,
    soldPrice: safeNumber(data.soldPrice) ?? 0,
    category: safeString(data.category) || "other",
    condition: safeString(data.condition) || "good",
    sold: data.sold === true,

    views: safeNumber(data.views) ?? 0,
    likes: safeNumber(data.likes) ?? 0,

    brandName: safeString(data.brandName),
    modelName: safeString(data.modelName),
    material: safeString(data.material),
    extractedKeywords: safeStringArray(data.extractedKeywords),

    conditionRiskScore: safeScore(data.conditionRiskScore),
    descriptionQualityScore: safeScore(data.descriptionQualityScore),

    brightnessScore: safeScore(data.brightnessScore),
    compositionScore: safeScore(data.compositionScore),
    backgroundScore: safeScore(data.backgroundScore),
    damageRiskScore: safeScore(data.damageRiskScore),
    overallImageScore: safeScore(data.overallImageScore),

    score: safeScore(data.score),
    rank: safeString(data.rank),
    memo: safeString(data.memo),

    hasImage: data.hasImage === true || Boolean(safeString(data.imageUrl)),
    imageUrl: safeString(data.imageUrl),
    imageFileName: safeString(data.imageFileName),
    source: safeString(data.source) || safeString(data.imageSource) || "import",

    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

export async function GET(req: NextRequest) {
  try {
    const admin = await assertAdmin(req);
    if (!admin.ok) return admin.response;

    const url = new URL(req.url);
    const limitParam = Number(url.searchParams.get("limit") || "200");
    const safeLimit = Math.max(1, Math.min(500, Math.round(limitParam)));

    const db = getAdminDb();

    const snap = await db
      .collection("sellCheckLogs")
      .orderBy("createdAt", "desc")
      .limit(safeLimit)
      .get();

    const logs = snap.docs.map((doc) => normalizeLog(doc.id, doc.data()));

    return NextResponse.json({
      ok: true,
      logs,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { ok: false, error: "学習データ一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await assertAdmin(req);
    if (!admin.ok) return admin.response;

    const body = await req.json().catch(() => ({}));
    const id = safeString(body.id);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "更新対象IDがありません" },
        { status: 400 }
      );
    }

    const patch = body.patch && typeof body.patch === "object" ? body.patch : {};

    const priceRaw = safeNumber(patch.price);
    const soldPriceRaw = safeNumber(patch.soldPrice);

    const payload = cleanObject({
      title: safeString(patch.title) || undefined,

      price: priceRaw !== undefined ? normalizePrice(priceRaw) : undefined,
      soldPrice:
        soldPriceRaw !== undefined ? normalizePrice(soldPriceRaw) : undefined,

      category: patch.category ? normalizeCategory(patch.category) : undefined,
      condition: patch.condition ? normalizeCondition(patch.condition) : undefined,
      sold: patch.sold === undefined ? undefined : safeBoolean(patch.sold),

      views: safeNumber(patch.views),
      likes: safeNumber(patch.likes),

      brandName: safeString(patch.brandName) || undefined,
      modelName: safeString(patch.modelName) || undefined,
      material: safeString(patch.material) || undefined,
      extractedKeywords: safeStringArray(patch.extractedKeywords),

      conditionRiskScore: safeScore(patch.conditionRiskScore),
      descriptionQualityScore: safeScore(patch.descriptionQualityScore),

      brightnessScore: safeScore(patch.brightnessScore),
      compositionScore: safeScore(patch.compositionScore),
      backgroundScore: safeScore(patch.backgroundScore),
      damageRiskScore: safeScore(patch.damageRiskScore),
      overallImageScore: safeScore(patch.overallImageScore),

      score: safeScore(patch.score),
      rank: safeString(patch.rank) || undefined,
      memo: safeString(patch.memo) || undefined,

      hasImage: patch.hasImage === undefined ? undefined : safeBoolean(patch.hasImage),
      imageUrl: safeString(patch.imageUrl) || undefined,
      imageFileName: safeString(patch.imageFileName) || undefined,
      source: safeString(patch.source) || undefined,

      updatedBy: admin.uid,
      updatedAt: new Date(),
    });

    await getAdminDb().collection("sellCheckLogs").doc(id).set(payload, {
      merge: true,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { ok: false, error: "学習データの更新に失敗しました" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await assertAdmin(req);
    if (!admin.ok) return admin.response;

    const url = new URL(req.url);
    const idFromQuery = safeString(url.searchParams.get("id"));

    const body = await req.json().catch(() => ({}));
    const id = idFromQuery || safeString(body.id);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "削除対象IDがありません" },
        { status: 400 }
      );
    }

    await getAdminDb().collection("sellCheckLogs").doc(id).delete();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { ok: false, error: "学習データの削除に失敗しました" },
      { status: 500 }
    );
  }
}