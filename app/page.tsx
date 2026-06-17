// app/page.tsx
// AOI FLOW の入口ページ。
// `/` と `/flow` のトップ表示ズレをなくすため、入口は `/flow` に統一します。

import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/flow");
}
