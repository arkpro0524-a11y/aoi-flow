// app/flow/sell-check/admin/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase";

type ImportRow = {
  title: string;
  price: string;
  soldPrice: string;
  category: string;
  condition: string;
  sold: boolean;
  views: string;
  likes: string;
  source: "manual" | "draft" | "import";
  memo: string;

  brandName: string;
  modelName: string;
  material: string;
  extractedKeywords: string;
  conditionRiskScore: string;
  descriptionQualityScore: string;

  brightnessScore: string;
  compositionScore: string;
  backgroundScore: string;
  damageRiskScore: string;
  overallImageScore: string;
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

function createEmptyRow(): ImportRow {
  return {
    title: "",
    price: "",
    soldPrice: "",
    category: "other",
    condition: "good",
    sold: true,
    views: "",
    likes: "",
    source: "import",
    memo: "",

    brandName: "",
    modelName: "",
    material: "",
    extractedKeywords: "",
    conditionRiskScore: "",
    descriptionQualityScore: "",

    brightnessScore: "",
    compositionScore: "",
    backgroundScore: "",
    damageRiskScore: "",
    overallImageScore: "",
  };
}

function isAdminUid(uid: string | null): boolean {
  const raw = process.env.NEXT_PUBLIC_ADMIN_UIDS || "";

  const ids = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (!uid) return false;

  return ids.includes(uid);
}

function normalizeCategoryForUi(value: unknown): string {
  const v = String(value ?? "").trim();
  return CATEGORY_OPTIONS.some((x) => x.value === v) ? v : "other";
}

function normalizeConditionForUi(value: unknown): string {
  const v = String(value ?? "").trim();
  return CONDITION_OPTIONS.some((x) => x.value === v) ? v : "good";
}

function normalizeKeywords(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }

  return String(value ?? "").trim();
}

function normalizeRow(raw: any): ImportRow {
  return {
    title: String(raw?.title ?? "").trim(),
    price: String(raw?.price ?? "").trim(),
    soldPrice: String(raw?.soldPrice ?? raw?.price ?? "").trim(),
    category: normalizeCategoryForUi(raw?.category),
    condition: normalizeConditionForUi(raw?.condition),
    sold:
      raw?.sold === true ||
      raw?.sold === "true" ||
      raw?.sold === "sold" ||
      raw?.sold === "売却済み",
    views: String(raw?.views ?? "").trim(),
    likes: String(raw?.likes ?? "").trim(),
    source: "import",
    memo: String(raw?.memo ?? "").trim(),

    brandName: String(raw?.brandName ?? "").trim(),
    modelName: String(raw?.modelName ?? "").trim(),
    material: String(raw?.material ?? "").trim(),
    extractedKeywords: normalizeKeywords(raw?.extractedKeywords),
    conditionRiskScore: String(raw?.conditionRiskScore ?? "").trim(),
    descriptionQualityScore: String(raw?.descriptionQualityScore ?? "").trim(),

    brightnessScore: String(raw?.brightnessScore ?? "").trim(),
    compositionScore: String(raw?.compositionScore ?? "").trim(),
    backgroundScore: String(raw?.backgroundScore ?? "").trim(),
    damageRiskScore: String(raw?.damageRiskScore ?? "").trim(),
    overallImageScore: String(raw?.overallImageScore ?? "").trim(),
  };
}

function rowForSubmit(row: ImportRow) {
  return {
    ...row,
    extractedKeywords: row.extractedKeywords
      .split(/[,\n、]+/g)
      .map((x) => x.trim())
      .filter(Boolean),
  };
}

export default function SellCheckAdminPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [idToken, setIdToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);

  const [rows, setRows] = useState<ImportRow[]>([createEmptyRow()]);
  const [csvText, setCsvText] = useState("");

  const [rawText, setRawText] = useState("");
  const [extractBusy, setExtractBusy] = useState(false);

  const [richText, setRichText] = useState("");
  const [richImageFile, setRichImageFile] = useState<File | null>(null);
  const [richImagePreviewUrl, setRichImagePreviewUrl] = useState("");
  const [richBusy, setRichBusy] = useState(false);

  const [imageAnalyzeBusyIndex, setImageAnalyzeBusyIndex] = useState<number | null>(
    null
  );
  const [imagePreviewUrls, setImagePreviewUrls] = useState<Record<number, string>>(
    {}
  );
  const [imageFileNames, setImageFileNames] = useState<Record<number, string>>({});

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const isAdmin = useMemo(() => isAdminUid(uid), [uid]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUid(u?.uid ?? null);

      if (u) {
        const token = await u.getIdToken(true).catch(() => "");
        setIdToken(token);
      } else {
        setIdToken("");
      }

      setAuthLoading(false);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    return () => {
      Object.values(imagePreviewUrls).forEach((url) => {
        URL.revokeObjectURL(url);
      });

      if (richImagePreviewUrl) {
        URL.revokeObjectURL(richImagePreviewUrl);
      }
    };
  }, [imagePreviewUrls, richImagePreviewUrl]);

  function updateRow(index: number, patch: Partial<ImportRow>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  function addRow() {
    setRows((prev) => [...prev, createEmptyRow()]);
  }

  function removeRow(index: number) {
    const oldUrl = imagePreviewUrls[index];
    if (oldUrl) URL.revokeObjectURL(oldUrl);

    setImagePreviewUrls((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });

    setImageFileNames((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });

    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [createEmptyRow()];
    });
  }

  function setImagePreview(index: number, file: File) {
    const oldUrl = imagePreviewUrls[index];
    if (oldUrl) URL.revokeObjectURL(oldUrl);

    const nextUrl = URL.createObjectURL(file);

    setImagePreviewUrls((prev) => ({
      ...prev,
      [index]: nextUrl,
    }));

    setImageFileNames((prev) => ({
      ...prev,
      [index]: file.name || "uploaded-image",
    }));
  }

  function setRichImage(file: File | null) {
    if (richImagePreviewUrl) {
      URL.revokeObjectURL(richImagePreviewUrl);
    }

    setRichImageFile(file);

    if (!file) {
      setRichImagePreviewUrl("");
      return;
    }

    setRichImagePreviewUrl(URL.createObjectURL(file));
  }

  function applyCsvText() {
    setError("");
    setMsg("");

    const lines = csvText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setError("CSV形式のテキストを入力してください。");
      return;
    }

    const parsed: ImportRow[] = lines.map((line) => {
      const cols = line.split(",").map((x) => x.trim());

      return normalizeRow({
        title: cols[0] || "",
        price: cols[1] || "",
        soldPrice: cols[2] || cols[1] || "",
        category: cols[3] || "other",
        condition: cols[4] || "good",
        sold: cols[5] || "売却済み",
        views: cols[6] || "",
        likes: cols[7] || "",
        memo: cols[8] || "",
        brandName: cols[9] || "",
        modelName: cols[10] || "",
        material: cols[11] || "",
        extractedKeywords: cols[12] || "",
        conditionRiskScore: cols[13] || "",
        descriptionQualityScore: cols[14] || "",
      });
    });

    setRows(parsed);
    setMsg(`${parsed.length}件を入力欄に反映しました。`);
  }

  async function extractFromRawText() {
    setError("");
    setMsg("");

    if (!idToken) {
      setError("ログイン確認が必要です。");
      return;
    }

    if (!isAdmin) {
      setError("管理者のみ実行できます。");
      return;
    }

    const text = rawText.trim();

    if (!text) {
      setError("商品ページの本文を貼り付けてください。");
      return;
    }

    setExtractBusy(true);

    try {
      const res = await fetch("/api/sell-check/extract", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ text }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "商品ページ本文のデータ化に失敗しました");
      }

      const extractedRows = Array.isArray(data.rows)
        ? data.rows
            .map(normalizeRow)
            .filter((row: ImportRow) => row.title || row.price || row.soldPrice)
        : [];

      if (extractedRows.length === 0) {
        setError("抽出できる学習データが見つかりませんでした。");
        return;
      }

      setRows(extractedRows);
      setMsg(`${extractedRows.length}件をAI抽出して入力欄に反映しました。`);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "商品ページ本文のデータ化に失敗しました";
      setError(message);
    } finally {
      setExtractBusy(false);
    }
  }

  async function extractRichFromTextAndImage() {
    setError("");
    setMsg("");

    if (!idToken) {
      setError("ログイン確認が必要です。");
      return;
    }

    if (!isAdmin) {
      setError("管理者のみ実行できます。");
      return;
    }

    const text = richText.trim();

    if (!text) {
      setError("本文＋画像の統合解析用の商品ページ本文を貼り付けてください。");
      return;
    }

    if (!richImageFile) {
      setError("本文＋画像の統合解析用の商品画像を選択してください。");
      return;
    }

    setRichBusy(true);

    try {
      const form = new FormData();
      form.append("text", text);
      form.append("image", richImageFile);

      const res = await fetch("/api/sell-check/extract-rich", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: form,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "本文＋画像の統合解析に失敗しました");
      }

      const extractedRows = Array.isArray(data.rows)
        ? data.rows
            .map(normalizeRow)
            .filter((row: ImportRow) => row.title || row.price || row.soldPrice)
        : [];

      if (extractedRows.length === 0) {
        setError("統合解析で抽出できる学習データが見つかりませんでした。");
        return;
      }

      setRows(extractedRows);
      setMsg(
        `${extractedRows.length}件を本文＋画像から統合解析して入力欄に反映しました。`
      );
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "本文＋画像の統合解析に失敗しました";
      setError(message);
    } finally {
      setRichBusy(false);
    }
  }

  async function analyzeImageForRow(index: number, file: File | null) {
    setError("");
    setMsg("");

    if (!file) return;

    setImagePreview(index, file);

    if (!idToken) {
      setError("ログイン確認が必要です。");
      return;
    }

    if (!isAdmin) {
      setError("管理者のみ実行できます。");
      return;
    }

    setImageAnalyzeBusyIndex(index);

    try {
      const form = new FormData();
      form.append("image", file);

      const res = await fetch("/api/sell-check/image-analyze", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: form,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "画像診断に失敗しました");
      }

      const analysis = data.imageAnalysis || data.result || {};

      updateRow(index, {
        brightnessScore: String(analysis.brightnessScore ?? ""),
        compositionScore: String(analysis.compositionScore ?? ""),
        backgroundScore: String(analysis.backgroundScore ?? ""),
        damageRiskScore: String(analysis.damageRiskScore ?? ""),
        overallImageScore: String(analysis.overallImageScore ?? ""),
      });

      setMsg("画像診断結果を入力欄に反映しました。");
    } catch (e) {
      const message = e instanceof Error ? e.message : "画像診断に失敗しました";
      setError(message);
    } finally {
      setImageAnalyzeBusyIndex(null);
    }
  }

  async function submitImport() {
    setError("");
    setMsg("");

    if (!idToken) {
      setError("ログイン確認が必要です。");
      return;
    }

    if (!isAdmin) {
      setError("管理者のみ実行できます。");
      return;
    }

    setBusy(true);

    try {
      const res = await fetch("/api/sell-check/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          rows: rows.map(rowForSubmit),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "学習データの保存に失敗しました");
      }

      const skippedText =
        typeof data.skippedCount === "number" && data.skippedCount > 0
          ? `（価格なしで${data.skippedCount}件スキップ）`
          : "";

      setMsg(`${data.savedCount ?? 0}件の学習データを保存しました。${skippedText}`);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "学習データの保存に失敗しました";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-black/30 p-6 text-sm text-white/70">
        認証確認中...
      </div>
    );
  }

  if (!uid) {
    return (
      <div className="rounded-3xl border border-white/10 bg-black/30 p-6 text-sm text-white/70">
        ログインしてください。
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-6 text-sm text-red-100">
        この画面は管理者専用です。
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="border-b border-white/10 pb-4">
        <h1 className="text-2xl font-black tracking-wide">
          売れる診断 学習データ管理
        </h1>
        <p className="mt-2 text-sm text-white/65">
          メルカリ等で収集した売却済みデータを、sellCheckLogs に保存します。
          ここに入れた実績データが、売れる診断の価格判断に使われます。
        </p>
      </div>

      <section className="rounded-3xl border border-white/10 bg-black/30 p-5">
        <div className="mb-3 text-lg font-black">本文＋画像から統合AI抽出</div>
        <div className="mb-3 text-sm text-white/55">
          商品ページ本文と商品画像を同時に解析します。本文と画像の矛盾、傷の説明漏れ、ブランド・素材・状態リスクまでまとめて学習データ化します。
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
          <textarea
            value={richText}
            onChange={(e) => setRichText(e.target.value)}
            className="min-h-[220px] w-full rounded-2xl border border-white/10 bg-black/45 p-4 text-sm text-white outline-none"
            placeholder={`例：
商品名、価格、商品説明、状態、売却済み表示、閲覧数、いいね数などをまとめて貼り付け`}
          />

          <label className="flex min-h-[220px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-white/25 bg-black/35 p-3 text-center text-sm text-white/65 hover:bg-white/10">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={richBusy}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setRichImage(file);
                e.currentTarget.value = "";
              }}
            />

            {richImagePreviewUrl ? (
              <img
                src={richImagePreviewUrl}
                alt="統合解析用の商品画像"
                className="max-h-[220px] w-full rounded-xl object-contain"
              />
            ) : (
              <span>
                商品画像を選択
                <br />
                本文と同時に解析します
              </span>
            )}
          </label>
        </div>

        {richImageFile ? (
          <div className="mt-2 text-xs text-white/50">
            選択中：{richImageFile.name}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={extractRichFromTextAndImage}
            disabled={richBusy}
            className="rounded-full bg-white px-5 py-2 text-sm font-black text-black disabled:opacity-50"
          >
            {richBusy ? "統合解析中..." : "本文＋画像をまとめて学習データ化"}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/30 p-5">
        <div className="mb-3 text-lg font-black">商品ページ本文からAI抽出</div>
        <div className="mb-3 text-sm text-white/55">
          メルカリ等の商品ページ本文・商品説明・価格情報を貼り付けると、学習データ形式に変換します。
        </div>

        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          className="min-h-[180px] w-full rounded-2xl border border-white/10 bg-black/45 p-4 text-sm text-white outline-none"
          placeholder={`例：
商品名、商品説明、価格、売却済み表示、状態、閲覧数、いいね数などをまとめて貼り付け`}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={extractFromRawText}
            disabled={extractBusy}
            className="rounded-full bg-white px-5 py-2 text-sm font-black text-black disabled:opacity-50"
          >
            {extractBusy ? "AI抽出中..." : "AIで学習データ化"}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/30 p-5">
        <div className="mb-3 text-lg font-black">CSV貼り付け</div>
        <div className="mb-3 text-sm text-white/55">
          形式：商品名,出品価格,売却価格,カテゴリ,状態,売却済み,閲覧数,いいね,メモ,ブランド,型番,素材,キーワード,状態リスク,説明文品質
        </div>

        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          className="min-h-[140px] w-full rounded-2xl border border-white/10 bg-black/45 p-4 text-sm text-white outline-none"
          placeholder={`例：
レザーショルダーバッグ,9800,8500,fashion,good,売却済み,320,18,TOD'S系,TOD'S,Dバッグ,レザー,バッグ 革 ブラウン,25,85`}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={applyCsvText}
            className="rounded-full bg-white px-5 py-2 text-sm font-black text-black"
          >
            CSVを入力欄へ反映
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/30 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-black">学習データ入力</div>
            <div className="mt-1 text-sm text-white/55">
              売れた商品の実績を入れるほど、価格帯の判断が安定します。
            </div>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="rounded-full border border-white/15 bg-white/10 px-5 py-2 text-sm font-black text-white"
          >
            行を追加
          </button>
        </div>

        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={index}
              className="rounded-2xl border border-white/10 bg-black/30 p-4"
            >
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                <label className="text-xs font-bold text-white/70">
                  商品名
                  <input
                    value={row.title}
                    onChange={(e) => updateRow(index, { title: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-xs font-bold text-white/70">
                  出品価格
                  <input
                    value={row.price}
                    onChange={(e) => updateRow(index, { price: e.target.value })}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-xs font-bold text-white/70">
                  売却価格
                  <input
                    value={row.soldPrice}
                    onChange={(e) =>
                      updateRow(index, { soldPrice: e.target.value })
                    }
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-xs font-bold text-white/70">
                  売却状態
                  <select
                    value={row.sold ? "sold" : "unsold"}
                    onChange={(e) =>
                      updateRow(index, { sold: e.target.value === "sold" })
                    }
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                  >
                    <option value="sold">売却済み</option>
                    <option value="unsold">未売却</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
                <label className="text-xs font-bold text-white/70">
                  カテゴリ
                  <select
                    value={row.category}
                    onChange={(e) =>
                      updateRow(index, { category: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                  >
                    {CATEGORY_OPTIONS.map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-white/70">
                  状態
                  <select
                    value={row.condition}
                    onChange={(e) =>
                      updateRow(index, { condition: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                  >
                    {CONDITION_OPTIONS.map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-white/70">
                  閲覧数
                  <input
                    value={row.views}
                    onChange={(e) => updateRow(index, { views: e.target.value })}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-xs font-bold text-white/70">
                  いいね
                  <input
                    value={row.likes}
                    onChange={(e) => updateRow(index, { likes: e.target.value })}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                  />
                </label>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                <label className="text-xs font-bold text-white/70">
                  ブランド
                  <input
                    value={row.brandName}
                    onChange={(e) =>
                      updateRow(index, { brandName: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-xs font-bold text-white/70">
                  型番・モデル
                  <input
                    value={row.modelName}
                    onChange={(e) =>
                      updateRow(index, { modelName: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-xs font-bold text-white/70">
                  素材
                  <input
                    value={row.material}
                    onChange={(e) =>
                      updateRow(index, { material: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                  />
                </label>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                <label className="text-xs font-bold text-white/70">
                  キーワード
                  <input
                    value={row.extractedKeywords}
                    onChange={(e) =>
                      updateRow(index, { extractedKeywords: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                    placeholder="例：バッグ, レザー, ブラウン"
                  />
                </label>

                <label className="text-xs font-bold text-white/70">
                  状態リスク 0〜100
                  <input
                    value={row.conditionRiskScore}
                    onChange={(e) =>
                      updateRow(index, { conditionRiskScore: e.target.value })
                    }
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-xs font-bold text-white/70">
                  説明文品質 0〜100
                  <input
                    value={row.descriptionQualityScore}
                    onChange={(e) =>
                      updateRow(index, {
                        descriptionQualityScore: e.target.value,
                      })
                    }
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                  />
                </label>
              </div>

              <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 text-sm font-black text-white/80">
                  画像診断
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
                  <label className="flex min-h-[180px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-white/25 bg-black/35 p-3 text-center text-sm text-white/65 hover:bg-white/10">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={imageAnalyzeBusyIndex !== null}
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        void analyzeImageForRow(index, file);
                        e.currentTarget.value = "";
                      }}
                    />

                    {imagePreviewUrls[index] ? (
                      <img
                        src={imagePreviewUrls[index]}
                        alt="学習データ用の商品画像"
                        className="max-h-[180px] w-full rounded-xl object-contain"
                      />
                    ) : (
                      <span>
                        画像を選択
                        <br />
                        ここにプレビュー表示
                      </span>
                    )}
                  </label>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer rounded-full bg-white px-4 py-2 text-xs font-black text-black">
                        {imageAnalyzeBusyIndex === index
                          ? "画像診断中..."
                          : "画像を選んで診断"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={imageAnalyzeBusyIndex !== null}
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            void analyzeImageForRow(index, file);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>

                      {imageFileNames[index] ? (
                        <div className="text-xs text-white/55">
                          選択中：{imageFileNames[index]}
                        </div>
                      ) : (
                        <div className="text-xs text-white/45">
                          商品画像を選ぶと、AIが明るさ・構図・背景・傷リスクを数値化します。
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                      <label className="text-xs font-bold text-white/70">
                        明るさ
                        <input
                          value={row.brightnessScore}
                          onChange={(e) =>
                            updateRow(index, { brightnessScore: e.target.value })
                          }
                          inputMode="numeric"
                          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                        />
                      </label>

                      <label className="text-xs font-bold text-white/70">
                        構図
                        <input
                          value={row.compositionScore}
                          onChange={(e) =>
                            updateRow(index, { compositionScore: e.target.value })
                          }
                          inputMode="numeric"
                          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                        />
                      </label>

                      <label className="text-xs font-bold text-white/70">
                        背景
                        <input
                          value={row.backgroundScore}
                          onChange={(e) =>
                            updateRow(index, { backgroundScore: e.target.value })
                          }
                          inputMode="numeric"
                          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                        />
                      </label>

                      <label className="text-xs font-bold text-white/70">
                        傷リスク
                        <input
                          value={row.damageRiskScore}
                          onChange={(e) =>
                            updateRow(index, { damageRiskScore: e.target.value })
                          }
                          inputMode="numeric"
                          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                        />
                      </label>

                      <label className="text-xs font-bold text-white/70">
                        画像総合
                        <input
                          value={row.overallImageScore}
                          onChange={(e) =>
                            updateRow(index, { overallImageScore: e.target.value })
                          }
                          inputMode="numeric"
                          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
                <label className="text-xs font-bold text-white/70">
                  メモ
                  <input
                    value={row.memo}
                    onChange={(e) => updateRow(index, { memo: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="self-end rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-xs font-black text-red-100"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {msg ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/75">
            {msg}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={submitImport}
            disabled={busy}
            className="rounded-2xl bg-white px-6 py-3 text-sm font-black text-black disabled:opacity-50"
          >
            {busy ? "保存中..." : "学習データとして保存"}
          </button>
        </div>
      </section>
    </div>
  );
}