// /lib/sellCheck/rules.ts

import type { SellCheckCategory, SellCheckCondition } from "@/lib/types/sellCheck";

export function normalizePrice(value: unknown): number {
  const raw = String(value ?? "").replace(/[^\d.]/g, "");
  const n = Number(raw);

  if (!Number.isFinite(n) || n <= 0) return 2000;

  return Math.max(300, Math.min(999999, Math.round(n)));
}

export function normalizeCondition(value: unknown): SellCheckCondition {
  if (value === "excellent") return "excellent";
  if (value === "good") return "good";
  if (value === "fair") return "fair";
  if (value === "poor") return "poor";
  return "good";
}

export function normalizeCategory(value: unknown): SellCheckCategory {
  if (value === "interior") return "interior";
  if (value === "fashion") return "fashion";
  if (value === "hobby") return "hobby";
  if (value === "kids") return "kids";
  if (value === "electronics") return "electronics";
  if (value === "other") return "other";
  return "other";
}

export function conditionLabel(condition: SellCheckCondition): string {
  if (condition === "excellent") return "新品同様";
  if (condition === "good") return "良好";
  if (condition === "fair") return "使用感あり";
  return "状態悪い";
}

export function categoryLabel(category: SellCheckCategory): string {
  if (category === "interior") return "インテリア・雑貨";
  if (category === "fashion") return "ファッション";
  if (category === "hobby") return "ホビー・コレクション";
  if (category === "kids") return "子ども用品";
  if (category === "electronics") return "家電・ガジェット";
  return "その他";
}

/**
 * 価格の基本点
 *
 * 目的：
 * - 安いほど売れやすい、という単純ルールは残す
 * - ただし高単価商品も利益商品になり得るため、落としすぎない
 */
export function priceBaseScore(price: number): number {
  const p = normalizePrice(price);

  if (p <= 1000) return 88;
  if (p <= 1500) return 86;
  if (p <= 3000) return 78;
  if (p <= 6000) return 66;
  if (p <= 12000) return 54;
  if (p <= 30000) return 44;

  return 36;
}

/**
 * 状態点
 *
 * 中古販売では状態の不安が購入停止要因になるため、
 * fair / poor は明確に下げる。
 */
export function conditionScore(condition: SellCheckCondition): number {
  if (condition === "excellent") return 92;
  if (condition === "good") return 78;
  if (condition === "fair") return 56;
  return 34;
}