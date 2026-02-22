// /components/upload/ImageUploader.tsx
// /components/upload/ImageUploader.tsx
"use client";

import React, { useRef } from "react";

type Props = {
  disabled?: boolean;
  multiple?: boolean;
  onPick: (files: File[]) => void;
  label?: string;
};

export default function ImageUploader({
  disabled,
  multiple = true,
  onPick,
  label = "画像をアップロード",
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={!!disabled}
        onClick={() => {
          console.log("[ImageUploader] click button, disabled=", !!disabled);
          inputRef.current?.click();
        }}
        className="inline-flex items-center justify-center rounded-full px-5 py-2 font-black bg-white text-black hover:bg-white/90 transition disabled:opacity-50"
      >
        {label}
      </button>

      {/* ✅ display:none をやめる（環境によっては files が取れなくなるため） */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        // ✅ 画面外に逃がす（見えないけど “存在” はする）
        style={{
          position: "absolute",
          left: "-9999px",
          width: 1,
          height: 1,
          opacity: 0,
        }}
        onChange={(e) => {
          console.log("[ImageUploader] onChange fired");
          const fl = e.currentTarget.files;

          if (!fl || fl.length === 0) {
            console.log("[] no files");
            // ✅ 同じファイルを連続で選べるように、必ずクリア
            e.currentTarget.value = "";
            return;
          }

          const files = Array.from(fl).filter(Boolean);
          console.log(
            "[ImageUploader] picked:",
            files.map((f) => `${f.name} (${f.type}) ${f.size}`)
          );

          // ✅ 同じファイルを連続で選べるように、必ずクリア
          e.currentTarget.value = "";

          onPick(files);
        }}
      />
    </div>
  );
}