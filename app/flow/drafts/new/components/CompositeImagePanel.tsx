//app/flow/drafts/new/components/CompositeImagePanel.tsx
"use client";

import React from "react";

/**
 * ④ 合成（動画用・文字なし）
 *
 * ✅ この部品の責務
 * - 合成画像の表示
 * - 合成が最新かどうかの注意表示
 *
 * ✅ 重要
 * - 元の inline JSX の事故防止文言を落とさない
 * - 「古い①から作られた④」を明確に警告する
 */

type Props = {
  aiImageUrl: string | undefined;
  isCompositeFresh: boolean;
};

export default function CompositeImagePanel({
  aiImageUrl,
  isCompositeFresh,
}: Props) {
  return (
    <details className="area4 rounded-2xl border border-white/10 bg-black/20">
      <summary className="cursor-pointer select-none p-3">
        <div className="text-white/70" style={{ fontSize: 12 }}>
          ④ 合成（動画用・文字なし）
        </div>
      </summary>

      <div className="p-3 pt-0">
        {!aiImageUrl ? (
          <div
            className="w-full rounded-xl border border-white/10 bg-black/30 flex items-center justify-center text-white/55"
            style={{
              aspectRatio: "1 / 1",
              fontSize: 13,
              textAlign: "center",
              padding: 10,
            }}
          >
            合成画像がありません（製品画像＋背景を合成）
          </div>
        ) : isCompositeFresh ? (
          <img
            src={aiImageUrl || ""}
            alt="composite"
            className="w-full rounded-xl border border-white/10"
            style={{ height: 240, objectFit: "contain", background: "#fff" }}
          />
        ) : (
          <div
            className="w-full rounded-xl border border-white/10 bg-black/30 flex items-center justify-center text-white/55"
            style={{
              aspectRatio: "1 / 1",
              fontSize: 13,
              textAlign: "center",
              padding: 10,
            }}
          >
            ④は古い①から作られています。
            <br />
            「製品画像＋背景を合成（保存）」で再生成してください。
          </div>
        )}

        <div
          className="text-white/55 mt-2"
          style={{ fontSize: 12, lineHeight: 1.5 }}
        >
          ※ この画像が「動画」に使われます（文字なし）。
        </div>
      </div>
    </details>
  );
}