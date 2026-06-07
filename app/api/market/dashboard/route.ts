// app/api/market/dashboard/route.ts
// 市場研究ダッシュボードAPI。
// 既存機能は削除せず、保存済み市場カードの状態を集計して返します。

import { NextResponse } from "next/server";
import { getAdminDb, requireUserFromAuthHeader } from "@/app/api/_firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MarketCardRecord = Record<string, unknown> & { id: string };

function statusOf(card: MarketCardRecord): string {
  return String(card.status ?? "researching").trim();
}

function scoreOf(card: MarketCardRecord): number {
  const raw = Number(card.marketFormationScore ?? card.ventoFitScore ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

export async function GET(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const db = getAdminDb();
    const snap = await db.collection("vento_market_cards").where("uid", "==", user.uid).limit(200).get();
    const cards = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as MarketCardRecord));

    const validatedCount = cards.filter((card) => statusOf(card) === "validated").length;
    const watchCount = cards.filter((card) => statusOf(card) === "watch").length;
    const passCount = cards.filter((card) => statusOf(card) === "pass").length;
    const topMarkets = cards
      .slice()
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, 8)
      .map((card) => ({
        id: card.id,
        marketName: String(card.marketName ?? "未命名市場"),
        status: statusOf(card),
        marketFormationScore: scoreOf(card),
        domesticDemand: String(card.domesticDemand ?? "未確認"),
        overseasDemand: String(card.overseasDemand ?? "未確認"),
        updatedAt: String(card.updatedAt ?? ""),
      }));

    return NextResponse.json({
      ok: true,
      marketCardsCount: cards.length,
      validatedCount,
      watchCount,
      passCount,
      topMarkets,
    });
  } catch (error) {
    console.error("[MARKET_DASHBOARD_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "市場研究ダッシュボード取得に失敗しました。" },
      { status: 500 }
    );
  }
}
