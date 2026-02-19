// /components/ImageTextEditor.tsx
"use client";

import React from "react";
import { TextOverlay } from "@/lib/types/draft";

type Props = {
  value?: TextOverlay;
  onChange: (v: TextOverlay) => void;
};

const DEFAULT: TextOverlay = {
  lines: [],
  fontSize: 42,
  lineHeight: 1.3,
  x: 60,
  y: 60,
  color: "#ffffff",
  background: {
    enabled: false,
    padding: 16,
    color: "rgba(0,0,0,0.4)",
    radius: 12,
  },
};

export default function ImageTextEditor({ value, onChange }: Props) {
  const v = value ?? DEFAULT;

  return (
    <div className="grid gap-3 rounded-xl border border-white/15 bg-black/25 p-3">
      <div className="text-xs font-bold text-white/70">文字（1行ごと）</div>
      <textarea
        value={v.lines.join("\n")}
        onChange={(e) =>
          onChange({ ...v, lines: e.target.value.split("\n").filter(Boolean) })
        }
        className="rounded-lg bg-black/40 border border-white/15 p-2 text-sm"
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">
          サイズ
          <input
            type="number"
            value={v.fontSize}
            onChange={(e) => onChange({ ...v, fontSize: Number(e.target.value) })}
          />
        </label>
        <label className="text-xs">
          行間
          <input
            type="number"
            step="0.1"
            value={v.lineHeight}
            onChange={(e) =>
              onChange({ ...v, lineHeight: Number(e.target.value) })
            }
          />
        </label>
      </div>

      <label className="text-xs">
        文字色
        <input
          type="color"
          value={v.color}
          onChange={(e) => onChange({ ...v, color: e.target.value })}
        />
      </label>
    </div>
  );
}