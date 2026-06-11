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

type Stats = {
  total: number;
  sold: number;
  unsold: number;
  averageScore: number;
  withImage: number;
  categoryCounts: Record<string, number>;
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
  const [stats, setStats] = useState<Stats | null>(null);

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
      } else {
        setIdToken("");
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

  async function saveDiagnosisResult(args: {
    result: SellCheckResult;
    imageUrl: string;
    imageSource: "manual" | "draft";
    draftId?: string;
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
        imageSource: args.imageSource,

        price,
        category,
        condition,

        title,
        memo,
        keywords,

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

  async function analyze() {
    setError("");
    setResult(null);
    setBusy(true);

    try {
      let targetFile: File | null = null;
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

        try {
          targetFile = await imageUrlToFile(selectedDraft.imageUrl);
        } catch (imageError) {
          // Safari や Firebase Storage の CORS 設定により、ブラウザ側で下書き画像を
          // File 化できない場合があります。その場合でも診断を止めず、
          // API 側へ imageUrl を渡してサーバー側で取得します。
          console.warn("[sell-check] client draft image fetch failed; fallback to server-side imageUrl", imageError);
          targetFile = null;
        }

        usedImageUrl = selectedDraft.imageUrl;
        usedDraftId = selectedDraft.id;
        imageSource = "draft";
      } else {
        if (imageFiles.length === 0) {
          setError("診断対象の画像を1枚以上選択してください。");
          return;
        }

        targetFile = imageFiles[0] || null;
        usedImageUrl = previewUrls[0] || "";
        imageSource = "manual";
      }

      if (!price.trim()) {
        setError("想定出品価格を入力してください。");
        return;
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
        imageFiles.slice(0, 8).forEach((file) => {
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
    } catch (e) {
      const message = e instanceof Error ? e.message : "診断に失敗しました";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
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
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []).slice(0, 8);
                        setImageFiles(files);
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

              <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <div className="text-sm font-bold text-white/55">推奨価格帯</div>
                <div className="mt-1 text-2xl font-black">
                  {formatYen(result.suggestedPriceMin)}〜
                  {formatYen(result.suggestedPriceMax)}
                </div>
              </div>

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