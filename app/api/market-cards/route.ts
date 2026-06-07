// app/api/market-cards/route.ts
// TREND KNOWLEDGEの市場カードを保存・編集・一覧表示するAPIです。

import { NextResponse } from "next/server";
import { getAdminDb, requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { analyzeMarketResearch, normalizeMarketCard } from "@/lib/vento/marketResearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(clean).filter((item) => item !== undefined);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const next = clean(item);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return value;
}

function cardToResearchInput(card: ReturnType<typeof normalizeMarketCard>) {
  const lines = [
    card.marketName,
    String(card.domesticDemand ?? ""),
    String(card.overseasDemand ?? ""),
    ...(Array.isArray(card.researchSources) ? card.researchSources : []),
    ...(Array.isArray(card.searchWords) ? card.searchWords : []),
    ...(Array.isArray(card.observationItems) ? card.observationItems : []),
    card.hypothesis,
    card.theory,
    ...(Array.isArray(card.evidence) ? card.evidence : []),
    ...(Array.isArray(card.missingInfo) ? card.missingInfo : []),
  ]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

  return {
    theme: card.marketName || "未命名市場",
    sourceText: lines.join("\n"),
    visualNotes: [card.theory, card.hypothesis].filter(Boolean).join("\n"),
    productCandidates: Array.isArray(card.searchWords) ? card.searchWords.join("\n") : "",
    sourceNotes: Array.isArray(card.researchSources) ? card.researchSources.join("\n") : "",
    budget: 0,
    imageNames: [],
  };
}

async function saveLinkedMarketResearch(args: {
  db: ReturnType<typeof getAdminDb>;
  uid: string;
  cardId: string;
  card: ReturnType<typeof normalizeMarketCard>;
  now: string;
}) {
  const { db, uid, cardId, card, now } = args;
  const result = analyzeMarketResearch(cardToResearchInput(card));
  const firstTrend = result.trendKnowledge.cards[0];
  const theory = result.marketTheoryEngine;
  const design = result.designLearning;

  const common = {
    uid,
    marketCardId: cardId,
    marketName: card.marketName || firstTrend?.marketName || "未命名市場",
    domesticDemand: result.domesticDemand,
    overseasDemand: result.overseasDemand,
    updatedAt: now,
    version: "vento-market-linkage-2026-06-final",
  };

  await Promise.all([
    db.collection("trend_knowledge_cards").doc(cardId).set(
      clean({
        ...common,
        researchPlan: firstTrend?.researchPlan ?? card.researchPlan ?? [],
        searchKeywords: firstTrend?.searchKeywords ?? card.searchKeywords ?? card.searchWords ?? [],
        observationTargets: firstTrend?.observationTargets ?? card.observationTargets ?? card.observationItems ?? [],
        nextResearchActions: firstTrend?.nextResearchActions ?? card.nextResearchActions ?? [],
        missingInformation: firstTrend?.missingInformation ?? card.missingInformation ?? card.missingInfo ?? [],
        hypothesis: card.hypothesis,
      }) as Record<string, unknown>,
      { merge: true }
    ),
    db.collection("market_theories").doc(cardId).set(
      clean({
        ...common,
        marketExistenceScore: theory.marketExistenceScore,
        marketFormationScore: theory.marketFormationScore,
        dataJudgement: theory.dataJudgement,
        theoryJudgement: theory.theoryJudgement,
        evidence: theory.evidence,
        missingEvidence: theory.missingEvidence,
        seriesScore: theory.seriesScore,
        storyScore: theory.storyScore,
        worldviewScore: theory.worldviewScore,
        collectorScore: theory.collectorScore,
        communityScore: theory.communityScore,
        searchCultureScore: theory.searchCultureScore,
        snsScore: theory.snsScore,
        youtubeScore: theory.youtubeScore,
        redditScore: theory.redditScore,
        overseasDistributionScore: theory.overseasDistributionScore,
        marketTheory: theory.marketTheory,
      }) as Record<string, unknown>,
      { merge: true }
    ),
    db.collection("design_learning").doc(cardId).set(
      clean({
        ...common,
        commonColors: design.commonColors,
        commonShapes: design.commonShapes,
        commonMaterials: design.commonMaterials,
        commonWorldviews: design.commonWorldviews,
        commonStories: design.commonStories,
        designGrammar: design.designGrammar,
        marketTheory: design.marketTheory,
        designScore: result.designScore,
      }) as Record<string, unknown>,
      { merge: true }
    ),
    db.collection("theory_db").doc(cardId).set(
      clean({
        ...common,
        marketTheory: design.marketTheory || theory.marketTheory,
        designGrammar: design.designGrammar,
        marketExistenceScore: theory.marketExistenceScore,
        marketFormationScore: theory.marketFormationScore,
        researchHistory: [
          `TREND KNOWLEDGE保存時に MARKET THEORY ENGINE / DESIGN LEARNING を自動実行: ${now}`,
        ],
        evidence: theory.evidence,
        missingEvidence: theory.missingEvidence,
      }) as Record<string, unknown>,
      { merge: true }
    ),
  ]);

  return {
    marketExistenceScore: theory.marketExistenceScore,
    marketFormationScore: theory.marketFormationScore,
    dataJudgement: theory.dataJudgement,
    theoryJudgement: theory.theoryJudgement,
    designGrammar: design.designGrammar,
    marketTheory: design.marketTheory || theory.marketTheory,
    commonWorldviews: design.commonWorldviews,
    commonStories: design.commonStories,
  };
}

export async function GET(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const db = getAdminDb();
    // Firestoreの複合インデックス未作成でも動くように、
    // 取得時はuidだけで絞り込み、並び替えはアプリ側で行います。
    // これにより「FAILED_PRECONDITION: The query requires an index」を避けます。
    const snap = await db
      .collection("vento_market_cards")
      .where("uid", "==", user.uid)
      .limit(100)
      .get();

    const cards = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }))
      .sort((a, b) => {
        const aTime = typeof a.updatedAt === "string" ? a.updatedAt : "";
        const bTime = typeof b.updatedAt === "string" ? b.updatedAt : "";
        return bTime.localeCompare(aTime);
      });

    return NextResponse.json({ ok: true, cards });
  } catch (error) {
    console.error("[MARKET_CARDS_GET_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "市場カード一覧の取得に失敗しました。" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const body = (await req.json()) as { card?: unknown };
    const card = normalizeMarketCard(body.card);
    const now = new Date().toISOString();
    const db = getAdminDb();
    const ref = await db.collection("vento_market_cards").add(
      clean({
        uid: user.uid,
        ...card,
        createdAt: now,
        updatedAt: now,
        version: "trend-knowledge-card-2026-06",
      }) as Record<string, unknown>
    );
    const linked = await saveLinkedMarketResearch({ db, uid: user.uid, cardId: ref.id, card, now });
    return NextResponse.json({ ok: true, id: ref.id, linked });
  } catch (error) {
    console.error("[MARKET_CARDS_POST_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "市場カード保存に失敗しました。" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const body = (await req.json()) as { id?: unknown; card?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) throw new Error("市場カードIDがありません。");

    const db = getAdminDb();
    const ref = db.collection("vento_market_cards").doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.uid !== user.uid) throw new Error("編集できない市場カードです。");

    const card = normalizeMarketCard(body.card);
    const now = new Date().toISOString();
    await ref.set(
      clean({
        ...card,
        uid: user.uid,
        updatedAt: now,
      }) as Record<string, unknown>,
      { merge: true }
    );
    const linked = await saveLinkedMarketResearch({ db, uid: user.uid, cardId: id, card, now });

    return NextResponse.json({ ok: true, id, linked });
  } catch (error) {
    console.error("[MARKET_CARDS_PUT_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "市場カード編集に失敗しました。" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const body = (await req.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) throw new Error("市場カードIDがありません。");

    const db = getAdminDb();
    const ref = db.collection("vento_market_cards").doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.uid !== user.uid) throw new Error("削除できない市場カードです。");

    await ref.delete();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[MARKET_CARDS_DELETE_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "市場カード削除に失敗しました。" },
      { status: 500 }
    );
  }
}
