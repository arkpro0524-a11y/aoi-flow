// /components/FlowShell.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import React from "react";

type Props = { user: User | null; onLogout: () => Promise<void>; children: React.ReactNode };
function cx(...xs: (string | false | undefined)[]) { return xs.filter(Boolean).join(" "); }

export default function FlowShell({ user, onLogout, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // ✅ ここが“根本修正”：固定px → clamp()（スマホで小さく、PCで大きく）
  const S = {
    LOGO: "clamp(56px, 14vw, 96px)",
    TITLE: "clamp(22px, 6vw, 44px)",
    SUB: "clamp(12px, 3.4vw, 18px)",
    TAB_FZ: "clamp(14px, 4.2vw, 22px)",
    TAB_PY: "clamp(10px, 2.8vw, 16px)",
    TAB_PX: "clamp(14px, 4.8vw, 28px)",
    LOGOUT_FZ: "clamp(12px, 3.5vw, 14px)",
    LOGOUT_PY: "clamp(10px, 2.8vw, 16px)",
    LOGOUT_PX: "clamp(14px, 4.0vw, 18px)",
  } as const;

  const Tab = ({ href, label }: { href: string; label: string }) => {
    const active = isActive(href);
    return (
      <Link
        href={href}
        className={cx("no-underline transition")}
        style={{
          fontSize: S.TAB_FZ,
          fontWeight: 900,
          lineHeight: 1,
          padding: `${S.TAB_PY} ${S.TAB_PX}`,
          borderRadius: 9999,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          whiteSpace: "nowrap",
          color: active ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.78)",
          background: active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)",
          border: active
            ? "1px solid rgba(255,255,255,0.18)"
            : "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 9999,
            background: active ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.45)",
            flex: "0 0 auto",
          }}
        />
        {label}
      </Link>
    );
  };

  async function logout() {
    await onLogout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen text-white">
      {/* 暗視背景（黒寄せ） */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#05070c]" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/6 via-transparent to-black/35" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.07),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.05),transparent_40%)]" />
      </div>

      {/* ヘッダー */}
      <header className="sticky top-0 z-30 border-b border-white/12 bg-black/45 backdrop-blur">
        {/* ✅ ここだけ：スマホは縦積み、sm以上で横並び（構成は同じ） */}
        <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          {/* 左 */}
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-aoi-flow2.png"
              alt="AOI FLOW"
              className="rounded-2xl bg-white/8 p-1 ring-1 ring-white/10 shrink-0"
              style={{ width: S.LOGO, height: S.LOGO }}
            />
            <div className="leading-tight min-w-0">
              <div
                className="truncate"
                style={{ fontSize: S.TITLE, fontWeight: 900, letterSpacing: "0.06em" }}
              >
                AOI FLOW
              </div>
              <div className="truncate" style={{ fontSize: S.SUB, color: "rgba(255,255,255,0.70)" }}>
                Caption Studio
              </div>
            </div>
          </div>

          {/* 中央タブ */}
          <div className="min-w-0 flex justify-start sm:flex-1 sm:justify-center">
            <div
              style={{
                display: "flex",
                gap: 10,
                padding: 6,
                borderRadius: 9999,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.35)",
                overflowX: "auto",
                maxWidth: "100%",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <Tab href="/flow/drafts" label="下書き一覧" />
              <Tab href="/flow/drafts/new" label="新規作成" />
              <Tab href="/flow/inbox" label="投稿待ち" />
            </div>
          </div>

          {/* 右 */}
          <div className="flex items-center gap-3 justify-end shrink-0">
            <button
              onClick={logout}
              className="rounded-full transition hover:brightness-110 whitespace-nowrap"
              style={{
                fontSize: S.LOGOUT_FZ,
                padding: `${S.LOGOUT_PY} ${S.LOGOUT_PX}`,
                fontWeight: 900,
                color: "rgba(255,255,255,0.92)",
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      {/* メイン枠（構成維持。pxだけスマホで軽く） */}
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-6">
        <div className="py-4 sm:py-6 h-[calc(100vh-5rem-3rem)] min-h-0">
          <main className="h-full min-h-0">
            <div
              className={cx(
                "w-full h-full min-h-0 rounded-3xl border border-white/10 bg-black/35 backdrop-blur",
                "p-4 sm:p-7",
                "flex flex-col",
                "[&_a]:text-white/90 [&_a:visited]:text-white/90 [&_a:hover]:text-white",
                "[&_a]:no-underline"
              )}
            >
              <div className="min-h-0 flex-1 overflow-auto">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}