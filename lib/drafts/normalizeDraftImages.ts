// lib/drafts/normalizeDraftImages.ts

import type { DraftImages } from "@/lib/types/draft";

/**
 * DraftDoc に images が無い（旧データ）場合に、
 * baseImageUrl から primary を自動生成して互換維持する。
 *
 * ルール：
 * - 既存の baseImageUrl は削除しない（移行期間）
 * - images が既にあれば何もしない
 * - images が無くて baseImageUrl があれば primary を作る
 * - materials は空で開始（あとで追加できる）
 */
export function normalizeDraftImages<T extends { baseImageUrl?: any; images?: any }>(d: T): T & {
  images: DraftImages;
} {
  const hasImages = !!(d as any).images;

  // 既に images があるならそのまま返す（ただし形だけ軽く整える）
  if (hasImages) {
    const images = (d as any).images as DraftImages;

    const primary = images?.primary ?? null;
    const materials = Array.isArray(images?.materials) ? images.materials : [];

    return {
      ...(d as any),
      images: {
        primary,
        materials,
      },
    };
  }

  // 旧：baseImageUrl → primary を生成
  const base = typeof (d as any).baseImageUrl === "string" ? (d as any).baseImageUrl : "";
  if (base) {
    const now = Date.now();
    return {
      ...(d as any),
      images: {
        primary: {
          id: "legacy",
          url: base,
          createdAt: now,
          role: "product",
        },
        materials: [],
      },
    };
  }

  // images も base も無い（新規 or 空データ）
  return {
    ...(d as any),
    images: {
      primary: null,
      materials: [],
    },
  };
}