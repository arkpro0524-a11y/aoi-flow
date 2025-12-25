"use client";

import React, { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("GlobalError:", error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          background: "#05070c",
          color: "#fff",
          padding: 16,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        }}
      >
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <h1 style={{ fontSize: 18, marginBottom: 12 }}>💥 App Error (error.tsx)</h1>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Message</div>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{error?.message}</pre>
          </div>

          {error?.stack && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Stack</div>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{error.stack}</pre>
            </div>
          )}

          {error?.digest && (
            <div style={{ opacity: 0.85, marginTop: 8, fontSize: 12 }}>
              digest: {error.digest}
            </div>
          )}

          <button
            onClick={() => reset()}
            style={{
              marginTop: 16,
              borderRadius: 10,
              padding: "10px 12px",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#fff",
              fontWeight: 800,
            }}
          >
            再試行
          </button>
        </div>
      </body>
    </html>
  );
}