// app/api/sell-check/save/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/api/_firebase/admin";

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
    .slice(0, 20);
}

function cleanObject(obj: CleanObject): CleanObject {
  const out: CleanObject = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      out[key] = value.filter((x) => x !== undefined);
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

export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const db = getAdminDb();

    const draftId = safeString(body.draftId);
    const imageUrl = safeString(body.imageUrl);
    const imageSource = safeString(body.imageSource) || "manual";

    const price = safeNonNegativeNumber(body.price);
    const score = safeScore(body.score);
    const suggestedPriceMin = safeNonNegativeNumber(body.suggestedPriceMin);
    const suggestedPriceMax = safeNonNegativeNumber(body.suggestedPriceMax);
    const learnedSampleCount = safeNonNegativeNumber(body.learnedSampleCount);

    const condition = safeString(body.condition);
    const category = safeString(body.category);

    // ★追加（既存そのまま）
    const soldPrice = safeNonNegativeNumber(body.soldPrice);

    const rankRaw = safeString(body.rank);
    const rank =
      rankRaw === "A" || rankRaw === "B" || rankRaw === "C" || rankRaw === "D"
        ? rankRaw
        : undefined;

    const action = safeString(body.action);
    const targetSummary = safeString(body.targetSummary);

    const improvements = safeArray(body.improvements);
    const reasons = safeArray(body.reasons);

    const nowMs = Date.now();
    const nowDate = new Date();

    let owner = "";

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
      owner = typeof data.userId === "string" ? data.userId : "";

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
        suggestedPriceMin: suggestedPriceMin ?? 0,
        suggestedPriceMax: suggestedPriceMax ?? 0,
        improvements,
        reasons,
        learnedSampleCount: learnedSampleCount ?? 0,
        checkedAt: nowMs,
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

    // 🔥ここが今回の追加（AI結果保存）
    const logPayload = cleanObject({
      uid: uid || undefined,
      draftId: draftId || undefined,
      imageUrl: imageUrl || undefined,
      imageSource,

      price,
      soldPrice,

      condition: condition || undefined,
      category: category || undefined,

      score,
      rank,
      action: action || undefined,
      suggestedPriceMin,
      suggestedPriceMax,
      improvements,
      reasons,
      learnedSampleCount,
      targetSummary: targetSummary || undefined,

      // 👇追加（重要）
      imageAnalysis: body.imageAnalysis,
      textAnalysis: body.textAnalysis,
      similarData: body.similarData,

      hasImage: !!imageUrl || body.hasImage === true,
      sold: body.sold === true,

      createdAt: nowDate,
      updatedAt: nowDate,
    });

    await db.collection("sellCheckLogs").add(logPayload);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);

    return NextResponse.json(
      { ok: false, error: "保存失敗" },
      { status: 500 }
    );
  }
}