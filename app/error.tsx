"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "#05070c",
        color: "white",
      }}
    >
      <div style={{ maxWidth: 860, width: "100%" }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
          Error boundary (Next.js)
        </div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 14,
            padding: 14,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {error?.message}
        </pre>

        <button
          onClick={() => reset()}
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "white",
            fontWeight: 800,
          }}
        >
          再読み込み
        </button>
      </div>
    </div>
  );
}