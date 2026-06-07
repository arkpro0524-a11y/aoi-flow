// app/api/market/theory-db/route.ts
// Vento理論DB保存API。
// 市場理論・市場仮説・成功/失敗事例・観測履歴・調査履歴を保存します。

import { NextResponse } from "next/server";
import { getAdminDb, requireUserFromAuthHeader } from "@/app/api/_firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TheoryDbPayload = {
  marketName?: unknown;
  theory?: unknown;
  hypothesis?: unknown;
  successCases?: unknown;
  failureCases?: unknown;
  purchaseReasons?: unknown;
  passReasons?: unknown;
  observationHistory?: unknown;
  researchHistory?: unknown;
  sourceLogId?: unknown;
  status?: unknown;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function arr(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 100);
}

function cleanUndefined(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(cleanUndefined).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const next = cleanUndefined(item);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return value;
}

export async function GET(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const db = getAdminDb();
    const snap = await db.collection("theory_db").where("uid", "==", user.uid).limit(100).get();
    const records = snap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }))
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
    return NextResponse.json({ ok: true, records });
  } catch (error) {
    console.error("[MARKET_THEORY_DB_GET_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "理論DB取得に失敗しました。" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const body = (await req.json()) as { record?: TheoryDbPayload };
    const raw = (body.record && typeof body.record === "object" ? body.record : body) as TheoryDbPayload;
    const now = new Date().toISOString();
    const record = cleanUndefined({
      uid: user.uid,
      marketName: str(raw.marketName) || "未命名市場",
      theory: str(raw.theory),
      hypothesis: str(raw.hypothesis),
      successCases: arr(raw.successCases),
      failureCases: arr(raw.failureCases),
      purchaseReasons: arr(raw.purchaseReasons),
      passReasons: arr(raw.passReasons),
      observationHistory: arr(raw.observationHistory),
      researchHistory: arr(raw.researchHistory),
      sourceLogId: str(raw.sourceLogId),
      status: str(raw.status) || "researching",
      createdAt: now,
      updatedAt: now,
      version: "vento-theory-db-2026-06-final",
    }) as Record<string, unknown>;

    const ref = await getAdminDb().collection("theory_db").add(record);
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error) {
    console.error("[MARKET_THEORY_DB_POST_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "理論DB保存に失敗しました。" },
      { status: 500 }
    );
  }
}
