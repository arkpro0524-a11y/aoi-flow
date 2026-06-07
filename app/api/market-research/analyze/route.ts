// app/api/market-research/analyze/route.ts
// Vento 市場調査OSの分析API。
// ユーザーが投入した記事・スクショ・商品候補から、
// TREND RADAR / TREND KNOWLEDGE / PRODUCT SELECTOR / SOURCE CHECK を一括で返します。

import { NextResponse } from "next/server";
import { requireUserFromAuthHeader, getAdminDb } from "@/app/api/_firebase/admin";
import {
  analyzeMarketResearch,
  normalizeMarketCard,
  normalizeMarketResearchInput,
} from "@/lib/vento/marketResearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const body = (await req.json()) as { input?: unknown; save?: boolean };

    const input = normalizeMarketResearchInput(body.input);
    const result = analyzeMarketResearch(input);

    let savedLogId: string | undefined;
    let savedKnowledgeIds: string[] = [];
    let savedMarketCardIds: string[] = [];
    let savedTheoryId: string | undefined;

    // 何も入力されていない場合でも、画面の説明として結果を返せるようにします。
    // ただし保存は入力がある場合だけ行います。
    const hasInput =
      input.theme ||
      input.sourceText ||
      input.visualNotes ||
      input.productCandidates ||
      input.sourceNotes ||
      input.imageNames.length > 0;

    if (body.save !== false && hasInput) {
      const db = getAdminDb();
      const now = new Date().toISOString();

      const logRef = await db.collection("market_research_logs").add({
        uid: user.uid,
        input,
        result,
        createdAt: now,
        updatedAt: now,
        version: "vento-market-research-os-2026-06",
      });

      savedLogId = logRef.id;

      const writes = result.trendKnowledge.cards.map(async (card) => {
        const ref = await db.collection("trend_knowledge_cards").add({
          uid: user.uid,
          sourceLogId: logRef.id,
          ...card,
          createdAt: now,
          updatedAt: now,
          researchPlan: card.researchPlan,
          searchKeywords: card.searchKeywords,
          observationTargets: card.observationTargets,
          nextResearchActions: card.nextResearchActions,
          missingInformation: card.missingInformation,
          version: "trend-knowledge-2026-06",
        });
        return ref.id;
      });

      savedKnowledgeIds = await Promise.all(writes);

      // TREND KNOWLEDGE画面で編集・一覧表示できる「市場カード」も同時保存します。
      // 旧trend_knowledge_cardsは残しつつ、新しい市場研究レイヤー用のvento_market_cardsを追加するだけです。
      const observationItems = result.trendKnowledge.observationPlans.flatMap((plan) => plan.observationItems);
      const marketCardWrites = result.trendKnowledge.cards.map(async (card) => {
        const marketCard = normalizeMarketCard({
          marketName: card.marketName,
          domesticDemand: card.domesticDemand,
          overseasDemand: card.overseasDemand,
          researchSources: card.nextResearch,
          searchWords: card.searchWords,
          observationItems,
          hypothesis: card.summary,
          theory: result.designLearning.marketTheory || result.marketTheoryEngine.marketTheory,
          evidence: card.theoryReasons,
          missingInfo: card.missingData,
          status: card.integratedJudgement === "見送り" ? "pass" : card.integratedJudgement === "有望" ? "validated" : "researching",
          updatedAt: now,
        });

        const ref = await db.collection("vento_market_cards").add({
          uid: user.uid,
          sourceLogId: logRef.id,
          ...marketCard,
          createdAt: now,
          version: "vento-market-card-2026-06",
        });
        return ref.id;
      });

      savedMarketCardIds = await Promise.all(marketCardWrites);

      const theoryPayload = {
        uid: user.uid,
        sourceLogId: logRef.id,
        marketExistenceScore: result.marketTheoryEngine.marketExistenceScore,
        marketFormationScore: result.marketTheoryEngine.marketFormationScore,
        dataJudgement: result.marketTheoryEngine.dataJudgement,
        theoryJudgement: result.marketTheoryEngine.theoryJudgement,
        evidence: result.marketTheoryEngine.evidence,
        missingEvidence: result.marketTheoryEngine.missingEvidence,
        domesticDemand: result.marketTheoryEngine.domesticDemand,
        overseasDemand: result.marketTheoryEngine.overseasDemand,
        marketTheoryEngine: result.marketTheoryEngine,
        designLearning: result.designLearning,
        designScore: result.designScore,
        marketFormation: result.marketFormation,
        multiDataIntegration: result.multiDataIntegration,
        sourceCheck: result.sourceCheck,
        createdAt: now,
        updatedAt: now,
        version: "vento-market-theory-engine-2026-06",
      };
      const theoryRef = await db.collection("market_theories").add(theoryPayload);
      await db.collection("vento_market_theories").add(theoryPayload);

      await db.collection("design_learning").add({
        uid: user.uid,
        sourceLogId: logRef.id,
        commonColors: result.designLearning.commonColors,
        commonShapes: result.designLearning.commonShapes,
        commonMaterials: result.designLearning.commonMaterials,
        commonWorldviews: result.designLearning.commonWorldviews,
        commonStories: result.designLearning.commonStories,
        designGrammar: result.designLearning.designGrammar,
        marketTheory: result.designLearning.marketTheory,
        designScore: result.designScore,
        domesticDemand: result.domesticDemand,
        overseasDemand: result.overseasDemand,
        createdAt: now,
        updatedAt: now,
        version: "design-learning-2026-06",
      });

      await db.collection("theory_db").add({
        uid: user.uid,
        sourceLogId: logRef.id,
        marketName: result.trendKnowledge.cards[0]?.marketName ?? "未命名市場",
        marketTheory: result.designLearning.marketTheory || result.marketTheoryEngine.marketTheory,
        marketHypothesis: result.trendKnowledge.cards[0]?.summary ?? "",
        successCases: [],
        failureCases: [],
        purchaseReasons: result.sellCheckUpgradePreview.buyConditions,
        passReasons: result.sellCheckUpgradePreview.passConditions,
        researchHistory: result.trendKnowledge.cards[0]?.nextResearchActions ?? [],
        observationHistory: result.trendKnowledge.observationPlans.map((plan) => `${plan.sourceName}: ${plan.targetCount}件`),
        createdAt: now,
        updatedAt: now,
        version: "theory-db-2026-06",
      });

      savedTheoryId = theoryRef.id;
    }

    return NextResponse.json({
      ok: true,
      result,
      savedLogId,
      savedKnowledgeIds,
      savedMarketCardIds,
      savedTheoryId,
    });
  } catch (error) {
    console.error("[MARKET_RESEARCH_ANALYZE_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "市場調査の分析に失敗しました。",
      },
      { status: 500 }
    );
  }
}
