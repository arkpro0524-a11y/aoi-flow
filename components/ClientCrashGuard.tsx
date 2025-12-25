// components/ClientCrashGuard.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type Crash = {
  message: string;
  stack?: string;
  where?: string;
  time: string;
};

function normalizeUnknownError(e: unknown): { message: string; stack?: string } {
  if (e instanceof Error) return { message: e.message || String(e), stack: e.stack };
  try {
    return { message: typeof e === "string" ? e : JSON.stringify(e) };
  } catch {
    return { message: String(e) };
  }
}

/**
 * ✅ 本番(iOS含む)でも「Application error」で死なずに
 * 画面に “原因(スタック/メッセージ)” を確実に出すためのガード。
 */
export default function ClientCrashGuard({ children }: { children: React.ReactNode }) {
  const [crash, setCrash] = useState<Crash | null>(null);

  const hint = useMemo(() => {
    if (!crash?.message) return null;
    if (crash.message.includes("Minified React error #310")) {
      return [
        "React #310 = Hooks の呼び出し順がレンダー間で変わっています。",
        "原因はほぼ必ず「条件分岐の中で useState/useEffect/useMemo 等を呼んでいる」か",
        "「return の位置が分岐で変わって、あるレンダーだけ Hook が追加される」パターンです。",
      ].join("\n");
    }
    if (crash.message.includes("Rendered more hooks than during the previous render")) {
      return [
        "Hooks順序エラーです。",
        "条件付きHook・条件付きreturn・カスタムHookの条件呼び出しを探してください。",
      ].join("\n");
    }
    return null;
  }, [crash]);

  useEffect(() => {
    // 直前のクラッシュを復元（iOSで再読み込みが走っても追える）
    try {
      const raw = sessionStorage.getItem("__aoi_crash__");
      if (raw) setCrash(JSON.parse(raw));
    } catch {}

    const onError = (ev: ErrorEvent) => {
      const { message, stack } = normalizeUnknownError(ev.error ?? ev.message);
      const c: Crash = {
        message,
        stack,
        where: "window.onerror",
        time: new Date().toISOString(),
      };
      setCrash(c);
      try {
        sessionStorage.setItem("__aoi_crash__", JSON.stringify(c));
      } catch {}
    };

    const onRejection = (ev: PromiseRejectionEvent) => {
      const { message, stack } = normalizeUnknownError(ev.reason);
      const c: Crash = {
        message,
        stack,
        where: "unhandledrejection",
        time: new Date().toISOString(),
      };
      setCrash(c);
      try {
        sessionStorage.setItem("__aoi_crash__", JSON.stringify(c));
      } catch {}
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (!crash) return <>{children}</>;

  return (
    <div style={{ minHeight: "100vh", padding: 16, background: "#05070c", color: "white" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.06em" }}>AOI FLOW - Crash Report</div>
        <div style={{ opacity: 0.7, marginTop: 8, fontSize: 12 }}>
          {crash.time} / {crash.where}
        </div>

        <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Message</div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12, lineHeight: 1.5 }}>{crash.message}</pre>
        </div>

        {hint && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Hint</div>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12, lineHeight: 1.5, opacity: 0.9 }}>{hint}</pre>
          </div>
        )}

        {crash.stack && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Stack</div>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12, lineHeight: 1.5 }}>{crash.stack}</pre>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button
            onClick={() => {
              try { sessionStorage.removeItem("__aoi_crash__"); } catch {}
              location.reload();
            }}
            style={{
              borderRadius: 9999,
              padding: "10px 14px",
              fontWeight: 800,
              background: "rgba(255,255,255,0.12)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            Reload
          </button>
          <button
            onClick={() => {
              const text = [
                crash.time,
                crash.where ?? "",
                crash.message ?? "",
                crash.stack ?? "",
              ].join("\n\n");
              navigator.clipboard.writeText(text);
              alert("コピーしました");
            }}
            style={{
              borderRadius: 9999,
              padding: "10px 14px",
              fontWeight: 800,
              background: "rgba(255,255,255,0.12)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}