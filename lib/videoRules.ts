// /lib/videoRules.ts

import { getVideoButtonById } from "@/lib/videoButtons";
import type { MotionCharacter } from "@/lib/types/draft";

/* =========================
   現在の設計：
   - videoButtons は nonai 専用
   - runway は別構造（cmVideo）
   よって isRunway は常に false
========================= */

export function isRunway(_id?: string) {
  return false;
}

export function canUseMotion(id?: string) {
  return !!getVideoButtonById(id);
}

export function clampMotionToRange(
  id: string,
  motion: MotionCharacter
): MotionCharacter {
  const b = getVideoButtonById(id);
  if (!b) return motion;

  const clamp = <T>(val: T, list: T[]) =>
    list.includes(val) ? val : list[0];

  return {
    tempo: clamp(motion.tempo, b.motionRange.tempo),
    reveal: clamp(motion.reveal, b.motionRange.reveal),
    intensity: clamp(motion.intensity, b.motionRange.intensity),
    attitude: clamp(motion.attitude, b.motionRange.attitude),
    rhythm: clamp(motion.rhythm, b.motionRange.rhythm),
  };
}

export function enforceRunwayLimit(ids: string[], _max = 2) {
  // runwayは存在しないのでそのまま返す
  return { ok: true, selectedIds: ids };
}