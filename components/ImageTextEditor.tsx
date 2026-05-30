// /components/ImageTextEditor.tsx
"use client";

import React from "react";
import type { TextOverlay } from "@/lib/types/draft";

type Props = {
  value?: TextOverlay;
  onChange: (v: TextOverlay) => void;
};

type SafeTextOverlay = {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  x: number;
  y: number;
  color: string;
  background: {
    enabled: boolean;
    padding: number;
    color: string;
    radius: number;
  };
};

const DEFAULT: SafeTextOverlay = {
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
  const v: SafeTextOverlay = {
    lines: value?.lines ?? DEFAULT.lines,
    fontSize: value?.fontSize ?? DEFAULT.fontSize,
    lineHeight: value?.lineHeight ?? DEFAULT.lineHeight,
    x: value?.x ?? DEFAULT.x,
    y: value?.y ?? DEFAULT.y,
    color: value?.color ?? DEFAULT.color,
    background: {
      enabled: value?.background?.enabled ?? DEFAULT.background.enabled,
      padding: value?.background?.padding ?? DEFAULT.background.padding,
      color: value?.background?.color ?? DEFAULT.background.color,
      radius: value?.background?.radius ?? DEFAULT.background.radius,
    },
  };

  return (
    <div className="grid gap-3 rounded-xl border border-white/15 bg-black/25 p-3">
      <div className="text-xs font-bold text-white/70">文字（1行ごと）</div>

      <textarea
        value={v.lines.join("\n")}
        onChange={(e) =>
          onChange({
            ...value,
            ...v,
            lines: e.target.value.split("\n").filter(Boolean),
          })
        }
        className="rounded-lg border border-white/15 bg-black/40 p-2 text-sm text-white outline-none"
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-white/80">
          サイズ
          <input
            type="number"
            value={v.fontSize}
            onChange={(e) =>
              onChange({
                ...value,
                ...v,
                fontSize: Number(e.target.value),
              })
            }
            className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm text-white outline-none"
          />
        </label>

        <label className="text-xs text-white/80">
          行間
          <input
            type="number"
            step="0.1"
            value={v.lineHeight}
            onChange={(e) =>
              onChange({
                ...value,
                ...v,
                lineHeight: Number(e.target.value),
              })
            }
            className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm text-white outline-none"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-white/80">
          横位置
          <input
            type="number"
            min={0}
            max={100}
            value={v.x}
            onChange={(e) =>
              onChange({
                ...value,
                ...v,
                x: Number(e.target.value),
              })
            }
            className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm text-white outline-none"
          />
        </label>

        <label className="text-xs text-white/80">
          縦位置
          <input
            type="number"
            min={0}
            max={100}
            value={v.y}
            onChange={(e) =>
              onChange({
                ...value,
                ...v,
                y: Number(e.target.value),
              })
            }
            className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm text-white outline-none"
          />
        </label>
      </div>

      <label className="text-xs text-white/80">
        文字色
        <input
          type="color"
          value={v.color}
          onChange={(e) =>
            onChange({
              ...value,
              ...v,
              color: e.target.value,
            })
          }
          className="mt-1 block h-10 w-full rounded-md border border-white/15 bg-black/40 p-1"
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-white/80">
        <input
          type="checkbox"
          checked={v.background.enabled}
          onChange={(e) =>
            onChange({
              ...value,
              ...v,
              background: {
                ...v.background,
                enabled: e.target.checked,
              },
            })
          }
        />
        文字背景を使う
      </label>
    </div>
  );
}