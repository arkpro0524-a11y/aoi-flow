// app/api/market/card/route.ts
// 市場カードAPIの新しい正式導線。
// 既存 /api/market-cards を削除せず、そのまま再利用します。

export { GET, POST, PUT, DELETE, runtime, dynamic } from "../../market-cards/route";
