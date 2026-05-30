// /lib/pricing.ts
export type VideoSeconds = 5 | 10;
export type VideoQuality = "standard" | "high";

export const PRICING_VERSION = "2026-01-18";
export const CURRENCY = "JPY" as const;
export const MAX_PROMPT_CHARS = 800;

const RUNWAY_VIDEO_YEN_PER_SEC: Record<VideoQuality, number> = {
  standard: 36,
  high: 72,
};

function normalizeSeconds(input: any): VideoSeconds {
  const n = Number(input);
  return n === 10 ? 10 : 5;
}
function normalizeQuality(input: any): VideoQuality {
  return input === "high" ? "high" : "standard";
}

export function estimateVideoCostJPY(
  uiSeconds: number,
  quality: VideoQuality = "standard"
) {
  const seconds = normalizeSeconds(uiSeconds);
  const q = normalizeQuality(quality);

  return {
    uiSeconds: seconds,
    estimatedJPY: seconds * RUNWAY_VIDEO_YEN_PER_SEC[q],
    currency: CURRENCY,
    version: PRICING_VERSION,
  };
}