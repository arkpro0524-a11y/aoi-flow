// /lib/videoRules.ts

import { videoButtons, getVideoButtonById } from "@/lib/videoButtons";
import type { MotionCharacter } from "@/lib/types/draft";

/* ========================= */

export function isRunway(id?: string) {
  const b = getVideoButtonById(id);
  return b?.engine === "runway";
}

export function canUseMotion(id?: string) {
  return !!getVideoButtonById(id);
}

export function clampMotionToRange(id: string, motion: MotionCharacter): MotionCharacter {
  const b = getVideoButtonById(id);
  if (!b) return motion;

  const clamp = <T>(val: T, list: T[]) => (list.includes(val) ? val : list[0]);

  return {
    tempo: clamp(motion.tempo, b.motionRange.tempo),
    reveal: clamp(motion.reveal, b.motionRange.reveal),
    intensity: clamp(motion.intensity, b.motionRange.intensity),
    attitude: clamp(motion.attitude, b.motionRange.attitude),
    rhythm: clamp(motion.rhythm, b.motionRange.rhythm),
  };
}

export function enforceRunwayLimit(ids: string[], max = 2) {
  const runway = ids.filter((id) => isRunway(id));
  if (runway.length <= max) {
    return { ok: true, selectedIds: ids };
  }
  return { ok: false, selectedIds: ids.slice(0, max) };
}