//lib/sellCheck/imageScore.ts
// 画像評価（軽量版：実用レベル）
export function evaluateImageQuality(meta: {
  brightness: number;
  centered: boolean;
  backgroundClean: boolean;
}) {
  let score = 50;

  if (meta.brightness > 0.6) score += 15;
  if (meta.centered) score += 15;
  if (meta.backgroundClean) score += 20;

  return Math.min(100, score);
}