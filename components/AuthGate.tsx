//components/AuthGate.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { auth } from "@/firebase";

const AuthUserContext = createContext<User | null>(null);
export const useAuthUser = () => useContext(AuthUserContext);

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const ctxValue = useMemo(() => user, [user]);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      setReady(true);
      return;
    }

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setReady(true);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!ready) return;

    const isFlow = !!pathname?.startsWith("/flow");
    const isLogin = pathname === "/login";

    if (!user && isFlow) {
      setRedirecting(true);
      router.replace("/login");
      return;
    }

    if (user && isLogin) {
      setRedirecting(true);
      router.replace("/");
      return;
    }

    setRedirecting(false);
  }, [ready, user, pathname, router]);

  if (!ready) {
    return <div className="text-white/70">Loading...</div>;
  }

  if (!user && pathname?.startsWith("/flow")) {
    return (
      <div className="text-white/70">
        ログインが必要です。ログイン画面へ移動します…
      </div>
    );
  }

  if (redirecting) {
    return <div className="text-white/70">移動中...</div>;
  }

  return <AuthUserContext.Provider value={ctxValue}>{children}</AuthUserContext.Provider>;
}