// /lib/videoDecision/saveDecision.ts（全張り替え）

import { getAdminDb } from "@/app/api/_firebase/admin";
import type { TextOverlayBySlot } from "@/lib/types/draft";

export async function saveVideoDecision(params: {
  uid: string;
  draftId?: string | null;
  primaryImageId: string;

  engine: "runway" | "non-ai";
  reused: boolean;
  hash?: string;

  /** 🔽 追加 */
  videoBurnedUrl?: string;
  videoBurnedAt?: Date;
  videoTextOverlay?: TextOverlayBySlot;
}) {
  const db = getAdminDb();
  const ref = db.collection("videoDecisions").doc();

  await ref.set({
    uid: params.uid,
    draftId: params.draftId ?? null,
    primaryImageId: params.primaryImageId,

    engine: params.engine,
    reused: params.reused,
    hash: params.hash ?? null,

    videoBurnedUrl: params.videoBurnedUrl ?? null,
    videoBurnedAt: params.videoBurnedAt ?? null,
    videoTextOverlay: params.videoTextOverlay ?? null,

    createdAt: new Date(),
  });

  return ref.id;
}