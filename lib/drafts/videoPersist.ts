// /lib/drafts/videoPersist.ts
"use client";

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";
import type { DraftDoc, MotionCharacter, NonAiVideoPreset } from "@/lib/types/draft";

/**
 * ✅ 非AI動画の保存（冪等 / 順序維持）
 * - Runway箱(videoUrl/videoUrls)は触らない
 * - nonAiVideoUrls は「最新を先頭」にして最大10
 * - 競合しても transaction で最終形が崩れない
 */
export async function saveNonAiVideoToDraftTx(params: {
  draftId: string;
  userId: string; // 事故防止：呼び出し側で auth.uid を渡す
  url: string; // mp4/webm どちらでも可（sync側でmp4優先にする設計）
  preset: NonAiVideoPreset;
  motion?: MotionCharacter | null; // 任意
}) {
  const draftId = String(params.draftId || "").trim();
  const userId = String(params.userId || "").trim();
  const url = String(params.url || "").trim();

  if (!draftId) throw new Error("draftId is required");
  if (!userId) throw new Error("userId is required");
  if (!url) throw new Error("url is required");
  if (!params.preset) throw new Error("preset is required");

  const ref = doc(db, "drafts", draftId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("draft not found");

    const cur = (snap.data() || {}) as DraftDoc;

    // ✅ 所有者一致（最重要）
    const owner = String((cur as any).userId || "");
    if (owner && owner !== userId) throw new Error("forbidden (owner mismatch)");

    const curUrls = Array.isArray(cur.nonAiVideoUrls) ? cur.nonAiVideoUrls.filter(Boolean) : [];

    // ✅ 冪等：同じURLは重複させず「先頭」へ
    const nextUrls = [url, ...curUrls.filter((x) => x !== url)].slice(0, 10);

    // ✅ 非AIは nonAi* の箱だけ触る（Runway箱には触らない）
    const payload: Partial<DraftDoc> = {
      videoSource: "nonai",
      nonAiVideoUrl: url,
      nonAiVideoUrls: nextUrls,
      nonAiVideoPreset: params.preset ?? null,
      motion: params.motion ?? undefined,
      // ✅ statusは「非AI完了」扱いにするなら nonAiStatus を作るのが理想だが、
      //    現段階では videoStatus を無理に done にしない（Runwayと混線防止）
      updatedAt: serverTimestamp() as any,
    };

    tx.update(ref, payload as any);
  });
}