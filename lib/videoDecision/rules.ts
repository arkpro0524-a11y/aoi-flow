// /lib/videoDecision/rules.ts

import { videoButtons } from "@/lib/videoButtons";
import type { VideoLabels } from "./labels";

/**
 * 商品動画（nonai）専用ルール
 * runwayはvideoButtonsに存在しないため比較しない
 */
export function pickCandidates(labels: VideoLabels) {
  return videoButtons.filter((b) => {
    // フォーカスがproductの場合、特定グループを除外
    if (labels.focus === "product" && b.big.startsWith("①")) return false;

    // 静止指定の場合、runway比較は削除（nonaiのみなので不要）
    // if (labels.motion === "static" && b.engine === "runway") return false;

    // 将来用フラグ（存在する場合のみ）
    if (labels.emphasis === "restrained" && (b as any).runwayExclusive)
      return false;

    return true;
  });
}

/**
 * 最終テンプレ決定
 * 並び順＝思想
 */
export function decideFinalTemplate(
  candidates: typeof videoButtons
) {
  return candidates[0] ?? null;
}