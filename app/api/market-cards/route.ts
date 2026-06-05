// app/api/market-cards/route.ts
// TREND KNOWLEDGEの市場カードを保存・編集・一覧表示するAPIです。

import { NextResponse } from "next/server";
import { getAdminDb, requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { normalizeMarketCard } from "@/lib/vento/marketResearch";

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
    return NextResponse.json({ ok: true, id: ref.id });
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
    await ref.set(
      clean({
        ...card,
        uid: user.uid,
        updatedAt: new Date().toISOString(),
      }) as Record<string, unknown>,
      { merge: true }
    );

    return NextResponse.json({ ok: true, id });
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
