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
   🎯 非AI専用：売上量産エンジン
   - 崩壊ゼロ
   - 再生成なし
   - カメラ/構成のみ
===================================================== */

export const videoButtons: VideoButton[] = [
  // =========================
  // 即売型（3秒フック）
  // =========================
  {
    id: "sell_hook_1s_pushin_nonai",
    big: "① 即売型",
    mid: "3秒フック",
    small: "強ズームイン",
    engine: "nonai",
    description: "冒頭1秒で注目を取る（崩壊ゼロ）",
    motionRange: {
      tempo: ["sharp", "normal"],
      reveal: ["early"],
      intensity: ["balanced", "strong"],
      attitude: ["assertive", "neutral"],
      rhythm: ["continuous"],
    },
    defaultMotion: {
      tempo: "normal",
      reveal: "early",
      intensity: "balanced",
      attitude: "assertive",
      rhythm: "continuous",
    },
  },

  // =========================
  // 高級ブランド型
  // =========================
  {
    id: "sell_luxury_slow_zoom_nonai",
    big: "② 高級ブランド型",
    mid: "余白重視",
    small: "スローズーム",
    engine: "nonai",
    description: "スロー＋余白で高級感を演出",
    motionRange: {
      tempo: ["slow"],
      reveal: ["delayed"],
      intensity: ["calm"],
      attitude: ["humble", "neutral"],
      rhythm: ["with_pause"],
    },
    defaultMotion: {
      tempo: "slow",
      reveal: "delayed",
      intensity: "calm",
      attitude: "neutral",
      rhythm: "with_pause",
    },
  },

  // =========================
  // 比較訴求型
  // =========================
  {
    id: "sell_compare_split_nonai",
    big: "③ 比較訴求型",
    mid: "安全比較",
    small: "静止分割",
    engine: "nonai",
    description: "再生成なし。並列表示で差を見せる",
    motionRange: {
      tempo: ["slow"],
      reveal: ["early"],
      intensity: ["calm"],
      attitude: ["neutral"],
      rhythm: ["with_pause"],
    },
    defaultMotion: {
      tempo: "slow",
      reveal: "early",
      intensity: "calm",
      attitude: "neutral",
      rhythm: "with_pause",
    },
  },

  // =========================
  // 使用イメージ型
  // =========================
  {
    id: "sell_usecase_bgvideo_comp_nonai",
    big: "④ 使用イメージ型",
    mid: "実写風",
    small: "背景動画合成",
    engine: "nonai",
    description: "商品固定＋背景動画で生活感を出す",
    motionRange: {
      tempo: ["normal"],
      reveal: ["delayed"],
      intensity: ["balanced"],
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

  // =========================
  // CTA型
  // =========================
  {
    id: "sell_cta_last_pushin_nonai",
    big: "⑤ CTA型",
    mid: "行動促進",
    small: "ラスト強調ズーム",
    engine: "nonai",
    description: "最後に寄って行動を促す",
    motionRange: {
      tempo: ["normal"],
      reveal: ["last"],
      intensity: ["balanced"],
      attitude: ["assertive"],
      rhythm: ["continuous"],
    },
    defaultMotion: {
      tempo: "normal",
      reveal: "last",
      intensity: "balanced",
      attitude: "assertive",
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