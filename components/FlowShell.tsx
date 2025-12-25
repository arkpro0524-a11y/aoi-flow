// /components/FlowShell.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import React from "react";

type Props = {
  user: User | null;
  onLogout: () => Promise<void>;
  children: React.ReactNode;
};

function cx(...xs: (string | false | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export default function FlowShell({ user, onLogout, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const Tab = ({ href, label }: { href: string; label: string }) => {
    const active = isActive(href);
    return (
      <Link
        href={href}
        className="no-underline transition"
        style={{
          fontWeight: 900,
          lineHeight: 1,
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
          // ✅ レスポンシブ：スマホは小さく、PCは程よく
          fontSize: "clamp(12px, 1.1vw, 16px)",
          padding: "clamp(8px, 1.0vw, 12px) clamp(12px, 1.8vw, 22px)",
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
    <div className="min-h-screen text-white overflow-x-hidden">
      {/* 背景（暗視） */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#05070c]" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/6 via-transparent to-black/35" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.07),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.05),transparent_40%)]" />
      </div>

      {/* ヘッダー */}
      <header className="sticky top-0 z-30 border-b border-white/12 bg-black/45 backdrop-blur">
        <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 py-3">
          {/* ✅ スマホは縦積み、md以上で横並び */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* 左：ロゴ＋タイトル */}
            <div className="flex items-center gap-3 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-aoi-flow2.png"
                alt="AOI FLOW"
                className="rounded-2xl bg-white/8 p-1 ring-1 ring-white/10 shrink-0"
                style={{
                  width: "clamp(44px, 4.6vw, 74px)",
                  height: "clamp(44px, 4.6vw, 74px)",
                }}
              />
              <div className="min-w-0 leading-tight">
                <div
                  style={{
                    fontSize: "clamp(18px, 2.2vw, 28px)",
                    fontWeight: 900,
                    letterSpacing: "0.10em",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  AOI FLOW
                </div>
                <div
                  style={{
                    fontSize: "clamp(11px, 1.2vw, 14px)",
                    color: "rgba(255,255,255,0.70)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  Caption Studio
                </div>
              </div>
            </div>

            {/* 中央：タブ（スマホは横スクロール可 / PCは中央寄せ） */}
            <div className="flex-1 min-w-0 flex md:justify-center">
              <div
                className="w-full md:w-auto"
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

            {/* 右：ログアウト（スマホでも押しやすいサイズ） */}
            <div className="flex justify-end md:justify-start">
              <button
                onClick={logout}
                className="rounded-full transition hover:brightness-110"
                style={{
                  fontWeight: 900,
                  color: "rgba(255,255,255,0.92)",
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  fontSize: "clamp(12px, 1.1vw, 14px)",
                  padding: "clamp(10px, 1.0vw, 12px) clamp(14px, 1.6vw, 18px)",
                }}
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* メイン：高さ固定をやめて、自然に伸びる */}
      <main className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 py-4 sm:py-6">
        <div
          className={cx(
            "w-full rounded-3xl border border-white/10 bg-black/35 backdrop-blur",
            "[&_a]:text-white/90 [&_a:visited]:text-white/90 [&_a:hover]:text-white",
            "[&_a]:no-underline"
          )}
          style={{
            // ✅ ここが「バランス」：スマホは薄め、PCはしっかり余白
            padding: "clamp(14px, 2.0vw, 28px)",
            boxShadow: "0 30px 120px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.05) inset",
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}