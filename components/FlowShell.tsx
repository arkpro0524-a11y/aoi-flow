// components/FlowShell.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useMemo, useState } from "react";
import { auth } from "@/firebase";

type Props = {
  user: User | null;
  onLogout: () => Promise<void>;
  children: React.ReactNode;
};

function cx(...xs: (string | false | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

function isAdminUid(uid: string | null): boolean {
  const raw = process.env.NEXT_PUBLIC_ADMIN_UIDS || "";

  const adminUids = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (!uid) return false;

  return adminUids.includes(uid);
}

const UI = {
  logo: "clamp(48px, 7vw, 90px)",
  title: "clamp(18px, 2.6vw, 34px)",
  sub: "clamp(12px, 1.8vw, 18px)",
  tabFont: "clamp(12px, 1.7vw, 16px)",
  tabPadY: "clamp(10px, 1.6vw, 14px)",
  tabPadX: "clamp(14px, 2.2vw, 22px)",
  logoutFont: "clamp(11px, 1.3vw, 12px)",
  logoutPadY: "clamp(10px, 1.6vw, 12px)",
  logoutPadX: "clamp(12px, 2.0vw, 16px)",
};

export default function FlowShell({ user, onLogout, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const [liveUser, setLiveUser] = useState<User | null>(user);

  useEffect(() => {
    setLiveUser(user);
  }, [user]);

  useEffect(() => {
    if (!auth) return;

    const unsub = onAuthStateChanged(auth, (u) => {
      setLiveUser(u ?? null);
    });

    return () => unsub();
  }, []);

  const effectiveUid = liveUser?.uid ?? user?.uid ?? null;

  const isAdmin = useMemo(() => {
    return isAdminUid(effectiveUid);
  }, [effectiveUid]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const Tab = ({ href, label }: { href: string; label: string }) => {
    const active = isActive(href);

    return (
      <Link
        href={href}
        className={cx("no-underline transition")}
        style={{
          fontSize: UI.tabFont as any,
          fontWeight: 900,
          lineHeight: 1,
          padding: `${UI.tabPadY} ${UI.tabPadX}`,
          borderRadius: 9999,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          whiteSpace: "nowrap",
          color: active ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.78)",
          background: active
            ? "linear-gradient(135deg, rgba(70,220,220,0.24), rgba(0,255,180,0.14))"
            : "rgba(255,255,255,0.08)",
          border: active
            ? "1px solid rgba(120,255,220,0.38)"
            : "1px solid rgba(255,255,255,0.10)",
          boxShadow: active
            ? "0 0 18px rgba(0,255,180,0.18), inset 0 0 18px rgba(255,255,255,0.06)"
            : "none",
          flex: "0 0 auto",
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 9999,
            background: active ? "rgba(120,255,220,0.98)" : "rgba(255,255,255,0.45)",
            boxShadow: active ? "0 0 10px rgba(0,255,180,0.75)" : "none",
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
    <div className="relative min-h-screen text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <img
          src="/flow-bg-tech1.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />

        <div className="absolute inset-0 bg-[#020814]/45" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_28%,rgba(0,255,180,0.20),transparent_38%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_72%,rgba(70,220,220,0.14),transparent_42%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/15 to-black/58" />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/12 bg-black/60 backdrop-blur">
        <div className="px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 items-center gap-3 md:gap-4">
              <img
                src="/logo-aoi-flow2.png"
                alt="AOI FLOW"
                className="shrink-0 rounded-2xl bg-white/8 p-1 ring-1 ring-white/10"
                style={{ width: UI.logo as any, height: UI.logo as any }}
              />

              <div className="min-w-0 leading-tight">
                <div
                  style={{
                    fontSize: UI.title as any,
                    fontWeight: 900,
                    letterSpacing: "0.06em",
                  }}
                >
                  AOI FLOW
                </div>

                <div
                  style={{
                    fontSize: UI.sub as any,
                    color: "rgba(255,255,255,0.70)",
                  }}
                >
                  Caption Studio
                </div>
              </div>
            </div>

            <div className="ml-auto shrink-0">
              <button
                onClick={logout}
                className="rounded-full transition hover:brightness-110"
                style={{
                  fontSize: UI.logoutFont as any,
                  padding: `${UI.logoutPadY} ${UI.logoutPadX}`,
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

          <div className="mt-3 w-full min-w-0 overflow-hidden">
            <div
              className="[&::-webkit-scrollbar]:hidden"
              style={{
                width: "100%",
                maxWidth: "100%",
                overflowX: "auto",
                overflowY: "hidden",
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-x",
                overscrollBehaviorX: "contain",
                paddingLeft: 6,
                paddingRight: 48,
                scrollbarWidth: "none" as any,
                msOverflowStyle: "none" as any,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  width: "max-content",
                  minWidth: "max-content",
                  gap: 10,
                  padding: 6,
                  borderRadius: 9999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.42)",
                  whiteSpace: "nowrap",
                  boxShadow: "inset 0 0 20px rgba(255,255,255,0.04)",
                }}
              >
                <Tab href="/" label="トップ" />
                <Tab href="/flow/drafts" label="下書き一覧" />
                <Tab href="/flow/drafts/new" label="新規作成" />
                <Tab href="/flow/sell-check" label="売れる診断" />

                {isAdmin ? (
                  <Tab href="/flow/sell-check/admin" label="学習データ管理" />
                ) : null}

                <Tab href="/flow/posted" label="投稿済み" />
                <Tab href="/flow/brands" label="設定" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 w-full px-3 sm:px-4 md:px-6">
        <div className="mx-auto w-full max-w-[1600px]">
          <div className="min-h-0 py-6">
            <main className="min-h-0">
              <div
                className={cx(
                  "w-full min-h-0 rounded-3xl border border-white/15 bg-black/18 p-5 md:p-7 backdrop-blur-[1px] shadow-[0_0_40px_rgba(0,0,0,0.18)]",
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
    </div>
  );
}