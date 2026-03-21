// /app/flow/drafts/new/components/SizeTemplatePanel.tsx
"use client";

import React from "react";
import type { SizeTemplateType } from "@/lib/types/draft";

/**
 * ③ サイズテンプレ表示用UI
 *
 * 重要
 * - 親の ImageTabPanel からは
 *   sizeTemplateType / setSizeTemplateType / busy
 *   の3つを受ける
 */

type Props = {
  sizeTemplateType: SizeTemplateType;
  setSizeTemplateType: React.Dispatch<React.SetStateAction<SizeTemplateType>>;
  busy?: boolean;
};

type TemplateCardProps = {
  id: SizeTemplateType;
  active: boolean;
  title: string;
  desc: string;
  bullets: string[];
  disabled?: boolean;
  onClick: () => void;
};

function TemplateCard({
  id,
  active,
  title,
  desc,
  bullets,
  disabled,
  onClick,
}: TemplateCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "w-full rounded-2xl border p-3 text-left transition",
        active
          ? "border-white/60 bg-white/10"
          : "border-white/10 bg-black/15 hover:bg-white/5",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-white/86 font-bold" style={{ fontSize: 13 }}>
          {title}
        </div>
        <div
          className={[
            "rounded-full px-2 py-1",
            active ? "bg-white/15 text-white" : "bg-black/20 text-white/55",
          ].join(" ")}
          style={{ fontSize: 11 }}
        >
          {id}
        </div>
      </div>

      <div className="mt-2 text-white/60" style={{ fontSize: 12, lineHeight: 1.6 }}>
        {desc}
      </div>

      <div className="mt-3 flex flex-col gap-1">
        {bullets.map((item) => (
          <div
            key={item}
            className="text-white/58"
            style={{ fontSize: 12, lineHeight: 1.5 }}
          >
            ・{item}
          </div>
        ))}
      </div>
    </button>
  );
}

export default function SizeTemplatePanel({
  sizeTemplateType,
  setSizeTemplateType,
  busy = false,
}: Props) {
  return (
    <details className="rounded-2xl border border-white/10 bg-black/20" open>
      <summary className="cursor-pointer select-none p-3">
        <div className="text-white/70" style={{ fontSize: 12 }}>
          ③ サイズ（テンプレ）
        </div>
      </summary>

      <div className="p-3 pt-0">
        <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
          <div className="text-white/84 font-bold" style={{ fontSize: 13 }}>
            サイズ見せ方テンプレ
          </div>
          <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
            サイズは AI に自由に考えさせず、売れやすくて見やすい型を使います。
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3">
          <TemplateCard
            id="simple"
            active={sizeTemplateType === "simple"}
            title="シンプル"
            desc="いちばん基本。商品と寸法だけをすっきり見せる型です。"
            bullets={["余計な装飾なし", "数字が見やすい", "はじめてでも使いやすい"]}
            disabled={busy}
            onClick={() => setSizeTemplateType("simple")}
          />

          <TemplateCard
            id="compare"
            active={sizeTemplateType === "compare"}
            title="比較"
            desc="他の物や目安と比べて、大きさの感覚を伝えやすい型です。"
            bullets={[
              "サイズ感が伝わりやすい",
              "家具や大きめ雑貨向き",
              "見た人が想像しやすい",
            ]}
            disabled={busy}
            onClick={() => setSizeTemplateType("compare")}
          />

          <TemplateCard
            id="detail"
            active={sizeTemplateType === "detail"}
            title="詳細"
            desc="縦・横・奥行きなどを丁寧に見せる型です。"
            bullets={[
              "情報量が多い",
              "不安を減らしやすい",
              "しっかり説明したい商品向き",
            ]}
            disabled={busy}
            onClick={() => setSizeTemplateType("detail")}
          />
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
          <div className="text-white/75 mb-2" style={{ fontSize: 12 }}>
            現在のテンプレ
          </div>
          <div className="text-white/88 font-bold" style={{ fontSize: 14 }}>
            {sizeTemplateType === "simple"
              ? "シンプル"
              : sizeTemplateType === "compare"
                ? "比較"
                : "詳細"}
          </div>

          <div className="mt-3 text-white/55" style={{ fontSize: 12, lineHeight: 1.7 }}>
            <div>使い分けの目安</div>
            <div>・シンプル：まず最初に使う</div>
            <div>・比較：家具や大きめ商品</div>
            <div>・詳細：寸法をしっかり見せたいとき</div>
          </div>
        </div>
      </div>
    </details>
  );
}