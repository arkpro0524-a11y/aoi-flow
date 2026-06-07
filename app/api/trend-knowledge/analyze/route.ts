// app/api/trend-knowledge/analyze/route.ts
// TREND KNOWLEDGE強化API。
// 市場ごとに「次に何を見るべきか」を researchPlan / searchKeywords / observationTargets / nextResearchActions / missingInformation として返します。

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
    const cards = result.trendKnowledge.cards.map((card) => ({
      ...card,
      researchPlan: card.researchPlan,
      searchKeywords: card.searchKeywords,
      observationTargets: card.observationTargets,
      nextResearchActions: card.nextResearchActions,
      missingInformation: card.missingInformation,
      domesticDemand: card.domesticDemand,
      overseasDemand: card.overseasDemand,
    }));

    return NextResponse.json({
      ok: true,
      cards,
      researchPlan: cards[0]?.researchPlan ?? [],
      searchKeywords: cards[0]?.searchKeywords ?? [],
      observationTargets: cards[0]?.observationTargets ?? [],
      nextResearchActions: cards[0]?.nextResearchActions ?? [],
      missingInformation: cards[0]?.missingInformation ?? [],
      domesticDemand: result.domesticDemand,
      overseasDemand: result.overseasDemand,
    });
  } catch (error) {
    console.error("[TREND_KNOWLEDGE_ANALYZE_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "TREND KNOWLEDGE分析に失敗しました。" },
      { status: 500 }
    );
  }
}
