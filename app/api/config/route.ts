// /app/api/config/route.ts
import { NextResponse } from "next/server";
import { PRICING } from "@/lib/server/pricing";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    pricing: PRICING.public(),
  });
}