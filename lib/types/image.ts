// /lib/types/image.ts
export type DraftImageRole =
  | "product"   // 商品そのもの（動画・背景の主素材）
  | "detail"    // 質感・寄り
  | "context"   // 置き・使用イメージ
  | "other";

export type DraftImage = {
  id: string;          // uuid
  url: string;
  role: DraftImageRole;
  createdAt: number;
};

export type DraftImages = {
  primaryImageId: string | null; // ★常に1つ
  items: DraftImage[];           // 複数
};