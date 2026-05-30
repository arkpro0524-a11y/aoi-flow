// /app/flow/drafts/new/components/StoryImagePanel.tsx
"use client";

import React from "react";
import { Btn } from "../ui";

/**
 * ⑤ ストーリー AI再生成用UI
 *
 * 重要
 * - 親の ImageTabPanel からは
 *   storyImageUrl / onGenerateStoryImage / busy
 *   を受ける
 *
 * 今回の追加
 * - 削除後に Storage から復活できるように、
 *   onSyncStoryImagesFromStorage を追加
 *
 * 方針
 * - 既存の表示
 * - 既存の「ストーリー画像を生成」
 * は削除しない
 * - 必要最小限で「同期」ボタンだけ足す
 */

type Props = {
  storyImageUrl?: string | null;
  onGenerateStoryImage: () => Promise<void>;
  onSyncStoryImagesFromStorage?: () => Promise<void> | void;
  busy?: boolean;
};

export default function StoryImagePanel({
  storyImageUrl,
  onGenerateStoryImage,
  onSyncStoryImagesFromStorage,
  busy = false,
}: Props) {
  return (
    <details className="rounded-2xl border border-white/10 bg-black/20" open>
      <summary className="cursor-pointer select-none p-3">
        <div className="text-white/70" style={{ fontSize: 12 }}>
          ⑤ ストーリー（AI再生成）
        </div>
      </summary>

      <div className="p-3 pt-0">
        {storyImageUrl ? (
          <img
            src={storyImageUrl}
            alt="story"
            className="w-full rounded-xl border border-white/10"
            style={{
              height: 240,
              objectFit: "contain",
              background: "rgba(0,0,0,0.25)",
            }}
          />
        ) : (
          <div
            className="w-full rounded-xl border border-white/10 bg-black/30 flex items-center justify-center text-white/55"
            style={{ aspectRatio: "1 / 1", fontSize: 13 }}
          >
            ストーリー画像がありません
          </div>
        )}

        <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
          <div className="text-white/84 font-bold" style={{ fontSize: 13 }}>
            この枠の役割
          </div>
          <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.7 }}>
            ⑤は「ただきれい」ではなく、
            <br />
            この商品がある場面や空気まで伝えるための画像です。
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Btn
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              await onGenerateStoryImage();
            }}
          >
            ストーリー画像を生成
          </Btn>

          <Btn
            variant="secondary"
            disabled={busy || typeof onSyncStoryImagesFromStorage !== "function"}
            onClick={() => {
              void onSyncStoryImagesFromStorage?.();
            }}
            title="Storage からストーリー画像を復活します"
          >
            ストーリー画像を同期
          </Btn>
        </div>

        <div className="mt-2 text-white/52" style={{ fontSize: 12, lineHeight: 1.6 }}>
          ※ 物語性を強めた再生成です。商品そのものの見やすさより、空気感や背景文脈を重視します。
        </div>
      </div>
    </details>
  );
}