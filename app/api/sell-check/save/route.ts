// /app/api/sell-check/save/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/api/_firebase/admin";
import {
  normalizeCategory,
  normalizeCondition,
  normalizePrice,
} from "@/lib/sellCheck/rules";

export const runtime = "nodejs";

type CleanObject = Record<string, any>;

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n);
}

function safeNonNegativeNumber(v: unknown): number | undefined {
  const n = safeNumber(v);
  if (n === undefined || n < 0) return undefined;
  return n;
}

function safeScore(v: unknown): number | undefined {
  const n = safeNumber(v);
  if (n === undefined) return undefined;
  return Math.max(0, Math.min(100, n));
}

function safeArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];

  return v
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

function cleanObject(obj: CleanObject): CleanObject {
  const out: CleanObject = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      out[key] = value.filter((x) => x !== undefined && x !== null);
      continue;
    }

    if (value && typeof value === "object" && !(value instanceof Date)) {
      out[key] = cleanObject(value);
      continue;
    }

    out[key] = value;
  }

  return out;
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

function normalizeRank(v: unknown): "A" | "B" | "C" | "D" | undefined {
  const s = safeString(v);
  if (s === "A" || s === "B" || s === "C" || s === "D") return s;
  return undefined;
}

function normalizeSellSpeed(v: unknown): string | undefined {
  const s = safeString(v);
  if (
    s === "fast" ||
    s === "normal" ||
    s === "slow" ||
    s === "collector_wait" ||
    s === "unknown"
  ) {
    return s;
  }

  return undefined;
}

function normalizeConfidenceLevel(v: unknown): string | undefined {
  const s = safeString(v);
  if (s === "high" || s === "medium" || s === "low") return s;
  return undefined;
}

function normalizeMarketType(v: unknown): string | undefined {
  const s = safeString(v);
  if (
    s === "normal" ||
    s === "collector" ||
    s === "low_rotation" ||
    s === "competitive" ||
    s === "unknown"
  ) {
    return s;
  }

  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const db = getAdminDb();

    const draftId = safeString(body.draftId);
    const imageUrl = safeString(body.imageUrl);
    const imageSource = safeString(body.imageSource) || "manual";

    const priceRaw = safeNonNegativeNumber(body.price);
    const price = priceRaw !== undefined ? normalizePrice(priceRaw) : undefined;

    const score = safeScore(body.score);
    const suggestedPriceMin = safeNonNegativeNumber(body.suggestedPriceMin);
    const suggestedPriceMax = safeNonNegativeNumber(body.suggestedPriceMax);
    const learnedSampleCount = safeNonNegativeNumber(body.learnedSampleCount);

    const conditionRaw = safeString(body.condition);
    const categoryRaw = safeString(body.category);

    const condition = conditionRaw ? normalizeCondition(conditionRaw) : undefined;
    const category = categoryRaw ? normalizeCategory(categoryRaw) : undefined;

    const title = safeString(body.title);
    const memo = safeString(body.memo);
    const keywords = safeString(body.keywords);

    const rank = normalizeRank(body.rank);

    const action = safeString(body.action);
    const targetSummary = safeString(body.targetSummary);

    const scoreLabel = safeString(body.scoreLabel);
    const rankLabel = safeString(body.rankLabel);
    const sellSpeed = normalizeSellSpeed(body.sellSpeed);
    const sellSpeedLabel = safeString(body.sellSpeedLabel);
    const confidenceLevel = normalizeConfidenceLevel(body.confidenceLevel);
    const confidenceLabel = safeString(body.confidenceLabel);
    const marketType = normalizeMarketType(body.marketType);
    const marketTypeLabel = safeString(body.marketTypeLabel);
    const scoreExplanation = safeString(body.scoreExplanation);

    const improvements = safeArray(body.improvements);
    const reasons = safeArray(body.reasons);

    const nowMs = Date.now();
    const nowDate = new Date();

    if (draftId) {
      const ref = db.collection("drafts").doc(draftId);
      const snap = await ref.get();

      if (!snap.exists) {
        return NextResponse.json(
          { ok: false, error: "下書きが見つかりません" },
          { status: 404 }
        );
      }

      const data = snap.data() || {};
      const owner = typeof data.userId === "string" ? data.userId : "";

      if (!uid) {
        return NextResponse.json(
          { ok: false, error: "ログイン確認が必要です" },
          { status: 401 }
        );
      }

      if (owner && owner !== uid) {
        return NextResponse.json(
          { ok: false, error: "この下書きに保存する権限がありません" },
          { status: 403 }
        );
      }

      const currentOutcome =
        data.outcome && typeof data.outcome === "object" ? data.outcome : {};

      const sellCheck = cleanObject({
        score: score ?? 0,
        rank: rank ?? "C",
        action,

        scoreLabel: scoreLabel || undefined,
        rankLabel: rankLabel || undefined,
        sellSpeed,
        sellSpeedLabel: sellSpeedLabel || undefined,
        confidenceLevel,
        confidenceLabel: confidenceLabel || undefined,
        marketType,
        marketTypeLabel: marketTypeLabel || undefined,
        scoreExplanation: scoreExplanation || undefined,

        suggestedPriceMin: suggestedPriceMin ?? 0,
        suggestedPriceMax: suggestedPriceMax ?? 0,
        improvements,
        reasons,
        learnedSampleCount: learnedSampleCount ?? 0,
        targetSummary,
        checkedAt: nowMs,

        price,
        category,
        condition,
        title: title || undefined,
        memo: memo || undefined,
        keywords: keywords || undefined,

        imageAnalysis: body.imageAnalysis,
        textAnalysis: body.textAnalysis,
        marketAnalysis: body.marketAnalysis,
        similarData: body.similarData,

        /**
         * 少数データ判定
         * 「不足データ」「次に集めるべきデータ」を保存
         */
        smallSampleAnalysis: body.smallSampleAnalysis,

        decisionMode: body.decisionMode,
        decisionModeLabel: body.decisionModeLabel,
        researchGuide: body.researchGuide,
        profitAnalysis: body.profitAnalysis,
        acquisitionAnalysis: body.acquisitionAnalysis,
        actionGuide: body.actionGuide,
        theoryProfile: body.theoryProfile,
        marketStructureAnalysis: body.marketStructureAnalysis,
        priceDistortionAnalysis: body.priceDistortionAnalysis,
        rotationLearningAnalysis: body.rotationLearningAnalysis,
      });

      const nextOutcome = cleanObject({
        ...currentOutcome,
        sellCheck,
        updatedAt: nowMs,
      });

      await ref.set(
        cleanObject({
          outcome: nextOutcome,
          updatedAt: nowDate,
        }),
        { merge: true }
      );
    }

    const diagnosisPayload = cleanObject({
      uid: uid || undefined,
      draftId: draftId || undefined,
      imageUrl: imageUrl || undefined,
      imageSource,

      price,
      condition,
      category,

      title: title || undefined,
      memo: memo || undefined,
      keywords: keywords || undefined,

      score,
      rank,
      action: action || undefined,

      scoreLabel: scoreLabel || undefined,
      rankLabel: rankLabel || undefined,
      sellSpeed,
      sellSpeedLabel: sellSpeedLabel || undefined,
      confidenceLevel,
      confidenceLabel: confidenceLabel || undefined,
      marketType,
      marketTypeLabel: marketTypeLabel || undefined,
      scoreExplanation: scoreExplanation || undefined,

      suggestedPriceMin,
      suggestedPriceMax,
      improvements,
      reasons,
      learnedSampleCount,
      targetSummary: targetSummary || undefined,

      imageAnalysis: body.imageAnalysis,
      textAnalysis: body.textAnalysis,
      marketAnalysis: body.marketAnalysis,
      similarData: body.similarData,

      /**
       * 少数データ判定ログ
       */
      smallSampleAnalysis: body.smallSampleAnalysis,

      decisionMode: body.decisionMode,
      decisionModeLabel: body.decisionModeLabel,
      researchGuide: body.researchGuide,
      profitAnalysis: body.profitAnalysis,
      acquisitionAnalysis: body.acquisitionAnalysis,
      actionGuide: body.actionGuide,
      theoryProfile: body.theoryProfile,
      marketStructureAnalysis: body.marketStructureAnalysis,
      priceDistortionAnalysis: body.priceDistortionAnalysis,
      rotationLearningAnalysis: body.rotationLearningAnalysis,

      hasImage: !!imageUrl || body.hasImage === true,

      isLearningData: false,
      learningNote:
        "診断履歴です。売却実績ではないため sellCheckLogs には保存していません。",

      createdAt: nowDate,
      updatedAt: nowDate,
    });

    await db.collection("sellCheckDiagnosisLogs").add(diagnosisPayload);

    return NextResponse.json({
      ok: true,
      savedToLearningLogs: false,
      savedToDiagnosisLogs: true,
    });
  } catch (e) {
    console.error(e);

    return NextResponse.json(
      { ok: false, error: "保存失敗" },
      { status: 500 }
    );
  }
}