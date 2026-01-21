// /app/flow/drafts/new/page.tsx
"use client";

/**
 * AOI FLOW｜下書き 新規/編集
 *
 * ✅ 既存機能：キャプション生成 / 画像生成 / 画像アップロード / 文字入り合成 / 下書き保存 / 一覧互換
 * ✅ 復活：IG / X / IG3（3案）ブロック（本文は絶対上書きしない）
 * ✅ 追加：動画生成（秒数 5/10、品質2段階、テンプレ、サイズ選択、コスト表示）
 * ✅ 追加：写真提出 指導書（常時表示・折りたたみ）
 *
 * ✅ 今回の確定仕様（UI事故防止）
 * - 「元画像 / イメージ画像 / 背景画像 / 合成画像」を“名前と表示”で完全に区別する
 * - 押せない時は、無反応にせず「その場に1行理由」を表示（モーダル/alert/toast禁止）
 * - 制作者だけ OpenAI / Runway / Sharp の使用状況を見える化（一般ユーザーは非表示）
 *
 * ✅ 課金事故対策
 * - フロントは Idempotency-Key を送らない
 *   → サーバ側が「入力から安定キー(stableHash)」を生成し、同条件の押し直しでも課金を増やさない
 * - フロントは inFlight + busy で二重クリックを防止
 * - /api/generate-video が 202(running) を返した時に「失敗扱いで落とさない」
 *   → “すでに生成中です” を表示して終了（課金事故防止）
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  ref,
  uploadString,
  getDownloadURL,
  listAll,
  getMetadata,
} from "firebase/storage";
import { auth, db, storage } from "@/firebase";

type Brand = "vento" | "riva";
type Phase = "draft" | "ready" | "posted";

type UiTemplate =
  | "zoomIn"
  | "zoomOut"
  | "slideLeft"
  | "slideRight"
  | "fadeIn"
  | "fadeOut"
  | "slowZoomFade"
  | "static";

type UiSeconds = 5 | 10;
type UiVideoQuality = "standard" | "high";
type UiVideoSize = "1024x1792" | "720x1280" | "1792x1024" | "1280x720";

/**
 * 画像プレビュー切替（UI上の名称を確定）
 * - “AI”という単語は曖昧なので禁止
 */
type PreviewMode = "base" | "idea" | "composite";

type DraftDoc = {
  userId: string;
  brand: Brand;
  phase: Phase;

  vision: string;
  keywordsText: string;
  memo: string;

  ig: string;
  x: string;
  ig3: string[];

  /**
   * 保存先（既存スキーマ互換のまま）
   * - baseImageUrl：元画像（アップロード画像）
   * - aiImageUrl：合成画像（動画に使用）を基本（※暫定運用）
   * - compositeImageUrl：文字入り（PNG）
   *
   * 追加フィールドは“型としては持つ”が、今フェーズでは Firestore への保存必須にはしない
   * - imageIdeaUrl：イメージ画像（世界観・雰囲気）
   * - bgImageUrl：背景画像（合成・動画用）
   */
  baseImageUrl?: string; // 元画像（アップロード画像）※常にJPEGに正規化
  aiImageUrl?: string; // 合成画像（動画に使用）※暫定的にここへ格納する運用
  compositeImageUrl?: string; // 文字入り（PNG）
  imageUrl?: string; // 代表（一覧互換）

  imageIdeaUrl?: string; // イメージ画像（世界観・雰囲気）※合成/動画に使わない
  bgImageUrl?: string; // 背景画像（合成・動画用）※単発で持てるならここ（未使用なら空のまま）

  /**
   * 旧：imageSource = "upload" | "ai" | "composite"
   * 新：プレビューは「元画像/イメージ/合成」で切替える
   * ※ Firestore schema を壊さないため、保存値は残す（UI側で previewMode と分離して扱う）
   */
  imageSource: "upload" | "ai" | "composite";

  overlayEnabled: boolean;
  overlayText: string;
  overlayFontScale: number;
  overlayY: number;
  overlayBgOpacity: number;

  videoUrl?: string;
  videoSeconds?: UiSeconds;
  videoQuality?: UiVideoQuality;
  videoTemplate?: UiTemplate;
  videoSize?: UiVideoSize;

  updatedAt?: any;
  createdAt?: any;

  bgImageUrls: string[]; // 背景履歴（最大10）
  videoUrls: string[]; // 動画履歴（最大10）
};

const DEFAULT: DraftDoc = {
  userId: "",
  brand: "vento",
  phase: "draft",

  vision: "",
  keywordsText: "",
  memo: "",

  ig: "",
  x: "",
  ig3: [],

  baseImageUrl: undefined,
  aiImageUrl: undefined,
  compositeImageUrl: undefined,
  imageUrl: undefined,

  imageIdeaUrl: undefined,
  bgImageUrl: undefined,

  imageSource: "upload",

  overlayEnabled: true,
  overlayText: "",
  overlayFontScale: 1.0,
  overlayY: 75,
  overlayBgOpacity: 0.45,

  videoUrl: undefined,
  videoSeconds: 5,
  videoQuality: "standard",
  videoTemplate: "slowZoomFade",
  videoSize: "1024x1792",

  bgImageUrls: [],
  videoUrls: [],
};

const UI = {
  gap: 12,
  cardPadding: 12,

  hVision: 64,
  hIG: 110,
  hX: 90,
  hMemo: 72,
  hOverlayText: 84,

  previewMaxWidth: 400,
  previewRadius: 11,

  stepBtnSize: 36,
  showLoadingText: true,

  FONT: {
    labelPx: 12,
    chipPx: 12,
    inputPx: 14,
    inputLineHeight: 1.55,
    buttonPx: 13,
    overlayPreviewBasePx: 18,
    overlayCanvasBasePx: 44,
  },

  FORM: {
    bg: "rgba(0,0,0,0.55)",
    border: "rgba(255,255,255,0.18)",
    text: "rgba(255,255,255,0.96)",
  },

  rightStickyTopPx: 25,

  RANGE: {
    boxPad: 8,
    headerMb: 6,
    valuePadY: 5,
    valuePadX: 10,
  },
};

function yen(n: number) {
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function splitKeywords(text: string) {
  return text
    .split(/[\n,、]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

const formStyle: React.CSSProperties = {
  background: UI.FORM.bg,
  borderColor: UI.FORM.border,
  color: UI.FORM.text,
  caretColor: UI.FORM.text,
  fontSize: UI.FONT.inputPx,
  lineHeight: UI.FONT.inputLineHeight as any,
};

function Btn(props: {
  children: React.ReactNode;
  onClick?: () => unknown | Promise<unknown>;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  title?: string;
}) {
  const variant = props.variant ?? "primary";
  const disabled = !!props.disabled;

  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 font-black transition " +
    "select-none whitespace-nowrap";

  const styles: Record<string, string> = {
    primary:
      "bg-white text-black hover:bg-white/92 border border-white/80 shadow-[0_14px_34px_rgba(0,0,0,0.60)]",
    secondary:
      "bg-white/18 text-white hover:bg-white/26 border border-white/40 shadow-[0_12px_28px_rgba(0,0,0,0.55)]",
    ghost:
      "bg-black/10 text-white/92 hover:bg-white/10 border border-white/30 shadow-[0_10px_24px_rgba(0,0,0,0.40)]",
    danger:
      "bg-red-500/92 text-white hover:bg-red-500 border border-red-200/40 shadow-[0_14px_34px_rgba(0,0,0,0.60)]",
  };

  return (
    <button
      type="button"
      title={props.title}
      onClick={() => {
        void Promise.resolve(props.onClick?.()).catch((e) => console.error(e));
      }}
      disabled={disabled}
      className={[
        base,
        styles[variant],
        disabled ? "opacity-40 cursor-not-allowed" : "active:scale-[0.99]",
        props.className ?? "",
      ].join(" ")}
      style={{ fontSize: UI.FONT.buttonPx }}
    >
      {props.children}
    </button>
  );
}

function SelectBtn(props: {
  selected: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const selected = props.selected;


  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={selected}
      className={[
        "inline-flex items-center justify-center rounded-full px-4 py-2 font-black transition select-none whitespace-nowrap",
        "border",
        selected
          ? "bg-white !text-black border-white ring-2 ring-white/70 shadow-[0_0_0_3px_rgba(255,255,255,0.22),0_18px_44px_rgba(0,0,0,0.70)]"
          : "bg-black/25 !text-white border-white/22 hover:bg-white/12 shadow-[0_10px_22px_rgba(0,0,0,0.35)]",
        props.disabled ? "opacity-35 cursor-not-allowed" : "active:scale-[0.99]",
      ].join(" ")}
      style={{
        fontSize: UI.FONT.buttonPx,
      }}
    >
      {props.label}
    </button>
  );
}

function Chip(props: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        "inline-flex items-center rounded-full px-3 py-1 font-bold",
        "bg-black/55 border border-white/25 text-white/90",
        props.className ?? "",
      ].join(" ")}
      style={{ fontSize: UI.FONT.chipPx }}
    >
      {props.children}
    </div>
  );
}

function RangeControl(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const v = props.value;
  const set = (next: number) => {
    const fixed = Number(next.toFixed(4));
    props.onChange(clamp(fixed, props.min, props.max));
  };
  const bump = (delta: number) => set(v + delta);
  const size = UI.stepBtnSize;

  return (
    <div
      className="rounded-2xl border border-white/14 bg-black/25"
      style={{ padding: UI.RANGE.boxPad }}
    >
      <div
        className="flex items-center justify-between gap-2"
        style={{ marginBottom: UI.RANGE.headerMb }}
      >
        <div className="text-white/85 font-bold" style={{ fontSize: UI.FONT.labelPx }}>
          {props.label}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => bump(-props.step)}
            className="rounded-full border border-white/25 bg-white/12 hover:bg-white/18 transition"
            style={{
              width: size,
              height: size,
              fontWeight: 900,
              color: "rgba(255,255,255,0.95)",
            }}
            title="小さく"
          >
            −
          </button>

          <div
            className="text-center font-black text-white/95 rounded-full bg-black/55 border border-white/22"
            style={{
              fontSize: UI.FONT.labelPx,
              padding: `${UI.RANGE.valuePadY}px ${UI.RANGE.valuePadX}px`,
              minWidth: 68,
            }}
          >
            {props.format(v)}
          </div>

          <button
            type="button"
            onClick={() => bump(props.step)}
            className="rounded-full border border-white/25 bg-white/12 hover:bg-white/18 transition"
            style={{
              width: size,
              height: size,
              fontWeight: 900,
              color: "rgba(255,255,255,0.95)",
            }}
            title="大きく"
          >
            +
          </button>
        </div>
      </div>

      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={v}
        onChange={(e) => set(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

function PhotoSubmissionGuide() {
  return (
    <details
      className="rounded-2xl border border-white/12 bg-black/25 mt-3"
      style={{ padding: UI.cardPadding }}
    >
      <summary
        className="cursor-pointer select-none"
        style={{
          listStyle: "none",
          outline: "none",
        }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-white/90 font-black" style={{ fontSize: UI.FONT.inputPx }}>
            写真提出のお願い（重要）
          </div>
          <Chip className="text-white/95">仕上がり安定の3条件</Chip>
        </div>

        <div className="text-white/70 mt-2" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.6 }}>
          ※ ここを開いて、撮影条件だけ守ってください（これで失敗が激減します）
        </div>
      </summary>

      <div className="mt-3 text-white/80" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.7 }}>
        提出する写真は、次の3つだけ守ってください。これで仕上がりが安定します。
      </div>

      <ul
        className="list-disc list-inside mt-2 space-y-1"
        style={{ color: "rgba(255,255,255,0.88)", fontSize: 13 }}
      >
        <li>背景は「白い壁 / 白い紙 / 単色の布」（柄・文字はNG）</li>
        <li>商品を画面の真ん中に大きく（小さいと形が崩れやすい）</li>
        <li>影を薄く（強い影は商品と誤認されやすい）</li>
      </ul>

      <div className="mt-3 text-white/70 font-bold" style={{ fontSize: UI.FONT.labelPx }}>
        NG例（失敗しやすい）
      </div>
      <ul
        className="list-disc list-inside mt-1 space-y-1"
        style={{ color: "rgba(255,255,255,0.70)", fontSize: 13 }}
      >
        <li>背景がごちゃごちゃ（部屋・棚・文字・柄）</li>
        <li>商品が小さい</li>
        <li>手で持ってる</li>
        <li>逆光 / 暗い / ブレている</li>
      </ul>

      <div className="mt-3 text-white/70 font-bold" style={{ fontSize: UI.FONT.labelPx }}>
        推奨
      </div>
      <ul
        className="list-disc list-inside mt-1 space-y-1"
        style={{ color: "rgba(255,255,255,0.70)", fontSize: 13 }}
      >
        <li>正面1枚 + 斜め1枚（合計2枚）</li>
        <li>明るい場所（昼間の窓際）</li>
        <li>iPhone/Androidの標準カメラでOK（加工しない）</li>
      </ul>

      <div className="mt-3 text-white/55" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.6 }}>
        ※ この画像を元に、背景のみをAIが変更して動画を生成します（商品自体は同一性を維持）。
      </div>
    </details>
  );
}

async function uploadDataUrlToStorage(uid: string, draftId: string, dataUrl: string) {
  const ext = "png";
  const path = `users/${uid}/drafts/${draftId}/${Date.now()}.${ext}`;
  const r = ref(storage, path);
  await uploadString(r, dataUrl, "data_url");
  return await getDownloadURL(r);
}

async function uploadImageFileAsJpegToStorage(uid: string, draftId: string, file: File) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("画像の読み込みに失敗しました（HEIF未対応の可能性）");

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas error");
  ctx.drawImage(bitmap, 0, 0);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

  const path = `users/${uid}/drafts/${draftId}/${Date.now()}.jpg`;
  const r = ref(storage, path);
  await uploadString(r, dataUrl, "data_url");
  return await getDownloadURL(r);
}

async function loadImageAsObjectUrl(src: string) {
  try {
    const res = await fetch(src, { method: "GET" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    return { blob, objectUrl, revoke: () => URL.revokeObjectURL(objectUrl) };
  } catch {
    return null;
  }
}

type PricingTable = {
  standard: { 5: number; 10: number };
  high: { 5: number; 10: number };
};
type ConfigResponseLike = any;

const FALLBACK_PRICING: PricingTable = {
  standard: { 5: 180, 10: 360 },
  high: { 5: 360, 10: 720 },
};

function normalizePricing(raw: ConfigResponseLike): PricingTable {
  const src = raw?.pricing?.video ?? raw?.videoPricing ?? raw?.pricing ?? raw ?? {};

  const s5 = Number(src?.standard?.[5] ?? src?.standard?.["5"] ?? src?.standard5);
  const s10 = Number(src?.standard?.[10] ?? src?.standard?.["10"] ?? src?.standard10);
  const h5 = Number(src?.high?.[5] ?? src?.high?.["5"] ?? src?.high5);
  const h10 = Number(src?.high?.[10] ?? src?.high?.["10"] ?? src?.high10);

  return {
    standard: {
      5: Number.isFinite(s5) && s5 > 0 ? s5 : FALLBACK_PRICING.standard[5],
      10: Number.isFinite(s10) && s10 > 0 ? s10 : FALLBACK_PRICING.standard[10],
    },
    high: {
      5: Number.isFinite(h5) && h5 > 0 ? h5 : FALLBACK_PRICING.high[5],
      10: Number.isFinite(h10) && h10 > 0 ? h10 : FALLBACK_PRICING.high[10],
    },
  };
}
export default function NewDraftPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const id = sp.get("id");

  const [uid, setUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadBusy, setLoadBusy] = useState(true);

  const [draftId, setDraftId] = useState<string | null>(id ?? null);
  const [d, setD] = useState<DraftDoc>({ ...DEFAULT });
// ✅ プレビュー切替（保存用 imageSource とは別物）
const [previewMode, setPreviewMode] = useState<PreviewMode>("base");
// ✅ 右カラムの表示タブ
type RightTab = "image" | "video";
const [rightTab, setRightTab] = useState<RightTab>("image");

// ✅ 文字入り「一時プレビュー」用（保存はしない）
const [overlayPreviewDataUrl, setOverlayPreviewDataUrl] = useState<string | null>(null);

// ✅ 「押せない理由」表示（その場に1行）
const [previewReason, setPreviewReason] = useState<string>("");

// canvas
const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  // ✅ 動画のキャッシュバスター：切替時だけ更新する（常時は更新しない）
  const [videoCacheKey, setVideoCacheKey] = useState<number>(0);
  const [videoHistory, setVideoHistory] = useState<string[]>([]);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);

  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [bgBusy, setBgBusy] = useState(false);

  const inFlightRef = useRef<Record<string, boolean>>({});

  const [pricing, setPricing] = useState<PricingTable>(FALLBACK_PRICING);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingUpdatedAt, setPricingUpdatedAt] = useState<number | null>(null);

  // ===========================
  // OWNER 表示制御（制作者だけに見せる）
  // ===========================
  // - NEXT_PUBLIC_OWNER_UID が一致する時だけ「OpenAI/Runway 表示」を出す
  // - 制作者以外は見えない（価格は見せてもOKだが、ここは要件通り“どのAIか”を隠す）
  const OWNER_UID = (process.env.NEXT_PUBLIC_OWNER_UID || "").trim();
  const isOwner = !!uid && !!OWNER_UID && uid === OWNER_UID;

  // ✅ C-2) プレビュー切替が押せない理由を判定（その場に1行表示する用）
  function previewDisabledReason(mode: PreviewMode, d: DraftDoc): string {
  if (mode === "base" && !d.baseImageUrl) return "先に元画像を保存してください";
  if (mode === "idea" && !d.imageIdeaUrl) return "先にイメージ画像を生成してください";
  if (mode === "composite" && !(d.compositeImageUrl || d.aiImageUrl))
  return "先に合成画像を作成してください";
  return "";
}

  async function fetchPricing() {
    setPricingBusy(true);
    setPricingError(null);
    try {
      const r = await fetch("/api/config", {
        method: "GET",
        headers: { "cache-control": "no-store" },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "config error");
      setPricing(normalizePricing(j));
      setPricingUpdatedAt(Date.now());
    } catch {
      setPricingError("価格取得に失敗（暫定表示）");
      setPricingUpdatedAt(Date.now());
    } finally {
      setPricingBusy(false);
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setLoadBusy(false);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    fetchPricing();
    const t = setInterval(() => fetchPricing(), 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") fetchPricing();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
  let cancelled = false;

  // ✅ プレビューで「文字入り」を見せたいのは base/composite のときだけ
  if (previewMode === "idea") {
    setOverlayPreviewDataUrl(null);
    return;
  }

  // 文字が空、またはoverlay無効ならプレビューは不要
  const text = (d.overlayText || "").trim();
  if (!d.overlayEnabled || !text) {
    setOverlayPreviewDataUrl(null);
    return;
  }

  // 元画像（base）が無いと描けない（仕様：文字入りは必ず元画像）
if (!d.baseImageUrl) {
  setOverlayPreviewDataUrl(null);
  return;
}

  // ✅ 打鍵のたびに重くならないよう、少し遅延
  const t = setTimeout(async () => {
    const out = await renderToCanvasAndGetDataUrlSilent();
    if (!cancelled) setOverlayPreviewDataUrl(out);
  }, 150);

  return () => {
    cancelled = true;
    clearTimeout(t);
  };
}, [
  previewMode,
  d.overlayEnabled,
  d.overlayText,
  d.overlayFontScale,
  d.overlayY,
  d.overlayBgOpacity,
]);

  useEffect(() => {
    if (!uid) return;

    (async () => {
      setLoadBusy(true);
      try {
        if (!id) {
          setDraftId(null);
          setD((prev) => ({ ...prev, userId: uid }));
          return;
        }

        const refDoc = doc(db, "drafts", id);
        const snap = await getDoc(refDoc);
        if (!snap.exists()) {
          setDraftId(null);
          setD((prev) => ({ ...prev, userId: uid }));
          return;
        }

        const data = snap.data() as any;

        const brand: Brand = data.brand === "riva" ? "riva" : "vento";
        const phase: Phase =
          data.phase === "ready" ? "ready" : data.phase === "posted" ? "posted" : "draft";

        const vision = typeof data.vision === "string" ? data.vision : "";
        const keywordsText = typeof data.keywordsText === "string" ? data.keywordsText : "";
        const memo = typeof data.memo === "string" ? data.memo : "";

        const ig =
          typeof data.ig === "string"
            ? data.ig
            : typeof data.caption_final === "string"
              ? data.caption_final
              : "";
        const x = typeof data.x === "string" ? data.x : "";
        const ig3 = Array.isArray(data.ig3) ? data.ig3.map(String).slice(0, 3) : [];

        const baseImageUrl =
          typeof data.baseImageUrl === "string" && data.baseImageUrl ? data.baseImageUrl : undefined;
        const aiImageUrl =
          typeof data.aiImageUrl === "string" && data.aiImageUrl ? data.aiImageUrl : undefined;
        const compositeImageUrl =
          typeof data.compositeImageUrl === "string" && data.compositeImageUrl
            ? data.compositeImageUrl
            : undefined;
const imageIdeaUrl =
  typeof data.imageIdeaUrl === "string" && data.imageIdeaUrl
    ? data.imageIdeaUrl
    : undefined;

const bgImageUrlSingle =
  typeof data.bgImageUrl === "string" && data.bgImageUrl
    ? data.bgImageUrl
    : undefined;

        const bgImageUrls: string[] = Array.isArray(data.bgImageUrls)
          ? data.bgImageUrls.filter((v: any) => typeof v === "string").slice(0, 10)
          : [];

        const videoUrls: string[] = Array.isArray(data.videoUrls)
          ? data.videoUrls.filter((v: any) => typeof v === "string").slice(0, 10)
          : [];

        const overlayEnabled = typeof data.overlayEnabled === "boolean" ? data.overlayEnabled : true;
        const overlayText = typeof data.overlayText === "string" ? data.overlayText : ig || "";
        const overlayFontScale =
          typeof data.overlayFontScale === "number" ? clamp(data.overlayFontScale, 0.6, 1.6) : 1.0;
        const overlayY = typeof data.overlayY === "number" ? clamp(data.overlayY, 0, 100) : 75;
        const overlayBgOpacity =
          typeof data.overlayBgOpacity === "number" ? clamp(data.overlayBgOpacity, 0, 0.85) : 0.45;

        const videoUrl =
          typeof data.videoUrl === "string" && data.videoUrl ? data.videoUrl : undefined;
        const videoSeconds: UiSeconds = data.videoSeconds === 10 || data.videoSeconds === "10" ? 10 : 5;
        const videoQuality: UiVideoQuality = data.videoQuality === "high" ? "high" : "standard";

        const videoTemplate: UiTemplate = (() => {
          const t = String(data.videoTemplate ?? "");
          const ok: UiTemplate[] = [
            "zoomIn",
            "zoomOut",
            "slideLeft",
            "slideRight",
            "fadeIn",
            "fadeOut",
            "slowZoomFade",
            "static",
          ];
          return ok.includes(t as UiTemplate) ? (t as UiTemplate) : "slowZoomFade";
        })();

        const videoSize: UiVideoSize = (() => {
          const s = String(data.videoSize ?? "");
          const ok: UiVideoSize[] = ["1024x1792", "720x1280", "1792x1024", "1280x720"];
          return ok.includes(s as UiVideoSize) ? (s as UiVideoSize) : "1024x1792";
        })();

        const imageSource: DraftDoc["imageSource"] =
          data.imageSource === "ai" || data.imageSource === "composite" || data.imageSource === "upload"
            ? data.imageSource
            : compositeImageUrl
              ? "composite"
              : baseImageUrl
                ? "upload"
                : aiImageUrl
                  ? "ai"
                  : "upload";

        setDraftId(id);
        setD({
          userId: uid,
          brand,
          phase,
          vision,
          keywordsText,
          memo,
          ig,
          x,
          ig3,
          baseImageUrl,
          aiImageUrl,
          compositeImageUrl,
          imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : undefined,
          imageSource,
imageIdeaUrl,
bgImageUrl: bgImageUrlSingle,

          bgImageUrls,
          videoUrls,

          overlayEnabled,
          overlayText,
          overlayFontScale,
          overlayY,
          overlayBgOpacity,

          videoUrl,
          videoSeconds,
          videoQuality,
          videoTemplate,
          videoSize,

          updatedAt: data.updatedAt,
          createdAt: data.createdAt,
        });
        // ✅ 初期プレビュー：あるものを優先（迷い防止）
if (compositeImageUrl || aiImageUrl) setPreviewMode("composite");
else if (baseImageUrl) setPreviewMode("base");
else if (imageIdeaUrl) setPreviewMode("idea");

// ✅ 背景プレビュー復元：Firestore単発(bgImageUrl)を最優先 → 無ければ履歴1件目
const initialBg = bgImageUrlSingle ?? (bgImageUrls.length ? bgImageUrls[0] : null);

// ✅ 別下書きへ切替時に「前のstate」が残ると事故るので、必ず上書きする
setBgImageUrl(initialBg);
        if (videoUrls.length && !videoPreviewUrl) setVideoPreviewUrl(videoUrls[0]);
      } finally {
        setLoadBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, id]);

  const brandLabel = d.brand === "vento" ? "VENTO" : "RIVA";
  const phaseLabel = d.phase === "draft" ? "下書き" : d.phase === "ready" ? "投稿待ち" : "投稿済み";
  const canGenerate = d.vision.trim().length > 0 && !busy;

  
  const baseForEditUrl = useMemo(() => {
    if (d.imageSource === "ai") return d.aiImageUrl || d.baseImageUrl || "";
    if (d.imageSource === "upload") return d.baseImageUrl || d.aiImageUrl || "";
    return d.baseImageUrl || d.aiImageUrl || "";
  }, [d.imageSource, d.baseImageUrl, d.aiImageUrl]);

  const displayImageUrl = useMemo(() => {
    // ✅ プレビューは previewMode で決める（保存互換の imageSource は見ない）
    if (previewMode === "composite") {
      return (
        overlayPreviewDataUrl ||
        d.compositeImageUrl || // ← 文字入り保存（PNG）
        d.aiImageUrl || // ← 背景合成（動画用）
        d.baseImageUrl || // ← 最後の保険
        ""
      );
    }
    if (previewMode === "idea") {
      // イメージ＝世界観用（未実装なら空になる）
      return d.imageIdeaUrl || "";
    }
    // base（元画像）
    return d.baseImageUrl || "";
  }, [
    previewMode,
    overlayPreviewDataUrl,
    d.compositeImageUrl,
    d.aiImageUrl,
    d.baseImageUrl,
    d.imageIdeaUrl,
  ]);

  // ✅ B.「URLが切り替わった時だけ」cache key を更新（常時 Date.now() しない）
  useEffect(() => {
    const u =
      selectedVideoUrl ||
      videoPreviewUrl ||
      d.videoUrl ||
      (videoHistory.length ? videoHistory[0] : "") ||
      (d.videoUrls.length ? d.videoUrls[0] : "");

    if (!u) return;

    setVideoCacheKey(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideoUrl, videoPreviewUrl, d.videoUrl, videoHistory, d.videoUrls]);

  // ✅ C. 動画URLは「切替時にだけ」v= を更新する（Range/206安定のため）
  const displayVideoUrl = useMemo(() => {
    const u =
      selectedVideoUrl ||
      videoPreviewUrl ||
      d.videoUrl ||
      (videoHistory.length ? videoHistory[0] : "") ||
      (d.videoUrls.length ? d.videoUrls[0] : "");

    if (!u) return undefined;

    // ✅ 初回だけは v= を付けない（不要なキャッシュ破壊を避ける）
    if (!videoCacheKey) return u;

    const sep = u.includes("?") ? "&" : "?";
    return `${u}${sep}v=${videoCacheKey}`;
  }, [selectedVideoUrl, videoPreviewUrl, d.videoUrl, videoHistory, d.videoUrls, videoCacheKey]);

  async function saveDraft(partial?: Partial<DraftDoc>): Promise<string | null> {
    if (!uid) return null;

    const includeVideoUrls = !!partial && Object.prototype.hasOwnProperty.call(partial, "videoUrls");
    const includeBgImageUrls = !!partial && Object.prototype.hasOwnProperty.call(partial, "bgImageUrls");

    const next: DraftDoc = { ...d, ...(partial ?? {}), userId: uid };
    const representativeUrl = next.compositeImageUrl || next.baseImageUrl || next.aiImageUrl || null;

    const payload: any = {
      userId: uid,
      brand: next.brand,
      phase: next.phase,
      vision: next.vision,
      keywordsText: next.keywordsText,
      memo: next.memo,
      ig: next.ig,
      x: next.x,
      ig3: next.ig3,

baseImageUrl: next.baseImageUrl ?? null,
aiImageUrl: next.aiImageUrl ?? null,
compositeImageUrl: next.compositeImageUrl ?? null,

imageIdeaUrl: next.imageIdeaUrl ?? null,
bgImageUrl: next.bgImageUrl ?? null,

imageUrl: representativeUrl,
caption_final: next.ig,

      imageSource: next.imageSource ?? "upload",

      overlayEnabled: next.overlayEnabled,
      overlayText: next.overlayText,
      overlayFontScale: next.overlayFontScale,
      overlayY: next.overlayY,
      overlayBgOpacity: next.overlayBgOpacity,

      videoUrl: next.videoUrl ?? null,
      videoSeconds: next.videoSeconds ?? 5,
      videoQuality: next.videoQuality ?? "standard",
      videoTemplate: next.videoTemplate ?? "slowZoomFade",
      videoSize: next.videoSize ?? "1024x1792",

      updatedAt: serverTimestamp(),
    };

    if (includeBgImageUrls) {
      payload.bgImageUrls = Array.isArray(next.bgImageUrls) ? next.bgImageUrls.slice(0, 10) : [];
    }
    if (includeVideoUrls) {
      payload.videoUrls = Array.isArray(next.videoUrls) ? next.videoUrls.slice(0, 10) : [];
    }

    if (!draftId) {
      payload.createdAt = serverTimestamp();
      payload.bgImageUrls = Array.isArray(next.bgImageUrls) ? next.bgImageUrls.slice(0, 10) : [];
      payload.videoUrls = Array.isArray(next.videoUrls) ? next.videoUrls.slice(0, 10) : [];

      const refDoc = await addDoc(collection(db, "drafts"), payload);
      setDraftId(refDoc.id);
      router.replace(`/flow/drafts/new?id=${encodeURIComponent(refDoc.id)}`);
      setD(next);
      return refDoc.id;
    } else {
      await updateDoc(doc(db, "drafts", draftId), payload);
      setD(next);
      return draftId;
    }
  }

  async function generateCaptions() {
    if (!uid) return;
    const vision = d.vision.trim();
    if (!vision) return alert("Vision（必須）を入力してください");

    if (inFlightRef.current["captions"]) return;
    inFlightRef.current["captions"] = true;

    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("no token");

      const body = { brandId: d.brand, vision, keywords: splitKeywords(d.keywordsText), tone: "" };

      const r = await fetch("/api/generate-captions", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "caption error");

      const ig = typeof j.instagram === "string" ? j.instagram : "";
      const x = typeof j.x === "string" ? j.x : "";
      const ig3 = Array.isArray(j.ig3) ? j.ig3.map(String).slice(0, 3) : [];

      const nextOverlay = (d.overlayText || "").trim() ? d.overlayText : ig;

      setD((prev) => ({
        ...prev,
        ig,
        x,
        ig3,
        overlayText: (prev.overlayText || "").trim() ? prev.overlayText : ig,
      }));

      await saveDraft({ ig, x, ig3, phase: "draft", overlayText: nextOverlay });
    } catch (e: any) {
      console.error(e);
      alert(`文章生成に失敗しました\n\n原因: ${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["captions"] = false;
    }
  }

  async function generateAiImage() {
    if (!uid) return;
    const vision = d.vision.trim();
    if (!vision) return alert("Vision（必須）を入力してください");

    if (inFlightRef.current["image"]) return;
    inFlightRef.current["image"] = true;

    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("no token");

      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) throw new Error("failed to create draft");

      const body = { brandId: d.brand, vision, keywords: splitKeywords(d.keywordsText), tone: "" };

      const r = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "image error");

      const b64 = typeof j.b64 === "string" ? j.b64 : "";
      if (!b64) throw new Error("no b64");

      const dataUrl = `data:image/png;base64,${b64}`;
      const url = await uploadDataUrlToStorage(uid, ensuredDraftId, dataUrl);

      setD((prev) => ({
  ...prev,
  imageIdeaUrl: url,
}));
await saveDraft({ imageIdeaUrl: url, phase: "draft" });
    } catch (e: any) {
      console.error(e);
      alert(`画像生成に失敗しました\n\n原因: ${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["image"] = false;
    }
  }

async function renderToCanvasAndGetDataUrlSilent(): Promise<string | null> {
  const canvas = canvasRef.current;
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const SIZE = 1024;
  canvas.width = SIZE;
  canvas.height = SIZE;

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = "#0b0f18";
  ctx.fillRect(0, 0, SIZE, SIZE);

  // ✅ 仕様：文字入りは「必ず元画像(base)」に入れる
const src = d.baseImageUrl || "";
if (!src) return null;

  const loaded = await loadImageAsObjectUrl(src);
  if (!loaded) return null;

  try {
    const img = new Image();
    img.src = loaded.objectUrl;

    const ok = await new Promise<boolean>((res) => {
      img.onload = () => res(true);
      img.onerror = () => res(false);
    });
    if (!ok) return null;

    const iw = img.naturalWidth || SIZE;
    const ih = img.naturalHeight || SIZE;
    const scale = Math.min(SIZE / iw, SIZE / ih);
    const w = iw * scale;
    const h = ih * scale;
    const x = (SIZE - w) / 2;
    const y = (SIZE - h) / 2;
    ctx.drawImage(img, x, y, w, h);
  } finally {
    loaded.revoke();
  }

  const overlayText = (d.overlayText || "").trim();
  if (d.overlayEnabled && overlayText) {
    const fontScale = clamp(d.overlayFontScale, 0.6, 1.6);
    const fontPx = Math.round(UI.FONT.overlayCanvasBasePx * fontScale);

    ctx.font = `900 ${fontPx}px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
    ctx.textBaseline = "top";

    const maxWidth = Math.floor(SIZE * 0.86);

    const fixedLines: string[] = [];
    let buf = "";
    for (const ch of overlayText) {
      const t = buf + ch;
      if (ctx.measureText(t).width <= maxWidth) buf = t;
      else {
        if (buf) fixedLines.push(buf);
        buf = ch;
      }
    }
    if (buf) fixedLines.push(buf);

    const lineH = Math.round(fontPx * 1.25);
    const blockH = fixedLines.length * lineH;

    const yPct = clamp(d.overlayY, 0, 100) / 100;
    const topY = Math.round((SIZE - blockH) * yPct);

    const pad = Math.round(SIZE * 0.035);
    const bgAlpha = clamp(d.overlayBgOpacity, 0, 0.85);

    ctx.fillStyle = `rgba(0,0,0,${bgAlpha})`;
    const rectY = Math.max(0, topY - Math.round(pad * 0.6));
    const rectH = Math.min(SIZE - rectY, blockH + Math.round(pad * 1.2));
    ctx.fillRect(0, rectY, SIZE, rectH);

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    for (let i = 0; i < fixedLines.length; i++) {
      const ln = fixedLines[i];
      const textW = ctx.measureText(ln).width;
      const tx = Math.round((SIZE - textW) / 2);
      const ty = topY + i * lineH;
      ctx.fillText(ln, tx, ty);
    }
  }

  return canvas.toDataURL("image/png");
}

  async function saveCompositeAsImageUrl() {
    if (!uid) return;

    if (inFlightRef.current["composite"]) return;
    inFlightRef.current["composite"] = true;

    setBusy(true);
    try {
      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) throw new Error("failed to create draft");

      const out = await renderToCanvasAndGetDataUrlSilent();
      if (!out) return;

      const url = await uploadDataUrlToStorage(uid, ensuredDraftId, out);

      setD((prev) => ({ ...prev, compositeImageUrl: url, imageSource: "composite" }));
      await saveDraft({ compositeImageUrl: url, imageSource: "composite" });

      alert("文字入りプレビューを保存しました");
    } catch (e: any) {
      console.error(e);
      alert(`保存に失敗しました\n\n原因: ${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["composite"] = false;
    }
  }

  async function setPhase(next: Phase) {
    await saveDraft({ phase: next });
    if (next === "ready") router.replace("/flow/inbox");
    if (next === "posted") router.replace("/flow/drafts");
  }

async function applyIg3ToOverlayOnly(text: string) {
  const t = (text ?? "").trim();
  if (!t) return;

  // ① テキストだけ更新
  setD((p) => ({ ...p, overlayText: t }));

  // ② プレビュー用に一時レンダリング（保存しない）
  const dataUrl = await renderToCanvasAndGetDataUrlSilent();
if (dataUrl) {
  setOverlayPreviewDataUrl(dataUrl);
  setPreviewMode("composite");
}
}

  const secondsKey: UiSeconds = (d.videoSeconds ?? 5) === 10 ? 10 : 5;
  const costStandard = pricing.standard[secondsKey];
  const costHigh = pricing.high[secondsKey];
  const shownCost = (d.videoQuality ?? "standard") === "high" ? costHigh : costStandard;

  const pricingMetaText = useMemo(() => {
    const t = pricingUpdatedAt ? new Date(pricingUpdatedAt) : null;
    const hhmm = t
      ? `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`
      : "—";
    return `更新 ${hhmm}${pricingBusy ? "（取得中）" : ""}${pricingError ? "（暫定）" : ""}`;
  }, [pricingUpdatedAt, pricingBusy, pricingError]);

  const templateItems: { id: UiTemplate; label: string }[] = [
    { id: "zoomIn", label: "ズームイン" },
    { id: "zoomOut", label: "ズームアウト" },
    { id: "slideLeft", label: "スライド（左）" },
    { id: "slideRight", label: "スライド（右）" },
    { id: "fadeIn", label: "フェードイン" },
    { id: "fadeOut", label: "フェードアウト" },
    { id: "slowZoomFade", label: "ゆっくりズーム＋フェード" },
    { id: "static", label: "静止（動きなし）" },
  ];

  const sizePresets: { id: UiVideoSize; label: string; sub: string }[] = [
    { id: "1024x1792", label: "Instagram / TikTok 縦（高画質）", sub: "おすすめ（品質を選ぶ意味が残る）" },
    { id: "720x1280", label: "Instagram / TikTok 縦（軽量）", sub: "試作・回数多い時" },
    { id: "1792x1024", label: "YouTube / Web 横（高画質）", sub: "サイト・LP・YouTube向け" },
    { id: "1280x720", label: "YouTube / Web 横（軽量）", sub: "試作・軽量" },
  ];

  function ratioFromVideoSize(size: UiVideoSize): string {
    // UIの動画サイズから、合成APIに渡す比率を決める（単純でOK）
    // 縦：9:16 / 横：16:9
    if (size === "1024x1792" || size === "720x1280") return "720:1280";
    return "1280:720";
  }

async function replaceBackgroundAndSaveToAiImage() {
  if (!uid) return;

  if (inFlightRef.current["replaceBg"]) return;
  inFlightRef.current["replaceBg"] = true;

  setBusy(true);
  try {
    // 下書きIDを確定
    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) throw new Error("failed to create draft");

    // ✅ 前景（商品）＝「文字入り保存(composite)」があれば最優先
    // そうでなければ「元画像(base)」
    const fg = d.compositeImageUrl || d.baseImageUrl || "";
    if (!fg) {
      alert("先に元画像を保存してください（合成の前景がありません）");
      return;
    }

    // 文字入りを使いたいのにまだ無い場合は明示して止める
    if (!d.compositeImageUrl && d.overlayEnabled && (d.overlayText || "").trim()) {
      alert("文字を入れて合成したい場合は、先に「文字入り画像を保存」を押してください");
      return;
    }

    // 背景：無ければ生成して使う
    const bg = bgImageUrl ? bgImageUrl : await generateBackgroundImage(fg);

    const ratio = ratioFromVideoSize(d.videoSize ?? "1024x1792");

    const r = await fetch("/api/replace-background", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        foregroundImage: fg,
        backgroundImage: bg,
        ratio,
        fit: "contain",
      }),
    });

    const j = await r.json().catch(() => ({}));

    if (!r.ok || j?.ok === false) {
      throw new Error(j?.error || "replace-background error");
    }

    // ✅ 新route.ts は dataUrl を返す（mock時は imageUrl の場合もある）ので両対応
    let outUrl = "";

    if (typeof j?.dataUrl === "string" && j.dataUrl.startsWith("data:image/")) {
      outUrl = await uploadDataUrlToStorage(uid, ensuredDraftId, j.dataUrl);
    } else if (typeof j?.imageUrl === "string" && j.imageUrl.startsWith("http")) {
      outUrl = j.imageUrl;
    } else if (typeof j?.b64 === "string" && j.b64) {
      const dataUrl = `data:image/png;base64,${j.b64}`;
      outUrl = await uploadDataUrlToStorage(uid, ensuredDraftId, dataUrl);
    } else {
      throw new Error("合成結果が取得できませんでした（dataUrl/imageUrl/b64が無い）");
    }

    // ✅ 保存先：aiImageUrl（合成画像＝動画用の代表）
    setD((p) => ({ ...p, aiImageUrl: outUrl, imageSource: "ai" }));
    await saveDraft({ aiImageUrl: outUrl, imageSource: "ai", phase: "draft" });

    alert("切り抜き＋背景合成を保存しました（AI画像として扱います）");
  } catch (e: any) {
    console.error(e);
    alert(`背景合成に失敗しました\n\n原因: ${e?.message || "不明"}`);
  } finally {
    setBusy(false);
    inFlightRef.current["replaceBg"] = false;
  }
}

  async function generateBackgroundImage(referenceImageUrl: string): Promise<string> {
    if (!uid) throw new Error("no uid");

    if (bgBusy) throw new Error("背景生成中です");
    setBgBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("no token");

      const body = {
        brandId: d.brand,
        vision: d.vision.trim(),
        keywords: splitKeywords(d.keywordsText),
        size: d.videoSize ?? "1024x1792",
        referenceImageUrl,
      };

      const r = await fetch("/api/generate-bg", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));

      if (r.status === 202 || j?.running) {
        throw new Error("背景がすでに生成中です。少し待ってから再度お試しください。");
      }

      if (!r.ok) throw new Error(j?.error || "bg error");

      const url = typeof j?.url === "string" ? j.url : "";
      if (!url) throw new Error("no bg url");

setBgImageUrl(url);

const nextBgUrls = [url, ...d.bgImageUrls.filter((x) => x !== url)].slice(0, 10);

// ✅ d.bgImageUrl（単発）も更新しておく（ロード復元の主役）
setD((prev) => ({ ...prev, bgImageUrl: url, bgImageUrls: nextBgUrls }));

const ensuredDraftId = draftId ?? (await saveDraft());
if (!ensuredDraftId) throw new Error("failed to create draft");

// ✅ Firestoreへも「単発(bgImageUrl) + 履歴(bgImageUrls)」を両方保存
await saveDraft({ bgImageUrl: url, bgImageUrls: nextBgUrls });

return url;
    } finally {
      setBgBusy(false);
    }
  }

  async function syncVideosFromStorage() {
    if (!uid) return;

    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) {
      alert("下書きIDの確定に失敗しました");
      return;
    }

    if (inFlightRef.current["syncVideos"]) return;
    inFlightRef.current["syncVideos"] = true;

    setBusy(true);
    try {
      // ✅ 下書き専用フォルダだけ見る
      const videosRef = ref(storage, `users/${uid}/drafts/${ensuredDraftId}/videos`);
      const listed = await listAll(videosRef);

      const found: { url: string; t: number }[] = [];

      for (const itemRef of listed.items) {
        const name = itemRef.name.toLowerCase();
        if (!name.endsWith(".mp4")) continue;

        try {
          const meta = await getMetadata(itemRef);
          const t = meta?.timeCreated ? new Date(meta.timeCreated).getTime() : 0;
          const url = await getDownloadURL(itemRef);
          found.push({ url, t });
        } catch {
          // skip
        }
      }

      if (found.length === 0) {
        alert("この下書きの動画が見つかりませんでした（まだ生成が無い / 保存先不一致）");
        return;
      }

      found.sort((a, b) => (b.t || 0) - (a.t || 0));
      const foundUrls = found.map((x) => x.url).slice(0, 10);

      // ✅ この下書きの Firestore にだけ保存
      const refDoc = doc(db, "drafts", ensuredDraftId);
      await updateDoc(refDoc, {
        videoUrls: foundUrls,
        updatedAt: serverTimestamp(),
      });

      setD((prev) => ({ ...prev, videoUrls: foundUrls }));
      alert(`同期しました：${foundUrls.length}件（この下書きのみ）`);
    } catch (e: any) {
      console.error(e);
      alert(`同期に失敗しました\n\n原因: ${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["syncVideos"] = false;
    }
  }

  async function generateVideo() {
    if (!uid) return;
    const vision = d.vision.trim();
    if (!vision) return alert("Vision（必須）を入力してください");

    if (inFlightRef.current["video"]) return;
    inFlightRef.current["video"] = true;

    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("no token");

      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) throw new Error("failed to create draft");

      // ✅ 参照画像の優先順位：
      // 1) 文字入り(composite) があれば最優先（意図通り）
      // 2) 次に aiImageUrl（= 「切り抜き＋背景合成」の保存先）
      // 3) 最後に baseImageUrl（アップロード画像）
      const reference = d.compositeImageUrl || d.aiImageUrl || d.baseImageUrl || "";
      if (!reference) {
        alert(
          "先に「画像をアップロード」または「AI画像生成」または「文字入り画像を保存」を行ってください（参照画像がありません）"
        );
        return;
      }

      const seconds = d.videoSeconds ?? 5;
      const templateId = d.videoTemplate ?? "slowZoomFade";
      const quality = (d.videoQuality ?? "standard") === "high" ? "high" : "standard";
      const size = d.videoSize ?? "1024x1792";

      const ensuredBgUrl = bgImageUrl ? bgImageUrl : await generateBackgroundImage(reference);

      const body = {
        brandId: d.brand,
        vision,
        keywords: splitKeywords(d.keywordsText),
        tone: "",
        templateId,
        seconds,
        quality,
        size,
        referenceImageUrl: reference,
        bgImageUrl: ensuredBgUrl,
      };

      const r = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));

      if (r.status === 202 || j?.running) {
        alert(
          "すでに生成中です（同条件の再実行はしません）。少し待ってから、もう一度ページを開いて確認してください。"
        );
        return;
      }

      if (!r.ok) throw new Error(j?.error || "video error");

      const url = typeof j?.url === "string" ? j.url : "";
      if (!url) throw new Error("no video url");

      setVideoPreviewUrl(url);

      setVideoHistory((prev) => {
        const next = [url, ...prev.filter((x) => x !== url)];
        return next.slice(0, 10);
      });
      setSelectedVideoUrl(url);

      async function buildNextVideoUrls(ensuredId: string, newUrl: string): Promise<string[]> {
        try {
          const snap = await getDoc(doc(db, "drafts", ensuredId));
          const cur =
            snap.exists() && Array.isArray((snap.data() as any).videoUrls)
              ? (snap.data() as any).videoUrls.filter((v: any) => typeof v === "string")
              : [];
          return [newUrl, ...cur.filter((x: string) => x !== newUrl)].slice(0, 10);
        } catch {
          return [newUrl, ...d.videoUrls.filter((x) => x !== newUrl)].slice(0, 10);
        }
      }

      const nextVideoUrls = await buildNextVideoUrls(ensuredDraftId, url);

      setD((prev) => ({
        ...prev,
        videoUrl: url,
        videoSeconds: seconds,
        videoQuality: quality,
        videoTemplate: templateId,
        videoSize: size,
        videoUrls: nextVideoUrls,
      }));

      await saveDraft({
        videoUrl: url,
        videoSeconds: seconds,
        videoQuality: quality,
        videoTemplate: templateId,
        videoSize: size,
        videoUrls: nextVideoUrls,
      });

      alert("動画を生成して保存しました");
    } catch (e: any) {
      console.error(e);
      alert(`動画生成に失敗しました\n\n原因: ${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["video"] = false;
    }
  }

  async function onUploadImageFile(file: File) {
    if (!uid) return;

    if (inFlightRef.current["upload"]) return;
    inFlightRef.current["upload"] = true;

    setBusy(true);
    try {
      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) throw new Error("failed to create draft");

      const url = await uploadImageFileAsJpegToStorage(uid, ensuredDraftId, file);

      setD((p) => ({ ...p, baseImageUrl: url, imageSource: "upload" }));

      await saveDraft({ baseImageUrl: url, imageSource: "upload", phase: "draft" });

      alert("アップロードしました（JPEGに変換して保存）");
    } catch (e: any) {
      console.error(e);
      alert(`アップロードに失敗しました\n\n原因: ${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["upload"] = false;
    }
  }

  const previewOverlayText = (d.overlayText || "").trim();

  return (
    <>
      <style jsx>{`
      .imgPair{
  display: grid;
  grid-template-columns: 1fr; /* ✅ スマホは縦 */
  gap: 8px;
}

@media (min-width: 900px){
  .imgPair{
    grid-template-columns: 1fr 1fr; /* ✅ PCは横 */
  }
}
        .pageWrap {
          min-height: 100vh;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: ${UI.gap}px;
        }
        .leftCol,
        .rightCol {
          width: 100%;
        }
// 置換：@media (min-width: 1024px) { ... } を丸ごとこれに
@media (min-width: 900px) {
  .pageWrap {
    flex-direction: row;
    align-items: flex-start;
    flex-wrap: nowrap; /* ✅ 横並び固定 */
  }
  .leftCol {
    width: 56%;
  }
  .rightCol {
    width: 44%;
    position: sticky;
    top: ${UI.rightStickyTopPx}px;
    height: calc(100vh - ${UI.rightStickyTopPx}px);
  }
  .rightScroll {
    height: 100%;
    overflow: auto;
  }
}
        details > summary::-webkit-details-marker {
          display: none;
        }
      `}</style>

      <div className="pageWrap">
        <section className="leftCol min-h-0 flex flex-col gap-3">
          <div className="shrink-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap" />
            {UI.showLoadingText && loadBusy ? (
              <div className="text-white/75" style={{ fontSize: UI.FONT.labelPx }}>
                読み込み中...
              </div>
            ) : null}
          </div>

          <div
            className="rounded-2xl border border-white/12 bg-black/25"
            style={{ padding: UI.cardPadding }}
          >
            <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
              Brand
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Btn
                variant={d.brand === "vento" ? "primary" : "secondary"}
                onClick={() => setD((p) => ({ ...p, brand: "vento" }))}
              >
                VENTO
              </Btn>
              <Btn
                variant={d.brand === "riva" ? "primary" : "secondary"}
                onClick={() => setD((p) => ({ ...p, brand: "riva" }))}
              >
                RIVA
              </Btn>
              <Chip>
                {brandLabel} / {phaseLabel}
              </Chip>
            </div>

<div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
  プレビュー切替
</div>

<div className="flex items-center gap-2 flex-wrap">
  {(
    [
      { mode: "base" as const, label: `プレビュー：元画像${d.baseImageUrl ? " ✓" : ""}` },
      { mode: "idea" as const, label: `プレビュー：イメージ${d.imageIdeaUrl ? " ✓" : ""}` },
      { mode: "composite" as const, label: `プレビュー：合成（動画用）${d.aiImageUrl ? " ✓" : ""}` },
    ] as const
  ).map(({ mode, label }) => {
    const reason = previewDisabledReason(mode, d);
    const disabled = !!reason || busy;

    return (
      <SelectBtn
        key={mode}
        selected={previewMode === mode}
        label={label}
        disabled={disabled}
        onClick={() => {
          if (disabled) {
            // ✅ その場に理由を出す（モーダル/トースト禁止）
            setPreviewReason(reason || "処理中です");
            return;
          }
          setPreviewReason("");
          setPreviewMode(mode);
        }}
        title="" // title は使わない（仕様違反になりやすい）
      />
    );
  })}
</div>

{previewReason ? (
  <div className="mt-2 text-white/70 font-bold" style={{ fontSize: UI.FONT.labelPx }}>
    {previewReason}
  </div>
) : null}

            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <label className="inline-flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  disabled={!uid || busy}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (!f) return;
                    await onUploadImageFile(f);
                  }}
                />
              </label>

              <Btn
                variant="secondary"
                disabled={!canGenerate}
                onClick={generateAiImage}
                title="AI画像は base を上書きしません（aiImageUrlへ保存）"
              >
                イメージ画像を生成（世界観・雰囲気）
                
              </Btn>
<div className="text-white/55 mt-2" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.5 }}>
  ※ イメージ画像は、合成や動画の素材には使用されません。
</div>
              <Btn variant="ghost" disabled={!uid || busy} onClick={() => saveDraft()}>
                保存
              </Btn>
            </div>

            <div
              className="text-white/55 mt-2"
              style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.5 }}
            >
              ※ アップロード画像は内部でJPEGに変換して保存します。
              <br />
              ※ AI画像は aiImageUrl に保存され、アップロード画像（base）は上書きされません。
            </div>

            <PhotoSubmissionGuide />

            <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
              Vision（必須）
            </div>
            <textarea
              value={d.vision}
              onChange={(e) => setD((p) => ({ ...p, vision: e.target.value }))}
              className="w-full rounded-xl border p-3 outline-none"
              style={{ ...formStyle, minHeight: UI.hVision }}
              placeholder="例：流行や価格ではなく、時間が残した佇まいを見る。"
            />

            <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
              Keywords（任意）
            </div>
            <input
              value={d.keywordsText}
              onChange={(e) => setD((p) => ({ ...p, keywordsText: e.target.value }))}
              className="w-full rounded-xl border p-3 outline-none"
              style={formStyle}
              placeholder="例：ビンテージ, 静けさ, 選別, 余白"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <Btn variant="primary" disabled={!canGenerate} onClick={generateCaptions}>
                文章を生成（IG＋X）
              </Btn>
            </div>
          </div>

          <div
            className="rounded-2xl border border-white/12 bg-black/25"
            style={{ padding: UI.cardPadding }}
          >
            <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
              Instagram 本文（編集可）
            </div>
            <textarea
              value={d.ig}
              onChange={(e) => setD((p) => ({ ...p, ig: e.target.value }))}
              className="w-full rounded-xl border p-3 outline-none"
              style={{ ...formStyle, minHeight: UI.hIG }}
              placeholder="IG本文"
            />

            <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
              X 投稿文（編集可）
            </div>
            <textarea
              value={d.x}
              onChange={(e) => setD((p) => ({ ...p, x: e.target.value }))}
              className="w-full rounded-xl border p-3 outline-none"
              style={{ ...formStyle, minHeight: UI.hX }}
              placeholder="X投稿文"
            />

            <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
              IG短文候補（ig3）※本文は上書きしない
            </div>

            <div className="grid grid-cols-1 gap-2">
              {(d.ig3 ?? []).length === 0 ? (
                <div
                  className="rounded-xl border border-white/10 bg-black/20 p-3 text-white/55"
                  style={{ fontSize: 13 }}
                >
                  まだ候補がありません（文章生成を実行すると入ります）
                </div>
              ) : null}

              {(d.ig3 ?? []).map((t, idx) => (
                <div
                  key={`${idx}-${t.slice(0, 12)}`}
                  className="rounded-xl border border-white/10 bg-black/20 p-3"
                >
                  <div
                    className="text-white/90"
                    style={{ fontSize: 14, lineHeight: 1.35, fontWeight: 800 }}
                  >
                    {t}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Btn
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        applyIg3ToOverlayOnly(t);
                      }}
                      title="本文は上書きしない（文字表示だけに使う）"
                    >
                      文字表示に使う
                    </Btn>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Btn variant="ghost" disabled={!uid || busy} onClick={() => saveDraft()}>
                保存
              </Btn>

              <Btn
                variant="secondary"
                disabled={!uid || busy}
                onClick={async () => {
                  if (!draftId) {
                    await saveDraft();
                    alert("先に下書きを作成しました");
                  } else {
                    alert("この下書きはすでに作成済みです");
                  }
                }}
              >
                下書きIDを確定
              </Btn>
            </div>
          </div>
        </section>

<section className="rightCol min-h-0">
  <div className="rightScroll flex flex-col gap-3">
    {/* =========================
        右：プレビュー（画像 / 動画）
    ========================== */}
    <div
      className="rounded-2xl border border-white/12 bg-black/25"
      style={{ padding: UI.cardPadding }}
    >
      {/* ヘッダー（内部表示 + タブ） */}
<div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {isOwner ? (
            <Chip>
              内部表示：画像=OpenAI / 背景=OpenAI / 合成=Sharp / 動画=Runway
              {` ｜状態：元=${d.baseImageUrl ? "✓" : "—"} / 背景=${bgImageUrl ? "✓" : "—"} / 合成=${d.aiImageUrl ? "✓" : "—"} / 動画=${d.videoUrl ? "✓" : "—"}`}
            </Chip>
          ) : null}
        </div>

<div className="flex items-center gap-2 whitespace-nowrap">
          <SelectBtn
            selected={rightTab === "image"}
            label="元画像｜背景(合成・動画用)"
            onClick={() => setRightTab("image")}
            disabled={busy}
          />
          <SelectBtn
            selected={rightTab === "video"}
            label="動画"
            onClick={() => setRightTab("video")}
            disabled={busy}
          />
        </div>
      </div>

      {/* =========================
          画像タブ
      ========================== */}
      {rightTab === "image" ? (
        <div className="mt-3 grid grid-cols-1 gap-2">
{/* 元画像｜背景（横並び） */}
<div className="imgPair">
                {/* 元画像 */}
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-white/70" style={{ fontSize: 12, marginBottom: 8 }}>
                プレビュー：元画像（文字入りはここに表示）
              </div>

              {d.baseImageUrl ? (
<img
  src={overlayPreviewDataUrl || d.baseImageUrl}
  alt="base"
  className="w-full rounded-xl border border-white/10"
  style={{ height: 240, objectFit: "contain", background: "rgba(0,0,0,0.25)" }}
/>
              ) : (
                <div
                  className="w-full rounded-xl border border-white/10 bg-black/30 flex items-center justify-center text-white/55"
                  style={{ aspectRatio: "1 / 1", fontSize: 13 }}
                >
                  元画像がありません（アップロード→保存）
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Btn variant="secondary" disabled={!uid || busy} onClick={saveCompositeAsImageUrl}>
                  文字入り画像を保存
                </Btn>

                <Btn variant="ghost" disabled={!uid || busy} onClick={() => saveDraft()}>
                  保存
                </Btn>
              </div>

              <div className="text-white/55 mt-2" style={{ fontSize: 12, lineHeight: 1.5 }}>
                ※ 文字入りプレビューは「元画像」に表示されます。
              </div>
            </div>

            {/* 背景（合成・動画用） */}
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-white/70" style={{ fontSize: 12, marginBottom: 8 }}>
                背景(合成・動画用)
              </div>

              {bgImageUrl ? (
<img
  src={bgImageUrl}
  alt="bg"
  className="w-full rounded-xl border border-white/10"
  style={{ height: 240, objectFit: "contain", background: "rgba(0,0,0,0.25)" }}
/>
              ) : (
                <div
                  className="w-full rounded-xl border border-white/10 bg-black/30 flex items-center justify-center text-white/55"
                  style={{ aspectRatio: "1 / 1", fontSize: 13 }}
                >
                  背景がありません（背景生成）
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Btn
                  variant="secondary"
                  disabled={!uid || busy}
                  onClick={async () => {
                    // 背景生成は「元画像」を基準にする（仕様：迷わせない）
                    const base = d.baseImageUrl || "";
                    if (!base) {
                      alert("先に元画像を保存してください");
                      return;
                    }
                    await generateBackgroundImage(base);
                  }}
                >
                  背景画像を生成（合成・動画用）
                </Btn>

                <Btn variant="secondary" disabled={!uid || busy} onClick={replaceBackgroundAndSaveToAiImage}>
                  製品画像＋背景を合成（保存）
                </Btn>
              </div>

              <div className="text-white/55 mt-2" style={{ fontSize: 12, lineHeight: 1.5 }}>
                ※ この背景が「合成」と「動画」に使われます。
              </div>
            </div>
          </div>

          {/* 文字の編集UI */}
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-white/80 font-bold" style={{ fontSize: 12 }}>
                文字表示
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={d.overlayEnabled}
                  onChange={(e) => setD((p) => ({ ...p, overlayEnabled: e.target.checked }))}
                />
                <span className="text-white/85" style={{ fontSize: 12 }}>
                  {d.overlayEnabled ? "ON" : "OFF"}
                </span>
              </label>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <RangeControl
                label="文字サイズ"
                value={d.overlayFontScale}
                min={0.6}
                max={1.6}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setD((p) => ({ ...p, overlayFontScale: v }))}
              />
              <RangeControl
                label="文字の上下位置"
                value={d.overlayY}
                min={0}
                max={100}
                step={1}
                format={(v) => `${v}%`}
                onChange={(v) => setD((p) => ({ ...p, overlayY: v }))}
              />
              <RangeControl
                label="文字背景の濃さ"
                value={d.overlayBgOpacity}
                min={0}
                max={0.85}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setD((p) => ({ ...p, overlayBgOpacity: v }))}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* =========================
          動画タブ
      ========================== */}
      {rightTab === "video" ? (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {/* 動画プレビュー */}
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/70" style={{ fontSize: 12, marginBottom: 8 }}>
              動画プレビュー
            </div>

            {displayVideoUrl ? (
<video
  key={displayVideoUrl}
  src={displayVideoUrl}
  controls
  playsInline
  className="w-full rounded-xl border border-white/10"
  style={{
    height: 260,              // ✅ 好きな高さに（例: 220〜320）
    objectFit: "contain",
    background: "rgba(0,0,0,0.25)",
  }}
/>
            ) : (
              <div
                className="w-full rounded-xl border border-white/10 bg-black/30 flex items-center justify-center text-white/55"
                style={{ aspectRatio: "16 / 9", fontSize: 13 }}
              >
                動画がありません（動画生成）
              </div>
            )}

            {/* 動画履歴 */}
            {d.videoUrls?.length ? (
              <div className="mt-3">
                <div className="text-white/70 mb-2" style={{ fontSize: 12 }}>
                  生成履歴（クリックで切替）
                </div>

                <div className="flex flex-col gap-2">
                  {d.videoUrls.slice(0, 6).map((u) => {
                    const selected = selectedVideoUrl === u;
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setSelectedVideoUrl(u)}
                        className="text-left rounded-xl border px-3 py-2 transition"
                        style={{
                          borderColor: selected ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.10)",
                          background: selected ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.15)",
                          color: selected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.75)",
                          fontSize: 12,
                        }}
                      >
                        {selected ? "✓ " : ""}
                        {u.slice(0, 52)}
                        {u.length > 52 ? "…" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <Btn variant="primary" disabled={!uid || busy || !canGenerate} onClick={generateVideo}>
                動画を生成（合成画像があれば使用）
              </Btn>

              <Btn variant="secondary" disabled={!uid || busy} onClick={syncVideosFromStorage}>
                動画を同期（Storage→Firestore）
              </Btn>

              <Btn variant="ghost" disabled={!uid || busy} onClick={() => saveDraft()}>
                保存
              </Btn>
            </div>
          </div>

          {/* 動画設定 */}
          <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
            <div className="text-white/85 mb-2" style={{ fontSize: UI.FONT.labelPx, fontWeight: 800 }}>
              動画設定
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-white/70 mb-2" style={{ fontSize: 12 }}>
                  動き（テンプレ）
                </div>

                <div className="flex flex-wrap gap-2">
                  {templateItems.map((t) => (
                    <SelectBtn
                      key={t.id}
                      selected={d.videoTemplate === t.id}
                      label={t.label}
                      onClick={() => setD((p) => ({ ...p, videoTemplate: t.id }))}
                      disabled={busy}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-white/70 mb-2" style={{ fontSize: 12 }}>
                  尺（秒）
                </div>

                <div className="flex flex-wrap gap-2">
                  <SelectBtn
                    selected={(d.videoSeconds ?? 5) === 5}
                    label="5秒"
                    onClick={() => setD((p) => ({ ...p, videoSeconds: 5 }))}
                    disabled={busy}
                  />
                  <SelectBtn
                    selected={(d.videoSeconds ?? 5) === 10}
                    label="10秒"
                    onClick={() => setD((p) => ({ ...p, videoSeconds: 10 }))}
                    disabled={busy}
                  />
                </div>
              </div>

              <div>
                <div className="text-white/70 mb-2" style={{ fontSize: 12 }}>
                  品質
                </div>

                <div className="flex flex-wrap gap-2">
                  <SelectBtn
                    selected={(d.videoQuality ?? "standard") === "standard"}
                    label={`標準（約 ${costStandard.toLocaleString()}円 / ${secondsKey}s）`}
                    onClick={() => setD((p) => ({ ...p, videoQuality: "standard" }))}
                    disabled={busy}
                  />
                  <SelectBtn
                    selected={(d.videoQuality ?? "standard") === "high"}
                    label={`高品質（約 ${costHigh.toLocaleString()}円 / ${secondsKey}s）`}
                    onClick={() => setD((p) => ({ ...p, videoQuality: "high" }))}
                    disabled={busy}
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip>{pricingMetaText}</Chip>
                  <Chip>
                    目安: {shownCost.toLocaleString()}円 / {secondsKey}s（{d.videoQuality ?? "standard"}）
                  </Chip>
                </div>
              </div>

              <div>
                <div className="text-white/70 mb-2" style={{ fontSize: 12 }}>
                  サイズ（用途）
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {sizePresets.map((s) => {
                    const selected = d.videoSize === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setD((p) => ({ ...p, videoSize: s.id }))}
                        disabled={busy}
                        className="text-left rounded-xl border px-3 py-2 transition"
                        style={{
                          borderColor: selected ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.10)",
                          background: selected ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.15)",
                          color: selected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.78)",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 800 }}>
                          {selected ? `✓ ${s.label}` : s.label}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>{s.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Btn variant="ghost" disabled={!uid || busy} onClick={() => saveDraft()}>
                  動画設定を保存
                </Btn>
                <Btn variant="secondary" disabled={!uid || busy} onClick={() => setPhase("ready")}>
                  投稿待ちへ
                </Btn>
                <Btn variant="secondary" disabled={!uid || busy} onClick={() => setPhase("posted")}>
                  投稿済みへ
                </Btn>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>

    {/* canvas（文字入り画像生成用：画面には出さない） */}
    <canvas ref={canvasRef} style={{ display: "none" }} />
  </div>
</section>
      </div>
    </>
  );
}
