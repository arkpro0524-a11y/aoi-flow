// /app/api/cutout/admin/route.ts
import { NextResponse } from "next/server";
import { getAdminDb, requireUserFromAuthHeader } from "@/app/api/_firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CutoutUsageDoc = {
  provider?: unknown;
  engine?: unknown;
  elapsed?: unknown;
  quality?: unknown;
  month?: unknown;
  uid?: unknown;
  createdAt?: { toDate?: () => Date };
};

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const db = getAdminDb();
    const url = new URL(req.url);
    const month = url.searchParams.get("month") || monthKey();

    const usageSnap = await db.collection("users").doc(user.uid).collection("usage").doc(month).get();
    const usageData = usageSnap.exists ? usageSnap.data() || {} : {};

    const eventSnap = await db
      .collection("cutoutUsage")
      .where("uid", "==", user.uid)
      .where("month", "==", month)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const events = eventSnap.docs.map((doc) => {
      const data = doc.data() as CutoutUsageDoc;
      const quality = data.quality && typeof data.quality === "object" ? (data.quality as Record<string, unknown>) : {};
      return {
        id: doc.id,
        provider: String(data.provider || "unknown"),
        engine: String(data.engine || "unknown"),
        quality: asNumber(quality.score),
        elapsed: asNumber(data.elapsed),
        month: String(data.month || month),
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || "",
      };
    });

    const averageQuality =
      events.length > 0 ? Math.round(events.reduce((sum, event) => sum + event.quality, 0) / events.length) : 0;
    const averageElapsed =
      events.length > 0 ? Math.round(events.reduce((sum, event) => sum + event.elapsed, 0) / events.length) : 0;

    return NextResponse.json({
      ok: true,
      month,
      usage: {
        count: asNumber(usageData.count),
        limit: asNumber(usageData.limit),
        month,
      },
      summary: {
        averageQuality,
        averageElapsed,
        totalEvents: events.length,
      },
      events,
    });
  } catch (error) {
    console.error("[CUTOUT_ADMIN_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "切り抜き管理情報を取得できませんでした。" },
      { status: 500 }
    );
  }
}
