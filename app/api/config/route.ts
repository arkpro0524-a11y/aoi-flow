// /app/api/config/route.ts
/**
 * /api/config（フロント互換の受け皿）
 * --------------------------------------------
 * 目的：
 * - フロントが GET /api/config を叩く前提を崩さずに 405 を消す
 * - 返す中身は「壊れない最低限 + 将来拡張しやすい形」
 *
 * 方針：
 * - GET: 200 で JSON を返す（キャッシュしない）
 * - OPTIONS: CORS/プリフライト対策（必要な環境だけ）
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function boolEnv(v: string | undefined, fallback = false) {
  if (v == null) return fallback;
  return String(v).toLowerCase() === "true";
}

export async function GET() {
  // ※「フロントを変えない」が最優先なので、ここは堅牢に “常に200” を返す
  return NextResponse.json(
    {
      ok: true,
      // ありがちなフロント期待値に寄せた “安全な形”
      env: {
        USE_REPLACE_BG_MOCK: boolEnv(process.env.USE_REPLACE_BG_MOCK, false),
        USE_REPLACE_BG_MOCK_V2: boolEnv(process.env.USE_REPLACE_BG_MOCK_V2, false),
        USE_REPLACE_BG_MOCK_V3: boolEnv(process.env.USE_REPLACE_BG_MOCK_V3, false),
      },
      // 将来ここに pricing / featureFlags を足せる
      featureFlags: {},
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

// 必要な環境でプリフライトが飛ぶ場合があるので保険
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}