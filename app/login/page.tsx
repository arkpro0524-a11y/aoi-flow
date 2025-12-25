// app/login/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, ensureAuthPersistence, ensureFirestorePersistence } from "@/firebase";

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.2 0 6.1 1.1 8.3 3l5.7-5.7C34.5 3.2 29.6 1 24 1 14.6 1 6.5 6.4 2.6 14.3l6.6 5.1C11 13.4 17 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4.1H24v7.7h12.7c-.3 2-1.6 5-4.7 7l7.2 5.6c4.2-3.9 7.3-9.7 7.3-16.2z" />
      <path fill="#FBBC05" d="M9.2 28.6c-1-2-1.6-4.2-1.6-6.6s.6-4.6 1.5-6.6l-6.6-5.1C.9 13.6 0 17.6 0 22s1 8.4 2.6 11.7l6.6-5.1z" />
      <path fill="#34A853" d="M24 46c5.6 0 10.3-1.8 13.8-5l-7.2-5.6c-1.9 1.3-4.5 2.2-6.6 2.2-7 0-13-3.9-14.8-9.9l-6.6 5.1C6.5 40.6 14.6 46 24 46z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureAuthPersistence().catch(() => {});
    ensureFirestorePersistence().catch(() => {});

    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) router.replace("/flow/drafts");
    });
    return () => unsub();
  }, [router]);

  const loginWithGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      router.replace("/flow/drafts");
    } catch (e: any) {
      const msg =
        e?.code === "auth/popup-closed-by-user"
          ? "ログインをキャンセルしました"
          : e?.code === "auth/cancelled-popup-request"
          ? "別のログイン画面が開いています（ポップアップを閉じて再実行）"
          : e?.code === "auth/popup-blocked"
          ? "ポップアップがブロックされています（Safariの設定を確認）"
          : "ログインに失敗しました";
      setError(msg);
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-8">
      <div className="relative w-full max-w-[620px]">
        <div
          className="pointer-events-none absolute inset-0 rounded-[34px] bg-black/40"
          style={{ boxShadow: "0 70px 220px rgba(0,0,0,0.85)" }}
        />

        <div
          className="relative rounded-[34px] ring-1 ring-white/[0.10] backdrop-blur-[22px]"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.05) 55%, rgba(0,0,0,0.10) 100%)",
            boxShadow:
              "0 40px 140px rgba(0,0,0,0.65), 0 2px 0 rgba(255,255,255,0.05) inset, 0 -28px 90px rgba(0,0,0,0.40) inset",
          }}
        >
          <div
            className="flex flex-col items-center text-center"
            style={{
              padding: "clamp(22px, 3.2vw, 34px)",
              minHeight: "clamp(420px, 58vh, 560px)",
              rowGap: "clamp(10px, 1.2vw, 16px)",
            }}
          >
            <img
              src="/logo-aoi-flow2.png"
              alt="AOI FLOW"
              style={{
                width: "auto",
                height: "clamp(84px, 10.5vh, 200px)",
                filter: "drop-shadow(0 26px 70px rgba(0,0,0,0.72))",
              }}
            />

            <div
              style={{
                fontSize: "clamp(26px, 3.2vw, 40px)",
                letterSpacing: "0.12em",
                color: "rgba(255,255,255,0.95)",
                fontWeight: 600,
                lineHeight: 1.05,
              }}
            >
              AOI FLOW
            </div>

            <div
              style={{
                fontSize: "clamp(13px, 1.4vw, 18px)",
                color: "rgba(255,255,255,0.60)",
                lineHeight: 1.2,
                marginTop: "-2px",
              }}
            >
              Caption Studio
            </div>

            <div style={{ height: "clamp(10px, 3vh, 26px)" }} />

            <button
              onClick={loginWithGoogle}
              disabled={busy}
              className="flex items-center justify-center gap-4 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                width: "min(520px, 100%)",
                minHeight: "clamp(54px, 6.2vh, 68px)",
                borderRadius: "18px",
                color: "#FFFFFF",
                fontSize: "clamp(14px, 1.3vw, 16px)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.12) 55%, rgba(0,0,0,0.12) 100%)",
                boxShadow:
                  "0 22px 60px rgba(0,0,0,0.60), 0 1px 0 rgba(255,255,255,0.14) inset, 0 -12px 24px rgba(0,0,0,0.35) inset",
                border: "1px solid rgba(0,0,0,0.30)",
              }}
            >
              <span className="grid place-items-center rounded-full bg-white" style={{ width: 36, height: 36 }}>
                <GoogleG />
              </span>
              <span>{busy ? "ログイン中..." : "Googleでログイン"}</span>
            </button>

            {error && (
              <div
                style={{
                  width: "min(520px, 100%)",
                  borderRadius: "18px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  padding: "14px 16px",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  marginTop: "clamp(8px, 1.2vw, 14px)",
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}