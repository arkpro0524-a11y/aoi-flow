// lib/server/runway.ts
/**
 * Runway SDK ラッパー
 *
 * ✅ 動画（image → video）
 * - sync: generateVideoWithRunway() ＝ 完了まで待って videoUrl を返す（既存互換）
 * - async: startVideoTaskWithRunway() ＝ taskId を返す（polling前提）
 * - check: checkVideoTaskWithRunway() ＝ task状態とURLを返す（/api/check-video-task 用）
 *
 * ✅ それ以外（背景生成/合成/移行/推薦）は “型と関数export” を用意してTSを通す
 */

import "server-only";
import RunwayML from "@runwayml/sdk";

/* =====================================================
   ENV
===================================================== */

export const RUNWAY_VERSION = process.env.RUNWAY_VERSION || "2024-11-06";

function requireRunwayKey() {
  // ✅ あなたの既存ENV名に合わせる
  const key = process.env.RUNWAYML_API_SECRET;
  if (!key) throw new Error("RUNWAYML_API_SECRET is missing");
  return key;
}

/**
 * ✅ クライアントはシングルトン化（毎回newを避ける）
 * - サーバレスでもコールドスタート以外は使い回せる
 */
let _client: any = null;
function getClient() {
  if (_client) return _client;

  const apiKey = requireRunwayKey();

  _client = new RunwayML({
    apiKey,
    runwayVersion: RUNWAY_VERSION,
    defaultHeaders: {
      "X-Runway-Version": RUNWAY_VERSION,
    },
  } as any);

  return _client;
}

/* =====================================================
   1) 動画生成（image → video）
===================================================== */

export type RunwayVideoParams = {
  model: string; // "gen4_turbo" 等
  promptImage: string; // URL or data URI
  promptText: string;
  seconds: 5 | 10; // UI都合
  ratio: string; // "1280:720" 等
  quality: "standard" | "high"; // UI都合（Runway側に渡せない場合あり）
};

export type RunwayVideoResult = {
  taskId: string;
  videoUrl: string;
  model: string;
  seconds: number;
  ratio: string;
  quality: string;
};

export type RunwayTaskStatus = "queued" | "running" | "succeeded" | "failed";

export type RunwayTaskCheckResult = {
  taskId: string;
  status: RunwayTaskStatus;
  videoUrl?: string; // succeeded のときだけ入る（取れた場合）
  // デバッグ用
  rawStatus?: string;
  // 参考：レスポンス形状が違う時の保険
  raw?: any;
};

/**
 * ✅ 返り値の「URL揺れ」を最大吸収
 * - string / 配列 / ネスト / artifacts / assets / outputs / result / data / output 等
 */
function pickVideoUrl(anyOutput: any): string | null {
  if (!anyOutput) return null;

  // 直URL
  if (typeof anyOutput === "string" && anyOutput.trim()) return anyOutput.trim();

  // 配列（["https://..."] / [{url:"..."}] / ネスト配列 など）
  if (Array.isArray(anyOutput)) {
    for (const it of anyOutput) {
      const v = pickVideoUrl(it);
      if (v) return v;
    }
    return null;
  }

  // よくあるキー
  const directKeys = [
    "videoUrl",
    "url",
    "outputUrl",
    "output_url",
  ] as const;

  for (const k of directKeys) {
    const v = (anyOutput as any)?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  // ネスト候補（よくある揺れ）
  const nestedKeys = [
    "output",
    "result",
    "data",
  ] as const;

  for (const k of nestedKeys) {
    const v = pickVideoUrl((anyOutput as any)?.[k]);
    if (v) return v;
  }

  // コレクション系（よくある揺れ）
  const collectionKeys = [
    "artifacts",
    "assets",
    "outputs",
  ] as const;

  for (const k of collectionKeys) {
    const arr = (anyOutput as any)?.[k];
    if (Array.isArray(arr)) {
      for (const it of arr) {
        const v = pickVideoUrl(it?.url ?? it);
        if (v) return v;
      }
    }
  }

  return null;
}

function normalizeStatus(raw: any): RunwayTaskStatus {
  const s = String(raw || "").toLowerCase();

  // queued
  if (s.includes("queue")) return "queued";
  if (s.includes("pend")) return "queued";
  if (s.includes("created")) return "queued";

  // running
  if (s.includes("run")) return "running";
  if (s.includes("process")) return "running";
  if (s.includes("progress")) return "running";
  if (s.includes("execut")) return "running";

  // succeeded
  if (s.includes("succ")) return "succeeded";
  if (s.includes("done")) return "succeeded";
  if (s.includes("complete")) return "succeeded";
  if (s.includes("finished")) return "succeeded";

  // failed
  if (s.includes("fail")) return "failed";
  if (s.includes("error")) return "failed";
  if (s.includes("canceled")) return "failed";
  if (s.includes("cancelled")) return "failed";

  // 不明は running 扱い（UIを落とさない）
  return "running";
}

function buildImageToVideoPayload(params: RunwayVideoParams) {
  // docs では duration を使う（seconds → duration）
  return {
    model: params.model,
    promptImage: params.promptImage,
    promptText: params.promptText,
    ratio: params.ratio,
    duration: params.seconds,
  } as any;
}

/**
 * ✅ 同期（既存互換）
 * - 完了まで待って videoUrl を返す
 */
export async function generateVideoWithRunway(
  params: RunwayVideoParams,
  opts: { idempotencyKey: string }
): Promise<RunwayVideoResult> {
  const client = getClient();
  const payload = buildImageToVideoPayload(params);

  let task: any;
  try {
    task = await (client as any).imageToVideo
      .create(payload, { idempotencyKey: opts.idempotencyKey })
      .waitForTaskOutput();
  } catch {
    // idempotencyKey 非対応/失敗環境の保険
    task = await (client as any).imageToVideo.create(payload).waitForTaskOutput();
  }

  const videoUrl = pickVideoUrl(task?.output) || pickVideoUrl(task);
  if (!videoUrl) throw new Error("Runway succeeded but video URL missing");

  return {
    taskId: String(task?.id ?? task?.taskId ?? ""),
    videoUrl,
    model: params.model,
    seconds: params.seconds,
    ratio: params.ratio,
    quality: params.quality,
  };
}

/**
 * ✅ 非同期開始（polling前提）
 * - taskId を返す（ここでは待たない）
 */
export async function startVideoTaskWithRunway(
  params: RunwayVideoParams,
  opts: { idempotencyKey: string }
): Promise<{ taskId: string; model: string; seconds: number; ratio: string; quality: string }> {
  const client = getClient();
  const payload = buildImageToVideoPayload(params);

  let task: any;
  try {
    task = await (client as any).imageToVideo.create(payload, { idempotencyKey: opts.idempotencyKey });
  } catch {
    task = await (client as any).imageToVideo.create(payload);
  }

  const taskId = String(task?.id ?? task?.taskId ?? "");
  if (!taskId) throw new Error("Runway taskId is missing");

  return {
    taskId,
    model: params.model,
    seconds: params.seconds,
    ratio: params.ratio,
    quality: params.quality,
  };
}

/**
 * ✅ task状態確認（/api/check-video-task 用）
 *
 * 重要：
 * - ここで長時間 wait しない（本番の関数タイムアウト/滞留原因）
 * - succeeded でも URL がまだ取れない揺れがあるため、
 *   「URLが取れたら返す / 取れなければ次のpollで拾う」方針に寄せる
 */
export async function checkVideoTaskWithRunway(taskId: string): Promise<RunwayTaskCheckResult> {
  const client = getClient();

  // ✅ retrieve で状態を見る（軽い）
  let task: any;
  try {
    task = await (client as any).tasks.retrieve(taskId);
  } catch (e: any) {
    throw new Error(e?.message || "failed to retrieve task");
  }

  const rawStatus =
    task?.status ?? task?.state ?? task?.data?.status ?? task?.data?.state ?? "";
  const status = normalizeStatus(rawStatus);

  if (status === "succeeded") {
    // ✅ 成功済みなら output からURLを拾う（拾えた時だけ返す）
    const videoUrl = pickVideoUrl(task?.output) || pickVideoUrl(task);
    if (videoUrl) {
      return { taskId, status, videoUrl, rawStatus: String(rawStatus), raw: task };
    }

    // ✅ succeeded でも output が遅延している揺れがある
    // ここで waitForTaskOutput() はしない（本番タイムアウト回避）。
    // 次のpollで拾える可能性が高いので、URL無しで返す。
    return { taskId, status, rawStatus: String(rawStatus), raw: task };
  }

  if (status === "failed") {
    return { taskId, status, rawStatus: String(rawStatus), raw: task };
  }

  // queued / running
  return { taskId, status, rawStatus: String(rawStatus), raw: task };
}

/* =====================================================
   2) “他APIが import している型/関数” を用意（TSを通す）
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
  throw new Error(
    "generateBackgroundImage is not implemented (USE_BACKGROUND_MOCK=true で運用してください)"
  );
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
  throw new Error(
    "replaceBackgroundImage is not implemented (USE_REPLACE_BG_MOCK=true で運用してください)"
  );
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
  return { videoUrl: params.sourceVideoUrl, model: params.model ?? "gen4_turbo" };
}

// テンプレ推薦
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
): Promise<{
  model: string;
  ratio: string;
  seconds: 5 | 10;
  quality: "standard" | "high";
  reason: string;
}> {
  const seconds = params.seconds ?? 10;
  const quality = params.quality ?? "standard";

  return {
    model: "gen4_turbo",
    ratio: params.platform === "tiktok" ? "720:1280" : "1280:720",
    seconds,
    quality,
    reason: "安定優先の固定テンプレ（必要になったらロジックを強化）",
  };
}