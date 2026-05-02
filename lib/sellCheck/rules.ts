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

export function priceBaseScore(price: number): number {
  const p = normalizePrice(price);

  if (p <= 1000) return 88;
  if (p <= 1500) return 86;
  if (p <= 3000) return 78;
  if (p <= 6000) return 68;
  if (p <= 12000) return 60;
  if (p <= 30000) return 52;
  if (p <= 80000) return 46;

  return 40;
}

export function conditionScore(condition: SellCheckCondition): number {
  if (condition === "excellent") return 92;
  if (condition === "good") return 78;
  if (condition === "fair") return 56;
  return 34;
}

export const RARE_KEYWORDS = [
  "昭和",
  "昭和レトロ",
  "当時物",
  "ヴィンテージ",
  "ビンテージ",
  "レトロ",
  "廃盤",
  "絶版",
  "限定",
  "限定品",
  "初版",
  "旧ロゴ",
  "希少",
  "レア",
  "入手困難",
  "非売品",
  "コラボ",
  "記念",
  "デッドストック",
  "未開封",
  "箱付き",
  "円谷",
  "ブルマァク",
  "ポピー",
  "バンダイ",
  "タカラ",
  "マルサン",
  "ソフビ",
  "ブリキ",
  "ゼンマイ",
  "怪獣",
  "ウルトラマン",
  "仮面ライダー",
];

export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xfee0)
    );
}

export function countRareKeywordHits(words: string[]): number {
  const text = normalizeSearchText(words.join(" "));

  return RARE_KEYWORDS.filter((keyword) => {
    return text.includes(normalizeSearchText(keyword));
  }).length;
}