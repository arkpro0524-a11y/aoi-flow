// /lib/server/pricing.ts

export type VideoQuality = "standard" | "high";
export type VideoSeconds = 5 | 10;

export const PRICING = {
  // 画像
  IMAGE_YEN_PER_GEN: 8,

  // 動画（“単価ズレ”を潰すため、表を単一ソース化）
  VIDEO_PRICE_TABLE: {
    standard: { 5: 180, 10: 320 },
    high: { 5: 420, 10: 780 },
  } as const satisfies Record<VideoQuality, Record<VideoSeconds, number>>,

  MAX_PROMPT_CHARS: 2000,

  public() {
    return {
      image: { yenPerGen: this.IMAGE_YEN_PER_GEN },
      video: this.VIDEO_PRICE_TABLE,
      maxPromptChars: this.MAX_PROMPT_CHARS,
      allowedVideoSeconds: [5, 10],
      allowedVideoQuality: ["standard", "high"],
    };
  },

  calcImageCostYen() {
    return this.IMAGE_YEN_PER_GEN;
  },

  calcVideoCostYen(seconds: VideoSeconds, quality: VideoQuality) {
    const q: VideoQuality = quality === "high" ? "high" : "standard";
    const s: VideoSeconds = seconds === 10 ? 10 : 5;
    return this.VIDEO_PRICE_TABLE[q][s];
  },

  /**
   * B対策：秒数の解釈をここで固定して「勝手に長くならない」
   * - 文字列/数値/ms/s を吸収
   * - 5000 などは ms とみなす
   * - 最終的に 5 or 10 に丸める（許可値）
   */
  normalizeVideoSeconds(input: unknown): VideoSeconds {
    let sec: number | null = null;

    if (typeof input === "number" && Number.isFinite(input)) sec = input;

    if (typeof input === "string") {
      const s = input.trim().toLowerCase();
      if (s.endsWith("ms")) {
        const n = Number(s.replace("ms", ""));
        if (Number.isFinite(n)) sec = n / 1000;
      } else if (s.endsWith("s")) {
        const n = Number(s.replace("s", ""));
        if (Number.isFinite(n)) sec = n;
      } else {
        const n = Number(s);
        if (Number.isFinite(n)) sec = n;
      }
    }

    if (sec == null) sec = 5;

    if (sec >= 1000) sec = sec / 1000;
    sec = Math.ceil(sec);

    // 許可値は 5 / 10 のみ
    const target = sec >= 8 ? 10 : 5;
    return target as VideoSeconds;
  },
};