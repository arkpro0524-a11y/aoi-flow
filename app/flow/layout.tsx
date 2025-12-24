// /app/flow/layout.tsx
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import FlowShell from "@/components/FlowShell";
import { auth } from "@/firebase";

export default function FlowLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setReady(true);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  async function onLogout() {
    await signOut(auth);
  }

  if (!ready) return null;

  return (
    <FlowShell user={user} onLogout={onLogout}>
      {children}
    </FlowShell>
  );
}