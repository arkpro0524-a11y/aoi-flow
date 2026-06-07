// app/api/market/fusion/route.ts
// 複数データ統合API。
// 単画像分析に寄せず、Google画像/eBay/Reddit/YouTube/SNS/記事などを統合して市場候補と理論を返します。

import { NextResponse } from "next/server";
import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { fuseMarketSignals, type MarketFusionInput } from "@/lib/marketFusion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireUserFromAuthHeader(req);
    const body = (await req.json()) as { input?: MarketFusionInput } & MarketFusionInput;
    const input = (body.input && typeof body.input === "object" ? body.input : body) as MarketFusionInput;
    const result = fuseMarketSignals(input);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[MARKET_FUSION_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "複数データ統合に失敗しました。" },
      { status: 500 }
    );
  }
}
