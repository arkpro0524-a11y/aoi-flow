// app/flow/page.tsx
// AOI FLOW のトップページ。
// `/` からもここへ転送し、起動直後と更新後のトップ表示を統一します。

import FlowHomeLanding from "@/components/FlowHomeLanding";

export default function FlowHomePage() {
  return <FlowHomeLanding />;
}
