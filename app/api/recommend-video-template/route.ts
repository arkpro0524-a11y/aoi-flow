/**
 * /app/api/recommend-video-template/route.ts
 * ─────────────────────────────────────────────
 * 役割：
 * - 入力（画像有無/用途/尺/品質 等）から推奨テンプレを返す
 *
 * 設計：
 * - USE_RECOMMEND_VIDEO_TEMPLATE_MOCK=true  → mock JSON
 * - false → realロジック
 *
 * 注意：
 * - lib/server/runway.ts は「動画生成専用」なので、ここから import しない
 * - JSON構造は mock/実 で完全一致（実装時もこの形を維持）
 */

import { NextResponse } from "next/server";
import { getIdempotencyKey } from "@/lib/server/idempotency";

/* =========================================================
   型（このAPI内だけで完結 / UIは一切触らない）
========================================================= */

export type RecommendVideoTemplateParams = {
  hasImage: boolean;
  purpose?: string; // "product" etc
  seconds?: number; // UI入力をそのまま受ける
  quality?: string; // "standard" | "high" など
  platform?: string; // "instagram" etc
};

type Recommendation = {
  model: string;
  ratio: string;
  seconds: number;
  quality: "standard" | "high";
  reason: string;
};

/* =========================================================
   ENV 切替
========================================================= */

const USE_MOCK = process.env.USE_RECOMMEND_VIDEO_TEMPLATE_MOCK === "true";

/* =========================================================
   Utils（正規化）
========================================================= */

function normalizeSeconds(v: any): 5 | 10 {
  const n = typeof v === "string" ? Number(v) : Number(v);
  return n === 5 ? 5 : 10;
}

function normalizeQuality(v: any): "standard" | "high" {
  return String(v || "").toLowerCase() === "high" ? "high" : "standard";
}

function normalizePlatform(v: any): string {
  const s = String(v || "").trim().toLowerCase();
  return s || "instagram";
}

function normalizePurpose(v: any): string {
  const s = String(v || "").trim().toLowerCase();
  return s || "product";
}

function pickRatio(platform: string): string {
  // 縦型を優先したいプラットフォーム
  if (platform === "tiktok" || platform === "reels" || platform === "shorts") return "720:1280";
  // instagram でも「ストーリー前提」なら縦、通常投稿は横寄り…など将来分岐可能
  if (platform === "instagram_story") return "720:1280";
  // デフォルトは横
  return "1280:720";
}

/* =========================================================
   Mock 実装
========================================================= */

function mockRecommendTemplate(params: RecommendVideoTemplateParams) {
  const seconds = params.seconds === 5 ? 5 : 10;
  const quality = String(params.quality).toLowerCase() === "high" ? "high" : "standard";

  const recommendation: Recommendation = {
    model: "gen4_turbo",
    ratio: "1280:720",
    seconds,
    quality,
    reason: "商品アップ向けの汎用テンプレ（安定性優先）",
  };

  return {
    ok: true,
    mock: true,
    recommendation,
  };
}

/* =========================================================
   Real 実装（事故らない決定ロジック）
   - 目的：UIが迷わず選べる「無難な推奨」を返す
   - ここでは外部API呼び出しはしない（課金・遅延・失敗要因を増やさない）
========================================================= */

function realRecommendTemplate(params: RecommendVideoTemplateParams) {
  const platform = normalizePlatform(params.platform);
  const purpose = normalizePurpose(params.purpose);
  const hasImage = Boolean(params.hasImage);

  const seconds = normalizeSeconds(params.seconds);
  const quality = normalizeQuality(params.quality);

  // まず比率は platform から決める
  const ratio = pickRatio(platform);

  // model は現状固定（Runway側の実運用モデル）
  const model = "gen4_turbo";

  // reason を状況に応じて組み立て（UI説明に使える）
  const reasons: string[] = [];

  reasons.push(ratio === "720:1280" ? "縦型（短尺プラットフォーム向け）" : "横型（汎用・安定）");

  if (hasImage) reasons.push("画像あり前提の image→video が安定");
  else reasons.push("画像なし：まずは汎用テンプレで破綻回避（将来は text→video 等を検討）");

  if (purpose === "product") reasons.push("商品訴求：アップ寄りの無難な動き");
  else if (purpose === "brand") reasons.push("ブランド訴求：雰囲気重視の汎用構成");
  else if (purpose === "service") reasons.push("サービス訴求：説明より“印象”優先で破綻回避");
  else reasons.push("汎用目的：破綻しにくい標準構成");

  reasons.push(seconds === 5 ? "5秒：短く破綻しにくい" : "10秒：情報量と動きのバランス");
  reasons.push(quality === "high" ? "高品質：コスト増だが見栄え優先" : "標準品質：コストと安定性優先");

  const recommendation: Recommendation = {
    model,
    ratio,
    seconds,
    quality,
    reason: reasons.join(" / "),
  };

  return {
    ok: true,
    mock: false,
    recommendation,
  };
}

/* =========================================================
   POST Handler
========================================================= */

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const params: RecommendVideoTemplateParams = {
      hasImage: Boolean(body.hasImage),
      purpose: body.purpose ?? "product",
      seconds: body.seconds,
      quality: body.quality,
      platform: body.platform ?? "instagram",
    };

    const _idemKey = getIdempotencyKey(req, params);

    // STEP6-A：Mock
    if (USE_MOCK) {
      return NextResponse.json(mockRecommendTemplate(params));
    }

    // STEP6-B：Real（ロジック実装）
    return NextResponse.json(realRecommendTemplate(params));
  } catch (err: any) {
    console.error("[recommend-video-template]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "テンプレ推薦に失敗しました" },
      { status: 500 }
    );
  }
}