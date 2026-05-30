/**
 * app/api/_pricing/pricing.ts
 * ==========================
 * ✅ 注意：このプロジェクトでは「唯一の定義」は /lib/server/pricing.ts
 * このファイルは二重定義を防ぐための “再公開ラッパー” のみ。
 */

export {
  PRICING,
  PRICING_VERSION,
  CURRENCY,
  MAX_PROMPT_CHARS,
} from "@/lib/server/pricing";

export type { VideoSeconds, VideoQuality } from "@/lib/server/pricing";

import { PRICING } from "@/lib/server/pricing";

export function estimateVideoCostJPY(
  uiSeconds: number,
  quality: "standard" | "high" = "standard"
) {
  const seconds = PRICING.normalizeVideoSeconds(uiSeconds);
  const q = PRICING.normalizeVideoQuality(quality);

  const pub = PRICING.public();

  return {
    uiSeconds: seconds,
    estimatedJPY: PRICING.calcVideoCostYen(seconds, q),
    currency: pub.currency,
    version: pub.version,
  };
}

// 互換：名前だけ残す（中身は同じ。Runway動画は calcVideoCostYen が唯一の定義）
export function estimateRunwayVideoCostJPY(
  uiSeconds: number,
  quality: "standard" | "high" = "standard"
) {
  return estimateVideoCostJPY(uiSeconds, quality);
}