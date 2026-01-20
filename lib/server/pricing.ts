import "server-only";

export type VideoSeconds = 5 | 10;
export type VideoQuality = "standard" | "high";

export const PRICING_VERSION = "2026-01-18";

// ✅ 追加：外部から参照できる通貨定義（ラッパー互換）
export const CURRENCY = "JPY" as const;

// UI で許可する最大文字数（必要ならここだけ変える）
export const MAX_PROMPT_CHARS = 800;

const RUNWAY_VIDEO_YEN_PER_SEC: Record<VideoQuality, number> = {
  standard: 36,
  high: 72,
};

// OpenAI はこのアプリ内で「文章/画像/背景」に使う想定の“目安”
const OPENAI_ESTIMATE_YEN = {
  captions: 20,
  image: 120,
  background: 120,
};

function normalizeSeconds(input: any): VideoSeconds {
  const n = Number(input);
  return n === 10 ? 10 : 5;
}
function normalizeQuality(input: any): VideoQuality {
  return input === "high" ? "high" : "standard";
}

export const PRICING = {
  VERSION: PRICING_VERSION,
  CURRENCY,
  MAX_PROMPT_CHARS,

  normalizeVideoSeconds(input: any): VideoSeconds {
    return normalizeSeconds(input);
  },

  normalizeVideoQuality(input: any): VideoQuality {
    return normalizeQuality(input);
  },

  calcVideoCostYen(seconds: number, quality: VideoQuality) {
    const q: VideoQuality = normalizeQuality(quality);
    const sec: VideoSeconds = normalizeSeconds(seconds);
    return sec * RUNWAY_VIDEO_YEN_PER_SEC[q];
  },

  // 画像/背景 価格目安（UI表示用）
  calcImageCostYen(kind: "image" | "background" = "image") {
    return kind === "background" ? OPENAI_ESTIMATE_YEN.background : OPENAI_ESTIMATE_YEN.image;
  },

  public() {
    const video = {
      standard: {
        5: PRICING.calcVideoCostYen(5, "standard"),
        10: PRICING.calcVideoCostYen(10, "standard"),
      },
      high: {
        5: PRICING.calcVideoCostYen(5, "high"),
        10: PRICING.calcVideoCostYen(10, "high"),
      },
    } as const;

    return {
      currency: CURRENCY,
      version: PRICING_VERSION,
      video,

      runway: {
        videoYenPerSecond: { ...RUNWAY_VIDEO_YEN_PER_SEC },
        allowedSeconds: [5, 10] as const,
        quality: ["standard", "high"] as const,
      },

      openai: {
        estimateYen: { ...OPENAI_ESTIMATE_YEN },
      },
    };
  },
};