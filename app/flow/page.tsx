// /app/flow/page.tsx
// AOI FLOW の /flow 入口ページ
// 現在の既存仕様を維持：/flow に来たら下書き一覧へ移動する

import { redirect } from "next/navigation";

export default function FlowIndexPage() {
  redirect("/flow/drafts");
}