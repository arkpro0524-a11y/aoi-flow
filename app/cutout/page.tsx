//app/cutout/page.tsx
"use client";

import { useState } from "react";

export default function CutoutPage() {
  const [url, setUrl] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/api/cutout", {
      method: "POST",
      body: fd,
    });

    const blob = await res.blob();
    setUrl(URL.createObjectURL(blob));
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>透過テスト</h1>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {url && (
        <div style={{ marginTop: 20 }}>
          <img src={url} style={{ maxWidth: 400 }} />
        </div>
      )}
    </div>
  );
}