// /lib/types/image.ts
export type DraftImageRole =
  | "product"
  | "material"
  | "detail"
  | "context"
  | "other";

export type DraftImage = {
  id: string;
  url: string;
  role: DraftImageRole;
  createdAt: number;
};

export type DraftImages = {
  primaryImageId: string | null;
  items: DraftImage[];
};