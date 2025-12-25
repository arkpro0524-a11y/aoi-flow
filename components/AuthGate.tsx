// components/AuthGate.tsxw
"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/firebase";

export default function AuthGate({
  children,
}: {
  children: (u: User) => React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  // ✅ 認証状態の購読（ここでは「状態更新」だけに寄せる）
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  // ✅ ルーティング制御は別Effectで（状態が揃ってから一発で判断）
  useEffect(() => {
    if (!ready) return;

    const isFlow = pathname?.startsWith("/flow");
    if (isFlow && !user) {
      router.replace("/login");
    }
  }, [ready, user, pathname, router]);

  if (!ready) return <div className="text-white/70">Loading...</div>;
  if (!user) return null;

  return <>{children(user)}</>;
}