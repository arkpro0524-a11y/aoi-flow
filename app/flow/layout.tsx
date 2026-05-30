// /app/flow/layout.tsx
"use client";

import React from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/firebase";
import FlowShell from "@/components/FlowShell";
import AuthGate, { useAuthUser } from "@/components/AuthGate";

function Inner({ children }: { children: React.ReactNode }) {
  const user = useAuthUser();

  async function onLogout() {
    // auth が何らかで壊れてても落とさない（保険）
    if (!auth) return;
    await signOut(auth);
  }

  return (
    <FlowShell user={user} onLogout={onLogout}>
      {children}
    </FlowShell>
  );
}

export default function FlowLayout({ children }: { children: React.ReactNode }) {
  // ✅ ここで /flow 配下をガードする（未ログインなら /login へ）
  return (
    <AuthGate>
      <Inner>{children}</Inner>
    </AuthGate>
  );
}