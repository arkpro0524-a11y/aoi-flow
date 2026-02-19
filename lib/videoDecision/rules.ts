// /lib/videoDecision/rules.ts

import { videoButtons } from "@/lib/videoButtons";
import type { VideoLabels } from "./labels";

export function pickCandidates(labels: VideoLabels) {
  return videoButtons.filter((b) => {
    if (labels.focus === "product" && b.big.startsWith("①")) return false;
    if (labels.motion === "static" && b.engine === "runway") return false;
    if (labels.emphasis === "restrained" && b.runwayExclusive) return false;
    return true;
  });
}

export function decideFinalTemplate(candidates: typeof videoButtons) {
  return candidates[0] ?? null; // ← 並び順がそのまま“思想”
}