// app/api/market/design/route.ts
// DESIGN LEARNING単独API。
// 市場の共通デザイン文法・市場理論・DESIGN SCOREを返します。

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
      designLearning: result.designLearning,
      commonColors: result.designLearning.commonColors,
      commonShapes: result.designLearning.commonShapes,
      commonMaterials: result.designLearning.commonMaterials,
      commonWorldviews: result.designLearning.commonWorldviews,
      commonStories: result.designLearning.commonStories,
      designGrammar: result.designLearning.designGrammar,
      designScore: result.designScore,
      marketTheory: result.designLearning.marketTheory,
      storedTheoryNote: result.designLearning.storedTheoryNote,
    });
  } catch (error) {
    console.error("[MARKET_DESIGN_API_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "DESIGN LEARNING分析に失敗しました。" },
      { status: 500 }
    );
  }
}
