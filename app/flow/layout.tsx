// /app/flow/layout.tsx
"use client";

import React from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/firebase";
import FlowShell from "@/components/FlowShell";
import { useAuthUser } from "@/components/AuthGate";

export default function FlowLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthUser();

  async function onLogout() {
    await signOut(auth);
  }

  return (
    <FlowShell user={user} onLogout={onLogout}>
      {children}
    </FlowShell>
  );
}