// /app/flow/layout.tsx
// /flow 配下の共通レイアウト。
//
// 重要：
// - `/flow` トップは白いホーム画面をそのまま表示します。
// - `/flow/market-research` は市場研究ラボ自身が共通サイドバーを持ちます。
// - それ以外の作業画面は FlowDashboardShell で共通サイドバーを付けます。
// - 既存の各ページ機能そのものはここでは触りません。

"use client";

import React from "react";
import { usePathname } from "next/navigation";
import FlowDashboardShell from "@/components/FlowDashboardShell";

function Inner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/flow" || pathname === "/flow/market-research") {
    return <>{children}</>;
  }

  return <FlowDashboardShell>{children}</FlowDashboardShell>;
}

export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return <Inner>{children}</Inner>;
}
