// app/api/market/trend/route.ts
// TREND KNOWLEDGE単独API。
// 市場候補ごとに、次に見るべき調査先・検索ワード・観測件数・観測項目を返します。

import { NextResponse } from "next/server";
import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { analyzeMarketResearch, normalizeMarketResearchInput } from "@/lib/vento/marketResearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireUserFromAuthHeader(req);
    const body = (await req.json()) as { input?: unknown };
    const input = normalizeMarketResearchInput(body.input ?? body);
    const result = analyzeMarketResearch(input);

    return NextResponse.json({
      ok: true,
      trendKnowledge: result.trendKnowledge,
      researchPlan: result.trendKnowledge.cards[0]?.researchPlan ?? [],
      searchKeywords: result.trendKnowledge.cards[0]?.searchKeywords ?? [],
      observationTargets: result.trendKnowledge.cards[0]?.observationTargets ?? [],
      nextResearchActions: result.trendKnowledge.cards[0]?.nextResearchActions ?? [],
      missingInformation: result.trendKnowledge.cards[0]?.missingInformation ?? [],
      marketCandidates: result.trendRadar.marketCandidates,
      multiDataIntegration: result.multiDataIntegration,
      domesticDemand: result.marketTheoryEngine.domesticDemand,
      overseasDemand: result.marketTheoryEngine.overseasDemand,
      requiredNextView: "次に何を見るべきかを、調査先・検索ワード・観測件数・観測項目として確認してください。",
    });
  } catch (error) {
    console.error("[MARKET_TREND_API_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "TREND KNOWLEDGE分析に失敗しました。" },
      { status: 500 }
    );
  }
}
