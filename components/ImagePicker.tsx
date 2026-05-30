// /components/ImagePicker.tsx
"use client";

import React, { useCallback } from "react";
import type { DraftImage, DraftImages } from "@/lib/types/draft";

type Props = {
  images: DraftImages | null;
  onChange: (next: DraftImages) => void;
};

/**
 * ImagePicker（primary固定 + materials複数）
 * - images が null のときは描画しない
 * - images.primary が欠けている/壊れている場合でもクラッシュしない（TS警告回避）
 *   ※ primaryは本来必須だが、Firestore移行中/旧データ混在の一瞬を想定してガードする
 */
export default function ImagePicker({ images, onChange }: Props) {
  const setPrimary = useCallback(
    (img: DraftImage) => {
      onChange({
        primary: img,
        materials: images?.materials ?? [],
      });
    },
    [images, onChange]
  );

  const addMaterial = useCallback(
    (img: DraftImage) => {
      if (!images) return;
      onChange({
        ...images,
        materials: [...(images.materials ?? []), img],
      });
    },
    [images, onChange]
  );

  const reorderMaterials = useCallback(
    (from: number, to: number) => {
      if (!images) return;
      const list = [...(images.materials ?? [])];
      if (from < 0 || from >= list.length) return;
      if (to < 0 || to >= list.length) return;

      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);

      onChange({ ...images, materials: list });
    },
    [images, onChange]
  );

  if (!images) return null;

  // ✅ primary が null/undefined でも落とさない（TS: possibly null を完全解消）
  const primary = images.primary ?? null;

  return (
    <div className="grid gap-4">
      {/* primary */}
      <div>
        <div className="font-bold text-sm mb-1">代表画像（primary）</div>

        {primary?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={primary.url} className="rounded-xl border" alt="primary" />
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">
            primary が未設定です（旧データ/移行中の可能性）。一度 primary を選択してください。
          </div>
        )}

        <div className="text-xs text-white/60 mt-1">
          判断・生成・再利用の基準（1枚固定）
        </div>

        {/* ここはUI側の「差替え導線」を置く想定（呼び出し側で setPrimary を使う） */}
        {/* 例：親から file input / 既存画像リストを渡して setPrimary(img) */}
      </div>

      {/* materials */}
      <div>
        <div className="font-bold text-sm mb-1">素材画像（materials）</div>

        {(images.materials ?? []).length ? (
          <div className="grid grid-cols-3 gap-2">
            {(images.materials ?? []).map((m, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.id}
                src={m.url}
                className="rounded-lg border"
                alt={`material-${i + 1}`}
                title={`順序 ${i + 1}`}
                draggable={false}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">
            materials がまだありません（追加できます）
          </div>
        )}
      </div>

      {/* NOTE:
          setPrimary / addMaterial / reorderMaterials は
          親コンポーネントからの操作導線（ボタンやD&D）で呼ぶ想定。
          ここでは “型安全 + null耐性 + TS警告ゼロ” を優先して最小修正。
      */}
    </div>
  );
}