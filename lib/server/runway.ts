/**
 * lib/server/runway.ts
 * ====================
 * Runway SDK ラッパー
 *
 * ✅ Runway動画生成（image → video）は公式の imageToVideo.create().waitForTaskOutput() を使う
 * ✅ それ以外（背景生成/合成/移行/推薦）は “型と関数export” を用意して、TSを通す
 *    ※ env が mock=true の間は route 側で return されるので、ここは実行されない前提
 */

import "server-only";
import RunwayML from "@runwayml/sdk";

/* =====================================================
   ENV
===================================================== */

export const RUNWAY_VERSION = process.env.RUNWAY_VERSION || "2024-11-06";

function requireRunwayKey() {
  const key = process.env.RUNWAYML_API_SECRET;
  if (!key) throw new Error("RUNWAYML_API_SECRET is missing");
  return key;
}

function createClient() {
  // SDK は `new RunwayML()` でも動くが、サーバでは明示しておく
  const apiKey = requireRunwayKey();

  return new RunwayML({
    apiKey,
    runwayVersion: RUNWAY_VERSION,
    defaultHeaders: {
      "X-Runway-Version": RUNWAY_VERSION,
    },
  } as any);
}

/* =====================================================
   1) 動画生成（image → video）
===================================================== */

export type RunwayVideoParams = {
  model: string; // "gen4_turbo" 等
  promptImage: string; // URL or data URI
  promptText: string;
  seconds: 5 | 10; // UI都合の秒
  ratio: string; // "1280:720" 等
  quality: "standard" | "high"; // UI都合（Runway側に渡せない場合がある）
};

export type RunwayVideoResult = {
  taskId: string;
  videoUrl: string;
  model: string;
  seconds: number;
  ratio: string;
  quality: string;
};

function pickVideoUrl(output: any): string | null {
  if (!output) return null;

  // SDK/レスポンス形の揺れ吸収
  if (typeof output.videoUrl === "string") return output.videoUrl;
  if (typeof output.url === "string") return output.url;

  if (Array.isArray(output)) {
    const first = output[0];
    if (first && typeof first.url === "string") return first.url;
    if (first && typeof first.videoUrl === "string") return first.videoUrl;
  }

  return null;
}

export async function generateVideoWithRunway(
  params: RunwayVideoParams,
  opts: { idempotencyKey: string }
): Promise<RunwayVideoResult> {
  const client = createClient();

  // ✅ 公式の呼び方：client.imageToVideo.create(...).waitForTaskOutput()
  // docs では duration を使う（seconds → duration に変換）  [oai_citation:1‡Runway API](https://docs.dev.runwayml.com/guides/using-the-api/)
  const payload: any = {
    model: params.model,
    promptImage: params.promptImage,
    promptText: params.promptText,
    ratio: params.ratio,
    duration: params.seconds,
  };

  // idempotencyKey を SDK の request option として渡せる場合は渡す（無理なら自動で無視/失敗するのでフォールバック）
  let task: any;
  try {
    task = await (client as any).imageToVideo
      .create(payload, { idempotencyKey: opts.idempotencyKey })
      .waitForTaskOutput();
  } catch {
    // フォールバック：options なし
    task = await (client as any).imageToVideo.create(payload).waitForTaskOutput();
  }

  const videoUrl = pickVideoUrl(task?.output) || pickVideoUrl(task);
  if (!videoUrl) {
    throw new Error("Runway succeeded but video URL missing");
  }

  return {
    taskId: String(task?.id ?? task?.taskId ?? ""),
    videoUrl,
    model: params.model,
    seconds: params.seconds,
    ratio: params.ratio,
    quality: params.quality,
  };
}

/* =====================================================
   2) “他APIが import している型/関数” を用意（TSを通す）
   ※ mock=false にして実行したいなら、ここは別途 実装が必要
===================================================== */

// 背景画像生成
export type BackgroundGenParams = {
  prompt: string;
  ratio: string; // "1280:720"
  style?: string; // "clean" 等
};
export async function generateBackgroundImage(
  _params: BackgroundGenParams,
  _opts: { idempotencyKey: string }
): Promise<{ imageUrl: string; prompt: string; ratio: string }> {
  throw new Error("generateBackgroundImage is not implemented (USE_BACKGROUND_MOCK=true で運用してください)");
}

// 背景合成
export type ReplaceBackgroundParams = {
  foregroundImage: string;
  backgroundImage: string;
  ratio: string;
  fit?: "contain" | "cover";
};
export async function replaceBackgroundImage(
  _params: ReplaceBackgroundParams,
  _opts: { idempotencyKey: string }
): Promise<{ imageUrl: string; ratio: string }> {
  throw new Error("replaceBackgroundImage is not implemented (USE_REPLACE_BG_MOCK=true で運用してください)");
}

// 動画移行
export type MigrateVideoParams = {
  sourceVideoUrl: string;
  model?: string;
};
export async function migrateVideoToRunway(
  params: MigrateVideoParams,
  _opts: { idempotencyKey: string }
): Promise<{ videoUrl: string; model: string }> {
  // mock=false に切り替えた時に “最低限動く” ように、現状はそのまま返す
  // （本当にRunway側へ移行するなら別API/仕様が必要）
  return { videoUrl: params.sourceVideoUrl, model: params.model ?? "gen4_turbo" };
}

// テンプレ推薦（Runwayに推薦APIは無いのでローカルロジックで返す）
export type RecommendVideoTemplateParams = {
  hasImage: boolean;
  purpose?: "product" | "service" | "brand" | string;
  seconds?: 5 | 10;
  quality?: "standard" | "high";
  platform?: "instagram" | "tiktok" | "youtube" | string;
};
export async function recommendVideoTemplate(
  params: RecommendVideoTemplateParams,
  _opts: { idempotencyKey: string }
): Promise<{ model: string; ratio: string; seconds: 5 | 10; quality: "standard" | "high"; reason: string }> {
  const seconds = params.seconds ?? 10;
  const quality = params.quality ?? "standard";

  // 超単純な推薦（壊さない・固定）
  return {
    model: "gen4_turbo",
    ratio: params.platform === "tiktok" ? "720:1280" : "1280:720",
    seconds,
    quality,
    reason: "安定優先の固定テンプレ（必要になったらロジックを強化）",
  };
}