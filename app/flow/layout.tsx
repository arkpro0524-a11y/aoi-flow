// /app/flow/layout.tsx
"use client";

import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import FlowShell from "@/components/FlowShell";
import { auth } from "@/firebase";

export default function FlowLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  // ✅ 認証購読は1回だけ（router 依存にしない）
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  // ✅ リダイレクト判定は別Effectで（購読を増やさない）
  useEffect(() => {
    if (!ready) return;
    if (!user && pathname?.startsWith("/flow")) {
      router.replace("/login");
    }
  }, [ready, user, pathname, router]);

  async function onLogout() {
    await signOut(auth);
    router.replace("/login");
  }

  // ✅ 初期は必ず待つ（何も描画しないより、まずは安定させる）
  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center text-white/70">
        Loading...
      </div>
    );
  }

  // ✅ 未ログイン時は children を「絶対に描画しない」
  // （これが #310 を潰す本命）
  if (!user) return null;

  return (
    <FlowShell user={user} onLogout={onLogout}>
      {children}
    </FlowShell>
  );
}