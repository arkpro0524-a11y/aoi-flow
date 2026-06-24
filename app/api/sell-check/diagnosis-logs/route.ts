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

function safePlainObject(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  return v as Record<string, unknown>;
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => safeString(x)).filter(Boolean).slice(0, 40);
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

    // uid + createdAt の複合インデックスが未作成でも履歴を必ず表示できるように、
    // Firestore側では uid のみに絞り、並び替えはサーバー側で行います。
    // これで「診断履歴が取得できない」「学習データと混ざる」を防ぎます。
    const snap = await getAdminDb()
      .collection("sellCheckDiagnosisLogs")
      .where("uid", "==", uid)
      .limit(Math.max(max, 100))
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

        // 詳細ポップアップで使う診断結果本体。
        // 売却実績の学習データではなく、売れる診断で保存した結果だけを返します。
        imageAnalysis: safePlainObject(data.imageAnalysis),
        textAnalysis: safePlainObject(data.textAnalysis),
        marketAnalysis: safePlainObject(data.marketAnalysis),
        similarData: safePlainObject(data.similarData),
        scoreBreakdown: safePlainObject(data.scoreBreakdown),
        profitAnalysis: safePlainObject(data.profitAnalysis),
        acquisitionAnalysis: safePlainObject(data.acquisitionAnalysis),
        theoryProfile: safePlainObject(data.theoryProfile),
        marketStructureAnalysis: safePlainObject(data.marketStructureAnalysis),
        priceDistortionAnalysis: safePlainObject(data.priceDistortionAnalysis),
        rotationLearningAnalysis: safePlainObject(data.rotationLearningAnalysis),
      };
    }).sort((a, b) => Date.parse((b as any).createdAt || "") - Date.parse((a as any).createdAt || "")).slice(0, max);

    return NextResponse.json({ ok: true, logs });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: "診断履歴の取得に失敗しました" },
      { status: 500 },
    );
  }
}


export async function DELETE(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);

    if (!uid) {
      return NextResponse.json(
        { ok: false, error: "ログイン確認が必要です" },
        { status: 401 },
      );
    }

    const url = new URL(req.url);
    const id = safeString(url.searchParams.get("id"));

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "削除する診断履歴IDがありません" },
        { status: 400 },
      );
    }

    const ref = getAdminDb().collection("sellCheckDiagnosisLogs").doc(id);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: "診断履歴が見つかりません" },
        { status: 404 },
      );
    }

    const data = snap.data() || {};
    if (safeString(data.uid) !== uid) {
      return NextResponse.json(
        { ok: false, error: "この診断履歴を削除する権限がありません" },
        { status: 403 },
      );
    }

    await ref.delete();

    return NextResponse.json({ ok: true, deletedId: id });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: "診断履歴の削除に失敗しました" },
      { status: 500 },
    );
  }
}
