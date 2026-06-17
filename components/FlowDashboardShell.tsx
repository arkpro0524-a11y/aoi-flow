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
    <div className="flowDashboardRoot" style={{ minHeight: "100vh", color: "white", background: "#061523" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <img src="/flow-bg-tech1.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.82 }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(2,8,20,0.74), rgba(4,18,31,0.46), rgba(2,8,20,0.72))" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 74% 22%, rgba(45,212,191,0.16), transparent 34%)" }} />
      </div>

      <UnifiedFlowSidebar onLogout={logout} />

      <main className="flowDashboardMain" style={{ position: "relative", zIndex: 1 }}>
        {children}
      </main>

      <style jsx global>{`
        .flowDashboardMain {
          margin-left: 244px;
          padding: 20px 28px 36px;
          width: calc(100% - 244px);
          max-width: calc(100vw - 244px);
          overflow-x: clip;
        }

        .flowDashboardMain *,
        .flowMarketMain * {
          box-sizing: border-box;
          min-width: 0;
        }

        .flowDashboardMain img,
        .flowMarketMain img,
        .flowDashboardMain video,
        .flowMarketMain video,
        .flowDashboardMain canvas,
        .flowMarketMain canvas {
          max-width: 100%;
        }

        @media (max-width: 980px) {
          .flowDashboardMain {
            margin-left: 0;
            width: 100%;
            max-width: 100vw;
            padding: 12px 10px 24px;
            overflow-x: hidden;
          }
        }


        @media (max-width: 980px) {
          .flowDashboardRoot {
            width: 100vw !important;
            max-width: 100vw !important;
            overflow-x: hidden !important;
          }

          .flowDashboardMain [style*="grid-template-columns"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .flowDashboardMain [style*="width:"] {
            max-width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
