// app/api/_pricing/pricing.ts
// ✅ ここが「唯一の価格・秒数ルールの定義」
// /api/config も /api/generate-image も、必ずこのファイルを参照する。
// こうすると C)「表示と実ロジックが別物」を構造的に防げる。

export type VideoUiSeconds = 5 | 10 | 15; // UIで選べる秒数（例）
export type VideoActualSeconds = 4 | 8 | 12 | 16; // 実際に生成・課金される秒数（例）

export const PRICING_VERSION = "2026-01-07";

// 🔽 あなたのアプリの実態に合わせて調整してOK（ただし“ここだけ”変える）
export const PRICING = {
  currency: "JPY",
  // 例：動画は「4秒単位」でしか生成できない想定
  video: {
    // 1秒あたりの単価（例）。実際はモデルや解像度で変動するなら、分岐を増やす。
    // 重要：見積もりは「UI秒」ではなく「実生成秒(課金秒)」で計算する
    pricePerSecond: 90, // 例：90円/秒（ダミー。あなたの設定に合わせて）
    allowedUiSeconds: [5, 10, 15] as const,
    // UI(5/10/15) → 実生成(8/12/16) に“自動で伸びる”仕様を、ここで明文化
    uiToActualSecondsMap: {
      5: 8,
      10: 12,
      15: 16,
    } as const,
  },

  // 画像も同様にやるならここに追加
  image: {
    // 例：1回あたり
    pricePerGeneration: 120, // 例：120円/回（ダミー）
  },
} as const;

export function getActualVideoSeconds(uiSeconds: number): VideoActualSeconds {
  const map = PRICING.video.uiToActualSecondsMap as Record<number, number>;
  const actual = map[uiSeconds];
  if (!actual) {
    // UIから来る値が変でも、サーバーが勝手に変換せず止める（過剰課金防止）
    throw new Error(`Invalid video seconds: ${uiSeconds}`);
  }
  return actual as VideoActualSeconds;
}

export function estimateVideoCostJPY(uiSeconds: number) {
  const actualSeconds = getActualVideoSeconds(uiSeconds);
  const estimatedJPY = actualSeconds * PRICING.video.pricePerSecond;

  return {
    uiSeconds,
    actualSeconds, // ✅ “実生成/課金秒”
    estimatedJPY,  // ✅ 見積もりは必ずこちら
    currency: PRICING.currency,
    version: PRICING_VERSION,
  };
}

export function estimateImageCostJPY() {
  return {
    estimatedJPY: PRICING.image.pricePerGeneration,
    currency: PRICING.currency,
    version: PRICING_VERSION,
  };
}