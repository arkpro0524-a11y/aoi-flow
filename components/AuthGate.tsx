// components/AuthGate.tsx（差し替え推奨：最小安全版）
"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/firebase";

export default function AuthGate({ children }: { children: (u: User) => React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  // ✅ 認証購読は1回だけ
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  // ✅ ルーティング判定は別でやる（pathname変化しても購読は増えない）
  useEffect(() => {
    if (!ready) return;
    if (!user && pathname?.startsWith("/flow")) router.replace("/login");
  }, [ready, user, pathname, router]);

  if (!ready) return <div className="text-white/70">Loading...</div>;
  if (!user) return null;

  return <>{children(user)}</>;
}