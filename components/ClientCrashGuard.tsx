"use client";

import React, { useEffect, useMemo, useState } from "react";

type Crash = {
  type: "error" | "unhandledrejection";
  message: string;
  stack?: string;
  source?: string;
};

export default function ClientCrashGuard() {
  const [crash, setCrash] = useState<Crash | null>(null);

  const ua = useMemo(() => {
    if (typeof navigator === "undefined") return "";
    return navigator.userAgent || "";
  }, []);

  useEffect(() => {
    // 既に落ちてる/落ちかけてる状況でも拾えるよう、イベントで捕捉
    const onError = (event: ErrorEvent) => {
      const msg = event?.error?.message || event?.message || "Unknown client error";
      const stack = event?.error?.stack;
      const source = `${event?.filename || ""}:${event?.lineno || ""}:${event?.colno || ""}`;
      setCrash({
        type: "error",
        message: msg,
        stack,
        source: source.trim() ? source : undefined,
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason: any = event?.reason;
      const msg =
        typeof reason === "string"
          ? reason
          : reason?.message
          ? reason.message
          : "Unhandled promise rejection";
      const stack = reason?.stack;
      setCrash({
        type: "unhandledrejection",
        message: msg,
        stack,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (!crash) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.86)",
        color: "#fff",
        padding: 16,
        overflow: "auto",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
          💥 Client Crash Captured ({crash.type})
        </div>

        <div style={{ opacity: 0.9, marginBottom: 12, fontSize: 13 }}>
          URL: {typeof location !== "undefined" ? location.href : ""} <br />
          UA: {ua}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Message</div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{crash.message}</pre>
        </div>

        {crash.source && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Source</div>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{crash.source}</pre>
          </div>
        )}

        {crash.stack && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Stack</div>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{crash.stack}</pre>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          <button
            onClick={() => setCrash(null)}
            style={{
              borderRadius: 10,
              padding: "10px 12px",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#fff",
              fontWeight: 800,
            }}
          >
            閉じる（続行）
          </button>

          <button
            onClick={() => location.reload()}
            style={{
              borderRadius: 10,
              padding: "10px 12px",
              background: "rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#fff",
              fontWeight: 800,
            }}
          >
            リロード
          </button>
        </div>

        <div style={{ opacity: 0.8, marginTop: 14, fontSize: 12 }}>
          ↑ この画面の Message/Stack をそのまま貼れば、原因を一発で確定して直せます。
        </div>
      </div>
    </div>
  );
}