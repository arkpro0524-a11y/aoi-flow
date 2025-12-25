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

/**
 * 目的：
 * - PC/スマホ両対応でヘッダーが崩れない
 * - スマホは「ロゴ＋ログアウト」→「タブ」の2段に自動で落ちる
 * - 文字/ロゴ/ボタンは clamp() で端末幅に追従
 */

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
          fontSize: "clamp(13px, 3.5vw, 18px)",
          fontWeight: 900,
          lineHeight: 1,
          padding: "clamp(10px, 2.6vw, 14px) clamp(16px, 3.6vw, 22px)",
          borderRadius: 9999,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          whiteSpace: "nowrap",
          color: active ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.78)",
          background: active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)",
          border: active ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
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
      {/* 背景 */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#05070c]" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/6 via-transparent to-black/35" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.07),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.05),transparent_40%)]" />
      </div>

      {/* ヘッダー（スマホは自然に2段になる） */}
      <header className="sticky top-0 z-30 border-b border-white/12 bg-black/45 backdrop-blur">
        <div
          className={cx(
            "mx-auto w-full max-w-7xl",
            "px-4 sm:px-6",
            "py-3",
            "flex flex-col gap-3"
          )}
        >
          {/* 上段：ロゴ + タイトル + ログアウト */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-aoi-flow2.png"
                alt="AOI FLOW"
                className="rounded-2xl bg-white/8 p-1 ring-1 ring-white/10 shrink-0"
                style={{
                  width: "clamp(44px, 10vw, 72px)",
                  height: "clamp(44px, 10vw, 72px)",
                }}
              />

              <div className="min-w-0 leading-tight">
                <div
                  style={{
                    fontSize: "clamp(18px, 5.2vw, 28px)",
                    fontWeight: 900,
                    letterSpacing: "0.06em",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  AOI FLOW
                </div>
                <div
                  style={{
                    fontSize: "clamp(12px, 3.6vw, 16px)",
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

            <button
              onClick={logout}
              className="rounded-full transition hover:brightness-110 shrink-0"
              style={{
                fontSize: "clamp(12px, 3.2vw, 14px)",
                padding: "clamp(8px, 2.4vw, 10px) clamp(12px, 3vw, 14px)",
                fontWeight: 900,
                color: "rgba(255,255,255,0.92)",
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              ログアウト
            </button>
          </div>

          {/* 下段：タブ（横スクロール可） */}
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
      </header>

      {/* メイン */}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        {/* ここは高さ固定をやめる（スマホSafariでズレやすい） */}
        <div className="py-4 sm:py-6">
          <main>
            <div
              className={cx(
                "w-full rounded-3xl border border-white/10 bg-black/35 p-4 sm:p-7 backdrop-blur",
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