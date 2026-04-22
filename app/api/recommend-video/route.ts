// /app/api/recommend-video/route.ts

import { NextResponse } from "next/server";
import { videoButtons, getVideoButtonById } from "@/lib/videoButtons";
import type { MotionCharacter, VideoEngine } from "@/lib/types/draft";

export const runtime = "nodejs";

/**
 * AOI FLOW
 * 商品動画 추천 API
 *
 * 今回の方針
 * - 商品動画は「派手さ」より「検品・理解・信頼」を優先する
 * - Runway を混ぜない
 * - LLM 依存をやめ、必ず同じ条件で同じ推薦が返るようにする
 * - 旧UI互換のため、返却形式は recommendedVideos のまま維持する
 */

type Input = {
  brand?: {
    vision?: string;
    voice?: string;
    ban?: string;
    must?: string;
  };
  context?: {
    purpose?: string;
    platform?: string;
    keywords?: string[];
  };
};

type Pick = {
  id: string;
  engine: VideoEngine; // 実際には nonai のみ返す
  motionCharacter: MotionCharacter;
  reason: string;
};

function normalizeText(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function normalizeKeywords(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim().toLowerCase() : ""))
    .filter(Boolean)
    .slice(0, 20);
}

function includesAny(text: string, words: string[]) {
  return words.some((w) => text.includes(w));
}

function keywordIncludesAny(words: string[], targets: string[]) {
  return words.some((w) => targets.some((t) => w.includes(t)));
}

function scoreButton(params: {
  buttonId: string;
  purpose: string;
  platform: string;
  vision: string;
  keywords: string[];
}) {
  const { buttonId, purpose, platform, vision, keywords } = params;

  let score = 0;
  const reasons: string[] = [];

  const allText = [purpose, platform, vision, ...keywords].join(" ");

  const isUsedItem =
    includesAny(allText, [
      "used",
      "secondhand",
      "vintage",
      "antique",
      "中古",
      "古物",
      "ヴィンテージ",
      "アンティーク",
      "経年",
      "味",
      "patina",
    ]) || keywordIncludesAny(keywords, ["中古", "傷", "使用感", "ヴィンテージ", "アンティーク"]);

  const needsInspection =
    includesAny(allText, [
      "inspection",
      "trust",
      "condition",
      "detail",
      "quality",
      "状態",
      "検品",
      "傷",
      "質感",
      "本物感",
      "信頼",
      "状態確認",
    ]) || keywordIncludesAny(keywords, ["傷", "状態", "質感", "木目", "金属", "擦れ", "汚れ"]);

  const needsLuxury =
    includesAny(allText, [
      "luxury",
      "calm",
      "premium",
      "quiet",
      "上品",
      "高級",
      "静か",
      "余白",
      "誠実",
      "落ち着き",
    ]) || keywordIncludesAny(keywords, ["高級", "上品", "静か", "落ち着き"]);

  const needsUsecase =
    includesAny(allText, [
      "lifestyle",
      "room",
      "scene",
      "usage",
      "生活",
      "使用",
      "設置",
      "部屋",
      "空間",
      "シーン",
    ]) || keywordIncludesAny(keywords, ["部屋", "使用", "設置", "空間"]);

  const isMarketplace =
    includesAny(platform, ["mercari", "メルカリ", "yahoo", "ヤフオク", "fril", "ラクマ"]) ||
    includesAny(purpose, ["sell", "sale", "販売", "出品"]);

  /**
   * ボタンごとの思想
   * ① 全体確認
   * ② 質感確認
   * ③ 多視点確認
   * ④ 使用シーン補助
   * ⑤ まとめ締め
   */
  switch (buttonId) {
    case "sell_hook_1s_pushin_nonai":
      score += 20;
      reasons.push("冒頭で全体像を短く把握しやすい");
      if (isMarketplace) {
        score += 12;
        reasons.push("出品系では最初の全体確認が有効");
      }
      if (needsInspection) {
        score += 8;
        reasons.push("検品導線の入口として使いやすい");
      }
      break;

    case "sell_luxury_slow_zoom_nonai":
      score += 26;
      reasons.push("質感や素材感を丁寧に見せやすい");
      if (needsInspection) {
        score += 18;
        reasons.push("傷・木目・金属感などの確認に向く");
      }
      if (needsLuxury) {
        score += 18;
        reasons.push("静かで上品な見せ方と相性が良い");
      }
      if (isUsedItem) {
        score += 10;
        reasons.push("中古・ヴィンテージ商品の説得力を上げやすい");
      }
      break;

    case "sell_compare_split_nonai":
      score += 24;
      reasons.push("視点切替で形状理解を助けやすい");
      if (needsInspection) {
        score += 20;
        reasons.push("多視点確認が検品情報と相性が良い");
      }
      if (isUsedItem) {
        score += 14;
        reasons.push("正面だけでなく側面や背面確認が重要");
      }
      break;

    case "sell_usecase_bgvideo_comp_nonai":
      score += 10;
      reasons.push("使用イメージの補助に向く");
      if (needsUsecase) {
        score += 20;
        reasons.push("設置後の雰囲気を補足しやすい");
      }
      if (needsInspection) {
        score -= 10;
        reasons.push("ただし検品主役には向かない");
      }
      break;

    case "sell_cta_last_pushin_nonai":
      score += 8;
      reasons.push("最後の締めには使える");
      if (isMarketplace) {
        score += 6;
        reasons.push("最後の再確認カットとして使える");
      }
      if (needsInspection) {
        score += 4;
        reasons.push("検品後のまとめに置きやすい");
      }
      break;

    default:
      score += 0;
      reasons.push("安全な既定候補");
      break;
  }

  return {
    score,
    reason: reasons.slice(0, 2).join(" / "),
  };
}

function buildRecommendedVideos(input: Input): Pick[] {
  const vision = normalizeText(input?.brand?.vision);
  const purpose = normalizeText(input?.context?.purpose);
  const platform = normalizeText(input?.context?.platform);
  const keywords = normalizeKeywords(input?.context?.keywords);

  const scored = videoButtons.map((button) => {
    const result = scoreButton({
      buttonId: button.id,
      purpose,
      platform,
      vision,
      keywords,
    });

    return {
      id: button.id,
      score: result.score,
      reason: result.reason,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  /**
   * 返却は上位3件に絞る
   * 商品動画は選択肢が多すぎると逆に迷うため
   */
  return scored.slice(0, 3).map((item) => {
    const button = getVideoButtonById(item.id);

    return {
      id: item.id,
      engine: "nonai" as VideoEngine,
      motionCharacter: button?.defaultMotion ?? {
        tempo: "normal",
        reveal: "early",
        intensity: "balanced",
        attitude: "neutral",
        rhythm: "continuous",
      },
      reason: item.reason || "商品理解を優先した安全候補",
    };
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Input;

    const recommendedVideos = buildRecommendedVideos(body);

    return NextResponse.json({
      recommendedVideos,
    });
  } catch (error) {
    console.error("[/api/recommend-video] failed:", error);

    const fallback = buildRecommendedVideos({});

    return NextResponse.json({
      recommendedVideos: fallback,
    });
  }
}