// /app/cutout/page.tsx
"use client";

import { useState } from "react";

export default function CutoutPage() {
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    setMsg("送信中...");
    setUrl(null);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/cutout", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const text = await res.text().catch(() => "");

        const err =
          json?.error ||
          json?.detail ||
          text ||
          `status ${res.status}`;

        throw new Error(err);
      }

      const verified = res.headers.get("X-Cutout-Verified") === "true";
      const blob = await res.blob();

      setUrl(URL.createObjectURL(blob));
      setMsg(
        verified
          ? "透過画像を取得しました"
          : "画像は返りましたが、透過確認ヘッダーがありません"
      );
    } catch (e: any) {
      console.error(e);
      setMsg(`失敗: ${e?.message || "不明"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>透過テスト</h1>

      <input
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {msg ? (
        <div style={{ marginTop: 16, fontSize: 14, opacity: 0.85 }}>
          {msg}
        </div>
      ) : null}

      {url ? (
        <div style={{ marginTop: 20 }}>
          <img
            src={url}
            alt="cutout result"
            style={{
              maxWidth: 500,
              border: "1px solid #ccc",
              background:
                "linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)",
              backgroundSize: "24px 24px",
              backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}