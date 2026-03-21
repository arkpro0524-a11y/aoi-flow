//app/cutout-test/page.tsx
"use client";

import { useRef, useState } from "react";

export default function CutoutTestPage() {
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [out, setOut] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function runCutout(file: File) {
    setBusy(true);
    setOut(null);

    // 元画像プレビュー
    const localUrl = URL.createObjectURL(file);
    setSrc(localUrl);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/cutout", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        alert("透過に失敗\n" + t.slice(0, 300));
        return;
      }

      const blob = await res.blob(); // PNGが返る
      const outUrl = URL.createObjectURL(blob);
      setOut(outUrl);
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    runCutout(file);
  }

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>透過テスト（ドラッグでOK）</h1>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          marginTop: 12,
          padding: 20,
          borderRadius: 12,
          border: "2px dashed #999",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {busy ? "処理中..." : "ここに画像をドラッグ（またはクリック）"}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) runCutout(file);
          }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>元画像</div>
          {src ? (
            <img src={src} style={{ width: "100%", borderRadius: 12, border: "1px solid #ddd" }} />
          ) : (
            <div style={{ color: "#666" }}>まだありません</div>
          )}
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>透過後（PNG）</div>
          {out ? (
            <>
              <div
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  padding: 12,
                  background:
                    "linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)",
                  backgroundSize: "24px 24px",
                  backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
                }}
              >
                <img src={out} style={{ width: "100%", display: "block" }} />
              </div>

              <a
                href={out}
                download="cutout.png"
                style={{ display: "inline-block", marginTop: 10, padding: "8px 12px", border: "1px solid #333", borderRadius: 10 }}
              >
                PNGを保存
              </a>
            </>
          ) : (
            <div style={{ color: "#666" }}>まだありません</div>
          )}
        </div>
      </div>
    </div>
  );
}