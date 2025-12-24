// /components/FlowShell.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import React from "react";

type Props = { user: User | null; onLogout: () => Promise<void>; children: React.ReactNode };
function cx(...xs: (string | false | undefined)[]) { return xs.filter(Boolean).join(" "); }

/** ✅ 暗視で見やすい：ここだけ調整ポイント */
const LOGO_PX = 130;
const BRAND_TITLE_PX = 60;
const BRAND_SUB_PX = 45;

const TAB_PX = 30;
const TAB_PAD_Y = 20;
const TAB_PAD_X = 50;

const LOGOUT_PX = 10;
const LOGOUT_PAD_Y = 20;
const LOGOUT_PAD_X = 20;

export default function FlowShell({ user, onLogout, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const Tab = ({ href, label }: { href: string; label: string }) => {
    const active = isActive(href);
    return (
      <Link
        href={href}
        className={cx("no-underline transition")}
        style={{
          fontSize: TAB_PX,
          fontWeight: 900,
          lineHeight: 1,
          padding: `${TAB_PAD_Y}px ${TAB_PAD_X}px`,
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
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          {/* 左 */}
          <div className="flex items-center gap-4 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-aoi-flow2.png"
              alt="AOI FLOW"
              className="rounded-2xl bg-white/8 p-1 ring-1 ring-white/10"
              style={{ width: LOGO_PX, height: LOGO_PX }}
            />
            <div className="leading-tight">
              <div style={{ fontSize: BRAND_TITLE_PX, fontWeight: 900, letterSpacing: "0.06em" }}>
                AOI FLOW
              </div>
              <div style={{ fontSize: BRAND_SUB_PX, color: "rgba(255,255,255,0.70)" }}>
                Caption Studio
              </div>
            </div>
          </div>

          {/* 中央タブ */}
          <div className="flex-1 min-w-0 flex justify-center">
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
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={logout}
              className="rounded-full transition hover:brightness-110"
              style={{
                fontSize: LOGOUT_PX,
                padding: `${LOGOUT_PAD_Y}px ${LOGOUT_PAD_X}px`,
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

      {/* メイン枠 */}
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="py-6 h-[calc(100vh-5rem-3rem)] min-h-0">
          <main className="h-full min-h-0">
            <div
              className={cx(
                "w-full h-full min-h-0 rounded-3xl border border-white/10 bg-black/35 p-7 backdrop-blur",
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