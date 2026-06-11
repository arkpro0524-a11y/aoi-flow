//app/api/sell-check/outcomes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/api/_firebase/admin";

export const runtime = "nodejs";

function safeString(v: unknown): string {
  return String(v ?? "").trim();
}

function safeNumber(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
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

function normalizeStatus(v: unknown) {
  const s = safeString(v);
  if (s === "watching") return "watching";
  if (s === "purchased") return "purchased";
  if (s === "listed") return "listed";
  if (s === "sold") return "sold";
  if (s === "unsold") return "unsold";
  if (s === "stopped") return "stopped";
  return "watching";
}

function normalizePlatform(v: unknown) {
  const s = safeString(v);
  if (s === "mercari") return "mercari";
  if (s === "yahoo_auction") return "yahoo_auction";
  if (s === "jmty") return "jmty";
  if (s === "rakuma") return "rakuma";
  return "other";
}

function calcNetProfit(args: {
  soldPrice: number;
  purchasePrice: number;
  shippingCost: number;
  packagingCost: number;
  platformFee: number;
}) {
  return (
    args.soldPrice -
    args.purchasePrice -
    args.shippingCost -
    args.packagingCost -
    args.platformFee
  );
}

export async function GET(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);

    if (!uid) {
      return NextResponse.json(
        { ok: false, error: "ログイン確認が必要です" },
        { status: 401 }
      );
    }

    // Firestore の複合インデックス未作成環境でも画面を止めないため、
    // uid だけで取得してから createdAt 降順ソートと 100件制限をアプリ側で行います。
    // 既存コレクション・既存データ形式は変更しません。
    const snap = await getAdminDb()
      .collection("sellCheckOutcomeLogs")
      .where("uid", "==", uid)
      .get();

    const logs = snap.docs
      .map((doc) => {
        const data = doc.data();
        const createdAt =
          typeof data.createdAt?.toMillis === "function"
            ? data.createdAt.toMillis()
            : Number(data.createdAt || 0);
        const updatedAt =
          typeof data.updatedAt?.toMillis === "function"
            ? data.updatedAt.toMillis()
            : Number(data.updatedAt || 0);

        return {
          id: doc.id,
          ...data,
          createdAt: Number.isFinite(createdAt) ? createdAt : 0,
          updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
        };
      })
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, 100);

    return NextResponse.json({ ok: true, logs });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, error: "実務ログの取得に失敗しました" },
      { status: 500 }
    );
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

    const body = await req.json().catch(() => ({}));

    const soldPrice = safeNumber(body.soldPrice);
    const purchasePrice = safeNumber(body.purchasePrice);
    const shippingCost = safeNumber(body.shippingCost);
    const packagingCost = safeNumber(body.packagingCost);
    const platformFee = safeNumber(body.platformFee);

    const payload = {
      uid,

      title: safeString(body.title),
      status: normalizeStatus(body.status),
      platform: normalizePlatform(body.platform),

      purchasePrice,
      listedPrice: safeNumber(body.listedPrice),
      soldPrice,

      shippingCost,
      packagingCost,
      platformFee,
      netProfit: calcNetProfit({
        soldPrice,
        purchasePrice,
        shippingCost,
        packagingCost,
        platformFee,
      }),

      views: safeNumber(body.views),
      likes: safeNumber(body.likes),
      daysToSell: safeNumber(body.daysToSell),

      memo: safeString(body.memo),
      failureReason: safeString(body.failureReason),

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!payload.title) {
      return NextResponse.json(
        { ok: false, error: "商品名が必要です" },
        { status: 400 }
      );
    }

    const ref = await getAdminDb().collection("sellCheckOutcomeLogs").add(payload);

    return NextResponse.json({
      ok: true,
      id: ref.id,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, error: "実務ログの保存に失敗しました" },
      { status: 500 }
    );
  }
}