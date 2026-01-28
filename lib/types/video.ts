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

export type VideoTemplateRecommendation = {
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
      recommendation: VideoTemplateRecommendation;
    }
  | {
      ok: false;
      error: string;
    };