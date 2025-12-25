// components/AuthGate.tsx
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setReady(true);
      if (!u && pathname?.startsWith("/flow")) router.replace("/login");
    });
    return () => unsub();
  }, [router, pathname]);

  if (!ready) return <div className="text-white/70">Loading...</div>;
  if (!user) return null;

  return <>{children(user)}</>;
}