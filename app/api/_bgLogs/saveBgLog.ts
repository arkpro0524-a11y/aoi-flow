/**
 * AOI FLOW
 * 背景生成ログ保存ユーティリティ
 *
 * 目的
 * - 生成結果（成功・失敗）をFirestoreに保存
 * - 後から分析・学習・閾値調整に使う
 *
 * 方針
 * - null / undefined は絶対保存しない
 * - 文字列・数値を安全に整形して保存
 * - generate-bg 側には影響を与えない（独立）
 */

import { getAdminDb } from "@/firebaseAdmin";

/**
 * Firestoreに保存するログの型
 */
export type BgLogInput = {
  uid: string;
  draftId: string;

  imageUrl?: string;

  keyword: string;
  scene: string;
  groundingType: string;
  productCategory: string;

  attempt: number;

  visibilityScore: number;
  contextScore: number;
  acceptScore: number;

  isAccepted: boolean;
  failureReason?: string;

  meta?: Record<string, unknown>;
};

/**
 * null / undefined 対策
 */
function safeString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return fallback;
}

function safeNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeBoolean(v: unknown): boolean {
  return v === true;
}

/**
 * ログ保存メイン関数
 */
export async function saveBgLog(input: BgLogInput) {
  try {
    const db = getAdminDb();

    const doc = {
      uid: safeString(input.uid),
      draftId: safeString(input.draftId),

      imageUrl: safeString(input.imageUrl),

      keyword: safeString(input.keyword),
      scene: safeString(input.scene),
      groundingType: safeString(input.groundingType),
      productCategory: safeString(input.productCategory),

      attempt: safeNumber(input.attempt),

      visibilityScore: safeNumber(input.visibilityScore),
      contextScore: safeNumber(input.contextScore),
      acceptScore: safeNumber(input.acceptScore),

      isAccepted: safeBoolean(input.isAccepted),
      failureReason: safeString(input.failureReason),

      meta: input.meta ?? {},

      createdAt: new Date(),
    };

    /**
     * Firestore保存
     * コレクション: bg_generation_logs
     */
    await db.collection("bg_generation_logs").add(doc);
  } catch (e) {
    /**
     * ログ保存失敗しても処理は止めない
     */
    console.error("[bg-log] save failed:", e);
  }
}