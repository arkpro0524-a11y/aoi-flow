// app/login/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, ensureAuthPersistence } from "@/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 永続化（popupではこれだけでOK）
    ensureAuthPersistence().catch(() => {});

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/flow/drafts");
      }
    });
    return () => unsub();
  }, [router]);

  const loginWithGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      // 成功時は onAuthStateChanged が拾う
    } catch (e: any) {
      console.error(e);
      setError(e?.code ?? "login_failed");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <button
        onClick={loginWithGoogle}
        disabled={busy}
        className="px-6 py-3 rounded-xl bg-white text-black"
      >
        {busy ? "ログイン中..." : "Googleでログイン"}
      </button>

      {error && (
        <div style={{ marginTop: 16, color: "red" }}>
          {error}
        </div>
      )}
    </div>
  );
}