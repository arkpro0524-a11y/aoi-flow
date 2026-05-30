// app/api/sell-check/stats/route.ts
// 売れる診断 学習状況API
// 既存の sellCheckLogs 集計を維持しつつ、平均スコア計算を安全化

import { NextResponse } from "next/server";
import { getAdminDb } from "@/app/api/_firebase/admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = getAdminDb();

    const snap = await db
      .collection("sellCheckLogs")
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();

    let total = 0;
    let sold = 0;
    let scoreCount = 0;
    let totalScore = 0;
    let withImage = 0;

    const categoryCounts: Record<string, number> = {};

    snap.docs.forEach((doc) => {
      const data = doc.data();

      total += 1;

      if (data.sold === true) sold += 1;

      if (typeof data.score === "number" && Number.isFinite(data.score)) {
        totalScore += data.score;
        scoreCount += 1;
      }

      if (data.hasImage === true || typeof data.imageUrl === "string") {
        withImage += 1;
      }

      const category =
        typeof data.category === "string" && data.category.trim()
          ? data.category.trim()
          : "other";

      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });

    return NextResponse.json({
      ok: true,
      stats: {
        total,
        sold,
        unsold: Math.max(0, total - sold),
        averageScore: scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0,
        withImage,
        categoryCounts,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: "学習状況の取得に失敗しました",
      },
      { status: 500 }
    );
  }
}