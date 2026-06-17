// components/FlowDashboardShell.tsx
// 共通サイドバーを使うための薄いレイアウトです。
// 中身のページ機能は一切作り替えず、左余白と背景だけを担当します。

"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/firebase";
import UnifiedFlowSidebar from "@/components/UnifiedFlowSidebar";

export default function FlowDashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  async function logout() {
    if (auth) await signOut(auth);
    router.replace("/login");
  }

  return (
    <div style={{ minHeight: "100vh", color: "white", background: "#061523" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <img src="/flow-bg-tech1.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.82 }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(2,8,20,0.74), rgba(4,18,31,0.46), rgba(2,8,20,0.72))" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 74% 22%, rgba(45,212,191,0.16), transparent 34%)" }} />
      </div>

      <UnifiedFlowSidebar onLogout={logout} />

      <main className="flowMainContent" style={{ position: "relative", zIndex: 1, marginLeft: 244, padding: "20px 28px 36px" }}>
        {children}
      </main>
    </div>
  );
}
