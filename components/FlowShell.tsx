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

  async function logout() {
    await onLogout();
    router.replace("/login");
  }

  const Tab = ({ href, label }: { href: string; label: string }) => {
    const active = isActive(href);
    return (
      <Link
        href={href}
        className={cx(
          "no-underline transition select-none",
          "inline-flex items-center gap-2 whitespace-nowrap",
          "rounded-full border",
          "px-3 py-2 sm:px-5 sm:py-2.5",
          "text-[13px] sm:text-[15px] md:text-[16px]",
          "font-extrabold",
          active
            ? "text-white border-white/20 bg-white/20"
            : "text-white/80 border-white/10 bg-white/8 hover:bg-white/12"
        )}
      >
        <span
          className={cx(
            "inline-block rounded-full",
            active ? "bg-white" : "bg-white/50"
          )}
          style={{ width: 8, height: 8 }}
        />
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen text-white">
      {/* 背景 */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#05070c]" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/6 via-transparent to-black/35" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.07),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.05),transparent_40%)]" />
      </div>

      {/* ヘッダー（スマホは縦積み / PCは横並び） */}
      <header className="sticky top-0 z-30 border-b border-white/12 bg-black/45 backdrop-blur">
        <div className="mx-auto w-full max-w-7xl px-3 sm:px-6">
          <div className="py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              {/* 左：ロゴ＆タイトル */}
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-aoi-flow2.png"
                  alt="AOI FLOW"
                  className="rounded-2xl bg-white/8 p-1 ring-1 ring-white/10"
                  style={{
                    width: "clamp(44px, 10vw, 76px)",
                    height: "clamp(44px, 10vw, 76px)",
                  }}
                />
                <div className="leading-tight min-w-0">
                  <div
                    className="truncate font-black tracking-[0.06em]"
                    style={{ fontSize: "clamp(18px, 4.8vw, 34px)" }}
                  >
                    AOI FLOW
                  </div>
                  <div
                    className="truncate text-white/70"
                    style={{ fontSize: "clamp(11px, 3.2vw, 16px)" }}
                  >
                    Caption Studio
                  </div>
                </div>
              </div>

              {/* 中央：タブ（スマホは横スクロールOK） */}
              <div className="md:flex-1 md:flex md:justify-center">
                <div
                  className={cx(
                    "flex items-center gap-2",
                    "rounded-full border border-white/10 bg-black/35 p-1",
                    "overflow-x-auto max-w-full",
                    "[-webkit-overflow-scrolling:touch]"
                  )}
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
                  className={cx(
                    "rounded-full border border-white/10 bg-white/12 text-white/95",
                    "font-extrabold",
                    "px-4 py-2 sm:px-5 sm:py-2.5",
                    "text-[13px] sm:text-[14px]",
                    "hover:brightness-110 transition"
                  )}
                >
                  ログアウト
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* メイン：高さ計算は捨てて、自然スクロールで端末差を吸収（ここが安定のコツ） */}
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 py-4 sm:py-6">
        <main
          className={cx(
            "w-full rounded-3xl border border-white/10 bg-black/35 backdrop-blur",
            "p-3 sm:p-6",
            "min-h-[calc(100vh-140px)] md:min-h-[calc(100vh-120px)]",
            "overflow-hidden",
            "[&_a]:text-white/90 [&_a:visited]:text-white/90 [&_a:hover]:text-white [&_a]:no-underline"
          )}
        >
          {/* 子ページ側が grid でも横溢れしないように保険 */}
          <div className="min-h-0 w-full overflow-x-auto">
            <div className="min-w-0">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}