// app/api/source-check/analyze/route.ts
// 商品ではなく出品者/供給源を見るSOURCE CHECK APIです。

import { NextResponse } from "next/server";
import { getAdminDb, requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { buildSourceCheck, normalizeSourceCheckInput } from "@/lib/vento/marketResearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const body = (await req.json()) as { input?: unknown; save?: boolean };
    const input = normalizeSourceCheckInput(body.input);
    const result = buildSourceCheck(input);

    let savedId = "";
    const hasInput = Boolean(input.sellerScreenshotNotes || input.listingText || input.itemDescription);
    if (body.save !== false && hasInput) {
      const now = new Date().toISOString();
      const ref = await getAdminDb().collection("vento_source_checks").add({
        uid: user.uid,
        input,
        result,
        createdAt: now,
        updatedAt: now,
        version: "source-check-2026-06",
      });
      savedId = ref.id;
    }

    return NextResponse.json({ ok: true, result, savedId });
  } catch (error) {
    console.error("[SOURCE_CHECK_ANALYZE_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "SOURCE CHECKに失敗しました。" },
      { status: 500 }
    );
  }
}
