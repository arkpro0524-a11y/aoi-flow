// /components/Footer.tsx
"use client";

/** 
 * ─────────────────────────────────────────────
 * 目的：
 * - ログイン画面で「横に走る帯（border-top）」が出るのを完全に消す
 *
 * 方針（固定）：
 * - 構造を増やさない（layout分岐/Provider追加なし）
 * - 既存Footerは維持しつつ、特定パスで非表示にするだけ
 */

import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();

  // ✅ /login と /flow 配下はフッターを出さない（完成イメージと一致させる）
  // - /login：背景 + 中央カードのみ
  // - /flow：FlowShell が画面を担当（フッターは邪魔）
  if (pathname === "/login" || pathname.startsWith("/flow")) return null;

  return (
    <footer className="mt-10 border-t border-white/10">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 text-xs text-white/50">
        © AOI FLOW
      </div>
    </footer>
  );
}