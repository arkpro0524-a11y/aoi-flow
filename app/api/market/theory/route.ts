// app/api/market/theory/route.ts
// MARKET THEORY ENGINE単独API。
// データ不足時でも市場存在性を10項目×3点=30点満点で説明します。

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
      marketTheoryEngine: result.marketTheoryEngine,
      marketExistenceScore: result.marketTheoryEngine.marketExistenceScore,
      marketFormationScore: result.marketTheoryEngine.marketFormationScore,
      dataJudgement: result.marketTheoryEngine.dataJudgement,
      theoryJudgement: result.marketTheoryEngine.theoryJudgement,
      evidence: result.marketTheoryEngine.evidence,
      missingEvidence: result.marketTheoryEngine.missingEvidence,
      domesticDemand: result.marketTheoryEngine.domesticDemand,
      overseasDemand: result.marketTheoryEngine.overseasDemand,
      marketFormation: result.marketFormation,
      missingInfo: result.marketTheoryEngine.missingInformation,
      reasons: result.marketTheoryEngine.scoreReasons,
    });
  } catch (error) {
    console.error("[MARKET_THEORY_API_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "MARKET THEORY ENGINE分析に失敗しました。" },
      { status: 500 }
    );
  }
}
