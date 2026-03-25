// /app/cutout/page.tsx
"use client";

import { useState } from "react";

export default function CutoutPage() {
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const handleFile = async (file: File) => {
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
        const text = await res.text().catch(() => "");
        throw new Error(text || `status ${res.status}`);
      }

      const isFallback = res.headers.get("X-Cutout-Fallback") === "true";
      const blob = await res.blob();

      setUrl(URL.createObjectURL(blob));
      setMsg(
        isFallback
          ? "cutoutサーバー未接続のため、透過ではなくPNG変換で返しました"
          : "透過画像を取得しました"
      );
    } catch (e: any) {
      console.error(e);
      setMsg(`失敗: ${e?.message || "不明"}`);
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>透過テスト</h1>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {msg ? (
        <div style={{ marginTop: 16, fontSize: 14, opacity: 0.85 }}>{msg}</div>
      ) : null}

      {url ? (
        <div style={{ marginTop: 20 }}>
          <img src={url} alt="cutout result" style={{ maxWidth: 400 }} />
        </div>
      ) : null}
    </div>
  );
}