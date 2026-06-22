//app/flow/sell-check/admin/page.tsx
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

  productType: string;
  characterName: string;
  seriesName: string;
  maker: string;
  era: string;
  collectorGenre: string;
  materialType: string;

  extractedKeywords: string;
  conditionRiskScore: string;
  descriptionQualityScore: string;

  rarityScore: string;
  demandScore: string;
  brandPowerScore: string;
  collectorScore: string;
  ageValueScore: string;
  trendScore: string;
  marketSupplyScore: string;
  keywordStrength: string;

  brightnessScore: string;
  compositionScore: string;
  backgroundScore: string;
  damageRiskScore: string;
  overallImageScore: string;
};

type SavedLog = ImportRow & {
  id: string;
  score?: number;
  rank?: string;
  hasImage: boolean;
  imageUrl: string;
  imageFileName: string;
  createdAt: number;
  updatedAt: number;
};

type DuplicateGroup = {
  key: string;
  keep: SavedLog;
  remove: SavedLog[];
  all: SavedLog[];
};


type DeepBulkProductBox = {
  id: string;
  text: string;
  files: File[];
  previewUrls: string[];
};

type LearningMode = "single" | "market" | "deep";

function createDeepBulkProductBox(index: number): DeepBulkProductBox {
  return {
    id: `deep-product-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    text: "",
    files: [],
    previewUrls: [],
  };
}

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


const MARKET_BULK_MAX_IMAGES = 20;
const DEEP_BULK_MAX_PRODUCT_BOXES = 60;
const IMAGE_UPLOAD_HARD_LIMIT_BYTES = 10 * 1024 * 1024;
const IMAGE_UPLOAD_SOFT_LIMIT_BYTES = 9 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0MB";
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function getFilesTotalSize(files: File[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

function getUploadRemainingBytes(totalSize: number): number {
  return Math.max(0, IMAGE_UPLOAD_HARD_LIMIT_BYTES - totalSize);
}

function getUploadPercent(totalSize: number): number {
  if (!Number.isFinite(totalSize) || totalSize <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((totalSize / IMAGE_UPLOAD_HARD_LIMIT_BYTES) * 100)));
}

function getDeepGroupSize(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function getDeepProductCount(fileCount: number, groupSize: number): number {
  if (fileCount <= 0) return 0;
  return Math.ceil(fileCount / Math.max(1, groupSize));
}

function getDeepRemainderCount(fileCount: number, groupSize: number): number {
  if (fileCount <= 0) return 0;
  return fileCount % Math.max(1, groupSize);
}

async function compressImageFile(file: File, maxWidth = 1400, quality = 0.72) {
  if (!file.type.startsWith("image/")) return file;

  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageUrl;
    });

    const scale = Math.min(1, maxWidth / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob) return file;
    if (blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "screenshot";
    return new File([blob], `${baseName}-compressed.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function compressImageFiles(files: File[], maxWidth = 1400, quality = 0.72) {
  const compressed: File[] = [];

  for (const file of files) {
    compressed.push(await compressImageFile(file, maxWidth, quality));
  }

  return compressed;
}

const EXPORT_HEADERS = [
  "商品名",
  "出品価格",
  "売却価格",
  "カテゴリ",
  "状態",
  "売却済み",
  "閲覧数",
  "いいね",
  "メモ",
  "ブランド",
  "型番",
  "素材",
  "商品種別",
  "作品名・キャラクター",
  "シリーズ",
  "メーカー",
  "年代",
  "コレクター分類",
  "素材分類",
  "キーワード",
  "状態リスク",
  "説明文品質",
  "希少性",
  "需要",
  "ブランド力",
  "コレクター価値",
  "年代価値",
  "現在人気度",
  "出品数の少なさ",
  "検索キーワード強度",
  "明るさ",
  "構図",
  "背景",
  "傷リスク",
  "画像総合",
  "診断スコア",
  "ランク",
  "画像あり",
  "画像ファイル名",
  "作成日時",
  "更新日時",
  "ID",
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

    productType: "",
    characterName: "",
    seriesName: "",
    maker: "",
    era: "",
    collectorGenre: "",
    materialType: "",

    extractedKeywords: "",
    conditionRiskScore: "",
    descriptionQualityScore: "",

    rarityScore: "",
    demandScore: "",
    brandPowerScore: "",
    collectorScore: "",
    ageValueScore: "",
    trendScore: "",
    marketSupplyScore: "",
    keywordStrength: "",

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

    productType: String(raw?.productType ?? "").trim(),
    characterName: String(raw?.characterName ?? "").trim(),
    seriesName: String(raw?.seriesName ?? "").trim(),
    maker: String(raw?.maker ?? "").trim(),
    era: String(raw?.era ?? "").trim(),
    collectorGenre: String(raw?.collectorGenre ?? "").trim(),
    materialType: String(raw?.materialType ?? "").trim(),

    extractedKeywords: normalizeKeywords(raw?.extractedKeywords),
    conditionRiskScore: String(raw?.conditionRiskScore ?? "").trim(),
    descriptionQualityScore: String(raw?.descriptionQualityScore ?? "").trim(),

    rarityScore: String(raw?.rarityScore ?? "").trim(),
    demandScore: String(raw?.demandScore ?? "").trim(),
    brandPowerScore: String(raw?.brandPowerScore ?? "").trim(),
    collectorScore: String(raw?.collectorScore ?? "").trim(),
    ageValueScore: String(raw?.ageValueScore ?? "").trim(),
    trendScore: String(raw?.trendScore ?? "").trim(),
    marketSupplyScore: String(raw?.marketSupplyScore ?? "").trim(),
    keywordStrength: String(raw?.keywordStrength ?? "").trim(),

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

function formatDate(ms: number) {
  if (!ms) return "—";

  return new Date(ms).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortText(value: unknown, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeDuplicateText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xfee0),
    )
    .replace(/\s+/g, "")
    .replace(/[・,，、。.\-ー_＿/／\\]/g, "");
}

function normalizeDuplicateNumber(value: unknown): string {
  return String(value ?? "").replace(/[^\d]/g, "");
}

function buildDuplicateKey(log: SavedLog): string {
  const title = normalizeDuplicateText(log.title);
  const brandName = normalizeDuplicateText(log.brandName);
  const modelName = normalizeDuplicateText(log.modelName);
  const category = normalizeDuplicateText(log.category);
  const condition = normalizeDuplicateText(log.condition);
  const soldPrice = normalizeDuplicateNumber(log.soldPrice);
  const price = normalizeDuplicateNumber(log.price);
  const effectivePrice = soldPrice || price;

  if (!title || !effectivePrice) {
    return "";
  }

  return [
    title,
    effectivePrice,
    category,
    condition,
    brandName,
    modelName,
  ].join("|");
}

function getDuplicateGroups(logs: SavedLog[]): DuplicateGroup[] {
  const map = new Map<string, SavedLog[]>();

  logs.forEach((log) => {
    const key = buildDuplicateKey(log);
    if (!key) return;

    const current = map.get(key) || [];
    current.push(log);
    map.set(key, current);
  });

  const groups: DuplicateGroup[] = [];

  map.forEach((items, key) => {
    if (items.length <= 1) return;

    const sorted = [...items].sort((a, b) => {
      const bTime = b.createdAt || b.updatedAt || 0;
      const aTime = a.createdAt || a.updatedAt || 0;
      return bTime - aTime;
    });

    groups.push({
      key,
      keep: sorted[0],
      remove: sorted.slice(1),
      all: sorted,
    });
  });

  return groups;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "")
    .replace(/\r?\n/g, " ")
    .trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function htmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getExportRows(logs: SavedLog[]) {
  return logs.map((log) => [
    log.title,
    log.price,
    log.soldPrice,
    log.category,
    log.condition,
    log.sold ? "売却済み" : "未売却",
    log.views,
    log.likes,
    log.memo,
    log.brandName,
    log.modelName,
    log.material,
    log.productType,
    log.characterName,
    log.seriesName,
    log.maker,
    log.era,
    log.collectorGenre,
    log.materialType,
    log.extractedKeywords,
    log.conditionRiskScore,
    log.descriptionQualityScore,
    log.rarityScore,
    log.demandScore,
    log.brandPowerScore,
    log.collectorScore,
    log.ageValueScore,
    log.trendScore,
    log.marketSupplyScore,
    log.keywordStrength,
    log.brightnessScore,
    log.compositionScore,
    log.backgroundScore,
    log.damageRiskScore,
    log.overallImageScore,
    log.score ?? "",
    log.rank ?? "",
    log.hasImage ? "あり" : "なし",
    log.imageFileName,
    formatDate(log.createdAt),
    formatDate(log.updatedAt),
    log.id,
  ]);
}

function downloadFile(args: {
  fileName: string;
  mimeType: string;
  content: string;
}) {
  const blob = new Blob([args.content], { type: args.mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = args.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function buildExportFileName(ext: "csv" | "xls") {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");

  return `sell-check-logs-${y}${m}${d}-${hh}${mm}.${ext}`;
}

export default function SellCheckAdminPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [idToken, setIdToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);

  const [rows, setRows] = useState<ImportRow[]>([createEmptyRow()]);
  const [csvText, setCsvText] = useState("");
  const [learningMode, setLearningMode] = useState<LearningMode>("deep");

  const [rawText, setRawText] = useState("");
  const [extractBusy, setExtractBusy] = useState(false);

  const [richText, setRichText] = useState("");
  const [richImageFiles, setRichImageFiles] = useState<File[]>([]);
  const [richImagePreviewUrls, setRichImagePreviewUrls] = useState<string[]>(
    [],
  );
  const [richBusy, setRichBusy] = useState(false);

  const [marketBulkText, setMarketBulkText] = useState("");
  const [marketBulkImageFiles, setMarketBulkImageFiles] = useState<File[]>([]);
  const [marketBulkImagePreviewUrls, setMarketBulkImagePreviewUrls] = useState<
    string[]
  >([]);
  const [marketBulkBusy, setMarketBulkBusy] = useState(false);

  const [deepBulkText, setDeepBulkText] = useState("");
  const [deepBulkImageFiles, setDeepBulkImageFiles] = useState<File[]>([]);
  const [deepBulkImagePreviewUrls, setDeepBulkImagePreviewUrls] = useState<
    string[]
  >([]);
  const [deepBulkGroupSize, setDeepBulkGroupSize] = useState("1");
  const [deepBulkProductTexts, setDeepBulkProductTexts] = useState<string[]>([]);
  const [deepBulkProductBoxes, setDeepBulkProductBoxes] = useState<
    DeepBulkProductBox[]
  >([createDeepBulkProductBox(1)]);
  const [deepBulkBusy, setDeepBulkBusy] = useState(false);

  const [fileImportBusy, setFileImportBusy] = useState(false);
  const [fileImportName, setFileImportName] = useState("");

  const [imageAnalyzeBusyIndex, setImageAnalyzeBusyIndex] = useState<
    number | null
  >(null);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<
    Record<number, string[]>
  >({});
  const [imageFileNames, setImageFileNames] = useState<Record<number, string>>(
    {},
  );

  const [logs, setLogs] = useState<SavedLog[]>([]);
  const [logsBusy, setLogsBusy] = useState(false);
  const [dedupeBusy, setDedupeBusy] = useState(false);
  const [editingLogId, setEditingLogId] = useState("");
  const [editingLog, setEditingLog] = useState<ImportRow | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const isAdmin = useMemo(() => isAdminUid(uid), [uid]);

  const duplicateGroups = useMemo(() => getDuplicateGroups(logs), [logs]);

  const duplicateRemoveCount = useMemo(() => {
    return duplicateGroups.reduce((sum, group) => sum + group.remove.length, 0);
  }, [duplicateGroups]);

  const duplicateIdSet = useMemo(() => {
    const set = new Set<string>();

    duplicateGroups.forEach((group) => {
      group.remove.forEach((log) => set.add(log.id));
    });

    return set;
  }, [duplicateGroups]);


  const marketBulkTotalSize = useMemo(
    () => getFilesTotalSize(marketBulkImageFiles),
    [marketBulkImageFiles],
  );

  const deepBulkTotalSize = useMemo(
    () => getFilesTotalSize(deepBulkImageFiles),
    [deepBulkImageFiles],
  );

  const deepBulkGroupSizeNumber = useMemo(
    () => getDeepGroupSize(deepBulkGroupSize),
    [deepBulkGroupSize],
  );

  const deepBulkProductCount = useMemo(
    () => deepBulkProductBoxes.filter((box) => box.files.length > 0 || box.text.trim()).length,
    [deepBulkProductBoxes],
  );

  const deepBulkCanAddProductBox = useMemo(
    () => deepBulkProductBoxes.length < DEEP_BULK_MAX_PRODUCT_BOXES && deepBulkTotalSize < IMAGE_UPLOAD_SOFT_LIMIT_BYTES,
    [deepBulkProductBoxes.length, deepBulkTotalSize],
  );

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
      Object.values(imagePreviewUrls).forEach((urls) => {
        urls.forEach((url) => URL.revokeObjectURL(url));
      });

      richImagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
      marketBulkImagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
      deepBulkImagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [
    imagePreviewUrls,
    richImagePreviewUrls,
    marketBulkImagePreviewUrls,
    deepBulkImagePreviewUrls,
  ]);

  useEffect(() => {
    if (!idToken || !isAdmin) return;

    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idToken, isAdmin]);


  useEffect(() => {
    setDeepBulkProductTexts(deepBulkProductBoxes.map((box) => box.text));
  }, [deepBulkProductBoxes]);

  function updateRow(index: number, patch: Partial<ImportRow>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, createEmptyRow()]);
  }

  function removeRow(index: number) {
    const oldUrls = imagePreviewUrls[index] || [];
    oldUrls.forEach((url) => URL.revokeObjectURL(url));

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

  function setRowImagePreviews(index: number, files: File[]) {
    const oldUrls = imagePreviewUrls[index] || [];
    oldUrls.forEach((url) => URL.revokeObjectURL(url));

    const nextUrls = files.map((file) => URL.createObjectURL(file));

    setImagePreviewUrls((prev) => ({
      ...prev,
      [index]: nextUrls,
    }));

    setImageFileNames((prev) => ({
      ...prev,
      [index]: files.map((file) => file.name || "uploaded-image").join(", "),
    }));
  }

  function setRichImages(files: File[]) {
    richImagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));

    setRichImageFiles(files);
    setRichImagePreviewUrls(files.map((file) => URL.createObjectURL(file)));
  }

  async function setMarketBulkImages(files: File[]) {
    marketBulkImagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));

    const selected = files.slice(0, MARKET_BULK_MAX_IMAGES);
    const compressed = await compressImageFiles(selected, 1200, 0.68);

    setMarketBulkImageFiles(compressed);
    setMarketBulkImagePreviewUrls(
      compressed.map((file) => URL.createObjectURL(file)),
    );

    const totalSize = getFilesTotalSize(compressed);
    if (totalSize > IMAGE_UPLOAD_SOFT_LIMIT_BYTES) {
      setError(
        `画像容量が${formatBytes(
          totalSize,
        )}あります。Next.jsの10MB上限に近いため、枚数を減らしてください。`,
      );
    } else {
      setMsg(
        `${compressed.length}枚を送信用に圧縮しました。合計容量：${formatBytes(
          totalSize,
        )}`,
      );
    }
  }

  function syncDeepBulkProductBoxes(nextBoxes: DeepBulkProductBox[]) {
    const normalizedBoxes = nextBoxes.length > 0 ? nextBoxes : [createDeepBulkProductBox(1)];
    const flatFiles = normalizedBoxes.flatMap((box) => box.files);
    const flatPreviews = normalizedBoxes.flatMap((box) => box.previewUrls);

    setDeepBulkProductBoxes(normalizedBoxes);
    setDeepBulkImageFiles(flatFiles);
    setDeepBulkImagePreviewUrls(flatPreviews);
    setDeepBulkProductTexts(normalizedBoxes.map((box) => box.text));
  }

  function addDeepBulkProductBox() {
    if (!deepBulkCanAddProductBox) {
      setError("10MB上限に近いため、新しい商品枠を追加できません。画像を減らしてください。");
      return;
    }

    const next = [
      ...deepBulkProductBoxes,
      createDeepBulkProductBox(deepBulkProductBoxes.length + 1),
    ];
    syncDeepBulkProductBoxes(next);
  }

  function removeDeepBulkProductBox(boxId: string) {
    const target = deepBulkProductBoxes.find((box) => box.id === boxId);
    target?.previewUrls.forEach((url) => URL.revokeObjectURL(url));
    const next = deepBulkProductBoxes.filter((box) => box.id !== boxId);
    syncDeepBulkProductBoxes(next.length > 0 ? next : [createDeepBulkProductBox(1)]);
  }

  function updateDeepBulkProductText(boxId: string, text: string) {
    const next = deepBulkProductBoxes.map((box) =>
      box.id === boxId ? { ...box, text } : box,
    );
    syncDeepBulkProductBoxes(next);
  }

  async function setDeepBulkBoxImages(boxId: string, files: File[]) {
    const targetIndex = deepBulkProductBoxes.findIndex((box) => box.id === boxId);
    const currentOtherFiles = deepBulkProductBoxes
      .filter((box) => box.id !== boxId)
      .flatMap((box) => box.files);

    const selected = files.slice(0, deepBulkGroupSizeNumber);
    const compressedOriginal = await compressImageFiles(selected, 1400, 0.72);

    const accepted: File[] = [];
    for (const file of compressedOriginal) {
      const nextTotal = getFilesTotalSize([...currentOtherFiles, ...accepted, file]);
      if (nextTotal <= IMAGE_UPLOAD_HARD_LIMIT_BYTES) {
        accepted.push(file);
      }
    }

    const shouldAutoAppend =
      targetIndex === deepBulkProductBoxes.length - 1 &&
      accepted.length >= deepBulkGroupSizeNumber &&
      deepBulkProductBoxes.length < DEEP_BULK_MAX_PRODUCT_BOXES &&
      getFilesTotalSize([...currentOtherFiles, ...accepted]) < IMAGE_UPLOAD_SOFT_LIMIT_BYTES;

    const next = deepBulkProductBoxes.map((box) => {
      if (box.id !== boxId) return box;
      box.previewUrls.forEach((url) => URL.revokeObjectURL(url));
      return {
        ...box,
        files: accepted,
        previewUrls: accepted.map((file) => URL.createObjectURL(file)),
      };
    });

    const normalizedNext = shouldAutoAppend
      ? [...next, createDeepBulkProductBox(next.length + 1)]
      : next;

    syncDeepBulkProductBoxes(normalizedNext);

    const nextTotalSize = getFilesTotalSize([...currentOtherFiles, ...accepted]);
    if (compressedOriginal.length > accepted.length) {
      setError(
        `10MB上限を超えるため、${accepted.length}枚だけ取り込みました。残り容量：${formatBytes(
          getUploadRemainingBytes(nextTotalSize),
        )}`,
      );
    } else if (files.length > deepBulkGroupSizeNumber) {
      setError(
        `この商品枠は現在${deepBulkGroupSizeNumber}枚/商品設定です。${deepBulkGroupSizeNumber}枚だけ取り込みました。`,
      );
    } else {
      setMsg(
        `${accepted.length}枚を商品枠に追加しました。合計容量：${formatBytes(
          nextTotalSize,
        )}${shouldAutoAppend ? "。次の商品枠を自動追加しました。" : ""}`,
      );
    }
  }

  function clearDeepBulkProductBoxes() {
    deepBulkProductBoxes.forEach((box) => {
      box.previewUrls.forEach((url) => URL.revokeObjectURL(url));
    });
    syncDeepBulkProductBoxes([createDeepBulkProductBox(1)]);
  }

  function exportLogsAsCsv() {
    setError("");
    setMsg("");

    if (logs.length === 0) {
      setError("出力できる保存済み学習データがありません。");
      return;
    }

    const rowsForExport = getExportRows(logs);
    const csv = [
      EXPORT_HEADERS.map(csvEscape).join(","),
      ...rowsForExport.map((row) => row.map(csvEscape).join(",")),
    ].join("\n");

    downloadFile({
      fileName: buildExportFileName("csv"),
      mimeType: "text/csv;charset=utf-8",
      content: `\uFEFF${csv}`,
    });

    setMsg(`保存済み学習データ ${logs.length}件をCSV出力しました。`);
  }

  function exportLogsAsExcel() {
    setError("");
    setMsg("");

    if (logs.length === 0) {
      setError("出力できる保存済み学習データがありません。");
      return;
    }

    const rowsForExport = getExportRows(logs);

    const tableRows = [
      `<tr>${EXPORT_HEADERS.map((h) => `<th>${htmlEscape(h)}</th>`).join("")}</tr>`,
      ...rowsForExport.map((row) => {
        return `<tr>${row.map((cell) => `<td>${htmlEscape(cell)}</td>`).join("")}</tr>`;
      }),
    ].join("");

    const html = `
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      table {
        border-collapse: collapse;
        font-family: Arial, sans-serif;
        font-size: 12px;
      }
      th {
        background: #e7ecf1;
        font-weight: bold;
      }
      th, td {
        border: 1px solid #999;
        padding: 6px;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    <table>${tableRows}</table>
  </body>
</html>
`.trim();

    downloadFile({
      fileName: buildExportFileName("xls"),
      mimeType: "application/vnd.ms-excel;charset=utf-8",
      content: html,
    });

    setMsg(`保存済み学習データ ${logs.length}件をExcel出力しました。`);
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

      const hasNewAttributeColumns = cols.length >= 30;

      if (hasNewAttributeColumns) {
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
          productType: cols[12] || "",
          characterName: cols[13] || "",
          seriesName: cols[14] || "",
          maker: cols[15] || "",
          era: cols[16] || "",
          collectorGenre: cols[17] || "",
          materialType: cols[18] || "",
          extractedKeywords: cols[19] || "",
          conditionRiskScore: cols[20] || "",
          descriptionQualityScore: cols[21] || "",
          rarityScore: cols[22] || "",
          demandScore: cols[23] || "",
          brandPowerScore: cols[24] || "",
          collectorScore: cols[25] || "",
          ageValueScore: cols[26] || "",
          trendScore: cols[27] || "",
          marketSupplyScore: cols[28] || "",
          keywordStrength: cols[29] || "",
        });
      }

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
        rarityScore: cols[15] || "",
        demandScore: cols[16] || "",
        brandPowerScore: cols[17] || "",
        collectorScore: cols[18] || "",
        ageValueScore: cols[19] || "",
        trendScore: cols[20] || "",
        marketSupplyScore: cols[21] || "",
        keywordStrength: cols[22] || "",
      });
    });

    setRows(parsed);
    setMsg(`${parsed.length}件を入力欄に反映しました。`);
  }

  async function importFromFile(file: File | null) {
    setError("");
    setMsg("");

    if (!file) return;

    if (!idToken) {
      setError("ログイン確認が必要です。");
      return;
    }

    if (!isAdmin) {
      setError("管理者のみ実行できます。");
      return;
    }

    setFileImportName(file.name || "");
    setFileImportBusy(true);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/sell-check/import-file", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: form,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "ファイル読込に失敗しました");
      }

      const importedRows = Array.isArray(data.rows)
        ? data.rows.map(normalizeRow)
        : [];

      if (importedRows.length === 0) {
        setError("ファイルから学習データを読み取れませんでした。");
        return;
      }

      setRows(importedRows);
      setMsg(`${importedRows.length}件をファイルから入力欄に反映しました。`);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "ファイル読込に失敗しました";
      setError(message);
    } finally {
      setFileImportBusy(false);
    }
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
        throw new Error(
          data?.error || "商品ページ本文のデータ化に失敗しました",
        );
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
        e instanceof Error
          ? e.message
          : "商品ページ本文のデータ化に失敗しました";
      setError(message);
    } finally {
      setExtractBusy(false);
    }
  }

  async function extractRichFromTextAndImages() {
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

    if (!text && richImageFiles.length === 0) {
      setError(
        "本文または画像を1つ以上入力してください。本文だけ・画像だけでも学習データ化できます。",
      );
      return;
    }

    setRichBusy(true);

    try {
      const form = new FormData();
      form.append("text", text);

      richImageFiles.forEach((file) => {
        form.append("images", file);
      });

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
        `${extractedRows.length}件を本文＋複数画像から統合解析して入力欄に反映しました。`,
      );
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "本文＋画像の統合解析に失敗しました";
      setError(message);
    } finally {
      setRichBusy(false);
    }
  }

  async function extractMarketBulkFromScreenshots() {
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

    const text = marketBulkText.trim();

    if (!text && marketBulkImageFiles.length === 0) {
      setError(
        "市場スクショまたは補足テキストを1つ以上入力してください。複数商品が並んだ一覧スクショを想定しています。",
      );
      return;
    }

    setMarketBulkBusy(true);

    try {
      const form = new FormData();
      form.append("text", text);

      marketBulkImageFiles.forEach((file) => {
        form.append("images", file);
      });

      const res = await fetch("/api/sell-check/extract-market-bulk", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: form,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "市場スクショ一括解析に失敗しました");
      }

      const extractedRows = Array.isArray(data.rows)
        ? data.rows
            .map(normalizeRow)
            .filter((row: ImportRow) => row.title || row.price || row.soldPrice)
        : [];

      if (extractedRows.length === 0) {
        setError(
          "市場スクショから抽出できる商品データが見つかりませんでした。",
        );
        return;
      }

      setRows(extractedRows);
      setMsg(
        `${extractedRows.length}件を市場スクショから抽出して入力欄に反映しました。保存前に必ず商品名・価格・売却状態を確認してください。`,
      );
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "市場スクショ一括解析に失敗しました";
      setError(message);
    } finally {
      setMarketBulkBusy(false);
    }
  }


  async function extractDeepBulkFromScreenshots() {
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

    const text = deepBulkText.trim();

    if (!text && deepBulkImageFiles.length === 0) {
      setError(
        "SELL CHECK深掘り用のスクショまたは補足テキストを1つ以上入力してください。1商品につき複数画像をまとめる用途です。",
      );
      return;
    }

    const totalSize = getFilesTotalSize(deepBulkImageFiles);
    if (totalSize > IMAGE_UPLOAD_SOFT_LIMIT_BYTES) {
      setError(
        `画像容量が${formatBytes(
          totalSize,
        )}あります。Next.jsの10MB上限を超える可能性があるため、枚数を減らしてください。`,
      );
      return;
    }

    setDeepBulkBusy(true);

    try {
      const form = new FormData();
      form.append("text", text);
      form.append("groupSize", deepBulkGroupSize);
      form.append("productTexts", JSON.stringify(deepBulkProductTexts));
      form.append(
        "productGroups",
        JSON.stringify(
          deepBulkProductBoxes
            .filter((box) => box.files.length > 0 || box.text.trim())
            .map((box) => ({ imageCount: box.files.length })),
        ),
      );

      deepBulkImageFiles.forEach((file) => {
        form.append("images", file);
      });

      const res = await fetch("/api/sell-check/extract-deep-bulk", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: form,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "SELL CHECK深掘り一括解析に失敗しました");
      }

      const extractedRows = Array.isArray(data.rows)
        ? data.rows
            .map(normalizeRow)
            .filter((row: ImportRow) => row.title || row.price || row.soldPrice || row.memo)
        : [];

      if (extractedRows.length === 0) {
        setError("SELL CHECK深掘り学習で抽出できる商品データが見つかりませんでした。");
        return;
      }

      setRows(extractedRows);
      setMsg(
        `${extractedRows.length}件をSELL CHECK深掘り学習として入力欄に反映しました。保存前にスコア・根拠・価格を確認してください。`,
      );
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "SELL CHECK深掘り一括解析に失敗しました";
      setError(message);
    } finally {
      setDeepBulkBusy(false);
    }
  }

  async function analyzeImagesForRow(index: number, files: File[]) {
    setError("");
    setMsg("");

    if (files.length === 0) return;

    setRowImagePreviews(index, files);

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

      files.forEach((file) => {
        form.append("images", file);
      });

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

      const analysis = data.result || {};

      updateRow(index, {
        brightnessScore: String(analysis.brightnessScore ?? ""),
        compositionScore: String(analysis.compositionScore ?? ""),
        backgroundScore: String(analysis.backgroundScore ?? ""),
        damageRiskScore: String(analysis.damageRiskScore ?? ""),
        overallImageScore: String(analysis.overallImageScore ?? ""),
      });

      setMsg(`${files.length}枚の画像診断結果を入力欄に反映しました。`);
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

      setMsg(
        `${data.savedCount ?? 0}件の学習データを保存しました。${skippedText}`,
      );
      await loadLogs();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "学習データの保存に失敗しました";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function loadLogs() {
    if (!idToken) return;

    setLogsBusy(true);

    try {
      const res = await fetch("/api/sell-check/logs?limit=200", {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "学習データ一覧の取得に失敗しました");
      }

      const nextLogs: SavedLog[] = Array.isArray(data.logs)
        ? data.logs.map((log: any) => ({
            id: String(log.id ?? ""),
            ...normalizeRow(log),
            score: typeof log.score === "number" ? log.score : undefined,
            rank: String(log.rank ?? ""),
            hasImage: log.hasImage === true,
            imageUrl: String(log.imageUrl ?? ""),
            imageFileName: String(log.imageFileName ?? ""),
            createdAt: Number(log.createdAt ?? 0),
            updatedAt: Number(log.updatedAt ?? 0),
          }))
        : [];

      setLogs(nextLogs);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "学習データ一覧の取得に失敗しました";
      setError(message);
    } finally {
      setLogsBusy(false);
    }
  }

  function startEditLog(log: SavedLog) {
    setEditingLogId(log.id);
    setEditingLog(normalizeRow(log));
  }

  function cancelEditLog() {
    setEditingLogId("");
    setEditingLog(null);
  }

  async function saveEditingLog() {
    setError("");
    setMsg("");

    if (!idToken || !editingLogId || !editingLog) return;

    try {
      const res = await fetch("/api/sell-check/logs", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          id: editingLogId,
          patch: rowForSubmit(editingLog),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "学習データの更新に失敗しました");
      }

      setMsg("学習データを更新しました。");
      cancelEditLog();
      await loadLogs();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "学習データの更新に失敗しました";
      setError(message);
    }
  }

  async function deleteLog(id: string) {
    setError("");
    setMsg("");

    if (!idToken) return;

    const ok = window.confirm("この学習データを削除しますか？");
    if (!ok) return;

    try {
      const res = await fetch(
        `/api/sell-check/logs?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "学習データの削除に失敗しました");
      }

      setMsg("学習データを削除しました。");
      await loadLogs();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "学習データの削除に失敗しました";
      setError(message);
    }
  }

  async function autoDeleteDuplicateLogs() {
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

    if (duplicateRemoveCount <= 0) {
      setMsg("削除対象の重複データはありません。");
      return;
    }

    const ok = window.confirm(
      `重複データを${duplicateRemoveCount}件削除します。\n同じ商品と判定されたデータは、新しい1件だけ残します。\n実行しますか？`,
    );

    if (!ok) return;

    setDedupeBusy(true);

    try {
      const idsToDelete = duplicateGroups.flatMap((group) =>
        group.remove.map((log) => log.id),
      );

      let deletedCount = 0;

      for (const id of idsToDelete) {
        const res = await fetch(
          `/api/sell-check/logs?id=${encodeURIComponent(id)}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          },
        );

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || "重複データの自動削除に失敗しました");
        }

        deletedCount += 1;
      }

      setMsg(`重複データを${deletedCount}件、自動削除しました。`);
      cancelEditLog();
      await loadLogs();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "重複データの自動削除に失敗しました";
      setError(message);
    } finally {
      setDedupeBusy(false);
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

  const glassPanel: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(180deg, rgba(13,39,59,0.58), rgba(6,21,35,0.48))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 40px rgba(0,0,0,0.20)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  };

  const glassCard: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(4,18,31,0.42)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
  };

  const inputBase: React.CSSProperties = {
    width: "100%",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    background: "rgba(3,12,22,0.54)",
    color: "rgba(248,250,252,0.94)",
    outline: "none",
    padding: "12px 14px",
    fontSize: 13,
    fontWeight: 700,
  };

  const primaryButton: React.CSSProperties = {
    border: "1px solid rgba(147,197,253,0.36)",
    borderRadius: 14,
    background: "linear-gradient(135deg, rgba(37,99,235,0.94), rgba(14,165,233,0.84))",
    color: "white",
    padding: "12px 16px",
    fontSize: 13,
    fontWeight: 950,
    boxShadow: "0 14px 30px rgba(37,99,235,0.25)",
  };

  const softButton: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 14,
    background: "rgba(255,255,255,0.065)",
    color: "rgba(248,250,252,0.90)",
    padding: "10px 14px",
    fontSize: 12,
    fontWeight: 900,
  };

  const activeMode = [
    {
      id: "single" as const,
      icon: "◎",
      title: "1商品を詳しく学習",
      sub: "商品ページ本文と画像を統合",
      caption: "Learning DB",
    },
    {
      id: "market" as const,
      icon: "▦",
      title: "複数商品を浅く市場学習",
      sub: "一覧スクショから商品カード抽出",
      caption: "Market DB",
    },
    {
      id: "deep" as const,
      icon: "◇",
      title: "複数商品を詳しくSELL CHECK学習",
      sub: "商品枠ごとに画像と文章を投入",
      caption: "Theory DB",
    },
  ];

  return (
    <div
      className="learning-admin-modern"
      style={{
        width: "100%",
        maxWidth: 1260,
        margin: "0 auto",
        display: "grid",
        gap: 14,
        color: "rgba(248,250,252,0.94)",
      }}
    >
      <style>{`
        .learning-admin-modern * { box-sizing: border-box; }
        .learning-admin-modern button { -webkit-appearance: none; appearance: none; cursor: pointer; }
        .learning-admin-modern button:disabled { cursor: not-allowed; opacity: .48; }
        .learning-admin-modern input,
        .learning-admin-modern textarea,
        .learning-admin-modern select {
          background: rgba(3,12,22,.62) !important;
          color: rgba(248,250,252,.94) !important;
          border-color: rgba(255,255,255,.12) !important;
        }
        .learning-admin-modern option { background: #0f1e30 !important; color: #f8fafc !important; }
        .learning-admin-modern table { background: rgba(3,12,22,.48) !important; }
        .learning-admin-modern th,
        .learning-admin-modern td { border-color: rgba(255,255,255,.10) !important; }
      `}</style>

      <section style={{ ...glassPanel, borderRadius: 22, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, letterSpacing: ".18em", fontWeight: 950, color: "#5eead4" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: "#14b8a6", boxShadow: "0 0 14px rgba(45,212,191,.65)" }} />
              LEARNING DATABASE CENTER
            </div>
            <h2 style={{ margin: "8px 0 0", fontSize: 26, lineHeight: 1.15, fontWeight: 950 }}>学習データ管理</h2>
            <p style={{ margin: "8px 0 0", maxWidth: 850, color: "rgba(255,255,255,.64)", fontSize: 13, lineHeight: 1.7 }}>
              売れる診断の判断精度を育てる場所です。商品詳細・市場一覧・SELL CHECK深掘りを切り替えてLearning DBへ蓄積します。
            </p>
          </div>
          <div style={{ minWidth: 250, ...glassCard, borderRadius: 18, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,.68)" }}>
              <span>10MB CAPACITY</span>
              <span>{formatBytes(deepBulkTotalSize)} / 10MB</span>
            </div>
            <div style={{ marginTop: 9, height: 9, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${getUploadPercent(deepBulkTotalSize)}%`, borderRadius: 999, background: deepBulkTotalSize > IMAGE_UPLOAD_SOFT_LIMIT_BYTES ? "linear-gradient(90deg,#f97316,#ef4444)" : "linear-gradient(90deg,#2563eb,#22d3ee,#34d399)" }} />
            </div>
            <div style={{ marginTop: 8, textAlign: "right", fontSize: 12, color: "rgba(255,255,255,.56)", fontWeight: 850 }}>残り {formatBytes(getUploadRemainingBytes(deepBulkTotalSize))}</div>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
          {[
            ["学習DB件数", `${logs.length}件`, "保存済み", "▾"],
            ["重複候補", `${duplicateRemoveCount}件`, "分析待ち", "□"],
            ["入力中", `${rows.length}件`, "確認待ち", "⌁"],
            ["容量上限", "10MB", "最大容量", "◌"],
            ["市場接続", "OK", "利用可能", "◎"],
          ].map(([label, value, sub, icon]) => (
            <div key={label} style={{ ...glassCard, borderRadius: 18, padding: 13, minHeight: 92, display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 12, background: "rgba(59,130,246,.18)", color: "#bfdbfe", fontWeight: 950 }}>{icon}</span>
              <span>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", fontWeight: 850 }}>{label}</div>
                <div style={{ marginTop: 3, fontSize: 22, lineHeight: 1.05, fontWeight: 950 }}>{value}</div>
                <div style={{ marginTop: 3, fontSize: 11, color: "rgba(255,255,255,.42)", fontWeight: 750 }}>{sub}</div>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...glassPanel, borderRadius: 22, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 950, marginBottom: 10 }}>学習モードを選択</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          {activeMode.map((mode, index) => {
            const active = learningMode === mode.id;
            const gradients = [
              "linear-gradient(135deg, rgba(37,99,235,.48), rgba(29,78,216,.22))",
              "linear-gradient(135deg, rgba(20,184,166,.42), rgba(13,148,136,.18))",
              "linear-gradient(135deg, rgba(124,58,237,.46), rgba(79,70,229,.18))",
            ];
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setLearningMode(mode.id)}
                style={{
                  ...glassCard,
                  borderRadius: 18,
                  padding: 16,
                  minHeight: 86,
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: active ? gradients[index] : "rgba(4,18,31,.44)",
                  border: active ? "1px solid rgba(94,234,212,.45)" : "1px solid rgba(255,255,255,.10)",
                  boxShadow: active ? "0 0 26px rgba(45,212,191,.12), inset 0 1px 0 rgba(255,255,255,.06)" : "inset 0 1px 0 rgba(255,255,255,.04)",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", width: 36, height: 36, borderRadius: 999, background: active ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.08)", fontSize: 16, fontWeight: 950 }}>{index + 1}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 950 }}>{mode.title}</span>
                  <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "rgba(255,255,255,.56)", fontWeight: 750 }}>{mode.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {learningMode === "single" ? (
        <section style={{ ...glassPanel, borderRadius: 22, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: ".16em", fontWeight: 950, color: "rgba(147,197,253,.72)" }}>SINGLE PRODUCT LEARNING</div>
              <h3 style={{ margin: "5px 0 0", fontSize: 21, fontWeight: 950 }}>1商品を詳しく学習</h3>
            </div>
            <button type="button" onClick={extractRichFromTextAndImages} disabled={richBusy || (!richText.trim() && richImageFiles.length === 0)} style={primaryButton}>{richBusy ? "統合解析中..." : "1商品を学習データ化"}</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(310px, .85fr)", gap: 14 }}>
            <textarea value={richText} onChange={(e) => setRichText(e.target.value)} style={{ ...inputBase, minHeight: 190, resize: "vertical" }} placeholder="商品名、価格、商品説明、状態、売却済み表示、閲覧数、いいね数などを貼り付け" />
            <label style={{ ...glassCard, borderRadius: 18, borderStyle: "dashed", minHeight: 190, padding: 12, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", cursor: "pointer" }}>
              <input type="file" accept="image/*" multiple style={{ display: "none" }} disabled={richBusy} onChange={(e) => { setRichImages(Array.from(e.target.files ?? [])); e.currentTarget.value = ""; }} />
              <span style={{ color: "rgba(255,255,255,.70)", fontWeight: 900 }}>{richImageFiles.length > 0 ? `${richImageFiles.length}枚選択中` : "商品画像・スクショを選択"}</span>
            </label>
          </div>
        </section>
      ) : null}

      {learningMode === "market" ? (
        <section style={{ ...glassPanel, borderRadius: 22, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: ".16em", fontWeight: 950, color: "rgba(45,212,191,.72)" }}>MARKET SCREENSHOT LEARNING</div>
              <h3 style={{ margin: "5px 0 0", fontSize: 21, fontWeight: 950 }}>複数商品を浅く市場学習</h3>
            </div>
            <button type="button" onClick={extractMarketBulkFromScreenshots} disabled={marketBulkBusy || marketBulkImageFiles.length === 0} style={primaryButton}>{marketBulkBusy ? "市場スクショ解析中..." : "市場スクショから一括データ化"}</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(330px, .75fr)", gap: 14 }}>
            <textarea value={marketBulkText} onChange={(e) => setMarketBulkText(e.target.value)} disabled={marketBulkBusy} style={{ ...inputBase, minHeight: 180, resize: "vertical" }} placeholder="任意：検索語、対象市場、スクショの補足。例：メルカリ 売却済み 英国 ヴィンテージ" />
            <label style={{ ...glassCard, borderRadius: 18, borderStyle: "dashed", minHeight: 180, padding: 12, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", cursor: "pointer" }}>
              <input type="file" accept="image/*" multiple style={{ display: "none" }} disabled={marketBulkBusy} onChange={(e) => { void setMarketBulkImages(Array.from(e.target.files ?? [])); e.currentTarget.value = ""; }} />
              <span style={{ color: "rgba(255,255,255,.70)", fontWeight: 900 }}>{marketBulkImageFiles.length > 0 ? `${marketBulkImageFiles.length}枚 / ${formatBytes(marketBulkTotalSize)}` : "市場スクショを選択"}</span>
            </label>
          </div>
        </section>
      ) : null}

      {learningMode === "deep" ? (
        <section style={{ ...glassPanel, borderRadius: 22, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: ".16em", fontWeight: 950, color: "rgba(110,231,183,.72)" }}>SELL CHECK DEEP LEARNING</div>
              <h3 style={{ margin: "5px 0 0", fontSize: 24, lineHeight: 1.15, fontWeight: 950 }}>③ 複数商品を詳しくSELL CHECK学習</h3>
              <p style={{ margin: "7px 0 0", color: "rgba(255,255,255,.58)", fontSize: 12.5, lineHeight: 1.65 }}>
                最大枚数ではなく10MBが上限です。1商品あたりのスクショ枚数を決めると、各商品枠がその枚数で満杯になった時点で次の枠を自動追加します。
              </p>
            </div>
            <button type="button" onClick={extractDeepBulkFromScreenshots} disabled={deepBulkBusy || (!deepBulkText.trim() && deepBulkImageFiles.length === 0 && deepBulkProductTexts.every((text) => !text.trim()))} style={primaryButton}>{deepBulkBusy ? "SELL CHECK深掘り解析中..." : "学習データを保存・更新する"}</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "230px minmax(0,1fr) 320px", gap: 12, marginBottom: 14 }}>
            <div style={{ ...glassCard, borderRadius: 18, padding: 14 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.58)", fontWeight: 950 }}>1商品あたりのスクショ枚数を設定</div>
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" onClick={() => setDeepBulkGroupSize(String(Math.max(1, deepBulkGroupSizeNumber - 1)))} disabled={deepBulkBusy || deepBulkGroupSizeNumber <= 1} style={{ ...softButton, width: 42, height: 38, padding: 0 }}>−</button>
                <select value={deepBulkGroupSize} onChange={(e) => setDeepBulkGroupSize(e.target.value)} disabled={deepBulkBusy} style={{ ...inputBase, height: 38, padding: "6px 10px", textAlign: "center" }}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => <option key={num} value={String(num)}>{num}枚 / 商品</option>)}
                </select>
                <button type="button" onClick={() => setDeepBulkGroupSize(String(Math.min(10, deepBulkGroupSizeNumber + 1)))} disabled={deepBulkBusy || deepBulkGroupSizeNumber >= 10} style={{ ...softButton, width: 42, height: 38, padding: 0 }}>＋</button>
              </div>
              <div style={{ marginTop: 9, fontSize: 11, color: "rgba(255,255,255,.46)", fontWeight: 750 }}>1商品につき1〜10枚まで設定できます。</div>
            </div>

            <div style={{ ...glassCard, borderRadius: 18, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 950, color: "rgba(255,255,255,.68)", marginBottom: 9 }}>
                <span>容量メーター</span>
                <span>{formatBytes(deepBulkTotalSize)} / 10MB</span>
              </div>
              <div style={{ height: 11, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${getUploadPercent(deepBulkTotalSize)}%`, borderRadius: 999, background: deepBulkTotalSize > IMAGE_UPLOAD_SOFT_LIMIT_BYTES ? "linear-gradient(90deg,#f97316,#ef4444)" : "linear-gradient(90deg,#2563eb,#22d3ee,#34d399)" }} />
              </div>
              <div style={{ marginTop: 9, display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,.52)", fontSize: 12, fontWeight: 850 }}>
                <span>{getUploadPercent(deepBulkTotalSize)}%</span>
                <span>残り {formatBytes(getUploadRemainingBytes(deepBulkTotalSize))}</span>
              </div>
            </div>

            <div style={{ ...glassCard, borderRadius: 18, padding: 14 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.58)", fontWeight: 950, marginBottom: 8 }}>学習の流れ</div>
              <div style={{ display: "grid", gap: 6, fontSize: 12, color: "rgba(255,255,255,.66)", fontWeight: 800 }}>
                <span><b style={{ color: "#93c5fd" }}>STEP 1</b>　枚数を決める</span>
                <span><b style={{ color: "#93c5fd" }}>STEP 2</b>　商品枠に投入（画像＋文章）</span>
                <span><b style={{ color: "#93c5fd" }}>STEP 3</b>　SELL CHECK項目へ変換</span>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,.34fr) minmax(0,.66fr)", gap: 12 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <textarea value={deepBulkText} onChange={(e) => setDeepBulkText(e.target.value)} disabled={deepBulkBusy} style={{ ...inputBase, minHeight: 145, resize: "vertical" }} placeholder="任意：検索語、対象市場、撮影ルール、共通条件など" />
              <button type="button" onClick={() => { setDeepBulkText(""); setDeepBulkProductTexts([]); clearDeepBulkProductBoxes(); }} disabled={deepBulkBusy} style={softButton}>入力クリア</button>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 950, color: "#a7f3d0" }}>商品枠（自動追加されます）</div>
                <button type="button" onClick={addDeepBulkProductBox} disabled={deepBulkBusy || !deepBulkCanAddProductBox} style={{ ...softButton, padding: "8px 12px" }}>＋ 商品を追加</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                {deepBulkProductBoxes.map((box, index) => {
                  const boxSize = getFilesTotalSize(box.files);
                  const boxRemainingSlots = Math.max(0, deepBulkGroupSizeNumber - box.files.length);
                  const canAddImages = deepBulkTotalSize < IMAGE_UPLOAD_HARD_LIMIT_BYTES && boxRemainingSlots > 0;
                  return (
                    <div key={box.id} style={{ ...glassCard, borderRadius: 18, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 9 }}>
                        <div style={{ fontSize: 14, fontWeight: 950 }}>商品{index + 1}</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ borderRadius: 999, padding: "4px 8px", background: "rgba(255,255,255,.08)", fontSize: 11, fontWeight: 950 }}>{box.files.length}/{deepBulkGroupSizeNumber}枚</span>
                          <span style={{ borderRadius: 999, padding: "4px 8px", background: "rgba(255,255,255,.08)", fontSize: 11, fontWeight: 850 }}>{formatBytes(boxSize)}</span>
                        </div>
                      </div>
                      <label style={{ border: "1px dashed rgba(255,255,255,.20)", background: "rgba(3,12,22,.45)", borderRadius: 15, minHeight: 120, padding: 12, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", cursor: canAddImages ? "pointer" : "not-allowed" }}>
                        <input type="file" accept="image/*" multiple style={{ display: "none" }} disabled={deepBulkBusy || !canAddImages} onChange={(e) => { const files = Array.from(e.target.files ?? []); void setDeepBulkBoxImages(box.id, files); e.currentTarget.value = ""; }} />
                        {box.previewUrls.length > 0 ? (
                          <span style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, width: "100%" }}>
                            {box.previewUrls.slice(0, 4).map((url) => <img key={url} src={url} alt="preview" style={{ width: "100%", height: 56, objectFit: "cover", borderRadius: 10 }} />)}
                          </span>
                        ) : (
                          <span style={{ color: "rgba(255,255,255,.68)", fontSize: 12, fontWeight: 900 }}>
                            ＋<br />スクショを投入<br />クリック or ドラッグ＆ドロップ<br />JPG / PNG
                          </span>
                        )}
                      </label>
                      <textarea value={box.text} onChange={(e) => updateDeepBulkProductText(box.id, e.target.value)} disabled={deepBulkBusy} style={{ ...inputBase, minHeight: 82, resize: "vertical", marginTop: 9, fontSize: 12 }} placeholder="商品補足文章：特徴・価格・用途・ターゲットなど" />
                      <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "rgba(255,255,255,.45)", fontSize: 11, fontWeight: 800 }}>{box.text.length} / 500文字</span>
                        <button type="button" onClick={() => removeDeepBulkProductBox(box.id)} disabled={deepBulkBusy || deepBulkProductBoxes.length <= 1} style={{ ...softButton, padding: "5px 8px", color: "#fecaca" }}>削除</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0,.64fr) minmax(0,.36fr)", gap: 14 }}>
        <div style={{ ...glassPanel, borderRadius: 22, padding: 16 }}>
          <div style={{ fontSize: 12, letterSpacing: ".16em", color: "rgba(147,197,253,.65)", fontWeight: 950 }}>CSV / EXCEL</div>
          <h3 style={{ margin: "5px 0 12px", fontSize: 18, fontWeight: 950 }}>CSV / Excel読込</h3>
          <label style={{ ...glassCard, minHeight: 118, borderRadius: 18, borderStyle: "dashed", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", cursor: "pointer", padding: 14 }}>
            <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" style={{ display: "none" }} disabled={fileImportBusy} onChange={(e) => { const file = e.target.files?.[0] ?? null; void importFromFile(file); e.currentTarget.value = ""; }} />
            <span style={{ color: "rgba(255,255,255,.68)", fontWeight: 850 }}>{fileImportBusy ? "ファイル読込中..." : fileImportName ? `前回読込：${fileImportName}` : "CSV / Excelファイルを選択"}<br /><small>.csv / .xlsx 対応</small></span>
          </label>
        </div>

        <div style={{ ...glassPanel, borderRadius: 22, padding: 16 }}>
          <div style={{ fontSize: 12, letterSpacing: ".16em", color: "rgba(147,197,253,.65)", fontWeight: 950 }}>LEARNING ROWS</div>
          <h3 style={{ margin: "5px 0 8px", fontSize: 18, fontWeight: 950 }}>学習データ入力</h3>
          <p style={{ margin: 0, color: "rgba(255,255,255,.52)", fontSize: 12, lineHeight: 1.6 }}>解析結果やCSV読込結果を保存前に確認します。</p>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button type="button" onClick={addRow} style={softButton}>行を追加</button>
            <button type="button" onClick={submitImport} disabled={busy} style={primaryButton}>{busy ? "保存中..." : "保存"}</button>
          </div>
        </div>
      </section>

      <section style={{ ...glassPanel, borderRadius: 22, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: ".16em", color: "rgba(147,197,253,.65)", fontWeight: 950 }}>SAVED LEARNING DATA</div>
            <h3 style={{ margin: "5px 0 0", fontSize: 20, fontWeight: 950 }}>保存済み学習データ</h3>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" onClick={exportLogsAsCsv} disabled={logs.length === 0} style={softButton}>CSV出力</button>
            <button type="button" onClick={exportLogsAsExcel} disabled={logs.length === 0} style={softButton}>Excel出力</button>
            <button type="button" onClick={loadLogs} disabled={logsBusy} style={softButton}>{logsBusy ? "読込中..." : "再読込"}</button>
          </div>
        </div>
        {logs.length === 0 ? (
          <div style={{ ...glassCard, borderRadius: 16, padding: 14, color: "rgba(255,255,255,.56)", fontSize: 13 }}>保存済み学習データがありません。</div>
        ) : (
          <div style={{ ...glassCard, borderRadius: 18, overflow: "hidden" }}>
            <div style={{ maxHeight: 360, overflow: "auto" }}>
              <table className="min-w-[1200px] border-collapse text-left text-xs text-white/75">
                <thead className="sticky top-0 z-20 bg-[#10131a] text-white">
                  <tr><ExcelTh stickyLeft>操作</ExcelTh><ExcelTh>商品名</ExcelTh><ExcelTh>出品価格</ExcelTh><ExcelTh>売却価格</ExcelTh><ExcelTh>状態</ExcelTh><ExcelTh>ブランド</ExcelTh><ExcelTh>メモ</ExcelTh><ExcelTh>作成日時</ExcelTh></tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-white/10 odd:bg-white/[0.03] hover:bg-white/[0.08]">
                      <ExcelTd stickyLeft><div className="flex min-w-[116px] gap-2"><button type="button" onClick={() => startEditLog(log)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-black text-white">編集</button><button type="button" onClick={() => deleteLog(log.id)} className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-[11px] font-black text-red-100">削除</button></div></ExcelTd>
                      <ExcelTd wide title={log.title}>{shortText(log.title)}</ExcelTd><ExcelTd>{shortText(log.price)}</ExcelTd><ExcelTd>{shortText(log.soldPrice)}</ExcelTd><ExcelTd>{shortText(log.condition)}</ExcelTd><ExcelTd>{shortText(log.brandName)}</ExcelTd><ExcelTd wide title={log.memo}>{shortText(log.memo)}</ExcelTd><ExcelTd wide>{formatDate(log.createdAt)}</ExcelTd>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {editingLogId && editingLog ? (
          <div style={{ marginTop: 16, ...glassCard, borderRadius: 18, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div><div style={{ fontSize: 16, fontWeight: 950 }}>選択中データの編集</div><div style={{ marginTop: 4, wordBreak: "break-all", color: "rgba(255,255,255,.45)", fontSize: 12 }}>ID：{editingLogId}</div></div>
              <div style={{ display: "flex", gap: 8 }}><button type="button" onClick={cancelEditLog} style={softButton}>キャンセル</button><button type="button" onClick={saveEditingLog} style={primaryButton}>編集内容を保存</button></div>
            </div>
            <RowEditor row={editingLog} index={0} updateRow={(_, patch) => setEditingLog((prev) => (prev ? { ...prev, ...patch } : prev))} removeRow={() => cancelEditLog()} imagePreviewUrls={[]} imageFileName="" busy={false} analyzeImagesForRow={async () => undefined} hideImageAnalyzer />
          </div>
        ) : null}
      </section>

      {error ? <div style={{ borderRadius: 14, border: "1px solid rgba(248,113,113,.25)", background: "rgba(239,68,68,.12)", padding: 12, color: "#fecaca", fontSize: 13, fontWeight: 800 }}>{error}</div> : null}
      {msg ? <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", padding: 12, color: "rgba(255,255,255,.72)", fontSize: 13, fontWeight: 800 }}>{msg}</div> : null}
    </div>
  );
}

function ExcelTh(props: { children: React.ReactNode; stickyLeft?: boolean }) {
  return (
    <th
      className={[
        "whitespace-nowrap border-r border-white/10 px-3 py-3 text-[11px] font-black",
        props.stickyLeft ? "sticky left-0 z-30 bg-[#10131a]" : "",
      ].join(" ")}
    >
      {props.children}
    </th>
  );
}

function ExcelTd(props: {
  children: React.ReactNode;
  wide?: boolean;
  stickyLeft?: boolean;
  title?: string;
}) {
  return (
    <td
      title={props.title}
      className={[
        "max-w-[180px] whitespace-nowrap border-r border-white/10 px-3 py-2 align-middle",
        "overflow-hidden text-ellipsis",
        props.wide ? "min-w-[220px]" : "min-w-[96px]",
        props.stickyLeft ? "sticky left-0 z-10 bg-[#10131a]" : "",
      ].join(" ")}
    >
      {props.children}
    </td>
  );
}

function RowEditor(props: {
  row: ImportRow;
  index: number;
  updateRow: (index: number, patch: Partial<ImportRow>) => void;
  removeRow: (index: number) => void;
  imagePreviewUrls: string[];
  imageFileName: string;
  busy: boolean;
  analyzeImagesForRow: (index: number, files: File[]) => Promise<void>;
  hideImageAnalyzer?: boolean;
}) {
  const {
    row,
    index,
    updateRow,
    removeRow,
    imagePreviewUrls,
    imageFileName,
    busy,
    analyzeImagesForRow,
    hideImageAnalyzer = true,
  } = props;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <Field label="商品名">
          <input
            value={row.title}
            onChange={(e) => updateRow(index, { title: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
          />
        </Field>

        <Field label="出品価格">
          <input
            value={row.price}
            onChange={(e) => updateRow(index, { price: e.target.value })}
            inputMode="numeric"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
          />
        </Field>

        <Field label="売却価格">
          <input
            value={row.soldPrice}
            onChange={(e) => updateRow(index, { soldPrice: e.target.value })}
            inputMode="numeric"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
          />
        </Field>

        <Field label="売却状態">
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
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
        <Field label="カテゴリ">
          <select
            value={row.category}
            onChange={(e) => updateRow(index, { category: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
          >
            {CATEGORY_OPTIONS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="状態">
          <select
            value={row.condition}
            onChange={(e) => updateRow(index, { condition: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
          >
            {CONDITION_OPTIONS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="閲覧数">
          <input
            value={row.views}
            onChange={(e) => updateRow(index, { views: e.target.value })}
            inputMode="numeric"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
          />
        </Field>

        <Field label="いいね">
          <input
            value={row.likes}
            onChange={(e) => updateRow(index, { likes: e.target.value })}
            inputMode="numeric"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
          />
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Field label="ブランド">
          <input
            value={row.brandName}
            onChange={(e) => updateRow(index, { brandName: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
          />
        </Field>

        <Field label="型番・モデル">
          <input
            value={row.modelName}
            onChange={(e) => updateRow(index, { modelName: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
          />
        </Field>

        <Field label="素材">
          <input
            value={row.material}
            onChange={(e) => updateRow(index, { material: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
          />
        </Field>
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 text-sm font-black text-white/80">
          類似判定用の抽出属性
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="商品種別">
            <input
              value={row.productType}
              onChange={(e) =>
                updateRow(index, { productType: e.target.value })
              }
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
              placeholder="例：ソフビ、ブリキ、ミニカー"
            />
          </Field>

          <Field label="作品名・キャラクター">
            <input
              value={row.characterName}
              onChange={(e) =>
                updateRow(index, { characterName: e.target.value })
              }
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
              placeholder="例：鉄人28号、アトム"
            />
          </Field>

          <Field label="シリーズ">
            <input
              value={row.seriesName}
              onChange={(e) => updateRow(index, { seriesName: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
              placeholder="例：昭和ウルトラシリーズ"
            />
          </Field>

          <Field label="メーカー">
            <input
              value={row.maker}
              onChange={(e) => updateRow(index, { maker: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
              placeholder="例：ポピー、ブルマァク"
            />
          </Field>

          <Field label="年代">
            <input
              value={row.era}
              onChange={(e) => updateRow(index, { era: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
              placeholder="例：昭和、1970年代"
            />
          </Field>

          <Field label="コレクター分類">
            <input
              value={row.collectorGenre}
              onChange={(e) =>
                updateRow(index, { collectorGenre: e.target.value })
              }
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
              placeholder="例：特撮、昭和レトロ玩具"
            />
          </Field>

          <Field label="素材分類">
            <input
              value={row.materialType}
              onChange={(e) =>
                updateRow(index, { materialType: e.target.value })
              }
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
              placeholder="例：ブリキ、ソフビ、金属"
            />
          </Field>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Field label="キーワード">
          <input
            value={row.extractedKeywords}
            onChange={(e) =>
              updateRow(index, { extractedKeywords: e.target.value })
            }
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
            placeholder="例：昭和レトロ, 当時物, ブリキ, 円谷"
          />
        </Field>

        <Field label="状態リスク 0〜100">
          <input
            value={row.conditionRiskScore}
            onChange={(e) =>
              updateRow(index, { conditionRiskScore: e.target.value })
            }
            inputMode="numeric"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
          />
        </Field>

        <Field label="説明文品質 0〜100">
          <input
            value={row.descriptionQualityScore}
            onChange={(e) =>
              updateRow(index, { descriptionQualityScore: e.target.value })
            }
            inputMode="numeric"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
          />
        </Field>
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 text-sm font-black text-white/80">
          希少性・市場価値スコア
        </div>
        <MarketValueScoreFields row={row} index={index} updateRow={updateRow} />
      </div>

      <div className="mt-3">
        <ImageScoreFields row={row} index={index} updateRow={updateRow} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
        <Field label="メモ">
          <input
            value={row.memo}
            onChange={(e) => updateRow(index, { memo: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
          />
        </Field>

        <button
          type="button"
          onClick={() => removeRow(index)}
          className="self-end rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-xs font-black text-red-100"
        >
          削除
        </button>
      </div>
    </>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs font-bold text-white/70">
      {props.label}
      {props.children}
    </label>
  );
}

function MarketValueScoreFields(props: {
  row: ImportRow;
  index: number;
  updateRow: (index: number, patch: Partial<ImportRow>) => void;
}) {
  const { row, index, updateRow } = props;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Field label="希少性 0〜100">
        <input
          value={row.rarityScore}
          onChange={(e) => updateRow(index, { rarityScore: e.target.value })}
          inputMode="numeric"
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
        />
      </Field>

      <Field label="需要 0〜100">
        <input
          value={row.demandScore}
          onChange={(e) => updateRow(index, { demandScore: e.target.value })}
          inputMode="numeric"
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
        />
      </Field>

      <Field label="ブランド力 0〜100">
        <input
          value={row.brandPowerScore}
          onChange={(e) =>
            updateRow(index, { brandPowerScore: e.target.value })
          }
          inputMode="numeric"
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
        />
      </Field>

      <Field label="コレクター価値 0〜100">
        <input
          value={row.collectorScore}
          onChange={(e) => updateRow(index, { collectorScore: e.target.value })}
          inputMode="numeric"
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
        />
      </Field>

      <Field label="年代価値 0〜100">
        <input
          value={row.ageValueScore}
          onChange={(e) => updateRow(index, { ageValueScore: e.target.value })}
          inputMode="numeric"
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
        />
      </Field>

      <Field label="現在人気度 0〜100">
        <input
          value={row.trendScore}
          onChange={(e) => updateRow(index, { trendScore: e.target.value })}
          inputMode="numeric"
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
        />
      </Field>

      <Field label="出品数の少なさ 0〜100">
        <input
          value={row.marketSupplyScore}
          onChange={(e) =>
            updateRow(index, { marketSupplyScore: e.target.value })
          }
          inputMode="numeric"
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
        />
      </Field>

      <Field label="検索キーワード強度 0〜100">
        <input
          value={row.keywordStrength}
          onChange={(e) =>
            updateRow(index, { keywordStrength: e.target.value })
          }
          inputMode="numeric"
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
        />
      </Field>
    </div>
  );
}

function ImageScoreFields(props: {
  row: ImportRow;
  index: number;
  updateRow: (index: number, patch: Partial<ImportRow>) => void;
}) {
  const { row, index, updateRow } = props;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
      <Field label="明るさ">
        <input
          value={row.brightnessScore}
          onChange={(e) =>
            updateRow(index, { brightnessScore: e.target.value })
          }
          inputMode="numeric"
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
        />
      </Field>

      <Field label="構図">
        <input
          value={row.compositionScore}
          onChange={(e) =>
            updateRow(index, { compositionScore: e.target.value })
          }
          inputMode="numeric"
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
        />
      </Field>

      <Field label="背景">
        <input
          value={row.backgroundScore}
          onChange={(e) =>
            updateRow(index, { backgroundScore: e.target.value })
          }
          inputMode="numeric"
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
        />
      </Field>

      <Field label="傷リスク">
        <input
          value={row.damageRiskScore}
          onChange={(e) =>
            updateRow(index, { damageRiskScore: e.target.value })
          }
          inputMode="numeric"
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
        />
      </Field>

      <Field label="画像総合">
        <input
          value={row.overallImageScore}
          onChange={(e) =>
            updateRow(index, { overallImageScore: e.target.value })
          }
          inputMode="numeric"
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
        />
      </Field>
    </div>
  );
}
