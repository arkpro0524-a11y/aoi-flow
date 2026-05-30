// /lib/videoButtons.ts

import type { MotionCharacter } from "@/lib/types/draft";

/* =========================
   型（非AI専用）
========================= */

export type VideoButton = {
  id: string;

  // UI分類
  big: string;
  mid: string;
  small: string;

  // 常に nonai
  engine: "nonai";

  /**
   * 説明文
   * - ユーザーに「このテンプレの役割」を明確に伝える
   * - 商品動画は演出ではなく、理解補助の道具として扱う
   */
  description: string;

  motionRange: {
    tempo: MotionCharacter["tempo"][];
    reveal: MotionCharacter["reveal"][];
    intensity: MotionCharacter["intensity"][];
    attitude: MotionCharacter["attitude"][];
    rhythm: MotionCharacter["rhythm"][];
  };

  defaultMotion: MotionCharacter;
};

// 旧データ救済
export const DEFAULT_VIDEO_BUTTON_ID = "sell_hook_1s_pushin_nonai";

/* =====================================================
   AOI FLOW｜商品動画（非AI専用）
   - 崩壊ゼロ
   - 再生成なし
   - 検品・理解・信頼を優先
===================================================== */

export const videoButtons: VideoButton[] = [
  /**
   * ① 全体確認型
   * - 最初に何の商品かを分かりやすく伝える
   * - 旧IDは維持する
   */
  {
    id: "sell_hook_1s_pushin_nonai",
    big: "① 検品導線",
    mid: "全体確認",
    small: "冒頭で把握",
    engine: "nonai",
    description: "冒頭で全体像を短く見せ、何の商品かをすぐ理解させる",
    motionRange: {
      tempo: ["normal", "sharp"],
      reveal: ["early"],
      intensity: ["calm", "balanced"],
      attitude: ["neutral", "assertive"],
      rhythm: ["continuous"],
    },
    defaultMotion: {
      tempo: "normal",
      reveal: "early",
      intensity: "balanced",
      attitude: "neutral",
      rhythm: "continuous",
    },
  },

  /**
   * ② 質感確認型
   * - 中古・高級感・素材感で最重要
   * - Vento にかなり相性が良い
   */
  {
    id: "sell_luxury_slow_zoom_nonai",
    big: "② 質感確認",
    mid: "素材を見せる",
    small: "静かな寄り",
    engine: "nonai",
    description: "木目・金属・布地などの質感確認に向いた静かなズーム",
    motionRange: {
      tempo: ["slow"],
      reveal: ["early", "delayed"],
      intensity: ["calm", "balanced"],
      attitude: ["humble", "neutral"],
      rhythm: ["with_pause", "continuous"],
    },
    defaultMotion: {
      tempo: "slow",
      reveal: "early",
      intensity: "calm",
      attitude: "neutral",
      rhythm: "with_pause",
    },
  },

  /**
   * ③ 多視点確認型
   * - 回転ではなく「視点切替」を主役にする
   * - 1枚から無理に回さない
   */
  {
    id: "sell_compare_split_nonai",
    big: "③ 多視点確認",
    mid: "正面以外も確認",
    small: "視点切替",
    engine: "nonai",
    description: "正面だけでなく側面や背面を比較的安全に見せる",
    motionRange: {
      tempo: ["slow", "normal"],
      reveal: ["early"],
      intensity: ["calm", "balanced"],
      attitude: ["neutral"],
      rhythm: ["with_pause", "continuous"],
    },
    defaultMotion: {
      tempo: "slow",
      reveal: "early",
      intensity: "balanced",
      attitude: "neutral",
      rhythm: "with_pause",
    },
  },

  /**
   * ④ 使用シーン補助型
   * - 検品主役ではない
   * - あくまで補助
   */
  {
    id: "sell_usecase_bgvideo_comp_nonai",
    big: "④ 使用イメージ",
    mid: "空間補助",
    small: "背景で補足",
    engine: "nonai",
    description: "設置後の雰囲気や使用シーンを補足する補助テンプレ",
    motionRange: {
      tempo: ["normal"],
      reveal: ["delayed"],
      intensity: ["calm", "balanced"],
      attitude: ["neutral"],
      rhythm: ["continuous"],
    },
    defaultMotion: {
      tempo: "normal",
      reveal: "delayed",
      intensity: "balanced",
      attitude: "neutral",
      rhythm: "continuous",
    },
  },

  /**
   * ⑤ まとめ締め型
   * - 最後に再確認させる
   * - CTA というより「確認の締め」
   */
  {
    id: "sell_cta_last_pushin_nonai",
    big: "⑤ まとめ",
    mid: "最終確認",
    small: "締めの寄り",
    engine: "nonai",
    description: "最後にもう一度見せ場を寄せて、記憶に残しやすくする",
    motionRange: {
      tempo: ["normal"],
      reveal: ["last"],
      intensity: ["calm", "balanced"],
      attitude: ["neutral", "assertive"],
      rhythm: ["continuous"],
    },
    defaultMotion: {
      tempo: "normal",
      reveal: "last",
      intensity: "balanced",
      attitude: "neutral",
      rhythm: "continuous",
    },
  },
];

/* =========================
   Utility
========================= */

export function getVideoButtonById(id?: string | null) {
  const key = String(id ?? "").trim();
  if (!key) return null;
  return videoButtons.find((b) => b.id === key) ?? null;
}

export function normalizeVideoButtonId(id?: string | null): string | null {
  const key = String(id ?? "").trim();
  if (!key) return null;
  return videoButtons.some((b) => b.id === key) ? key : DEFAULT_VIDEO_BUTTON_ID;
}

export function groupVideoButtons() {
  const map = new Map<
    string,
    { big: string; mids: { mid: string; items: { id: string }[] }[] }
  >();

  for (const b of videoButtons) {
    if (!map.has(b.big)) {
      map.set(b.big, { big: b.big, mids: [] });
    }

    const group = map.get(b.big)!;

    let mid = group.mids.find((m) => m.mid === b.mid);
    if (!mid) {
      mid = { mid: b.mid, items: [] };
      group.mids.push(mid);
    }

    mid.items.push({ id: b.id });
  }

  return Array.from(map.values());
}