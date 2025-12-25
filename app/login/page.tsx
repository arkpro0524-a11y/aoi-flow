"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  type User,
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

function isIOSLike(ua: string) {
  // iPhone/iPad/iPod + iPadOS(=Macintosh but touch)
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && typeof navigator !== "undefined" && (navigator as any).maxTouchPoints > 1);
}

export default function LoginPage() {
  const router = useRouter();

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const ios = useMemo(() => (ua ? isIOSLike(ua) : false), [ua]);
  const mode = ios ? "redirect" : "popup→fallback redirect";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ デバッグログ（複数行で積む）
  const [logs, setLogs] = useState<string[]>([]);
  const push = (s: string) => setLogs((p) => [...p, `${new Date().toLocaleTimeString()}  ${s}`].slice(-80));

  useEffect(() => {
    push(`boot: ua=${ua}`);
    push(`boot: mode=${mode}`);

    // 永続化（先に）
    ensureAuthPersistence()
      .then(() => push("boot: ensureAuthPersistence=OK"))
      .catch((e: any) => push(`boot: ensureAuthPersistence=ERR ${e?.code || e?.message || e}`));

    ensureFirestorePersistence()
      .then(() => push("boot: ensureFirestorePersistence=OK"))
      .catch((e: any) => push(`boot: ensureFirestorePersistence=ERR ${e?.code || e?.message || e}`));

    // redirectの戻り結果を拾う
    (async () => {
      try {
        const res = await getRedirectResult(auth);
        if (res?.user) {
          push(`boot: redirect result=USER uid=${res.user.uid}`);
        } else {
          push("boot: redirect result=none");
        }
      } catch (e: any) {
        const code = e?.code || "unknown";
        push(`boot: redirect result=ERR ${code}`);
        setError(`ログインに失敗しました: ${code}`);
      }
    })();

    // 認証状態の監視（最重要）
    const unsub = onAuthStateChanged(
      auth,
      (u: User | null) => {
        if (u) {
          push(`auth: signed in uid=${u.uid}`);
          router.replace("/flow/drafts");
        } else {
          push("auth: signed out");
        }
      },
      (e: any) => {
        const code = e?.code || "unknown";
        push(`auth: listener ERR ${code}`);
        setError(`ログインに失敗しました: ${code}`);
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const loginWithGoogle = async () => {
    setError(null);
    setBusy(true);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      if (ios) {
        push("click: signInWithRedirect (ios)");
        await signInWithRedirect(auth, provider);
        // ここでページ遷移するので busyは解除しない
        return;
      }

      // PC/Android等：まずpopupを試して、ダメならredirectへ退避
      push("click: signInWithPopup (pc)");
      await signInWithPopup(auth, provider);
      push("popup: success");
      router.replace("/flow/drafts");
    } catch (e: any) {
      const code = e?.code || "unknown";
      push(`login: ERR ${code}`);

      // popup系がコケる環境ならredirectに切り替える
      if (
        code === "auth/popup-blocked" ||
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        try {
          push("fallback: signInWithRedirect");
          await signInWithRedirect(auth, provider);
          return;
        } catch (e2: any) {
          const code2 = e2?.code || "unknown";
          push(`fallback: ERR ${code2}`);
          setError(`ログインに失敗しました: ${code2}`);
        }
      } else {
        setError(`ログインに失敗しました: ${code}`);
      }

      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6">
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
                  textAlign: "left",
                }}
              >
                {error}
              </div>
            )}

            {/* ✅ デバッグ表示（必ず出る） */}
            <div
              style={{
                width: "min(520px, 100%)",
                marginTop: 14,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.35)",
                padding: "12px 14px",
                color: "rgba(255,255,255,0.85)",
                fontSize: 12,
                textAlign: "left",
                whiteSpace: "pre-wrap",
                lineHeight: 1.35,
                maxHeight: 180,
                overflow: "auto",
              }}
            >
              {logs.join("\n")}
            </div>

            <div style={{ width: "min(520px, 100%)", color: "rgba(255,255,255,0.55)", fontSize: 12, textAlign: "left" }}>
              ※ このdebugの最後の数行をそのまま貼れば、原因を一発で確定できます。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}