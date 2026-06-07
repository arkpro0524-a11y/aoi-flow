// app/api/market/card/route.ts
// 市場カードAPIの新しい正式導線。
// 既存 /api/market-cards を削除せず、そのまま再利用します。
// Next.js の Route Segment Config（runtime / dynamic）は再exportできないため、
// このファイル内で直接定義します。

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { GET, POST, PUT, DELETE } from "../../market-cards/route";
