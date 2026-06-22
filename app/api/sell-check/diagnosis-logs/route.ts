import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/api/_firebase/admin";

export const runtime = "nodejs";

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n);
}

function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return 0;
}

function toIso(v: any): string {
  const ms = toMs(v);
  if (!ms) return "";
  return new Date(ms).toISOString();
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

export async function GET(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);

    if (!uid) {
      return NextResponse.json(
        { ok: false, error: "ログイン確認が必要です" },
        { status: 401 },
      );
    }

    const url = new URL(req.url);
    const limitParam = Number(url.searchParams.get("limit") || "30");
    const max = Math.max(1, Math.min(100, Number.isFinite(limitParam) ? Math.round(limitParam) : 30));

    const snap = await getAdminDb()
      .collection("sellCheckDiagnosisLogs")
      .where("uid", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(max)
      .get();

    const logs = snap.docs.map((doc) => {
      const data = doc.data() || {};
      const imageUrls = Array.isArray(data.imageUrls)
        ? data.imageUrls.map((x) => safeString(x)).filter(Boolean)
        : [];
      const imageUrl = safeString(data.imageUrl) || imageUrls[0] || "";

      return {
        id: doc.id,
        title: safeString(data.title) || "（商品名未入力）",
        memo: safeString(data.memo),
        keywords: safeString(data.keywords),
        price: safeNumber(data.price),
        category: safeString(data.category),
        condition: safeString(data.condition),
        score: safeNumber(data.score),
        rank: safeString(data.rank),
        action: safeString(data.action),
        scoreLabel: safeString(data.scoreLabel),
        rankLabel: safeString(data.rankLabel),
        sellSpeedLabel: safeString(data.sellSpeedLabel),
        confidenceLabel: safeString(data.confidenceLabel),
        suggestedPriceMin: safeNumber(data.suggestedPriceMin),
        suggestedPriceMax: safeNumber(data.suggestedPriceMax),
        imageUrl,
        imageUrls: imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : [],
        imageCount: safeNumber(data.imageCount) ?? (imageUrls.length || (imageUrl ? 1 : 0)),
        reasons: Array.isArray(data.reasons) ? data.reasons.map((x) => safeString(x)).filter(Boolean).slice(0, 10) : [],
        improvements: Array.isArray(data.improvements) ? data.improvements.map((x) => safeString(x)).filter(Boolean).slice(0, 10) : [],
        targetSummary: safeString(data.targetSummary),
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

    return NextResponse.json({ ok: true, logs });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: "診断履歴の取得に失敗しました" },
      { status: 500 },
    );
  }
}
