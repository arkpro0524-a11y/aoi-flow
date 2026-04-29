// app/flow/sell-check/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
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
      <div className="mt-1 text-lg font-black text-white">{scoreText(props.value)}</div>
    </div>
  );
}

export default function SellCheckPage() {
  const sp = useSearchParams();
  const initialDraftId = sp.get("draftId");

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

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  const [price, setPrice] = useState("2000");
  const [category, setCategory] = useState("interior");
  const [condition, setCondition] = useState("good");

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
    if (!imageFile) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!selectedDraft) return;

    if (selectedDraft.listedPrice && selectedDraft.listedPrice > 0) {
      setPrice(String(selectedDraft.listedPrice));
    }

    if (selectedDraft.category) setCategory(selectedDraft.category);
    if (selectedDraft.condition) setCondition(selectedDraft.condition);
  }, [selectedDraft]);

  async function saveResultLog(args: {
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

        score: args.result.score,
        rank: args.result.rank,
        action: args.result.action,
        suggestedPriceMin: args.result.suggestedPriceMin,
        suggestedPriceMax: args.result.suggestedPriceMax,
        improvements: args.result.improvements,
        reasons: args.result.reasons,
        learnedSampleCount: args.result.learnedSampleCount,
        targetSummary: args.result.targetSummary,

        imageAnalysis: args.result.imageAnalysis,
        textAnalysis: args.result.textAnalysis,
        similarData: args.result.similarData,

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

        targetFile = await imageUrlToFile(selectedDraft.imageUrl);
        usedImageUrl = selectedDraft.imageUrl;
        usedDraftId = selectedDraft.id;
        imageSource = "draft";
      } else {
        if (!imageFile) {
          setError("診断対象の画像を選択してください。");
          return;
        }

        targetFile = imageFile;
        usedImageUrl = previewUrl;
        imageSource = "manual";
      }

      const form = new FormData();
      form.append("price", price);
      form.append("category", category);
      form.append("condition", condition);
      form.append("image", targetFile);

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

      await saveResultLog({
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
      <div className="border-b border-white/10 pb-4">
        <h1 className="text-2xl font-black tracking-wide">売れる診断</h1>
        <p className="mt-2 text-sm text-white/65">
          診断対象は、AOI FLOWで作成した下書き・投稿済み画像、または手動アップロード画像です。
          診断結果は、draftに戻して成果データとして蓄積できます。
        </p>
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
              onClick={() => setSourceMode("manual")}
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

                          <div className="mt-3 text-xs text-white/55 break-all">
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
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setImageFile(f);
                      }}
                    />

                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="診断対象の商品画像"
                        className="max-h-[260px] w-full rounded-xl object-contain"
                      />
                    ) : (
                      <span>
                        画像を選択
                        <br />
                        ここが診断対象になります
                      </span>
                    )}
                  </label>

                  {imageFile ? (
                    <div className="mt-3 text-xs text-white/55">
                      対象画像：{imageFile.name}
                      <br />
                      サイズ：約{Math.round(imageFile.size / 1024).toLocaleString()}KB
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-white/75">
                  価格
                </label>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-white outline-none"
                  placeholder="例：2000"
                />
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
              売れる可能性、価格帯、改善点、診断根拠を表示します。
            </div>
          </div>

          {!result ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">
              まだ診断していません。左側で画像と条件を入力してください。
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/8 p-5">
                <div className="text-sm text-white/55">売れる可能性</div>
                <div className="mt-2 flex items-end gap-3">
                  <div className="text-5xl font-black">{result.score}</div>
                  <div className="pb-2 text-xl font-black text-white/70">/ 100</div>
                  <div className="ml-auto rounded-full bg-white px-4 py-2 text-lg font-black text-black">
                    {result.rank}
                  </div>
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

              {result.similarData ? (
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <div className="text-sm font-bold text-white/55">類似データ根拠</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-xl bg-white/7 p-3 text-sm">
                      類似件数
                      <div className="mt-1 text-lg font-black">
                        {result.similarData.similarCount}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/7 p-3 text-sm">
                      売却済み
                      <div className="mt-1 text-lg font-black">
                        {result.similarData.similarSoldCount}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/7 p-3 text-sm">
                      中央値
                      <div className="mt-1 text-lg font-black">
                        {formatYen(result.similarData.medianSoldPrice)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/7 p-3 text-sm">
                      平均
                      <div className="mt-1 text-lg font-black">
                        {formatYen(result.similarData.averageSoldPrice)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {result.imageAnalysis ? (
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <div className="text-sm font-bold text-white/55">画像診断根拠</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
                    <MiniScoreCard label="明るさ" value={result.imageAnalysis.brightnessScore} />
                    <MiniScoreCard label="構図" value={result.imageAnalysis.compositionScore} />
                    <MiniScoreCard label="背景" value={result.imageAnalysis.backgroundScore} />
                    <MiniScoreCard label="傷リスク" value={result.imageAnalysis.damageRiskScore} />
                    <MiniScoreCard label="画像総合" value={result.imageAnalysis.overallImageScore} />
                  </div>

                  {result.imageAnalysis.imageReasons?.length ? (
                    <div className="mt-3 space-y-1">
                      {result.imageAnalysis.imageReasons.map((x, i) => (
                        <div key={`${x}-${i}`} className="text-sm text-white/70">
                          ・{x}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {result.textAnalysis ? (
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <div className="text-sm font-bold text-white/55">商品情報・説明文根拠</div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-xl bg-white/7 p-3 text-sm">
                      ブランド
                      <div className="mt-1 font-black">
                        {result.textAnalysis.brandName || "—"}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/7 p-3 text-sm">
                      型番・モデル
                      <div className="mt-1 font-black">
                        {result.textAnalysis.modelName || "—"}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/7 p-3 text-sm">
                      素材
                      <div className="mt-1 font-black">
                        {result.textAnalysis.material || "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <MiniScoreCard
                      label="状態リスク"
                      value={result.textAnalysis.conditionRiskScore}
                    />
                    <MiniScoreCard
                      label="説明文品質"
                      value={result.textAnalysis.descriptionQualityScore}
                    />
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

                  {result.textAnalysis.textReasons?.length ? (
                    <div className="mt-3 space-y-1">
                      {result.textAnalysis.textReasons.map((x, i) => (
                        <div key={`${x}-${i}`} className="text-sm text-white/70">
                          ・{x}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <div className="text-sm font-bold text-white/55">改善ポイント</div>
                <div className="mt-3 space-y-2">
                  {result.improvements.map((x, i) => (
                    <div key={`${x}-${i}`} className="rounded-xl bg-white/7 px-3 py-2 text-sm">
                      {x}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <div className="text-sm font-bold text-white/55">理由</div>
                <div className="mt-3 space-y-2">
                  {result.reasons.map((x, i) => (
                    <div key={`${x}-${i}`} className="text-sm text-white/70">
                      ・{x}
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-xs text-white/45">
                学習データ参照数：{result.learnedSampleCount}件
                {sourceMode === "draft" && selectedDraft ? (
                  <>
                    <br />
                    この診断結果は draft の outcome.sellCheck に保存されます。
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
            Firestoreに保存された診断ログの状態です。データが増えるほど価格判断が安定します。
          </div>
        </div>

        {!stats ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
            学習状況を取得できませんでした。
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-white/50">診断ログ</div>
              <div className="mt-1 text-2xl font-black">{stats.total}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-white/50">売却済み</div>
              <div className="mt-1 text-2xl font-black">{stats.sold}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-white/50">未売却/未入力</div>
              <div className="mt-1 text-2xl font-black">{stats.unsold}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-white/50">平均スコア</div>
              <div className="mt-1 text-2xl font-black">{stats.averageScore}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-white/50">画像あり</div>
              <div className="mt-1 text-2xl font-black">{stats.withImage}</div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}