// app/api/market/source/route.ts
// SOURCE CHECK単独API。
// 商品ではなく、出品者・供給源の価値を評価します。

import { NextResponse } from "next/server";
import { getAdminDb, requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { buildSourceCheck, normalizeSourceCheckInput } from "@/lib/vento/marketResearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const body = (await req.json()) as { input?: unknown; save?: boolean };
    const input = normalizeSourceCheckInput(body.input ?? body);
    const result = buildSourceCheck(input);

    let savedId = "";
    const hasInput = Boolean(input.sellerScreenshotNotes || input.listingText || input.itemDescription);
    if (body.save !== false && hasInput) {
      const now = new Date().toISOString();
      const ref = await getAdminDb().collection("source_checks").add({
        uid: user.uid,
        input,
        result,
        supplyPotential: result.supplyPotential,
        repeatSupply: result.repeatSupply,
        warehousePotential: result.warehousePotential,
        deadStockPotential: result.deadStockPotential,
        bundlePotential: result.bundlePotential,
        contactValue: result.contactValue,
        domesticDemand: "供給源の国内需要は商品・地域・配送条件から別途確認してください。",
        overseasDemand: "供給源の海外需要はeBay/海外発送適性と分けて確認してください。",
        createdAt: now,
        updatedAt: now,
        version: "market-source-check-2026-06-final",
      });
      savedId = ref.id;
    }

    return NextResponse.json({
      ok: true,
      result,
      supplyPotential: result.supplyPotential,
      repeatSupply: result.repeatSupply,
      warehousePotential: result.warehousePotential,
      deadStockPotential: result.deadStockPotential,
      bundlePotential: result.bundlePotential,
      contactValue: result.contactValue,
      domesticDemand: "供給源の国内需要は商品・地域・配送条件から別途確認してください。",
      overseasDemand: "供給源の海外需要はeBay/海外発送適性と分けて確認してください。",
      savedId,
    });
  } catch (error) {
    console.error("[MARKET_SOURCE_API_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "SOURCE CHECK分析に失敗しました。" },
      { status: 500 }
    );
  }
}
