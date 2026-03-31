// /app/flow/drafts/new/components/CompositeImagePanel.tsx
"use client";

import React from "react";

/**
 * ④ 合成（動画用・文字なし）
 *
 * ✅ この部品の責務
 * - 合成画像の表示
 * - 合成が最新かどうかの注意表示
 *
 * ✅ 今回の調整
 * - 影を「広い黒い楕円」ではなく、もっと薄く自然に見える形へ修正
 * - 濃すぎる違和感を減らす
 * - 既存の表示ロジックは変えない
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
            className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/55"
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
          <div
            className="flex w-full items-center justify-center rounded-xl border border-white/10"
            style={{
              height: 240,
              background: "#ffffff",
              overflow: "hidden",
              padding: 10,
            }}
          >
            <img
              src={aiImageUrl}
              alt="composite"
              className="max-h-full max-w-full"
              style={{
                objectFit: "contain",

                /**
                 * 影をかなり弱めて自然寄りにします
                 * - 近い影を薄く
                 * - 遠い影をさらに薄く
                 * - 前回より黒さと広がりを減らす
                 */
                filter:
                  "drop-shadow(0px 6px 8px rgba(0, 0, 0, 0.10)) drop-shadow(0px 14px 14px rgba(0, 0, 0, 0.06))",

                /**
                 * 少しだけ下げて接地感を出します
                 * 前回より弱めます
                 */
                transform: "translateY(1px)",
              }}
            />
          </div>
        ) : (
          <div
            className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/55"
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
          className="mt-2 text-white/55"
          style={{ fontSize: 12, lineHeight: 1.5 }}
        >
          ※ この画像が「動画」に使われます（文字なし）。
        </div>
      </div>
    </details>
  );
}