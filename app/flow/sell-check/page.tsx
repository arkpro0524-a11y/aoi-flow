// /app/flow/sell-check/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/firebase";
import type { SellCheckResult } from "@/lib/types/sellCheck";


type BatchDiagnosisItem = {
  id: string;
  title: string;
  price: string;
  purchasePrice: string;
  category: string;
  condition: string;
  memo: string;
  keywords: string;
  files: File[];
  previews: string[];
  result: SellCheckResult | null;
  savedImageUrl: string;
  error: string;
};

function createBatchDiagnosisItem(index: number): BatchDiagnosisItem {
  return {
    id: `batch-diagnosis-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    title: "",
    price: "",
    purchasePrice: "",
    category: "interior",
    condition: "good",
    memo: "",
    keywords: "",
    files: [],
    previews: [],
    result: null,
    savedImageUrl: "",
    error: "",
  };
}

function isSupportedImageFile(file: File): boolean {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();

  if (["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"].includes(type)) {
    return true;
  }

  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}

function filterSupportedImageFiles(files: File[]): { supported: File[]; rejected: File[] } {
  const supported: File[] = [];
  const rejected: File[] = [];

  files.forEach((file) => {
    if (isSupportedImageFile(file)) supported.push(file);
    else rejected.push(file);
  });

  return { supported, rejected };
}

function unsupportedImageMessage(rejected: File[]): string {
  if (rejected.length === 0) return "";
  const names = rejected.map((file) => file.name || "未対応画像").join("、");
  return `未対応の画像形式があります：${names}。PNG / JPEG / GIF / WebP に変換してから選択してください。`;
}

const SELL_CHECK_MAX_IMAGES = 8;
const SELL_CHECK_TOTAL_IMAGE_LIMIT_BYTES = 8_000_000;
const SELL_CHECK_SINGLE_IMAGE_LIMIT_BYTES = 1_200_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像をブラウザで読み込めませんでした。PNG / JPEG / WebP に変換してください。"));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("画像の圧縮に失敗しました。"));
    }, type, quality);
  });
}

function replaceImageExt(name: string, ext: string): string {
  const base = String(name || `sell-check-image-${Date.now()}`).replace(/\.[^.]+$/, "");
  return `${base}.${ext}`;
}

async function compressImageForSellCheck(file: File, maxBytes: number): Promise<File> {
  if (!isSupportedImageFile(file)) {
    throw new Error(unsupportedImageMessage([file]));
  }

  if (file.size > 0 && file.size <= maxBytes && file.type !== "image/gif") {
    return file;
  }

  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImageElement(dataUrl);

  const maxSide = 1600;
  const width = Math.max(1, img.naturalWidth || img.width || 1);
  const height = Math.max(1, img.naturalHeight || img.height || 1);
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像圧縮用のCanvasを作成できませんでした。");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const qualities = [0.86, 0.76, 0.66, 0.56, 0.46, 0.36];
  let lastBlob: Blob | null = null;

  for (const quality of qualities) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    lastBlob = blob;
    if (blob.size <= maxBytes) {
      return new File([blob], replaceImageExt(file.name, "jpg"), { type: "image/jpeg" });
    }
  }

  if (!lastBlob) throw new Error("画像の圧縮に失敗しました。");
  return new File([lastBlob], replaceImageExt(file.name, "jpg"), { type: "image/jpeg" });
}

async function prepareSellCheckImages(files: File[]): Promise<File[]> {
  const targets = files.slice(0, SELL_CHECK_MAX_IMAGES);
  if (targets.length === 0) return [];

  const perFileLimit = Math.min(
    SELL_CHECK_SINGLE_IMAGE_LIMIT_BYTES,
    Math.max(420_000, Math.floor(SELL_CHECK_TOTAL_IMAGE_LIMIT_BYTES / targets.length)),
  );

  const prepared: File[] = [];
  for (const file of targets) {
    prepared.push(await compressImageForSellCheck(file, perFileLimit));
  }
  return prepared;
}

type Stats = {
  total: number;
  sold: number;
  unsold: number;
  averageScore: number;
  withImage: number;
  categoryCounts: Record<string, number>;
};

type DiagnosisLog = {
  id: string;
  title: string;
  memo: string;
  keywords: string;
  price?: number;
  category: string;
  condition: string;
  score?: number;
  rank?: string;
  action: string;
  scoreLabel: string;
  rankLabel: string;
  sellSpeedLabel: string;
  confidenceLabel: string;
  suggestedPriceMin?: number;
  suggestedPriceMax?: number;
  imageUrl: string;
  imageUrls: string[];
  imageCount: number;
  reasons: string[];
  improvements: string[];
  targetSummary: string;
  createdAt: string;
  updatedAt: string;
  imageAnalysis?: any;
  textAnalysis?: any;
  marketAnalysis?: any;
  similarData?: any;
  scoreBreakdown?: any;
  profitAnalysis?: any;
  acquisitionAnalysis?: any;
  theoryProfile?: any;
  marketStructureAnalysis?: any;
  priceDistortionAnalysis?: any;
  rotationLearningAnalysis?: any;
};

type DraftOption = {
  id: string;
  title: string;
  phase: "draft" | "ready" | "posted";
  brand: "vento" | "riva";
  imageUrl: string;
  listedPrice?: number;
  condition?: string;
  category?: string;
  memo?: string;
  keywords?: string;
};

const CATEGORY_OPTIONS = [
  { value: "interior", label: "インテリア・雑貨" },
  { value: "fashion", label: "ファッション" },
  { value: "hobby", label: "ホビー・コレクション" },
  { value: "kids", label: "子ども用品" },
  { value: "electronics", label: "家電・ガジェット" },
  { value: "other", label: "その他" },
];

const CONDITION_OPTIONS = [
  { value: "excellent", label: "新品同様" },
  { value: "good", label: "良好" },
  { value: "fair", label: "使用感あり" },
  { value: "poor", label: "状態悪い" },
];

function formatYen(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `${Number(n || 0).toLocaleString()}円`;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

function scoreText(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${Math.round(v)}/100`;
}

function resolveListImageUrl(data: DocumentData): string {
  return (
    safeString(data.compositeImageUrl) ||
    safeString(data.aiImageUrl) ||
    safeString(data.imageUrl) ||
    safeString(data.baseImageUrl) ||
    ""
  );
}

function resolveTitle(data: DocumentData): string {
  return (
    safeString(data.caption_final) ||
    safeString(data.igCaption) ||
    safeString(data.ig) ||
    safeString(data.xCaption) ||
    safeString(data.x) ||
    safeString(data.vision) ||
    "（本文なし）"
  );
}

function resolveMemo(data: DocumentData): string {
  return (
    safeString(data.memo) ||
    safeString(data.description) ||
    safeString(data.caption_final) ||
    safeString(data.igCaption) ||
    safeString(data.ig) ||
    safeString(data.xCaption) ||
    safeString(data.x) ||
    ""
  );
}

function resolveKeywords(data: DocumentData): string {
  if (Array.isArray(data.keywords)) {
    return data.keywords
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .join(" ");
  }

  return (
    safeString(data.keywordsText) ||
    safeString(data.keywords) ||
    safeString(data.brandKeywords) ||
    ""
  );
}

function normalizePhase(v: unknown): "draft" | "ready" | "posted" {
  if (v === "ready") return "ready";
  if (v === "posted") return "posted";
  return "draft";
}

function phaseLabel(v: "draft" | "ready" | "posted") {
  if (v === "ready") return "投稿待ち";
  if (v === "posted") return "投稿済み";
  return "下書き";
}

function fallbackRankLabel(rank: SellCheckResult["rank"]): string {
  if (rank === "A") return "A：強い出品候補";
  if (rank === "B") return "B：出品候補";
  if (rank === "C") return "C：改善して出品";
  return "D：情報不足・改善推奨";
}

function fallbackScoreLabel(score: number): string {
  if (score >= 82) return "総合診断スコア：高";
  if (score >= 68) return "総合診断スコア：やや高";
  if (score >= 52) return "総合診断スコア：中";
  return "総合診断スコア：低";
}

async function imageUrlToFile(url: string): Promise<File> {
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error("下書き画像の取得に失敗しました。手動アップロードで診断してください。");
  }

  const blob = await res.blob();

  if (!blob || blob.size === 0) {
    throw new Error("下書き画像が空です。手動アップロードで診断してください。");
  }

  return new File([blob], `draft-image-${Date.now()}.png`, {
    type: blob.type || "image/png",
  });
}

function MiniScoreCard(props: { label: string; value: unknown }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs text-white/50">{props.label}</div>
      <div className="mt-1 text-lg font-black text-white">
        {scoreText(props.value)}
      </div>
    </div>
  );
}

function InfoCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="text-xs text-white/50">{props.label}</div>
      <div className="mt-1 text-sm font-black text-white">{props.value}</div>
    </div>
  );
}


function clampScore(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function yenOrDash(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return formatYen(n);
}

function marketAveragePrice(result: SellCheckResult): number | undefined {
  return (
    result.similarData?.averageSoldPrice ||
    result.similarData?.medianSoldPrice ||
    result.similarData?.averageActivePrice ||
    result.similarData?.medianActivePrice ||
    undefined
  );
}

function priceRotationLabel(result: SellCheckResult): string {
  return (
    result.rotationLearningAnalysis?.expectedDaysToSellLabel ||
    result.sellSpeedLabel ||
    "—"
  );
}

function RingMetric(props: { label: string; value: unknown; sub?: string }) {
  const score = clampScore(props.value, 0);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-center">
      <div
        className="mx-auto flex h-24 w-24 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(rgba(74,222,128,.95) ${score * 3.6}deg, rgba(255,255,255,.12) 0deg)`,
        }}
      >
        <div className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-[#071521] text-xl font-black text-white">
          {score}
        </div>
      </div>
      <div className="mt-2 text-xs font-black text-white/80">{props.label}</div>
      {props.sub ? <div className="mt-1 text-[11px] text-white/45">{props.sub}</div> : null}
    </div>
  );
}

function toSellCheckResultFromDiagnosisLog(log: DiagnosisLog): SellCheckResult {
  const score = clampScore(log.score, 0);
  const rank = log.rank === "A" || log.rank === "B" || log.rank === "C" || log.rank === "D" ? log.rank : "C";

  return {
    score,
    rank,
    action: log.action || log.rankLabel || fallbackRankLabel(rank),
    scoreLabel: log.scoreLabel || fallbackScoreLabel(score),
    rankLabel: log.rankLabel || fallbackRankLabel(rank),
    sellSpeed: "unknown",
    sellSpeedLabel: log.sellSpeedLabel || "診断結果から確認",
    confidenceLevel: "medium",
    confidenceLabel: log.confidenceLabel || "保存済み診断",
    marketType: "unknown",
    marketTypeLabel: "保存済み診断",
    scoreExplanation: log.targetSummary || "保存済みの売れる診断結果です。",
    suggestedPriceMin: Number(log.suggestedPriceMin || 0),
    suggestedPriceMax: Number(log.suggestedPriceMax || 0),
    improvements: Array.isArray(log.improvements) ? log.improvements : [],
    reasons: Array.isArray(log.reasons) ? log.reasons : [],
    learnedSampleCount: Number(log.similarData?.similarCount || 0),
    targetSummary: log.targetSummary || log.title || "保存済み診断",
    imageAnalysis: log.imageAnalysis,
    textAnalysis: log.textAnalysis,
    marketAnalysis: log.marketAnalysis,
    similarData: log.similarData,
    scoreBreakdown: log.scoreBreakdown,
    profitAnalysis: log.profitAnalysis,
    acquisitionAnalysis: log.acquisitionAnalysis,
    theoryProfile: log.theoryProfile,
    marketStructureAnalysis: log.marketStructureAnalysis,
    priceDistortionAnalysis: log.priceDistortionAnalysis,
    rotationLearningAnalysis: log.rotationLearningAnalysis,
  };
}

function shortDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "日時不明";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}


function metricValue(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function logMarketAverage(log: DiagnosisLog): number | undefined {
  return safeNumber(
    log.similarData?.averageSoldPrice ??
      log.similarData?.averagePrice ??
      log.marketAnalysis?.averageSoldPrice,
  );
}

function logMarketMedian(log: DiagnosisLog): number | undefined {
  return safeNumber(
    log.similarData?.medianSoldPrice ??
      log.similarData?.medianPrice ??
      log.marketAnalysis?.medianSoldPrice,
  );
}

function logRotationLabel(log: DiagnosisLog): string {
  return (
    safeString(log.rotationLearningAnalysis?.expectedDaysToSellLabel) ||
    safeString(log.rotationLearningAnalysis?.rotationLabel) ||
    safeString(log.sellSpeedLabel) ||
    "データ不足"
  );
}

function logPriceRange(log: DiagnosisLog): string {
  const min = safeNumber(log.suggestedPriceMin);
  const max = safeNumber(log.suggestedPriceMax);
  if (min !== undefined && max !== undefined && min > 0 && max > 0) return `${formatYen(min)}〜${formatYen(max)}`;
  if (min !== undefined && min > 0) return formatYen(min);
  if (max !== undefined && max > 0) return formatYen(max);
  return "—";
}

function diagnosisMetricSet(log: DiagnosisLog): { label: string; product: number; market: number }[] {
  const result = toSellCheckResultFromDiagnosisLog(log);
  const legacyScoreBreakdown = result.scoreBreakdown as (typeof result.scoreBreakdown & { profitScore?: number; rotationScore?: number }) | undefined;
  const legacyRotationAnalysis = result.rotationLearningAnalysis as (typeof result.rotationLearningAnalysis & { rotationScore?: number }) | undefined;
  const priceScore = metricValue(result.scoreBreakdown?.priceScore ?? legacyScoreBreakdown?.profitScore ?? log.score, 60);
  const designScore = metricValue(result.imageAnalysis?.overallImageScore ?? result.scoreBreakdown?.imageScore ?? log.score, 60);
  const demandScore = metricValue(result.marketAnalysis?.demandScore ?? result.scoreBreakdown?.marketScore ?? log.score, 60);
  const supplyScore = metricValue(result.marketAnalysis?.marketSupplyScore ?? 55, 55);
  const trendScore = metricValue(result.marketAnalysis?.trendScore ?? 60, 60);
  const rotationScore =
    result.sellSpeed === "fast" ? 88 :
    result.sellSpeed === "normal" ? 68 :
    result.sellSpeed === "slow" ? 44 :
    result.sellSpeed === "collector_wait" ? 38 :
    metricValue(legacyRotationAnalysis?.rotationScore ?? legacyScoreBreakdown?.rotationScore, 55);

  return [
    { label: "価格", product: priceScore, market: metricValue(log.similarData?.marketPriceScore, 65) },
    { label: "回転", product: rotationScore, market: metricValue(log.similarData?.marketRotationScore, 60) },
    { label: "デザイン", product: designScore, market: metricValue(log.similarData?.marketDesignScore, 60) },
    { label: "需要", product: demandScore, market: metricValue(log.similarData?.marketDemandScore, 58) },
    { label: "供給", product: supplyScore, market: metricValue(log.similarData?.marketSupplyScore, 55) },
    { label: "トレンド", product: trendScore, market: metricValue(log.similarData?.marketTrendScore, 58) },
  ];
}

function DiagnosisRadarChart({ log }: { log: DiagnosisLog }) {
  const metrics = diagnosisMetricSet(log);
  const size = 300;
  const center = size / 2;
  const radius = 105;

  const point = (value: number, index: number) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / metrics.length;
    const r = (metricValue(value) / 100) * radius;
    return [center + Math.cos(angle) * r, center + Math.sin(angle) * r] as const;
  };

  const polygon = (key: "product" | "market") => metrics.map((m, i) => point(m[key], i).join(",")).join(" ");

  return (
    <div style={{ border: "1px solid rgba(255,255,255,.10)", background: "rgba(0,0,0,.20)", borderRadius: 20, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: "white" }}>市場平均との比較</div>
        <div style={{ display: "flex", gap: 10, fontSize: 11, color: "rgba(255,255,255,.62)" }}>
          <span>● あなたの商品</span>
          <span>● 市場平均</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", maxWidth: 360, display: "block", margin: "0 auto" }}>
        {[20, 40, 60, 80, 100].map((n) => (
          <polygon
            key={n}
            points={metrics.map((_, i) => point(n, i).join(",")).join(" ")}
            fill="none"
            stroke="rgba(255,255,255,.10)"
            strokeWidth="1"
          />
        ))}
        {metrics.map((m, i) => {
          const [x, y] = point(108, i);
          return (
            <text key={m.label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,.75)" fontSize="12" fontWeight="700">
              {m.label}
            </text>
          );
        })}
        <polygon points={polygon("market")} fill="rgba(59,130,246,.18)" stroke="rgba(96,165,250,.95)" strokeWidth="3" strokeDasharray="6 5" />
        <polygon points={polygon("product")} fill="rgba(34,197,94,.20)" stroke="rgba(74,222,128,.98)" strokeWidth="3" />
        {metrics.map((m, i) => {
          const [px, py] = point(m.product, i);
          const [mx, my] = point(m.market, i);
          return (
            <g key={m.label}>
              <circle cx={mx} cy={my} r="4" fill="rgba(96,165,250,.98)" />
              <circle cx={px} cy={py} r="4" fill="rgba(74,222,128,.98)" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DiagnosisDetailPopup({ log, onClose }: { log: DiagnosisLog; onClose: () => void }) {
  const metrics = diagnosisMetricSet(log);
  const images = (log.imageUrls?.length ? log.imageUrls : log.imageUrl ? [log.imageUrl] : []).filter(Boolean);
  const result = toSellCheckResultFromDiagnosisLog(log);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.72)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}
      onClick={onClose}
    >
      <div
        style={{ width: "min(1180px, 96vw)", maxHeight: "92vh", overflowY: "auto", borderRadius: 28, border: "1px solid rgba(255,255,255,.14)", background: "linear-gradient(135deg, rgba(5,18,32,.98), rgba(8,35,52,.96))", boxShadow: "0 30px 120px rgba(0,0,0,.7)", padding: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <button type="button" onClick={onClose} style={{ marginBottom: 14, color: "#60a5fa", fontWeight: 800, background: "transparent", border: 0, cursor: "pointer" }}>← 一覧に戻る</button>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ width: 96, height: 96, borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,255,255,.12)", background: "rgba(0,0,0,.25)", flex: "0 0 auto" }}>
                {images[0] ? <img src={images[0]} alt="診断商品" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <div style={{ padding: 10, fontSize: 12, color: "rgba(255,255,255,.7)" }}>画像なし</div>}
              </div>
              <div>
                <div style={{ fontSize: 12, letterSpacing: ".18em", color: "rgba(125,211,252,.72)", fontWeight: 900 }}>SELL CHECK RESULT</div>
                <h2 style={{ margin: "6px 0 0", color: "white", fontSize: 26, lineHeight: 1.25 }}>{log.title || "商品名未入力"}</h2>
                <div style={{ marginTop: 8, color: "rgba(255,255,255,.58)", fontSize: 13 }}>{shortDateTime(log.createdAt)} / 診断ID：{log.id}</div>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.08)", color: "white", borderRadius: 14, padding: "10px 14px", fontWeight: 900, cursor: "pointer" }}>閉じる</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
          <div style={{ gridColumn: "span 1", border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.055)", borderRadius: 18, padding: 16 }}>
            <div style={{ color: "rgba(255,255,255,.58)", fontSize: 12, fontWeight: 800 }}>総合スコア</div>
            <div style={{ color: "#4ade80", fontSize: 46, fontWeight: 900, lineHeight: 1 }}>{log.score ?? 0}<span style={{ fontSize: 14, color: "rgba(255,255,255,.6)" }}>点</span></div>
            <div style={{ color: "rgba(255,255,255,.78)", fontSize: 13, marginTop: 8 }}>{log.rankLabel || log.action || "診断済み"}</div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.055)", borderRadius: 18, padding: 16 }}>
            <div style={{ color: "rgba(255,255,255,.58)", fontSize: 12, fontWeight: 800 }}>推奨価格</div>
            <div style={{ color: "white", fontSize: 24, fontWeight: 900, marginTop: 8 }}>{logPriceRange(log)}</div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.055)", borderRadius: 18, padding: 16 }}>
            <div style={{ color: "rgba(255,255,255,.58)", fontSize: 12, fontWeight: 800 }}>市場平均 / 中央値</div>
            <div style={{ color: "white", fontSize: 20, fontWeight: 900, marginTop: 8 }}>{yenOrDash(logMarketAverage(log))}</div>
            <div style={{ color: "rgba(255,255,255,.62)", fontSize: 13 }}>中央値 {yenOrDash(logMarketMedian(log))}</div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.055)", borderRadius: 18, padding: 16 }}>
            <div style={{ color: "rgba(255,255,255,.58)", fontSize: 12, fontWeight: 800 }}>回転目安</div>
            <div style={{ color: "#fbbf24", fontSize: 20, fontWeight: 900, marginTop: 8 }}>{logRotationLabel(log)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 16 }}>
          <DiagnosisRadarChart log={log} />
          <div style={{ border: "1px solid rgba(255,255,255,.10)", background: "rgba(0,0,0,.20)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "white", marginBottom: 10 }}>項目別スコア比較</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse", color: "white", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "rgba(255,255,255,.62)", textAlign: "left" }}>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.10)" }}>診断項目</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.10)" }}>あなたの商品</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.10)" }}>市場平均</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.10)" }}>評価</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr key={m.label}>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>{m.label}</td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.08)", color: "#86efac", fontWeight: 900 }}>{m.product}/100</td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.08)", color: "#93c5fd", fontWeight: 900 }}>{m.market}/100</td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.08)", color: m.product >= m.market ? "#86efac" : "#fbbf24", fontWeight: 900 }}>{m.product >= m.market ? "良い" : "要調整"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
          <div style={{ border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.045)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "white", marginBottom: 10 }}>小学生でもわかる解説</div>
            <p style={{ color: "rgba(255,255,255,.72)", lineHeight: 1.8, fontSize: 14 }}>{result.scoreExplanation || result.scoreLabel || "この商品がどれくらい売れやすいか、価格・見た目・市場データから判定しました。"}</p>
            <ul style={{ margin: "12px 0 0", paddingLeft: 18, color: "rgba(255,255,255,.72)", lineHeight: 1.8, fontSize: 13 }}>
              {(log.reasons?.length ? log.reasons : ["市場平均と比較し、売れ行きと価格の妥当性を確認しています。"]).slice(0, 5).map((x, i) => <li key={`${x}-${i}`}>{x}</li>)}
            </ul>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.045)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "white", marginBottom: 10 }}>改善ポイント</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "rgba(255,255,255,.72)", lineHeight: 1.8, fontSize: 13 }}>
              {(log.improvements?.length ? log.improvements : ["写真・説明文・価格を見直すと判断しやすくなります。"]).slice(0, 6).map((x, i) => <li key={`${x}-${i}`}>{x}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function SavedDiagnosisSection(props: {
  logs: DiagnosisLog[];
  loading: boolean;
  error: string;
  onReload: () => void;
  onSelect: (log: DiagnosisLog) => void;
}) {
  return (
    <section style={{ borderRadius: 28, border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.055)", padding: 18, boxShadow: "0 24px 80px rgba(0,0,0,.25)", backdropFilter: "blur(16px)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".22em", color: "rgba(125,211,252,.72)" }}>SAVED DIAGNOSIS</div>
          <h2 style={{ margin: "5px 0 0", fontSize: 24, lineHeight: 1.2, color: "white", fontWeight: 900 }}>保存済み売れる診断</h2>
          <p style={{ margin: "9px 0 0", color: "rgba(255,255,255,.62)", fontSize: 14, lineHeight: 1.7 }}>売れる診断で診断・保存した商品だけを表示します。学習データ管理のデータとは別です。カードを押すと詳細をポップアップ表示します。</p>
        </div>
        <button type="button" onClick={props.onReload} style={{ flex: "0 0 auto", border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.08)", color: "white", borderRadius: 14, padding: "10px 14px", fontWeight: 900, cursor: "pointer" }}>履歴を再読込</button>
      </div>

      {props.loading ? (
        <div style={{ marginTop: 16, borderRadius: 18, border: "1px solid rgba(255,255,255,.10)", background: "rgba(0,0,0,.25)", padding: 14, color: "rgba(255,255,255,.64)", fontSize: 14 }}>診断履歴を読み込み中...</div>
      ) : props.error ? (
        <div style={{ marginTop: 16, borderRadius: 18, border: "1px solid rgba(251,191,36,.20)", background: "rgba(251,191,36,.10)", padding: 14, color: "#fef3c7", fontSize: 14 }}>{props.error}</div>
      ) : props.logs.length === 0 ? (
        <div style={{ marginTop: 16, borderRadius: 18, border: "1px solid rgba(255,255,255,.10)", background: "rgba(0,0,0,.25)", padding: 14, color: "rgba(255,255,255,.64)", fontSize: 14 }}>まだ保存済み診断がありません。売れる診断を実行すると、ここに商品別履歴が表示されます。</div>
      ) : (
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {props.logs.map((log) => {
            const thumb = log.imageUrl || log.imageUrls?.[0] || "";
            return (
              <button
                type="button"
                key={log.id}
                onClick={() => props.onSelect(log)}
                style={{ display: "block", width: "100%", overflow: "hidden", borderRadius: 18, border: "1px solid rgba(255,255,255,.12)", background: "rgba(0,0,0,.28)", padding: 0, textAlign: "left", cursor: "pointer" }}
              >
                <div style={{ width: "100%", height: 118, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.28)", overflow: "hidden" }}>
                  {thumb ? <img src={thumb} alt={log.title || "診断商品"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <div style={{ padding: 10, color: "rgba(255,255,255,.72)", fontSize: 13, fontWeight: 900, textAlign: "center" }}>{log.title || "商品名未入力"}</div>}
                </div>
                <div style={{ padding: 10 }}>
                  <div style={{ color: "white", fontSize: 13, fontWeight: 900, lineHeight: 1.35, minHeight: 36, overflow: "hidden" }}>{log.title || "商品名未入力"}</div>
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center", color: "rgba(255,255,255,.52)", fontSize: 11 }}>
                    <span>{shortDateTime(log.createdAt)}</span>
                    <span style={{ border: "1px solid rgba(74,222,128,.22)", background: "rgba(34,197,94,.12)", color: "#bbf7d0", borderRadius: 999, padding: "2px 7px", fontWeight: 900 }}>{log.score ?? 0}点</span>
                  </div>
                  <div style={{ marginTop: 5, color: "rgba(255,255,255,.52)", fontSize: 11 }}>推奨 {logPriceRange(log)}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SellCheckInsightPanel(props: { result: SellCheckResult; listedPrice?: string | number }) {
  const result = props.result;
  const listed = safeNumber(props.listedPrice);
  const marketAvg = marketAveragePrice(result);
  const designScore = result.imageAnalysis?.overallImageScore ?? result.scoreBreakdown?.imageScore ?? 0;
  const marketDemand = result.marketAnalysis?.demandScore ?? result.scoreBreakdown?.marketScore ?? 0;
  const priceScore = result.scoreBreakdown?.priceScore ?? 0;
  const rotationScore =
    result.sellSpeed === "fast" ? 88 :
    result.sellSpeed === "normal" ? 68 :
    result.sellSpeed === "slow" ? 42 :
    result.sellSpeed === "collector_wait" ? 34 : 50;

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.055] p-4 shadow-[0_24px_80px_rgba(0,0,0,.22)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/60">SELL CHECK INSIGHT</div>
          <div className="mt-1 text-lg font-black text-white">価格・回転・市場比較</div>
          <p className="mt-1 text-xs leading-5 text-white/55">既存のSELL CHECK結果を削らず、判断に必要な指標だけを上に集約しています。</p>
        </div>
        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-50">
          {result.action || result.rankLabel || fallbackRankLabel(result.rank)}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <InfoCard label="推奨価格" value={`${formatYen(result.suggestedPriceMin)}〜${formatYen(result.suggestedPriceMax)}`} />
        <InfoCard label="市場平均" value={yenOrDash(marketAvg)} />
        <InfoCard label="入力価格" value={yenOrDash(listed)} />
        <InfoCard label="価格による回転速度" value={priceRotationLabel(result)} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <RingMetric label="総合" value={result.score} sub="SELL CHECK" />
        <RingMetric label="価格妥当性" value={priceScore} sub="入力価格×類似価格" />
        <RingMetric label="デザイン性" value={designScore} sub="画像総合" />
        <RingMetric label="市場需要" value={marketDemand} sub="市場平均との比較" />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <InfoCard label="売却中央値" value={yenOrDash(result.similarData?.medianSoldPrice)} />
        <InfoCard label="販売中中央値" value={yenOrDash(result.similarData?.medianActivePrice)} />
        <InfoCard label="類似データ数" value={`${result.similarData?.similarCount ?? result.learnedSampleCount ?? 0}件`} />
      </div>
    </div>
  );
}

export default function SellCheckPage() {
  const sp = useSearchParams();
  const initialDraftId = sp.get("draftId");
  const selectorSource = sp.get("source") === "product-selector";
  const selectorTitle = sp.get("title") || "";
  const selectorMemo = sp.get("memo") || "";
  const selectorKeywords = sp.get("keywords") || "";
  const selectorCategoryRaw = sp.get("category") || "";
  const selectorCategory = CATEGORY_OPTIONS.some((x) => x.value === selectorCategoryRaw)
    ? selectorCategoryRaw
    : "interior";

  const [uid, setUid] = useState<string | null>(null);
  const [idToken, setIdToken] = useState("");

  const [sourceMode, setSourceMode] = useState<"draft" | "manual">(
    initialDraftId ? "draft" : "manual"
  );

  const [drafts, setDrafts] = useState<DraftOption[]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState(initialDraftId ?? "");

  const selectedDraft = useMemo(
    () => drafts.find((x) => x.id === selectedDraftId) ?? null,
    [drafts, selectedDraftId]
  );

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const [price, setPrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [estimatedShippingCost, setEstimatedShippingCost] = useState("");
  const [estimatedPackagingCost, setEstimatedPackagingCost] = useState("");
  const [platformFeeRate, setPlatformFeeRate] = useState("0.1");

  const [category, setCategory] = useState(selectorSource ? selectorCategory : "interior");
  const [condition, setCondition] = useState("good");

  const [title, setTitle] = useState(selectorSource ? selectorTitle : "");
  const [memo, setMemo] = useState(selectorSource ? selectorMemo : "");
  const [keywords, setKeywords] = useState(selectorSource ? selectorKeywords : "");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SellCheckResult | null>(null);
  const [error, setError] = useState("");

  const [batchItems, setBatchItems] = useState<BatchDiagnosisItem[]>([
    createBatchDiagnosisItem(1),
  ]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const [diagnosisMode, setDiagnosisMode] = useState<"single" | "bulk">("single");
  const [stats, setStats] = useState<Stats | null>(null);
  const [diagnosisLogs, setDiagnosisLogs] = useState<DiagnosisLog[]>([]);
  const [diagnosisLogsLoading, setDiagnosisLogsLoading] = useState(false);
  const [diagnosisLogsError, setDiagnosisLogsError] = useState("");
  const [selectedDiagnosisLog, setSelectedDiagnosisLog] = useState<DiagnosisLog | null>(null);

  const targetText = useMemo(() => {
    const categoryLabel =
      CATEGORY_OPTIONS.find((x) => x.value === category)?.label || "その他";
    const conditionLabel =
      CONDITION_OPTIONS.find((x) => x.value === condition)?.label || "良好";

    return `${categoryLabel} / ${conditionLabel} / ${Number(price || 0).toLocaleString()}円`;
  }, [category, condition, price]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUid(u?.uid ?? null);

      if (u) {
        const token = await u.getIdToken(true).catch(() => "");
        setIdToken(token);
        void loadDiagnosisLogs(token);
      } else {
        setIdToken("");
        setDiagnosisLogs([]);
        setDiagnosisLogsError("ログイン確認後に診断履歴を表示します。");
      }
    });

    return () => unsub();
  }, []);

  async function loadStats() {
    try {
      const res = await fetch("/api/sell-check/stats", {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json();

      if (data?.ok && data?.stats) {
        setStats(data.stats);
      }
    } catch {
      setStats(null);
    }
  }

  async function loadDiagnosisLogs(token = idToken) {
    if (!token) {
      setDiagnosisLogs([]);
      setDiagnosisLogsError("ログイン確認後に診断履歴を表示します。");
      return;
    }

    setDiagnosisLogsLoading(true);
    setDiagnosisLogsError("");

    try {
      const res = await fetch("/api/sell-check/diagnosis-logs?limit=60", {
        method: "GET",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "診断履歴の取得に失敗しました");
      }

      setDiagnosisLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (e) {
      setDiagnosisLogs([]);
      setDiagnosisLogsError(e instanceof Error ? e.message : "診断履歴の取得に失敗しました");
    } finally {
      setDiagnosisLogsLoading(false);
    }
  }

  async function loadDrafts(currentUid: string) {
    setDraftLoading(true);

    try {
      const qy = query(
        collection(db, "drafts"),
        where("userId", "==", currentUid),
        orderBy("updatedAt", "desc"),
        limit(100)
      );

      const snap = await getDocs(qy);

      const list: DraftOption[] = snap.docs
        .map((docSnap) => {
          const data = docSnap.data() as DocumentData;
          const imageUrl = resolveListImageUrl(data);

          if (!imageUrl) return null;

          const outcome =
            data.outcome && typeof data.outcome === "object" ? data.outcome : {};

          return {
            id: docSnap.id,
            title: resolveTitle(data),
            phase: normalizePhase(data.phase),
            brand: data.brand === "riva" || data.brandId === "riva" ? "riva" : "vento",
            imageUrl,
            listedPrice: safeNumber((outcome as any).listedPrice),
            condition: safeString(data.condition),
            category: safeString(data.category),
            memo: resolveMemo(data),
            keywords: resolveKeywords(data),
          };
        })
        .filter(Boolean) as DraftOption[];

      setDrafts(list);

      if (initialDraftId && list.some((x) => x.id === initialDraftId)) {
        setSelectedDraftId(initialDraftId);
      } else if (!selectedDraftId && list.length > 0) {
        setSelectedDraftId(list[0].id);
      }
    } catch (e) {
      console.error(e);
      setDrafts([]);
    } finally {
      setDraftLoading(false);
    }
  }

  useEffect(() => {
    void loadStats();
  }, []);

  useEffect(() => {
    if (!uid) {
      setDrafts([]);
      return;
    }

    void loadDrafts(uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    if (imageFiles.length === 0) {
      setPreviewUrls([]);
      return;
    }

    const urls = imageFiles.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imageFiles]);

  useEffect(() => {
    if (sourceMode !== "draft") return;
    if (!selectedDraft) return;

    if (selectedDraft.listedPrice && selectedDraft.listedPrice > 0) {
      setPrice(String(selectedDraft.listedPrice));
    }

    if (selectedDraft.category) setCategory(selectedDraft.category);
    if (selectedDraft.condition) setCondition(selectedDraft.condition);

    setTitle(selectedDraft.title || "");
    setMemo(selectedDraft.memo || "");
    setKeywords(selectedDraft.keywords || "");
  }, [selectedDraft, sourceMode]);

  function updateBatchItem(id: string, patch: Partial<BatchDiagnosisItem>) {
    setBatchItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function addBatchItem() {
    setBatchItems((prev) => [...prev, createBatchDiagnosisItem(prev.length + 1)]);
  }

  function removeBatchItem(id: string) {
    setBatchItems((prev) => {
      const target = prev.find((item) => item.id === id);
      target?.previews.forEach((url) => URL.revokeObjectURL(url));
      const next = prev.filter((item) => item.id !== id);
      return next.length > 0 ? next : [createBatchDiagnosisItem(1)];
    });
  }

  function setBatchItemImages(id: string, files: File[]) {
    const { supported, rejected } = filterSupportedImageFiles(files);
    const rejectMessage = unsupportedImageMessage(rejected);

    setBatchItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        item.previews.forEach((url) => URL.revokeObjectURL(url));
        const nextFiles = supported.slice(0, 8);
        return {
          ...item,
          files: nextFiles,
          previews: nextFiles.map((file) => URL.createObjectURL(file)),
          error: rejectMessage,
        };
      }),
    );
  }

  async function uploadDiagnosisImage(file: File): Promise<string> {
    const uploadFile = await compressImageForSellCheck(file, SELL_CHECK_SINGLE_IMAGE_LIMIT_BYTES);
    const form = new FormData();
    form.append("file", uploadFile);

    const headers: Record<string, string> = {};
    if (idToken) headers.Authorization = `Bearer ${idToken}`;

    const res = await fetch("/api/upload/image", {
      method: "POST",
      headers,
      body: form,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || !data?.url) {
      throw new Error(data?.error || "診断画像の保存に失敗しました");
    }

    return String(data.url);
  }

  async function analyzeBatchItem(item: BatchDiagnosisItem): Promise<{ result: SellCheckResult; imageUrl: string }> {
    if (!item.price.trim()) {
      throw new Error("想定出品価格を入力してください。");
    }

    const { supported, rejected } = filterSupportedImageFiles(item.files);
    if (rejected.length > 0) {
      throw new Error(unsupportedImageMessage(rejected));
    }

    if (supported.length === 0) {
      throw new Error("診断対象画像を1枚以上選択してください。");
    }

    const preparedImages = await prepareSellCheckImages(supported);
    let uploadedImageUrls: string[] = [];
    let imageUrl = "";

    const form = new FormData();
    form.append("price", item.price);
    form.append("purchasePrice", item.purchasePrice);
    form.append("estimatedShippingCost", estimatedShippingCost);
    form.append("estimatedPackagingCost", estimatedPackagingCost);
    form.append("platformFeeRate", platformFeeRate);
    form.append("category", item.category);
    form.append("condition", item.condition);
    form.append("title", item.title);
    form.append("memo", item.memo);
    form.append("keywords", item.keywords);
    form.append("imageUrl", imageUrl);
    preparedImages.forEach((file) => form.append("images", file));

    const res = await fetch("/api/sell-check/analyze", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "診断に失敗しました");
    }

    const nextResult = data.result as SellCheckResult;

    // 診断そのものを優先します。画像保存で容量・Storage・権限エラーが出ても、
    // 診断結果は保存できるように代表画像保存だけ後段で試行します。
    try {
      uploadedImageUrls = [];
      for (const file of preparedImages.slice(0, 4)) {
        const url = await uploadDiagnosisImage(file);
        if (url) uploadedImageUrls.push(url);
      }
      imageUrl = uploadedImageUrls[0] || "";
    } catch (uploadError) {
      console.warn("[sell-check] bulk image save skipped", uploadError);
      uploadedImageUrls = [];
      imageUrl = "";
    }

    await saveDiagnosisPayload({
      result: nextResult,
      imageUrl,
      imageUrls: uploadedImageUrls,
      imageSource: "manual",
      title: item.title,
      memo: item.memo,
      keywords: item.keywords,
      price: item.price,
      category: item.category,
      condition: item.condition,
    });

    return { result: nextResult, imageUrl };
  }

  async function analyzeBatch() {
    setBatchBusy(true);
    setBatchMessage("");
    setError("");

    try {
      let successCount = 0;

      for (const item of batchItems) {
        if (item.files.length === 0 && !item.title.trim() && !item.price.trim()) continue;

        updateBatchItem(item.id, { error: "", result: null });

        try {
          const analyzed = await analyzeBatchItem(item);
          updateBatchItem(item.id, {
            result: analyzed.result,
            savedImageUrl: analyzed.imageUrl,
            error: "",
          });
          successCount += 1;
        } catch (e) {
          updateBatchItem(item.id, {
            error: e instanceof Error ? e.message : "診断に失敗しました",
          });
        }
      }

      setBatchMessage(
        successCount > 0
          ? `${successCount}件の診断を保存しました。画像付きで診断履歴に保存されています。`
          : "診断対象がありません。各商品枠に画像と想定出品価格を入れてから一括診断してください。",
      );
      await loadStats();
      await loadDiagnosisLogs();
    } finally {
      setBatchBusy(false);
    }
  }

  async function saveDiagnosisPayload(args: {
    result: SellCheckResult;
    imageUrl: string;
    imageUrls?: string[];
    imageSource: "manual" | "draft";
    draftId?: string;
    title: string;
    memo: string;
    keywords: string;
    price: string;
    category: string;
    condition: string;
  }) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (idToken) {
      headers.Authorization = `Bearer ${idToken}`;
    }

    const res = await fetch("/api/sell-check/save", {
      method: "POST",
      headers,
      body: JSON.stringify({
        draftId: args.draftId,
        imageUrl: args.imageUrl,
        imageUrls: args.imageUrls || (args.imageUrl ? [args.imageUrl] : []),
        imageCount: args.imageUrls?.length || (args.imageUrl ? 1 : 0),
        imageSource: args.imageSource,
        price: args.price,
        category: args.category,
        condition: args.condition,
        title: args.title,
        memo: args.memo,
        keywords: args.keywords,
        score: args.result.score,
        rank: args.result.rank,
        action: args.result.action,
        scoreLabel: args.result.scoreLabel,
        rankLabel: args.result.rankLabel,
        sellSpeed: args.result.sellSpeed,
        sellSpeedLabel: args.result.sellSpeedLabel,
        confidenceLevel: args.result.confidenceLevel,
        confidenceLabel: args.result.confidenceLabel,
        marketType: args.result.marketType,
        marketTypeLabel: args.result.marketTypeLabel,
        scoreExplanation: args.result.scoreExplanation,
        suggestedPriceMin: args.result.suggestedPriceMin,
        suggestedPriceMax: args.result.suggestedPriceMax,
        improvements: args.result.improvements,
        reasons: args.result.reasons,
        learnedSampleCount: args.result.learnedSampleCount,
        targetSummary: args.result.targetSummary,
        imageAnalysis: args.result.imageAnalysis,
        textAnalysis: args.result.textAnalysis,
        marketAnalysis: args.result.marketAnalysis,
        similarData: args.result.similarData,
        decisionMode: args.result.decisionMode,
        decisionModeLabel: args.result.decisionModeLabel,
        researchGuide: args.result.researchGuide,
        profitAnalysis: args.result.profitAnalysis,
        acquisitionAnalysis: args.result.acquisitionAnalysis,
        actionGuide: args.result.actionGuide,
        theoryProfile: args.result.theoryProfile,
        marketStructureAnalysis: args.result.marketStructureAnalysis,
        priceDistortionAnalysis: args.result.priceDistortionAnalysis,
        rotationLearningAnalysis: args.result.rotationLearningAnalysis,
        hasImage: true,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "診断結果の保存に失敗しました");
    }
  }

  async function saveDiagnosisResult(args: {
    result: SellCheckResult;
    imageUrl: string;
    imageUrls?: string[];
    imageSource: "manual" | "draft";
    draftId?: string;
  }) {
    await saveDiagnosisPayload({
      result: args.result,
      imageUrl: args.imageUrl,
      imageUrls: args.imageUrls,
      imageSource: args.imageSource,
      draftId: args.draftId,
      price,
      category,
      condition,
      title,
      memo,
      keywords,
    });
  }

  async function analyze() {
    setError("");
    setResult(null);
    setBusy(true);

    try {
      let targetFile: File | null = null;
      let manualPreparedImages: File[] = [];
      let usedImageUrl = "";
      let usedDraftId = "";
      let imageSource: "manual" | "draft" = "manual";

      if (sourceMode === "draft") {
        if (!selectedDraft) {
          setError("診断する下書き・投稿済みデータを選択してください。");
          return;
        }

        if (!selectedDraft.imageUrl) {
          setError("選択したデータに診断対象画像がありません。");
          return;
        }

        // 下書き画像はブラウザ側で fetch → File 化すると、Safari/CORS/Storage署名URLの期限で
        // 「Load failed」になり診断そのものが止まることがあります。
        // ここでは既存の手動アップロード処理は維持しつつ、下書き画像は imageUrl をAPIへ渡し、
        // サーバー側で取得します。サーバー側でも取得できない場合はAPIがテキスト診断へフォールバックします。
        targetFile = null;

        usedImageUrl = selectedDraft.imageUrl;
        usedDraftId = selectedDraft.id;
        imageSource = "draft";
      } else {
        const { supported, rejected } = filterSupportedImageFiles(imageFiles);
        if (rejected.length > 0) {
          setError(unsupportedImageMessage(rejected));
          return;
        }

        if (supported.length === 0) {
          setError("診断対象の画像を1枚以上選択してください。PNG / JPEG / GIF / WebP に対応しています。");
          return;
        }

        manualPreparedImages = await prepareSellCheckImages(supported);
        targetFile = manualPreparedImages[0] || null;
        usedImageUrl = "";
        imageSource = "manual";
      }

      if (!price.trim()) {
        setError("想定出品価格を入力してください。");
        return;
      }

      if (sourceMode === "manual" && targetFile) {
        try {
          usedImageUrl = await uploadDiagnosisImage(targetFile);
        } catch (uploadError) {
          console.warn("[sell-check] manual image save skipped before analyze", uploadError);
          usedImageUrl = "";
        }
      }

      const form = new FormData();
      form.append("price", price);
      form.append("purchasePrice", purchasePrice);
      form.append("estimatedShippingCost", estimatedShippingCost);
      form.append("estimatedPackagingCost", estimatedPackagingCost);
      form.append("platformFeeRate", platformFeeRate);
      form.append("category", category);
      form.append("condition", condition);
      form.append("title", title);
      form.append("memo", memo);
      form.append("keywords", keywords);
      if (sourceMode === "manual") {
        manualPreparedImages.forEach((file) => {
          form.append("images", file);
        });
      } else if (targetFile) {
        form.append("image", targetFile);
      }

      if (usedImageUrl) {
        form.append("imageUrl", usedImageUrl);
      }

      if (usedDraftId) {
        form.append("draftId", usedDraftId);
      }

      const res = await fetch("/api/sell-check/analyze", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "診断に失敗しました");
      }

      const nextResult = data.result as SellCheckResult;
      setResult(nextResult);

      await saveDiagnosisResult({
        result: nextResult,
        imageUrl: usedImageUrl,
        imageSource,
        draftId: usedDraftId || undefined,
      });

      await loadStats();
      await loadDiagnosisLogs();
    } catch (e) {
      const message = e instanceof Error ? e.message : "診断に失敗しました";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sell-check-root space-y-5">
      <style>{`
        .sell-check-root input, .sell-check-root textarea, .sell-check-root select {
          background: rgba(0, 0, 0, 0.45) !important;
          color: rgba(255,255,255,.92) !important;
          border-color: rgba(255,255,255,.12) !important;
          border-radius: 14px !important;
        }
        .sell-check-root input::placeholder, .sell-check-root textarea::placeholder {
          color: rgba(255,255,255,.35) !important;
        }
        .sell-check-root img {
          max-width: 100%;
        }
      `}</style>
      <section className="rounded-[2rem] border border-white/15 bg-black/18 p-5 md:p-6">
        <div className="text-xs font-black tracking-[0.32em] text-white/50">
          SELL CHECK / STRUCTURE
        </div>
        <h2 className="mt-2 text-2xl font-black tracking-[0.12em] text-white">
          DB判定 → 理論判定 → 統合判定
        </h2>
        <p className="mt-3 text-sm leading-7 text-white/65">
          売れる診断は単独ツールではなく、市場研究ラボで蓄積したMarket DB・Learning DB・Theory DBを参照し、
          既存SELL CHECKロジックを削除せずに最終判断を補助する画面です。
        </p>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-4">
            <div className="text-sm font-black text-white">① DB判定</div>
            <p className="mt-2 text-xs leading-6 text-white/62">
              過去市場、類似市場、類似商品、成功事例、失敗事例、theoryDB内容を確認します。
            </p>
          </div>
          <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-4">
            <div className="text-sm font-black text-white">② 理論判定</div>
            <p className="mt-2 text-xs leading-6 text-white/62">
              市場理論、デザイン理論、市場形成、市場存在性、不足情報を確認します。
            </p>
          </div>
          <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-4">
            <div className="text-sm font-black text-white">③ 統合判定</div>
            <p className="mt-2 text-xs leading-6 text-white/62">
              DB判定＋理論判定＋商品画像を統合し、買い・見送り・保留、安全価格、攻め価格、利益予測、回転予測を確認します。
            </p>
          </div>
        </div>
      </section>


      <div className="border-b border-white/10 pb-4">
        <h1 className="text-2xl font-black tracking-wide">売れる診断</h1>
        <p className="mt-2 text-sm text-white/65">
          商品画像・価格・カテゴリ・状態に加えて、商品名・説明文・キーワードを使って診断します。
          売却済みデータを主軸にし、販売中データは競合在庫として補正します。
        </p>

        <div className="mt-3">
          <Link
            href="/flow/sell-check/outcomes"
            className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white"
          >
            仕入れ・売却 実務ログを開く
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-3xl border border-white/10 bg-black/25 p-2">
        <button
          type="button"
          onClick={() => setDiagnosisMode("single")}
          className={[
            "rounded-2xl px-4 py-2 text-sm font-black transition",
            diagnosisMode === "single" ? "bg-white text-black" : "bg-white/8 text-white hover:bg-white/12",
          ].join(" ")}
        >
          1商品を診断
        </button>
        <button
          type="button"
          onClick={() => setDiagnosisMode("bulk")}
          className={[
            "rounded-2xl px-4 py-2 text-sm font-black transition",
            diagnosisMode === "bulk" ? "bg-white text-black" : "bg-white/8 text-white hover:bg-white/12",
          ].join(" ")}
        >
          複数商品を一括診断
        </button>
      </div>

      {diagnosisMode === "bulk" ? (
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.24em] text-sky-100/60">BULK SELL CHECK</div>
            <h2 className="mt-1 text-xl font-black text-white">複数商品を同時に診断・保存</h2>
            <p className="mt-2 text-sm leading-6 text-white/60">商品ごとに画像・価格・説明文を入れて一括診断します。結果は画像付きで診断履歴へ保存されます。</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={addBatchItem} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white">商品枠を追加</button>
            <button type="button" onClick={analyzeBatch} disabled={batchBusy} className="rounded-2xl bg-sky-100 px-5 py-2 text-sm font-black text-sky-950 disabled:opacity-50">{batchBusy ? "一括診断中..." : "一括診断して保存"}</button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {batchItems.map((item, index) => (
            <div key={item.id} className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="font-black text-white">商品 {index + 1}</div>
                <button type="button" onClick={() => removeBatchItem(item.id)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/60">削除</button>
              </div>
              <label className="flex min-h-[150px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-sky-200/25 bg-black/25 p-3 text-center text-sm text-white/55 hover:bg-white/10">
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple className="hidden" onChange={(e) => { setBatchItemImages(item.id, Array.from(e.target.files ?? [])); e.currentTarget.value = ""; }} />
                {item.previews.length > 0 ? (
                  <div className="grid w-full grid-cols-2 gap-2">
                    {item.previews.slice(0, 4).map((url, i) => (
                      <img key={`${url}-${i}`} src={url} alt={`商品${index + 1}画像${i + 1}`} className="h-24 w-full rounded-xl border border-white/10 object-contain" />
                    ))}
                  </div>
                ) : (
                  <span>＋ 画像を選択<br /><span className="text-xs text-white/35">複数枚可</span></span>
                )}
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input value={item.title} onChange={(e) => updateBatchItem(item.id, { title: e.target.value })} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none" placeholder="商品名" />
                <input value={item.price} onChange={(e) => updateBatchItem(item.id, { price: e.target.value })} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none" placeholder="出品価格" />
                <select value={item.category} onChange={(e) => updateBatchItem(item.id, { category: e.target.value })} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none">{CATEGORY_OPTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
                <select value={item.condition} onChange={(e) => updateBatchItem(item.id, { condition: e.target.value })} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none">{CONDITION_OPTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
              </div>
              <textarea value={item.memo} onChange={(e) => updateBatchItem(item.id, { memo: e.target.value })} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none" placeholder="説明文・状態・付属品・傷など" />
              <input value={item.keywords} onChange={(e) => updateBatchItem(item.id, { keywords: e.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none" placeholder="キーワード" />
              {item.error ? <div className="mt-3 rounded-xl border border-red-300/20 bg-red-500/10 p-2 text-xs text-red-100">{item.error}</div> : null}
              {item.result ? (
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm text-emerald-50">
                    <div className="font-black">診断保存済み：{item.result.score}/100・ランク{item.result.rank}</div>
                    <div className="mt-1 text-xs text-emerald-50/70">{item.result.rankLabel || fallbackRankLabel(item.result.rank)}</div>
                  </div>
                  <SellCheckInsightPanel result={item.result} listedPrice={item.price} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {batchMessage ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/75">{batchMessage}</div> : null}
      </section>
      ) : null}

      {diagnosisMode === "single" ? (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-white/10 bg-black/30 p-5">
          <div className="mb-4">
            <div className="text-lg font-black">1. 診断対象</div>
            <div className="mt-1 text-sm text-white/60">
              AOI FLOWの制作画像を使うか、手動アップロードで診断します。
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSourceMode("draft")}
              className={[
                "rounded-full px-4 py-2 text-sm font-black border",
                sourceMode === "draft"
                  ? "bg-white text-black border-white"
                  : "bg-white/8 text-white border-white/15",
              ].join(" ")}
            >
              AOI FLOWの画像から選ぶ
            </button>

            <button
              type="button"
              onClick={() => {
                setSourceMode("manual");
                setTitle("");
                setMemo("");
                setKeywords("");
                setPrice("");
                setPurchasePrice("");
                setEstimatedShippingCost("");
                setEstimatedPackagingCost("");
                setPlatformFeeRate("0.1");
              }}
              className={[
                "rounded-full px-4 py-2 text-sm font-black border",
                sourceMode === "manual"
                  ? "bg-white text-black border-white"
                  : "bg-white/8 text-white border-white/15",
              ].join(" ")}
            >
              手動アップロード
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
            <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
              <div className="mb-2 text-sm font-bold text-white/75">商品画像</div>

              {sourceMode === "draft" ? (
                <div className="space-y-3">
                  {!uid ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                      ログイン確認中です。
                    </div>
                  ) : draftLoading ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                      AOI FLOW画像を読み込み中...
                    </div>
                  ) : drafts.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                      診断できる画像付きデータがありません。
                    </div>
                  ) : (
                    <>
                      <select
                        value={selectedDraftId}
                        onChange={(e) => setSelectedDraftId(e.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-white outline-none"
                      >
                        {drafts.map((d) => (
                          <option key={d.id} value={d.id}>
                            {phaseLabel(d.phase)} / {d.brand.toUpperCase()} / {d.title}
                          </option>
                        ))}
                      </select>

                      {selectedDraft?.imageUrl ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <img
                            src={selectedDraft.imageUrl}
                            alt="AOI FLOWの診断対象画像"
                            className="max-h-[260px] w-full rounded-xl object-contain"
                          />

                          <div className="mt-3 break-all text-xs text-white/55">
                            対象：{phaseLabel(selectedDraft.phase)} /{" "}
                            {selectedDraft.brand.toUpperCase()}
                            <br />
                            draftId：{selectedDraft.id}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <>
                  <label className="flex min-h-[220px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 p-3 text-center text-sm text-white/60 hover:bg-white/10">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const selected = Array.from(e.target.files ?? []).slice(0, 8);
                        const { supported, rejected } = filterSupportedImageFiles(selected);
                        setImageFiles(supported);
                        const msg = unsupportedImageMessage(rejected);
                        if (msg) setError(msg);
                        e.currentTarget.value = "";
                      }}
                    />

                    {previewUrls.length > 0 ? (
                      <div className="w-full">
                        <div className="mb-3 text-left text-xs font-black text-white/55">
                          診断対象の商品画像：{previewUrls.length}枚
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {previewUrls.map((url, index) => (
                            <div key={`${imageFiles[index]?.name || "image"}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                              <img
                                src={url}
                                alt={`診断対象の商品画像 ${index + 1}`}
                                className="max-h-[220px] w-full rounded-xl object-contain"
                              />
                              <div className="border-t border-white/10 px-3 py-2 text-xs font-bold text-white/50">
                                {imageFiles[index]?.name || `画像 ${index + 1}`}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <span>
                        画像を複数選択
                        <br />
                        全体・裏面・傷・付属品もまとめて診断できます
                      </span>
                    )}
                  </label>

                  {imageFiles.length > 0 ? (
                    <div className="mt-3 text-xs text-white/55">
                      対象画像：{imageFiles.map((file) => file.name).join(", ")}
                      <br />
                      合計サイズ：約{Math.round(imageFiles.reduce((sum, file) => sum + file.size, 0) / 1024).toLocaleString()}KB
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-white/75">
                  想定出品価格
                </label>
                <div className="mb-2 text-xs text-white/45">
                  この金額で出した場合に、価格妥当性・売れ行き目安・推奨価格帯を判定します。
                </div>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-white outline-none"
                  placeholder="例：2000"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <InputField label="仕入れ価格" value={purchasePrice} onChange={setPurchasePrice} placeholder="例：500" />
                <InputField label="想定送料" value={estimatedShippingCost} onChange={setEstimatedShippingCost} placeholder="例：750" />
                <InputField label="梱包費" value={estimatedPackagingCost} onChange={setEstimatedPackagingCost} placeholder="例：100" />
                <InputField label="販売手数料率" value={platformFeeRate} onChange={setPlatformFeeRate} placeholder="例：0.1" decimal />
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-white/75">
                  カテゴリ
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-white outline-none"
                >
                  {CATEGORY_OPTIONS.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-white/75">
                  商品状態
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-white outline-none"
                >
                  {CONDITION_OPTIONS.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </div>

              <TextInput label="商品名" value={title} onChange={setTitle} placeholder="例：昭和レトロ ブリキ玩具 円谷プロ 当時物" />

              <div>
                <label className="mb-1 block text-sm font-bold text-white/75">
                  説明文
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-white outline-none"
                  placeholder="状態、付属品、年代、メーカー、傷や汚れなどを入力"
                />
              </div>

              <TextInput label="キーワード" value={keywords} onChange={setKeywords} placeholder="例：ソフビ ブリキ 円谷 昭和レトロ 当時物" />

              {selectorSource ? (
                <div className="rounded-2xl border border-cyan-200/20 bg-cyan-200/[0.07] p-4 text-sm font-bold leading-7 text-cyan-50/78">
                  PRODUCT SELECTORから候補情報を引き継ぎました。
                  商品名・説明文・キーワードを必要に応じて整えてから診断してください。
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-bold text-white/50">現在の診断対象</div>
                <div className="mt-1 text-base font-black text-white">{targetText}</div>
                <div className="mt-2 text-xs text-white/45">
                  {sourceMode === "draft"
                    ? selectedDraft
                      ? `AOI FLOW画像：${selectedDraft.title}`
                      : "AOI FLOW画像：未選択"
                    : "手動アップロード画像"}
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
                  {error}
                </div>
              ) : null}

              <button
                type="button"
                onClick={analyze}
                disabled={busy}
                className="w-full rounded-2xl bg-white px-5 py-4 text-base font-black text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "診断中..." : "この商品を診断する"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-black/30 p-5">
          <div className="mb-4">
            <div className="text-lg font-black">2. 診断結果</div>
            <div className="mt-1 text-sm text-white/60">
              総合診断スコア、売れ行き目安、価格帯、改善点、診断根拠を表示します。
            </div>
          </div>

          {!result ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">
              まだ診断していません。左側で画像と条件を入力してください。
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/8 p-5">
                <div className="text-sm text-white/55">
                  {result.scoreLabel || fallbackScoreLabel(result.score)}
                </div>

                <div className="mt-2 flex items-end gap-3">
                  <div className="text-5xl font-black">{result.score}</div>
                  <div className="pb-2 text-xl font-black text-white/70">/ 100</div>
                  <div className="ml-auto rounded-full bg-white px-4 py-2 text-lg font-black text-black">
                    {result.rank}
                  </div>
                </div>

                <div className="mt-3 text-base font-black">
                  {result.rankLabel || fallbackRankLabel(result.rank)}
                </div>

                <div className="mt-2 text-sm text-white/65">
                  {result.scoreExplanation ||
                    `${result.score}/100 は即売確率ではなく、価格・画像・説明文・市場価値・類似データを合わせた総合診断値です。`}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <InfoCard label="売れ行き目安" value={result.sellSpeedLabel || "—"} />
                  <InfoCard label="市場タイプ" value={result.marketTypeLabel || "—"} />
                  <InfoCard label="データ信頼度" value={result.confidenceLabel || "—"} />
                </div>

                <div className="mt-3 text-lg font-black">{result.action}</div>
              </div>

              <SellCheckInsightPanel result={result} listedPrice={price} />

              <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <div className="text-sm font-bold text-white/55">推奨価格帯</div>
                <div className="mt-1 text-2xl font-black">
                  {formatYen(result.suggestedPriceMin)}〜
                  {formatYen(result.suggestedPriceMax)}
                </div>
              </div>

              {result.scoreBreakdown ? (
                <ResultBlock title="総合点内訳">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    <MiniScoreCard label="価格" value={result.scoreBreakdown.priceScore} />
                    <MiniScoreCard label="状態" value={result.scoreBreakdown.conditionScore} />
                    <MiniScoreCard label="画像" value={result.scoreBreakdown.imageScore} />
                    <MiniScoreCard label="説明文" value={result.scoreBreakdown.textScore} />
                    <MiniScoreCard label="類似価格" value={result.scoreBreakdown.learnedPriceScore} />
                    <MiniScoreCard label="市場価値" value={result.scoreBreakdown.marketScore} />
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <InfoCard label="在庫圧補正" value={`-${result.scoreBreakdown.pressurePenalty}点`} />
                    <InfoCard label="補正前スコア" value={`${result.scoreBreakdown.rawScore}/100`} />
                    <InfoCard label="最終スコア" value={`${result.scoreBreakdown.finalScore}/100`} />
                  </div>

                  <BulletList items={result.scoreBreakdown.reasons} />
                </ResultBlock>
              ) : null}

              {result.decisionModeLabel ? (
                <ResultBlock title="判定モード">
                  <div className="text-lg font-black text-white">
                    {result.decisionModeLabel}
                  </div>
                </ResultBlock>
              ) : null}

              {result.marketStructureAnalysis ? (
                <ResultBlock title="市場構造OS">
                  <div className="text-lg font-black text-white">
                    {result.marketStructureAnalysis.structureLabel}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <InfoCard
                      label="回転構造"
                      value={result.marketStructureAnalysis.rotationExplanation}
                    />
                    <InfoCard
                      label="価格判断方針"
                      value={result.marketStructureAnalysis.priceJudgementPolicy}
                    />
                    <InfoCard
                      label="追加データ方針"
                      value={result.marketStructureAnalysis.dataRequirementPolicy}
                    />
                    <InfoCard
                      label="市場リスク"
                      value={result.marketStructureAnalysis.riskLevel}
                    />
                  </div>

                  <BulletList items={result.marketStructureAnalysis.reasons} />
                </ResultBlock>
              ) : null}

              {result.theoryProfile ? (
                <ResultBlock title="理論DB補正">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    <MiniScoreCard
                      label="IP強度"
                      value={result.theoryProfile.ipStrengthScore}
                    />
                    <MiniScoreCard
                      label="収集文化"
                      value={result.theoryProfile.collectorCultureScore}
                    />
                    <MiniScoreCard
                      label="箱文化"
                      value={result.theoryProfile.boxCultureScore}
                    />
                    <MiniScoreCard
                      label="発送適性"
                      value={result.theoryProfile.shippingSuitabilityScore}
                    />
                    <MiniScoreCard
                      label="回転リスク"
                      value={result.theoryProfile.rotationRiskScore}
                    />
                    <MiniScoreCard
                      label="検索具体度"
                      value={result.theoryProfile.searchSpecificityScore}
                    />
                  </div>

                  <BulletList items={result.theoryProfile.theoryReasons} />
                </ResultBlock>
              ) : null}

              {result.profitAnalysis ? (
                <ResultBlock title="利益計算">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <InfoCard label="想定売値" value={formatYen(result.profitAnalysis.expectedSalePrice)} />
                    <InfoCard label="仕入れ価格" value={formatYen(result.profitAnalysis.purchasePrice)} />
                    <InfoCard label="送料" value={formatYen(result.profitAnalysis.estimatedShippingCost)} />
                    <InfoCard label="手数料" value={formatYen(result.profitAnalysis.estimatedPlatformFee)} />
                    <InfoCard label="実利益" value={formatYen(result.profitAnalysis.estimatedNetProfit)} />
                    <InfoCard label="利益率" value={`${result.profitAnalysis.profitMarginRate}%`} />
                    <InfoCard label="損益分岐" value={formatYen(result.profitAnalysis.breakEvenPrice)} />
                  </div>

                  <BulletList items={result.profitAnalysis.riskNotes} />
                </ResultBlock>
              ) : null}

              {result.acquisitionAnalysis ? (
                <ResultBlock title="仕入れ判断">
                  <div className="text-2xl font-black">
                    {result.acquisitionAnalysis.buyDecisionLabel}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <InfoCard label="安全仕入れ" value={formatYen(result.acquisitionAnalysis.safePurchasePrice)} />
                    <InfoCard label="攻め仕入れ" value={formatYen(result.acquisitionAnalysis.aggressivePurchasePrice)} />
                    <InfoCard label="仕入れ上限" value={formatYen(result.acquisitionAnalysis.maxPurchasePrice)} />
                    <InfoCard label="仕入れリスク" value={result.acquisitionAnalysis.acquisitionRiskLevel} />
                    <InfoCard label="送料リスク" value={result.acquisitionAnalysis.shippingRiskLevel} />
                    <InfoCard label="回転率リスク" value={result.acquisitionAnalysis.rotationRiskLevel} />
                  </div>

                  <BulletList items={result.acquisitionAnalysis.reasons} />
                </ResultBlock>
              ) : null}

              {result.researchGuide ? (
                <ResultBlock title="検索支援・追加調査ガイド">
                  {result.researchGuide.searchQueries.length > 0 ? (
                    <div>
                      <div className="text-xs font-bold text-white/50">
                        推奨検索ワード
                      </div>
                      <div className="mt-2 space-y-2">
                        {result.researchGuide.searchQueries.map((x, i) => (
                          <div
                            key={`${x}-${i}`}
                            className="rounded-xl bg-white/7 px-3 py-2 text-sm text-white/80"
                          >
                            {x}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <GuideList title="精度を上げるために必要な情報" items={result.researchGuide.requiredDataToImprove} />
                  <GuideList title="調査のコツ" items={result.researchGuide.precisionTips} />
                </ResultBlock>
              ) : null}

              {result.actionGuide ? (
                <ResultBlock title="今日やること・避けること">
                  <GuideList title="今日やること" items={result.actionGuide.todayActions} />
                  <GuideList title="避けること" items={result.actionGuide.avoidActions} red />
                  <GuideList title="実務ログに残すべき項目" items={result.actionGuide.dataToRecord} />
                </ResultBlock>
              ) : null}



              {result.priceDistortionAnalysis ? (
                <ResultBlock title="価格歪み検知">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <InfoCard
                      label="歪みレベル"
                      value={result.priceDistortionAnalysis.distortionLabel}
                    />
                    <InfoCard
                      label="価格信頼度"
                      value={result.priceDistortionAnalysis.priceReliabilityLabel}
                    />
                    <InfoCard
                      label="中央値を信じるか"
                      value={result.priceDistortionAnalysis.shouldTrustMedian ? "信じやすい" : "要注意"}
                    />
                  </div>
                  <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                    {result.priceDistortionAnalysis.correctedPricePolicy}
                  </div>
                  <BulletList items={result.priceDistortionAnalysis.warningReasons} />
                </ResultBlock>
              ) : null}

              {result.rotationLearningAnalysis ? (
                <ResultBlock title="回転率学習">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <InfoCard
                      label="回転判定"
                      value={result.rotationLearningAnalysis.rotationLabel}
                    />
                    <InfoCard
                      label="売却日数目安"
                      value={result.rotationLearningAnalysis.expectedDaysToSellLabel}
                    />
                    <InfoCard
                      label="学習信頼度"
                      value={result.rotationLearningAnalysis.learningReliability}
                    />
                  </div>
                  <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                    {result.rotationLearningAnalysis.viewLikeSignal}
                  </div>
                  <GuideList
                    title="次に学習させるデータ"
                    items={result.rotationLearningAnalysis.nextLearningData}
                  />
                  <BulletList items={result.rotationLearningAnalysis.reasons} />
                </ResultBlock>
              ) : null}

              {result.similarData ? (
                <ResultBlock title="類似データ根拠">
                  <div className="text-xs text-white/50">
                    類似判定はカテゴリだけでなく、メーカー・作品名/キャラクター・シリーズ・商品種別・年代・素材・キーワードを重み付けして判断します。
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <InfoCard label="類似件数" value={`${result.similarData.similarCount}`} />
                    <InfoCard label="売却済み" value={`${result.similarData.similarSoldCount}`} />
                    <InfoCard label="販売中" value={`${result.similarData.similarActiveCount}`} />
                    <InfoCard label="一致度" value={result.similarData.matchLevel} />
                    <InfoCard label="売却中央値" value={formatYen(result.similarData.medianSoldPrice)} />
                    <InfoCard label="売却平均" value={formatYen(result.similarData.averageSoldPrice)} />
                    <InfoCard label="販売中中央値" value={formatYen(result.similarData.medianActivePrice)} />
                    <InfoCard label="在庫圧" value={result.similarData.marketPressure} />
                  </div>

                  {result.similarMatchAnalysis ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-black text-white">一致度詳細</div>
                      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <InfoCard label="最大一致重み" value={`${result.similarMatchAnalysis.maxWeight}`} />
                        <InfoCard label="平均一致重み" value={`${result.similarMatchAnalysis.averageWeight}`} />
                        <InfoCard label="強一致件数" value={`${result.similarMatchAnalysis.strongMatchCount}`} />
                        <InfoCard label="ブランド情報あり" value={`${result.similarMatchAnalysis.brandMatchCount}`} />
                        <InfoCard label="型番情報あり" value={`${result.similarMatchAnalysis.modelMatchCount}`} />
                        <InfoCard label="商品種別あり" value={`${result.similarMatchAnalysis.productTypeMatchCount}`} />
                        <InfoCard label="素材情報あり" value={`${result.similarMatchAnalysis.materialMatchCount}`} />
                        <InfoCard label="年代情報あり" value={`${result.similarMatchAnalysis.eraMatchCount}`} />
                      </div>
                      <BulletList items={result.similarMatchAnalysis.reasons} />
                      <GuideList title="一致度の注意" items={result.similarMatchAnalysis.warnings} red />
                    </div>
                  ) : null}
                </ResultBlock>
              ) : null}

              {result.smallSampleAnalysis ? (
                <ResultBlock title="少数データ判定">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                    {result.smallSampleAnalysis.summary}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <InfoCard label="使用できた売却済み類似データ" value={`${result.smallSampleAnalysis.usableSampleCount}件`} />
                    <InfoCard label="目標データ数" value={`${result.smallSampleAnalysis.targetSampleCount}件`} />
                  </div>

                  <GuideList title="不足しているデータ" items={result.smallSampleAnalysis.missingData} />
                  <GuideList title="次に集めるべきデータ" items={result.smallSampleAnalysis.nextDataToCollect} />
                  <GuideList title="判定メモ" items={result.smallSampleAnalysis.decisionNotes} />
                </ResultBlock>
              ) : null}

              {result.imageAnalysis ? (
                <ResultBlock title="画像診断根拠">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    <MiniScoreCard label="明るさ" value={result.imageAnalysis.brightnessScore} />
                    <MiniScoreCard label="構図" value={result.imageAnalysis.compositionScore} />
                    <MiniScoreCard label="背景" value={result.imageAnalysis.backgroundScore} />
                    <MiniScoreCard label="傷リスク" value={result.imageAnalysis.damageRiskScore} />
                    <MiniScoreCard label="画像総合" value={result.imageAnalysis.overallImageScore} />
                  </div>

                  <BulletList items={result.imageAnalysis.imageReasons} />
                </ResultBlock>
              ) : null}

              {result.textAnalysis ? (
                <ResultBlock title="商品情報・説明文根拠">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <InfoCard label="ブランド" value={result.textAnalysis.brandName || "—"} />
                    <InfoCard label="型番・モデル" value={result.textAnalysis.modelName || "—"} />
                    <InfoCard label="素材" value={result.textAnalysis.material || "—"} />
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <InfoCard label="商品種別" value={result.textAnalysis.productType || "—"} />
                    <InfoCard label="作品名・キャラクター" value={result.textAnalysis.characterName || "—"} />
                    <InfoCard label="シリーズ" value={result.textAnalysis.seriesName || "—"} />
                    <InfoCard label="メーカー" value={result.textAnalysis.maker || "—"} />
                    <InfoCard label="年代" value={result.textAnalysis.era || "—"} />
                    <InfoCard label="コレクター分類" value={result.textAnalysis.collectorGenre || "—"} />
                    <InfoCard label="素材分類" value={result.textAnalysis.materialType || "—"} />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <MiniScoreCard label="状態リスク" value={result.textAnalysis.conditionRiskScore} />
                    <MiniScoreCard label="説明文品質" value={result.textAnalysis.descriptionQualityScore} />
                  </div>

                  {result.textAnalysis.extractedKeywords?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {result.textAnalysis.extractedKeywords.map((x) => (
                        <span
                          key={x}
                          className="rounded-full border border-white/10 bg-white/7 px-3 py-1 text-xs text-white/75"
                        >
                          {x}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <BulletList items={result.textAnalysis.textReasons} />
                </ResultBlock>
              ) : null}

              {result.marketAnalysis ? (
                <ResultBlock title="市場価値推定">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <MiniScoreCard label="希少性" value={result.marketAnalysis.rarityScore} />
                    <MiniScoreCard label="需要" value={result.marketAnalysis.demandScore} />
                    <MiniScoreCard label="ブランド力" value={result.marketAnalysis.brandPowerScore} />
                    <MiniScoreCard label="コレクター価値" value={result.marketAnalysis.collectorScore} />
                    <MiniScoreCard label="年代価値" value={result.marketAnalysis.ageValueScore} />
                    <MiniScoreCard label="現在人気度" value={result.marketAnalysis.trendScore} />
                    <MiniScoreCard label="出品数の少なさ" value={result.marketAnalysis.marketSupplyScore} />
                    <MiniScoreCard label="検索KW強度" value={result.marketAnalysis.keywordStrength} />
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                    {result.marketAnalysis.estimatedByTheory
                      ? "類似売却データが少ないため、商品名・ブランド・年代語・素材・コレクター語句から理論推定しています。"
                      : `類似データ信頼度：${result.marketAnalysis.dataConfidence}`}
                    <br />
                    市場在庫圧：{result.marketAnalysis.marketPressure || "normal"} / 販売中参照：
                    {result.marketAnalysis.activeListingCount || 0}件
                  </div>

                  <BulletList items={result.marketAnalysis.rareReasons} />
                </ResultBlock>
              ) : null}

              <ResultBlock title="改善ポイント">
                <div className="space-y-2">
                  {result.improvements.map((x, i) => (
                    <div key={`${x}-${i}`} className="rounded-xl bg-white/7 px-3 py-2 text-sm">
                      {x}
                    </div>
                  ))}
                </div>
              </ResultBlock>

              <ResultBlock title="理由">
                <BulletList items={result.reasons} />
              </ResultBlock>

              <div className="text-xs text-white/45">
                学習データ参照数：{result.learnedSampleCount}件
                <br />
                この診断結果は売却実績の学習データには自動保存されません。
                {sourceMode === "draft" && selectedDraft ? (
                  <>
                    <br />
                    draft の outcome.sellCheck には診断結果のみ保存されます。
                  </>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
      ) : null}

      <SavedDiagnosisSection
        logs={diagnosisLogs}
        loading={diagnosisLogsLoading}
        error={diagnosisLogsError}
        onReload={() => loadDiagnosisLogs()}
        onSelect={(log) => setSelectedDiagnosisLog(log)}
      />

      {selectedDiagnosisLog ? (
        <DiagnosisDetailPopup log={selectedDiagnosisLog} onClose={() => setSelectedDiagnosisLog(null)} />
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-black/30 p-5">
        <div className="mb-4">
          <div className="text-lg font-black">3. 学習状況 管理パネル</div>
          <div className="mt-1 text-sm text-white/60">
            Firestoreの売却実績データと販売中データの状態です。
          </div>
        </div>

        {!stats ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
            学習状況を取得できませんでした。
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <InfoCard label="学習データ" value={`${stats.total}`} />
            <InfoCard label="売却済み" value={`${stats.sold}`} />
            <InfoCard label="未売却/販売中" value={`${stats.unsold}`} />
            <InfoCard label="平均スコア" value={`${stats.averageScore}`} />
            <InfoCard label="画像あり" value={`${stats.withImage}`} />
          </div>
        )}
      </section>
    </div>
  );
}

function InputField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  decimal?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-bold text-white/75">
        {props.label}
      </label>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        inputMode={props.decimal ? "decimal" : "numeric"}
        className="w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-white outline-none"
        placeholder={props.placeholder}
      />
    </div>
  );
}

function TextInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-bold text-white/75">
        {props.label}
      </label>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-white outline-none"
        placeholder={props.placeholder}
      />
    </div>
  );
}

function ResultBlock(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
      <div className="text-sm font-bold text-white/55">{props.title}</div>
      <div className="mt-3">{props.children}</div>
    </div>
  );
}

function BulletList(props: { items?: string[] }) {
  if (!props.items || props.items.length === 0) return null;

  return (
    <div className="mt-3 space-y-1">
      {props.items.map((x, i) => (
        <div key={`${x}-${i}`} className="text-sm text-white/70">
          ・{x}
        </div>
      ))}
    </div>
  );
}

function GuideList(props: { title: string; items?: string[]; red?: boolean }) {
  if (!props.items || props.items.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="text-xs font-bold text-white/50">{props.title}</div>
      <div className="mt-2 space-y-1">
        {props.items.map((x, i) => (
          <div
            key={`${x}-${i}`}
            className={props.red ? "text-sm text-red-100" : "text-sm text-white/70"}
          >
            ・{x}
          </div>
        ))}
      </div>
    </div>
  );
}