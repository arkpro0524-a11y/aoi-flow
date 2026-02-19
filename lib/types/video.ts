// /lib/types/video.ts

/**
 * 共通：Video 関連の型
 * - UI / API の両方で同じ型を使えるようにする
 * - server-only は付けない（共有ファイル）
 */

export type VideoSeconds = 5 | 10;
export type VideoQuality = "standard" | "high";

// UI / API で出がちな表現を許容（内部で正規化する前提）
export type VideoPlatform =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "x"
  | "web"
  | (string & {});

export type VideoPurpose =
  | "product"
  | "service"
  | "brand"
  | "event"
  | "other"
  | (string & {});

// "1280:720" のような比率文字列（厳密バリデーションは各API側で実施）
export type VideoRatio = `${number}:${number}` | (string & {});

export type RecommendVideoTemplateParams = {
  hasImage: boolean;
  purpose?: VideoPurpose;
  seconds?: number; // UI入力そのまま（API側で 5/10 に正規化）
  quality?: string; // UI入力そのまま（API側で "standard"|"high" に正規化）
  platform?: VideoPlatform;
};

/**
 * ✅ UIで使う「テンプレ推薦の正本」
 * - videoButtons の id を返す（= そのまま保存・適用できる）
 */
export type VideoTemplateId = string;

export type VideoTemplatePick = {
  templateId: VideoTemplateId; // videoButtons の id（正本）
  label?: string;              // UI表示用（任意：なければ videoButtons から引く）
};

/**
 * （任意）旧：モデルが判断した詳細（デバッグ用）
 * - これを recommendation 正本にすると UI が困るので debug に隔離
 */
export type VideoTemplateRecommendationDebug = {
  model: string;
  ratio: VideoRatio;
  seconds: VideoSeconds;
  quality: VideoQuality;
  reason: string;
};

export type RecommendVideoTemplateResponse =
  | {
      ok: true;
      mock: boolean;
      recommendation: VideoTemplatePick; // ✅ 正本は templateId
      debug?: VideoTemplateRecommendationDebug; // 任意
    }
  | {
      ok: false;
      error: string;
    };