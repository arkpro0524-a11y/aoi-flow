// components/AuthGate.tsx
"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { auth } from "@/firebase";

const AuthUserContext = createContext<User | null>(null);
export const useAuthUser = () => useContext(AuthUserContext);

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  // ✅ Hooksは「必ず上から同じ順番で」呼ばれる必要がある
  //    → useMemo を early return より前に置く
  const ctxValue = useMemo(() => user, [user]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!ready) return;

    const isFlow = pathname?.startsWith("/flow");
    const isLogin = pathname === "/login";

    if (!user && isFlow) router.replace("/login");
    if (user && isLogin) router.replace("/flow/drafts");
  }, [ready, user, pathname, router]);

  if (!ready) return <div className="text-white/70">Loading...</div>;
  if (!user && pathname?.startsWith("/flow")) return null;

  return <AuthUserContext.Provider value={ctxValue}>{children}</AuthUserContext.Provider>;
}