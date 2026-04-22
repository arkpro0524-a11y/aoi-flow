// /lib/videoDecision/rules.ts

import { getVideoButtonById, videoButtons } from "@/lib/videoButtons";
import type { VideoLabels } from "./labels";

/**
 * AOI FLOW
 * 商品動画（nonai）専用ルール
 *
 * 今回の方針
 * - 「派手な入口」より「検品・理解」を優先
 * - そのため候補順を明示的に制御する
 * - runway 比較はしない
 */

function scoreTemplate(id: string, labels: VideoLabels) {
  let score = 0;

  /**
   * labels 側の詳細型が今後増減しても落ちないように、
   * ここでは存在確認ベースで安全に扱う
   */
  const focus = String((labels as any)?.focus ?? "");
  const motion = String((labels as any)?.motion ?? "");
  const emphasis = String((labels as any)?.emphasis ?? "");
  const tone = String((labels as any)?.tone ?? "");
  const usecase = String((labels as any)?.usecase ?? "");

  switch (id) {
    case "sell_luxury_slow_zoom_nonai":
      score += 30;
      if (focus === "product") score += 18;
      if (tone === "premium" || tone === "calm") score += 12;
      if (emphasis === "restrained") score += 10;
      break;

    case "sell_compare_split_nonai":
      score += 28;
      if (focus === "product") score += 18;
      if (motion === "static") score += 10;
      break;

    case "sell_hook_1s_pushin_nonai":
      score += 18;
      if (focus === "product") score += 8;
      if (motion !== "static") score += 6;
      break;

    case "sell_usecase_bgvideo_comp_nonai":
      score += 10;
      if (usecase === "room" || usecase === "lifestyle") score += 18;
      if (focus !== "product") score += 8;
      break;

    case "sell_cta_last_pushin_nonai":
      score += 8;
      if (focus === "product") score += 4;
      break;

    default:
      score += 0;
      break;
  }

  return score;
}

/**
 * 候補抽出
 * - まず全部候補に入れる
 * - その後 score で並び替える
 */
export function pickCandidates(labels: VideoLabels) {
  const scored = videoButtons.map((button) => ({
    button,
    score: scoreTemplate(button.id, labels),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.map((x) => x.button);
}

/**
 * 最終テンプレ決定
 * - 先頭 = もっとも思想に近いもの
 * - 念のため getVideoButtonById でも存在保証をかける
 */
export function decideFinalTemplate(candidates: typeof videoButtons) {
  const first = candidates[0];
  if (!first) return null;

  return getVideoButtonById(first.id) ?? null;
}