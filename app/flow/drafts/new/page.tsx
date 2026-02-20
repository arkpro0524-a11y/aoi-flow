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
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ref, uploadString, getDownloadURL, listAll, getMetadata } from "firebase/storage";

import { auth, db, storage } from "@/firebase";

// ✅ 計画A：非AI動画（選択/生成/保存）UI部品
import VideoTemplatePicker from "@/components/video/VideoTemplatePicker";
import NonAiVideoActions from "@/components/video/NonAiVideoActions";

// ✅ motion型は共通定義を使う（ローカル定義禁止）
import type { MotionCharacter } from "@/lib/types/draft";

import { normalizeDraftImages } from "@/lib/drafts/normalizeDraftImages";
import { estimateVideoCostJPY } from "@/lib/pricing";

import ImageTextEditor from "@/components/ImageTextEditor";

// ✅ DraftDoc は必ず lib から読む（ここがズレると video系のpropが全部死ぬ）
import type {
  DraftDoc,
  DraftImages,
  TextOverlay,
  TextOverlayBySlot,
  ImagePurpose,
  StaticImageVariant,
  StaticImageLog,
  UiVideoSize, 
} from "@/lib/types/draft";

import VideoPanel from "./VideoPanel";

// ✅ CMパネルは「実体1箇所」に統一（思想違反③の再発防止）
import BrandCMPanel from "@/components/cm/BrandCMPanel";


// =========================
// 型定義（VideoTemplatePicker の props から正を取る）
// =========================
type VideoPickerValue = React.ComponentProps<typeof VideoTemplatePicker>["value"];
type PickerRecommended = VideoPickerValue["recommended"][number];
type RecommendedItem = PickerRecommended;

// ✅ 初期値（VideoTemplatePicker の value 型に一致させる）
const EMPTY_VIDEO_PICKER_VALUE = {
  selectedId: null,
  motion: null,
  recommended: [],
} satisfies React.ComponentProps<typeof VideoTemplatePicker>["value"];

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
const VIDEO_SIZE_OPTIONS: { id: UiVideoSize; label: string; sub: string }[] = [
  { id: "720x1280", label: "縦（Instagram / TikTok）", sub: "おすすめ" },
  { id: "960x960", label: "正方形（Instagram投稿）", sub: "おすすめ" }, // ← ここ修正
  { id: "1280x720", label: "横（YouTube / Web）", sub: "おすすめ" },
];


const DEFAULT_TEXT_OVERLAY: TextOverlay = {
  lines: [""],
  fontSize: 44,
  lineHeight: 1.15,
  x: 50,
  y: 80,
  color: "#FFFFFF",
  background: {
    enabled: true,
    padding: 18,
    color: "rgba(0,0,0,0.45)",
    radius: 16,
  },
};

const DEFAULT: DraftDoc = {
  userId: "", // ✅ 必須
  brand: "vento",
  phase: "draft",

  vision: "",
  keywordsText: "",
  memo: "",

  ig: "",
  x: "",
  ig3: [],

  baseImageUrl: undefined,
  bgImageUrl: undefined,
  bgImageUrls: [],

  aiImageUrl: undefined,
  compositeImageUrl: undefined,
  imageIdeaUrl: undefined,

  imageUrl: undefined,
  imageSource: "upload",

  images: { primary: null, materials: [] },

  textOverlayBySlot: { base: DEFAULT_TEXT_OVERLAY },


  videoSeconds: 5,
  videoQuality: "standard",
  videoSize: "720x1280",

  // ✅ 非AI系
  nonAiVideoUrl: undefined,
  nonAiVideoUrls: [],
  nonAiVideoPreset: undefined,

};
// =========================
// UI 定数
// =========================
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

// ✅ 文字入り描画の「描画元」を1箇所に集約（全員これを見る）
// - 仕様：文字入り（投稿用）は「元画像（baseImageUrl）」にだけ乗せる
// - 合成（動画用）は文字なし（aiImageUrl）として別管理する
function getOverlaySourceUrlForPreview(d: DraftDoc) {
  return d.baseImageUrl || "";
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


const PURPOSE_LABEL: Record<ImagePurpose, string> = {
  sales: "売上",
  branding: "世界観",
  trust: "信頼",
  story: "物語",
};
// ✅ Scene（背景の文脈）: 目的とは別軸。生活感をここで制御する
type BgScene = "studio" | "lifestyle" | "scale" | "detail";
const BG_SCENE_LABEL: Record<BgScene, string> = {
  studio: "スタジオ（無難）",
  lifestyle: "生活感（売れる文脈）",
  scale: "サイズ感（使用想像）",
  detail: "質感（近接）",
};

const [bgScene, setBgScene] = useState<BgScene>("studio");
const [staticPurpose, setStaticPurpose] = useState<ImagePurpose>("sales");
const [staticRecommendation, setStaticRecommendation] = useState<string>("");
const [staticVariants, setStaticVariants] = useState<StaticImageVariant[]>([]);
const [staticBusy, setStaticBusy] = useState(false);

  const router = useRouter();
  const sp = useSearchParams();
  const id = sp.get("id");

  const [uid, setUid] = useState<string | null>(null);
  // ===========================
// ✅ recommend / picker 系
// ===========================
const [recommendReason, setRecommendReason] = useState<string>("");
const [videoPickerValue, setVideoPickerValue] = useState<
  React.ComponentProps<typeof VideoTemplatePicker>["value"]
>(EMPTY_VIDEO_PICKER_VALUE);

const [recommendUserLocked, setRecommendUserLocked] = useState<boolean>(false);
const [recommendAutoEnabled, setRecommendAutoEnabled] = useState<boolean>(true);

// 仮実装（存在しないとTSが死ぬ）
async function applyTopRecommendation(arg: any) {
  const recommended = Array.isArray(arg?.recommended) ? arg.recommended : [];
  const force = !!arg?.force;

  if (!recommended.length) return;

  // ✅ 先頭を「トップ推奨」として扱う（フロントのみ）
  const top = recommended[0];

  // ✅ non-ai → 商品動画へ寄せて、非AI人格を自動選択
  if (top?.engine === "nonai") {
    setVideoTab("product");
    setNonAiPreset(
      {
        id: String(top.id || ""),
        motionCharacter: top.motionCharacter,
      } as any
    );
    if (typeof top?.reason === "string" && top.reason.trim()) {
      setNonAiReason(top.reason.trim());
    } else if (force) {
      setNonAiReason("");
    }
    return;
  }

  // ✅ runway → ブランドCMへ寄せる（Runwayの詳細は BrandCMPanel 側）
  if (top?.engine === "runway") {
    setVideoTab("cm");
    if (typeof top?.reason === "string" && top.reason.trim()) {
      showMsg(`推奨（ブランドCM）：${top.reason.trim()}`);
    } else if (force) {
      showMsg("推奨（ブランドCM）を適用しました");
    }
    return;
  }
}

// ===========================
// ✅ idToken
// ===========================
const [idToken, setIdToken] = useState<string>("");

// ===========================
// ✅ pricing
// ===========================
const [pricing, setPricing] = useState<PricingTable>(FALLBACK_PRICING);
const [pricingBusy, setPricingBusy] = useState<boolean>(false);
const [pricingError, setPricingError] = useState<string | null>(null);
const [pricingUpdatedAt, setPricingUpdatedAt] = useState<number>(0);

const [busy, setBusy] = useState(false);
const [loadBusy, setLoadBusy] = useState(true);

const [draftId, setDraftId] = useState<string | null>(id ?? null);

// ===========================
// ✅ stale draftId 対策：常に最新の draftId を参照する
// ===========================
const draftIdRef = useRef<string | null>(id ?? null);
useEffect(() => {
  draftIdRef.current = draftId;
}, [draftId]);

const [d, setD] = useState<DraftDoc>({ ...DEFAULT });

// ===========================
// ✅ stale closure 対策：常に最新の d を参照する（必須）
// ===========================
const dRef = useRef<DraftDoc>({ ...DEFAULT });
useEffect(() => {
  dRef.current = d;
}, [d]);

// ===========================
// TODO(分割): UIから判断/副作用を剥がす
// - useDraftController.ts: 状態と判断（唯一の脳）
// - draftRepo.ts: Firestore
// - storageRepo.ts: Storage
// - videoTask.ts: Runway task
// ※ 計画Aでは移動しない。UI追加だけ。
// ===========================
// ✅ Runwayに渡すサイズは必ず UiVideoSize（旧データは読み込み時に吸収）
const normalizeVideoSize = (s: any): UiVideoSize => {
  const v = String(s ?? "");

  // ✅ 正：3サイズ（backend と一致）
  if (v === "720x1280") return "720x1280";
  if (v === "1280x720") return "1280x720";
  if (v === "960x960") return "960x960";

  // ✅ 旧 → 新へ丸める
  if (v === "1024x1792") return "720x1280";
  if (v === "1792x1024") return "1280x720";

  // ✅ 旧正方形 → 現行正方形へ
  if (v === "1080x1080") return "960x960";
  if (v === "1024x1024") return "960x960";

  return "720x1280";
};
// ✅ 右カラムの表示タブ（大タブ）
type RightTab = "image" | "video";
const [rightTab, setRightTab] = useState<RightTab>("image");

// ✅ 動画タブ内の切替（商品 / CM）※ Firestoreに保存しない
type VideoTab = "product" | "cm";
const [videoTab, setVideoTab] = useState<VideoTab>("product");
type ImageSlot = "base" | "mood" | "composite";

// ✅ 文字入り「一時プレビュー」用（保存はしない）
const [overlayPreviewDataUrl, setOverlayPreviewDataUrl] = useState<string | null>(null);

// ✅ プレビュー表示モード（UI用：Firestore互換の imageSource とは分離）
type PreviewMode = "base" | "idea" | "composite";

// base = 元画像（+文字プレビュー可）
// idea = イメージ画像（世界観）
// composite = 合成（動画用・文字なし = aiImageUrl）
const [previewMode, setPreviewMode] = useState<PreviewMode>("base");

// ✅ 「現在プレビューしているスロット」を一意に決める（duplicate禁止）
const currentSlot: ImageSlot = useMemo(() => {
  if (previewMode === "base") return "base";
  if (previewMode === "idea") return "mood";
  return "composite";
}, [previewMode]);

  // ✅ 押せない/表示できない時の「その場に1行理由」（モーダル/alert禁止）
  const [previewReason, setPreviewReason] = useState<string>("");

  // ✅ 画面内メッセージ（alert/confirm禁止の置換先）
  const [uiMsg, setUiMsg] = useState<string>("");

  function showMsg(s: string) {
    setUiMsg(s);
  }

  // canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
const [videoHistory, setVideoHistory] = useState<string[]>([]);
const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);

// ===========================
// ✅ 非AI専用 state（不足していた定義）
// ===========================
const [nonAiVideoPreviewUrl, setNonAiVideoPreviewUrl] = useState<string | null>(null);
const [nonAiVideoHistory, setNonAiVideoHistory] = useState<string[]>([]);
const [nonAiPreset, setNonAiPreset] =
  useState<NonNullable<DraftDoc["nonAiVideoPreset"]> | null>(null);
const [nonAiReason, setNonAiReason] = useState<string>("");
const [nonAiBusy, setNonAiBusy] = useState<boolean>(false);

// ✅ 文字焼き込み用
const [burnReason, setBurnReason] = useState<string>("");
const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
   // ✅ 背景生成の busy ※重複宣言禁止
  const [bgBusy, setBgBusy] = useState(false);
  // ✅ inFlight ※重複宣言禁止
  const inFlightRef = useRef<Record<string, boolean>>({});
// ✅ Runway polling / task check は BrandCMPanel 側に隔離（page.tsx には置かない）

  // ===========================
  // OWNER 表示制御（制作者だけに見せる）
  // ===========================
  // - NEXT_PUBLIC_OWNER_UID が一致する時だけ「OpenAI/Runway 表示」を出す
  // - 制作者以外は見えない（価格は見せてもOKだが、ここは要件通り“どのAIか”を隠す）
  const OWNER_UID = (process.env.NEXT_PUBLIC_OWNER_UID || "").trim();
  const isOwner = !!uid && !!OWNER_UID && uid === OWNER_UID;
  // ↑↑ここまで追加↑↑

  // ===========================
  // ✅ missing functions（この3つが無いとTSが死ぬ）
  // ===========================

  // 1) 画像アップロード（複数）
  // - 先頭1枚：baseImageUrl（投稿用の元画像）
  // - 2枚目以降：d.images.materials に追加（素材）
  // - Firestore：baseImageUrl と images を保存
  async function onUploadImageFiles(files: FileList | File[]) {
    if (!uid) return;

    const list = Array.from(files || []).filter(Boolean);
    if (list.length === 0) return;

    if (inFlightRef.current["upload"]) return;
    inFlightRef.current["upload"] = true;

    setBusy(true);
    try {
      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) throw new Error("failed to create draft");

      // ✅ 1枚ずつ順にアップロード（順序を崩さない）
      const uploadedUrls: string[] = [];
      for (const f of list) {
        const url = await uploadImageFileAsJpegToStorage(uid, ensuredDraftId, f);
        if (url) uploadedUrls.push(url);
      }

      if (uploadedUrls.length === 0) {
        throw new Error("画像のアップロードに失敗しました");
      }

      const first = uploadedUrls[0];          // ✅ 先頭を元画像へ
      const rest = uploadedUrls.slice(1);     // ✅ 残りを素材へ

      // ✅ 現在の materials を取得（重複排除しつつ先頭に追加）
      const curMaterials = Array.isArray(dRef.current.images?.materials) ? dRef.current.images!.materials : [];
      const nextMaterials = uniqKeepOrder([...rest, ...curMaterials], 20);

      // ✅ Draft state 更新
      setD((p: DraftDoc) => ({
        ...p,
        baseImageUrl: first ?? p.baseImageUrl,
        imageSource: "upload",
        images: {
          ...(p.images ?? { primary: null, materials: [] }),
          // primary は「UI上の代表」を持ちたい場合に使えるが、今回は触らない（事故防止）
          materials: nextMaterials,
        },
      }));

      // ✅ 空表示事故防止：元画像が入ったら必ず base に寄せる
      setPreviewMode("base");
      setPreviewReason("");

      // ✅ Firestore 保存（base + images）
      await saveDraft({
        baseImageUrl: first,
        imageSource: "upload",
        phase: "draft",
        images: {
          ...(dRef.current.images ?? { primary: null, materials: [] }),
          materials: nextMaterials,
        },
      });

      showMsg(`元画像+素材を保存しました（${uploadedUrls.length}枚 / JPEG変換）`);
    } catch (e: any) {
      console.error(e);
      showMsg(`画像アップロードに失敗しました：${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["upload"] = false;
    }
  }
  // 2) おすすめ（動画プリセット取得）
  async function fetchRecommendPresets() {
    const key = "recommendPresets";
    if (inFlightRef.current[key]) {
      setRecommendReason("おすすめ取得はすでに実行中です");
      return;
    }
    inFlightRef.current[key] = true;

    setRecommendReason("");
    try {
      const vision = (dRef.current.vision || "").trim();
      if (!vision) {
        setRecommendReason("おすすめは使えません：Vision（必須）が空です");
        return;
      }

      // ✅ /api/recommend-video が期待してる形に合わせる
      const body = {
        brand: {
          vision,
          voice: (dRef.current.voice || "").trim(),
          ban: (dRef.current.ban || "").trim(),
          must: (dRef.current.must || "").trim(),
        },
        context: {
          purpose: (dRef.current.purpose || "").trim(),
          platform: (dRef.current.platform || "").trim(),
          keywords: splitKeywords(dRef.current.keywordsText),
        },
      };

      // ✅ ここ：/api/recommend-video に統一
      const r = await fetch("/api/recommend-video", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg =
          (typeof j?.error === "string" && j.error) ||
          (typeof j?.message === "string" && j.message) ||
          `recommend api error (status=${r.status})`;
        throw new Error(msg);
      }

      const raw = Array.isArray(j?.recommendedVideos) ? j.recommendedVideos : [];

      const normalized = raw
        .map((x: any) => {
          const id = typeof x?.id === "string" ? x.id : "";
          if (!id) return null;

const engine: "nonai" | "runway" =
  String(x?.engine).toLowerCase() === "runway"
    ? "runway"
    : "nonai";

          const mc = x?.motionCharacter ?? null;

          const motionCharacter =
            mc &&
            typeof mc === "object" &&
            typeof mc.tempo === "string" &&
            typeof mc.reveal === "string" &&
            typeof mc.intensity === "string" &&
            typeof mc.attitude === "string" &&
            typeof mc.rhythm === "string"
              ? mc
              : null;

          if (!motionCharacter) return null;

          const reason = typeof x?.reason === "string" ? x.reason.trim() : "";

          return { id, engine, motionCharacter, reason };
        })
        .filter(Boolean) as {
        id: string;
        engine: "non-ai" | "runway";
        motionCharacter: MotionCharacter;
        reason: string;
      }[];

      if (!normalized.length) {
        setRecommendReason("おすすめがありません（Vision/Keywords/ブランドを見直すか、手動で選んでください）");
        setVideoPickerValue((prev) => ({ ...prev, recommended: [] }));
        return;
      }

      setVideoPickerValue((prev) => ({ ...prev, recommended: normalized as any }));

      // ✅ ここ：必ず normalized を渡す（今まで空配列で死んでた）
      await applyTopRecommendation({ force: false, recommended: normalized });
    } catch (e: any) {
      console.error(e);
      setRecommendReason(`おすすめ取得に失敗：${e?.message || "不明"}`);
    } finally {
      inFlightRef.current[key] = false;
    }
  }
// ===========================
// ✅ recommended が更新されたら「1位を自動確定」
// - ただし「ユーザーが手動で選んだ後」は上書きしない
// - rightTab が video の時だけに限定（事故防止）
// ===========================
useEffect(() => {
  if (rightTab !== "video") return;

  const rec = Array.isArray(videoPickerValue?.recommended) ? videoPickerValue.recommended : [];
  if (!rec.length) return;

  // ✅ 「おすすめが来た」ことだけ表示（確定は fetch 内でやる）
  if (!recommendUserLocked && recommendAutoEnabled) {
    setRecommendReason(`おすすめがあります：${rec.length}件（1位を自動確定します）`);
  } else {
    setRecommendReason(`おすすめがあります：${rec.length}件（手動選択が優先されています）`);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [rightTab, videoPickerValue?.recommended, recommendUserLocked, recommendAutoEnabled]);

// ✅ ログイン中ユーザーからトークンを取る（ログインしてるなら必ず取れる）
useEffect(() => {
  let cancelled = false;

  async function loadToken() {
    try {
      // auth はこのページ内ですでに使ってる前提（import済みのはず）
      const user = auth.currentUser;

      if (!user) {
        if (!cancelled) {
          setIdToken("");
          setRecommendReason("おすすめは使えません：ログイン確認中です");
        }
        return;
      }

      // ✅ Firebaseの“合言葉”を取得
      const token = await user.getIdToken();

      if (!cancelled) {
        setIdToken(token);
        setRecommendReason(""); // 取れたら理由を消す
      }
    } catch (e) {
      if (!cancelled) {
        setIdToken("");
        setRecommendReason("おすすめは使えません：合言葉の取得に失敗しました");
      }
    }
  }

  void loadToken();
  return () => {
    cancelled = true;
  };
}, [uid]); // uidが変わったら取り直す（ログイン/ログアウト想定）







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

// ===========================
// ✅ Static Variants（静止画構図おすすめ）
// - JSX内に貼ると崩壊するので、必ず NewDraftPage() 内の関数エリアに置く
// ===========================
async function generateStaticVariants() {
  if (!idToken) {
    showMsg("おすすめ生成できません：IDトークンがありません（ログイン確認中）");
    return;
  }

  setStaticBusy(true);

  try {
    const res = await fetch("/api/generate-static-variants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        vision: dRef.current.vision,         // ✅ stale回避：d ではなく dRef
        keywords: dRef.current.keywordsText, // ✅ stale回避
        purpose: staticPurpose,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showMsg(data?.error || "生成失敗");
      return;
    }

    setStaticRecommendation(data?.recommendation || "");
    setStaticVariants(Array.isArray(data?.variants) ? data.variants : []);

    // DraftDocへ保存（既存saveDraft統合）
    setD((p) => ({
      ...p,
      imagePurpose: staticPurpose,
      staticImageVariants: Array.isArray(data?.variants) ? data.variants : [],
    }));

    await saveDraft({
      imagePurpose: staticPurpose,
      staticImageVariants: Array.isArray(data?.variants) ? data.variants : [],
    });
  } finally {
    setStaticBusy(false);
  }
}

async function selectStaticVariant(v: StaticImageVariant) {
  if (!v?.id) {
    showMsg("構図が不正です");
    return;
  }

  if (!v.prompt || !v.prompt.trim()) {
    showMsg("この構図にはプロンプトがありません");
    return;
  }

  const log: StaticImageLog = {
    purpose: staticPurpose,
    selectedVariantId: v.id,
    timestamp: Date.now(),
  };

  const nextLogs = [
    ...(dRef.current.staticImageLogs || []),
    log,
  ];

  // ✅ state更新（UI即反映）
  setD((prev) => ({
    ...prev,
    staticImageLogs: nextLogs,
    selectedStaticVariantId: v.id,
    selectedStaticPrompt: v.prompt,
  }));

  try {
    // ✅ Firestore保存
    await saveDraft({
      staticImageLogs: nextLogs,
      selectedStaticVariantId: v.id,
      selectedStaticPrompt: v.prompt,
    });

    showMsg(`構図 ${v.id} を採用しました`);
  } catch (e: any) {
    console.error(e);
    showMsg("構図の保存に失敗しました");
  }
}
async function renderToCanvasAndGetDataUrlSilent(): Promise<string | null> {
  const cur = dRef.current;

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

  // ✅ 仕様確定：文字入りは「投稿用の静止画」
  // ✅ 描画元を1箇所に集約（全員これを見る）
  const src = getOverlaySourceUrlForPreview(cur); // ★ d → cur
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

// ✅ 計画E：現在スロットの文字設定を取得（なければ null）
  const slotOverlay = (cur.textOverlayBySlot?.[currentSlot] ?? null) as
    | TextOverlay
    | null;

  // ✅ 計画E：スロットごとの ON/OFF は「textが1文字以上あるか」で判定（enabledフィールドは持たない）
  const overlayText = Array.isArray(slotOverlay?.lines)
    ? slotOverlay!.lines.join("\n").trim()
    : "";

  if (overlayText) {
    const fontPx = Math.max(10, Math.round(slotOverlay?.fontSize ?? 64));
    const lineH = Math.max(10, Math.round((slotOverlay?.lineHeight ?? 1.25) * fontPx));

    ctx.font = `900 ${fontPx}px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
    ctx.textBaseline = "top";

    const maxWidth = Math.floor(SIZE * 0.86);

    // ✅ lines が無い/空の時は overlayText を自動改行して lines を作る
    const rawLines =
      Array.isArray(slotOverlay?.lines) && slotOverlay!.lines.length
        ? slotOverlay!.lines.map((s) => String(s ?? ""))
        : overlayText.split("\n");

    const fixedLines: string[] = [];
    for (const ln0 of rawLines) {
      let buf = "";
      for (const ch of ln0) {
        const t = buf + ch;
        if (ctx.measureText(t).width <= maxWidth) buf = t;
        else {
          if (buf) fixedLines.push(buf);
          buf = ch;
        }
      }
      if (buf) fixedLines.push(buf);
    }

    const blockH = fixedLines.length * lineH;

    const yRaw = typeof slotOverlay?.y === "number" ? slotOverlay.y : 0;
    // x/y は 0..1 を想定（TextOverlay定義に従う）。もし 0..100 が来ても丸めて吸収。
    const y01 = yRaw > 1 ? clamp(yRaw / 100, 0, 1) : clamp(yRaw, 0, 1);
    const topY = Math.round((SIZE - blockH) * y01);

    const pad = Math.round(SIZE * 0.035);

    const bg = slotOverlay?.background;
    if (bg?.enabled) {
      ctx.fillStyle = bg.color || "rgba(0,0,0,0.45)";
      const rectY = Math.max(0, topY - Math.round(pad * 0.6));
      const rectH = Math.min(SIZE - rectY, blockH + Math.round(pad * 1.2));
      ctx.fillRect(0, rectY, SIZE, rectH);
    }

    ctx.fillStyle = slotOverlay?.color || "rgba(255,255,255,0.95)";
    for (let i = 0; i < fixedLines.length; i++) {
      const ln = fixedLines[i];
      const textW = ctx.measureText(ln).width;

      const xRaw = typeof slotOverlay?.x === "number" ? slotOverlay.x : 0.5;
      const x01 = xRaw > 1 ? clamp(xRaw / 100, 0, 1) : clamp(xRaw, 0, 1);
      const tx = Math.round((SIZE - textW) * x01);

      const ty = topY + i * lineH;
      ctx.fillText(ln, tx, ty);
    }
  }

  return canvas.toDataURL("image/png");
}

useEffect(() => {
  let cancelled = false;

  // ✅ 計画E：現在スロットの文字設定
  const slot = currentSlot;
  const o = (d.textOverlayBySlot?.[slot] ?? null) as TextOverlay | null;

  const text =
    Array.isArray(o?.lines) ? o!.lines.join("\n").trim() : "";

  if (!text) {
    setOverlayPreviewDataUrl(null);
    return;
  }

  // ✅ 文字入りプレビューの描画元は「baseスロットのみ」運用のままならここで制限
  //    （もし“現在スロットの画像”に文字を乗せたいなら、この src を slot で分岐させる）
  const srcForOverlay = getOverlaySourceUrlForPreview(d);
  if (!srcForOverlay) {
    setOverlayPreviewDataUrl(null);
    return;
  }

  const t = setTimeout(async () => {
    const out = await renderToCanvasAndGetDataUrlSilent();
    if (!cancelled) setOverlayPreviewDataUrl(out);
  }, 150);

  return () => {
    cancelled = true;
    clearTimeout(t);
  };
}, [
  currentSlot,
  d.textOverlayBySlot,
  d.baseImageUrl,
]); 
 useEffect(() => {
    if (!uid) return;

        // ✅ 下書き切替時：右側の「動画表示残留」を全消し（別下書きの動画が出る事故防止）
    setSelectedVideoUrl(null);
    setVideoPreviewUrl(null);
    setVideoHistory([]);
    setUiMsg("");
    setPreviewReason("");
        // ✅ 計画A：非AI側の残留も消す（別下書き事故防止）
    setNonAiReason("");
    setNonAiPreset(null);
    setNonAiVideoPreviewUrl(null);
    setNonAiVideoHistory([]);

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

// ✅ ③-3) 既存Draftの正規化（移行の本丸）
const normalized = normalizeDraftImages(data);

function classifyUrl(u?: string) {
  if (!u) return "none" as const;
  if (u.includes("/users%2F") === false) return "other" as const;

  // decode不要でも contains でだいたい判定できる
  if (u.includes("/generations%2Fimages%2F")) return "idea" as const;
  if (u.includes("/drafts%2F_bg%2F")) return "bg" as const;
  if (u.includes("/drafts%2F") && u.includes("%2Fvideos%2F")) return "video" as const;
  if (u.includes("/drafts%2F") && u.match(/\.jpg|\.jpeg/i)) return "base" as const;
  if (u.includes("/drafts%2F") && u.match(/\.png/i)) return "draftPng" as const;
  return "other" as const;
}

// ⬇⬇⬇ 既存の setD 呼び出しは「data」ではなく normalized を使う
setD({
  ...normalized,
  userId: uid,
});
setDraftId(id);

// ---- getDoc直後のdataから取り出した後に ----
let baseImageUrl = typeof data.baseImageUrl === "string" ? data.baseImageUrl : undefined;
let aiImageUrl   = typeof data.aiImageUrl === "string" ? data.aiImageUrl : undefined;
let imageIdeaUrl = typeof data.imageIdeaUrl === "string" ? data.imageIdeaUrl : undefined;
let bgImageUrlSingle = typeof data.bgImageUrl === "string" ? data.bgImageUrl : undefined;
let compositeImageUrl = typeof data.compositeImageUrl === "string" ? data.compositeImageUrl : undefined;

// 旧データ吸収：aiImageUrl が idea っぽいのに imageIdeaUrl が空 → 移す
if (!imageIdeaUrl && classifyUrl(aiImageUrl) === "idea") {
  imageIdeaUrl = aiImageUrl;
  aiImageUrl = undefined; // ④を空にして事故を止める（必要なら別フィールドに退避でもOK）
}

// 旧データ吸収：imageUrl が背景っぽいのに bg が空 → 補完
const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : undefined;
if (!bgImageUrlSingle && classifyUrl(imageUrl) === "bg") {
  bgImageUrlSingle = imageUrl;
}

// 旧データ吸収：base が無いのに imageUrl がjpg（下書き内） → base補完
if (!baseImageUrl && classifyUrl(imageUrl) === "base") {
  baseImageUrl = imageUrl;
}

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


// ===========================
// ✅ 互換吸収（読み取りだけ）：旧 product Runway（videoUrl/videoUrls）が残ってる下書きは、nonAi が空の時だけ nonAi に一時補完（書き戻し禁止）
// ✅ 最終状態：Firestoreの更新で productのRunwayフィールドは増えない／更新されない、CMだけRunwayが動く（cmVideoはBrandCMPanel側）
// ===========================

        const bgImageUrls: string[] = Array.isArray(data.bgImageUrls)
          ? data.bgImageUrls.filter((v: any) => typeof v === "string").slice(0, 10)
          : [];

        // ✅ 旧 product Runway（読み取り互換用：表示補完の材料にするだけ。stateへ保持はしない）
        const legacyVideoUrls: string[] = Array.isArray(data.videoUrls)
          ? data.videoUrls.filter((v: any) => typeof v === "string").slice(0, 10)
          : [];

        const legacyVideoUrl =
          typeof data.videoUrl === "string" && data.videoUrl ? data.videoUrl : undefined;

        // ✅ 計画A：非AI動画の復元（互換を壊さない）
        const nonAiVideoUrls0: string[] = Array.isArray(data.nonAiVideoUrls)
          ? data.nonAiVideoUrls.filter((v: any) => typeof v === "string").slice(0, 10)
          : [];

        const nonAiVideoUrl0 =
          typeof data.nonAiVideoUrl === "string" && data.nonAiVideoUrl ? data.nonAiVideoUrl : undefined;

        // ✅ 旧 product Runway 互換吸収（読み取りだけ）
        // - nonAi が空の時だけ legacy を nonAi に一時補完（表示のため）
        // - 書き戻し（saveDraft）では絶対に保存しない
        const legacyHead =
          (String(nonAiVideoUrl0 ?? "").trim())
            ? String(nonAiVideoUrl0 ?? "").trim()
            : (String(legacyVideoUrl ?? "").trim() ? String(legacyVideoUrl ?? "").trim() : "");

        const legacyList = legacyVideoUrls;

        const nonAiVideoUrls: string[] =
          (Array.isArray(nonAiVideoUrls0) && nonAiVideoUrls0.length)
            ? nonAiVideoUrls0
            : (Array.isArray(legacyList) && legacyList.length ? legacyList : []);

        const nonAiVideoUrl: string | undefined =
          (String(nonAiVideoUrl0 ?? "").trim())
            ? nonAiVideoUrl0
            : (legacyHead ? legacyHead : (nonAiVideoUrls.length ? nonAiVideoUrls[0] : undefined));

        // ✅ videoSource は nonai だけ（productは非AI専用運用）
        // ※ 旧 runwaysource が来ても page 側では採用しない
        const videoSource: DraftDoc["videoSource"] =
          (data.videoSource === "nonai" ? "nonai" : undefined) ?? (nonAiVideoUrl ? "nonai" : undefined);

        const nonAiVideoPreset: DraftDoc["nonAiVideoPreset"] =
          data && typeof data.nonAiVideoPreset === "object" && data.nonAiVideoPreset
            ? {
                id: String(data.nonAiVideoPreset.id ?? ""),
                major: String(data.nonAiVideoPreset.major ?? ""),
                middle: String(data.nonAiVideoPreset.middle ?? ""),
                minor: String(data.nonAiVideoPreset.minor ?? ""),
                tempo: (data.nonAiVideoPreset.tempo === "slow" || data.nonAiVideoPreset.tempo === "normal" || data.nonAiVideoPreset.tempo === "sharp")
                  ? data.nonAiVideoPreset.tempo
                  : "normal",
                reveal: (data.nonAiVideoPreset.reveal === "early" || data.nonAiVideoPreset.reveal === "delayed" || data.nonAiVideoPreset.reveal === "last")
                  ? data.nonAiVideoPreset.reveal
                  : "early",
                intensity: (data.nonAiVideoPreset.intensity === "calm" || data.nonAiVideoPreset.intensity === "balanced" || data.nonAiVideoPreset.intensity === "strong")
                  ? data.nonAiVideoPreset.intensity
                  : "balanced",
                attitude: (data.nonAiVideoPreset.attitude === "humble" || data.nonAiVideoPreset.attitude === "neutral" || data.nonAiVideoPreset.attitude === "assertive")
                  ? data.nonAiVideoPreset.attitude
                  : "neutral",
                rhythm: (data.nonAiVideoPreset.rhythm === "with_pause" || data.nonAiVideoPreset.rhythm === "continuous")
                  ? data.nonAiVideoPreset.rhythm
                  : "continuous",
              }
            : undefined;

        const overlayEnabled = typeof data.overlayEnabled === "boolean" ? data.overlayEnabled : true;
        const overlayText = typeof data.overlayText === "string" ? data.overlayText : ig || "";
        const overlayFontScale =
          typeof data.overlayFontScale === "number" ? clamp(data.overlayFontScale, 0.6, 1.6) : 1.0;
        const overlayY = typeof data.overlayY === "number" ? clamp(data.overlayY, 0, 100) : 75;
        const overlayBgOpacity =
          typeof data.overlayBgOpacity === "number" ? clamp(data.overlayBgOpacity, 0, 0.85) : 0.45;

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

  // ✅ images を必ず補完（旧データ互換）
  images: data.images ?? {
    primary:
      baseImageUrl
        ? {
            id: "legacy-primary",
            url: baseImageUrl,
            createdAt: Date.now(),
            role: "product",
          }
        : null,
    materials: [],
  },

  // ✅ 計画E：文字編集スロット（旧データ互換）
  textOverlayBySlot: data.textOverlayBySlot ?? {
    base: undefined,
    mood: undefined,
    composite: undefined,
  },

  bgImageUrls,

  // ✅ product は nonAi のみ（legacy runway は state に保持しない）
  nonAiVideoUrl,
  nonAiVideoUrls,
  nonAiVideoPreset,
  videoSource,

  updatedAt: data.updatedAt,
  createdAt: data.createdAt,
});

// ✅ 初期プレビュー：空表示を絶対に作らない（仕様厳守）
if (baseImageUrl) setPreviewMode("base");
else if (imageIdeaUrl) setPreviewMode("idea");
else if (aiImageUrl) setPreviewMode("composite");
else setPreviewMode("base");

// ===========================
// - product Runway（videoUrl/videoUrls）は読み取りだけ互換吸収（nonAiが空の時だけ一時補完）
// - 書き戻しはしない（setDもsaveDraftも触らない）
// - videoPreviewUrl / setVideoPreviewUrl は product から完全撤去
// ===========================

// ✅ 背景プレビュー復元：Firestore単発(bgImageUrl)を最優先 → 無ければ履歴1件目
const initialBg = bgImageUrlSingle ?? (bgImageUrls.length ? bgImageUrls[0] : null);

// ✅ 別下書きへ切替時に「前のstate」が残ると事故るので、必ず上書きする
setBgImageUrl(initialBg);

// ✅ 計画A：非AI動画のプレビュー復元（空表示防止）
setNonAiPreset(nonAiVideoPreset ? nonAiVideoPreset : null);

// ✅ picker には selectedId だけ復元（motionはnullでOK）
setVideoPickerValue(
  nonAiVideoPreset
    ? {
        selectedId: nonAiVideoPreset.id,
        // ✅ MotionCharacter に存在する属性だけ渡す（id/major/middle/minor を渡さない）
        motion: {
          tempo: nonAiVideoPreset.tempo,
          reveal: nonAiVideoPreset.reveal,
          intensity: nonAiVideoPreset.intensity,
          attitude: nonAiVideoPreset.attitude,
          rhythm: nonAiVideoPreset.rhythm,
        },
        // ✅ never[] 推論を避ける
        recommended: EMPTY_VIDEO_PICKER_VALUE.recommended,
      }
    : EMPTY_VIDEO_PICKER_VALUE
);

// ✅ 非AI履歴（Firestore）
setNonAiVideoHistory(nonAiVideoUrls);

// ✅ product旧互換吸収：旧 Runway（videoUrl/videoUrls）が残ってる下書きは、nonAiが空の時だけ nonAiプレビューへ一時補完（書き戻し禁止）
const legacyRunwayHead = (() => {
  const a: string[] = [];
  const v0 = typeof (data as any)?.videoUrl === "string" ? String((data as any).videoUrl || "").trim() : "";
  if (v0) a.push(v0);
  const vs = Array.isArray((data as any)?.videoUrls)
    ? (data as any).videoUrls.filter((v: any) => typeof v === "string").map((v: any) => String(v || "").trim()).filter(Boolean)
    : [];
  if (vs.length) a.push(...vs);
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const u of a) {
    const s = String(u || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    uniq.push(s);
  }
  return uniq.length ? uniq[0] : "";
})();

if (nonAiVideoUrl) setNonAiVideoPreviewUrl(nonAiVideoUrl);
else if (nonAiVideoUrls.length) setNonAiVideoPreviewUrl(nonAiVideoUrls[0]);
else if (legacyRunwayHead) setNonAiVideoPreviewUrl(legacyRunwayHead);
else setNonAiVideoPreviewUrl(null);

// ✅ 「選択中」も同様に補完（表示だけ）
if (!selectedVideoUrl) {
  const head =
    (String(nonAiVideoUrl ?? "").trim()) ||
    (nonAiVideoUrls.length ? String(nonAiVideoUrls[0] ?? "").trim() : "") ||
    (legacyRunwayHead ? legacyRunwayHead : "");
  if (head) setSelectedVideoUrl(head);
}
      } finally {
        setLoadBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, id]);

// ✅ previewMode が成立している時だけ、理由表示を自動で消す（render中setState禁止）
useEffect(() => {
  const ok =
    (previewMode === "base" && !!d.baseImageUrl) ||
    (previewMode === "idea" && !!d.imageIdeaUrl) ||
    (previewMode === "composite" && !!d.aiImageUrl);

  if (ok && previewReason) setPreviewReason("");
}, [previewMode, d.baseImageUrl, d.imageIdeaUrl, d.aiImageUrl, previewReason]);

const brandLabel = d.brand === "vento" ? "VENTO" : "RIVA";
const phaseLabel = d.phase === "draft" ? "下書き" : d.phase === "ready" ? "投稿待ち" : "投稿済み";
const vision = (d.vision ?? "").trim();
const canGenerate = vision.length > 0 && !busy;

const baseForEditUrl = useMemo(() => {
  if (d.imageSource === "ai") return d.aiImageUrl || d.baseImageUrl || "";
  if (d.imageSource === "upload") return d.baseImageUrl || d.aiImageUrl || "";
  return d.baseImageUrl || d.aiImageUrl || "";
}, [d.imageSource, d.baseImageUrl, d.aiImageUrl]);

const displayImageUrl = useMemo(() => {
  if (previewMode === "composite") {
    return d.aiImageUrl || "";
  }
  if (previewMode === "idea") {
    return d.imageIdeaUrl || "";
  }
  return overlayPreviewDataUrl || d.baseImageUrl || "";
}, [previewMode, overlayPreviewDataUrl, d.aiImageUrl, d.baseImageUrl, d.imageIdeaUrl]);
// ✅ 表示する動画URL（非AI専用）
// 優先：選択中 → 非AIプレビュー → 代表 → 履歴
const displayVideoUrl = useMemo(() => {
  const u =
    selectedVideoUrl ||
    nonAiVideoPreviewUrl ||
    d.nonAiVideoUrl ||
    (nonAiVideoHistory.length ? nonAiVideoHistory[0] : "") ||
    ((d.nonAiVideoUrls?.length ?? 0) > 0 ? d.nonAiVideoUrls![0] : "");

  const s = (u ?? "").trim();
  return s ? s : "";
}, [
  selectedVideoUrl,
  nonAiVideoPreviewUrl,
  d.nonAiVideoUrl,
  d.nonAiVideoUrls,
  nonAiVideoHistory,
]);
// ✅ 候補一覧（複数動画）
// 優先：非AI → 選択中 → プレビュー → 代表 → 履歴 → Firestore配列
const videoCandidates = useMemo(() => {
  const arr: string[] = [];

  if (typeof d.nonAiVideoUrl === "string" && d.nonAiVideoUrl) arr.push(d.nonAiVideoUrl);
  if (typeof selectedVideoUrl === "string" && selectedVideoUrl) arr.push(selectedVideoUrl);
  if (typeof nonAiVideoPreviewUrl === "string" && nonAiVideoPreviewUrl) arr.push(nonAiVideoPreviewUrl);

  if (Array.isArray(nonAiVideoHistory)) arr.push(...nonAiVideoHistory);
  if (Array.isArray(d.nonAiVideoUrls)) arr.push(...d.nonAiVideoUrls);

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const u of arr) {
    const s = String(u ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    uniq.push(s);
  }
  return uniq.slice(0, 12);
}, [d.nonAiVideoUrl, d.nonAiVideoUrls, selectedVideoUrl, nonAiVideoPreviewUrl, nonAiVideoHistory]);
const videoCandidatesTop3 = useMemo(() => {
  const arr: string[] = [];

  // ✅ 非AIのみ：代表 → 選択 → プレビュー
  if (typeof d.nonAiVideoUrl === "string" && d.nonAiVideoUrl) arr.push(d.nonAiVideoUrl);
  if (typeof selectedVideoUrl === "string" && selectedVideoUrl) arr.push(selectedVideoUrl);
  if (typeof nonAiVideoPreviewUrl === "string" && nonAiVideoPreviewUrl) arr.push(nonAiVideoPreviewUrl);

  // ✅ 非AIのみ：履歴（UI state）
  if (Array.isArray(nonAiVideoHistory)) arr.push(...nonAiVideoHistory);

  // ✅ 非AIのみ：Firestore配列
  if (Array.isArray(d.nonAiVideoUrls)) arr.push(...d.nonAiVideoUrls);

  // ✅ trim + 重複排除 + 最大3件
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const u of arr) {
    const s = String(u ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    uniq.push(s);
    if (uniq.length >= 3) break;
  }

  return uniq;
}, [
  d.nonAiVideoUrl,
  d.nonAiVideoUrls,
  selectedVideoUrl,
  nonAiVideoPreviewUrl,
  nonAiVideoHistory,
]);

// ✅ 動画タブ：選択が空なら「代表(d.videoUrl) → 履歴先頭」に寄せる（空表示防止）
useEffect(() => {
  // 動画タブ かつ 商品動画タブ の時だけ
  if (rightTab !== "video") return;
  if (videoTab !== "product") return;

  const head =
    (String(d.nonAiVideoUrl ?? "").trim()) ||
    (Array.isArray(d.nonAiVideoUrls) && d.nonAiVideoUrls.length ? String(d.nonAiVideoUrls[0] ?? "").trim() : "");

  if (!head) return;

  if (!selectedVideoUrl) setSelectedVideoUrl(head);
  if (!nonAiVideoPreviewUrl) setNonAiVideoPreviewUrl(head);
}, [
  rightTab,
  videoTab,
  d.nonAiVideoUrl,
  d.nonAiVideoUrls,
  selectedVideoUrl,
  nonAiVideoPreviewUrl,
]);
// ✅ 背景の表示は state 優先 → Firestore(d.bgImageUrl) → Firestore(d.bgImageUrls[0]) にフォールバック
const bgDisplayUrl =
  bgImageUrl ||
  d.bgImageUrl ||
  (Array.isArray(d.bgImageUrls) ? d.bgImageUrls[0] : "") ||
  "";

// ✅ 計画E：スロット文字（TextOverlay）を“必ず型に沿って”作る
function ensureSlotOverlay(
  base: DraftDoc,
  slot: ImageSlot,
  patch?: Partial<TextOverlay>
): DraftDoc["textOverlayBySlot"] {
  const cur = base.textOverlayBySlot?.[slot];
  const next: TextOverlay = {
    lines: Array.isArray(cur?.lines) ? cur!.lines : [],
    fontSize: typeof cur?.fontSize === "number" ? cur!.fontSize : 64,
    lineHeight: typeof cur?.lineHeight === "number" ? cur!.lineHeight : 1.25,
    x: typeof cur?.x === "number" ? cur!.x : 0.5,
    y: typeof cur?.y === "number" ? cur!.y : 0.75,
    color: typeof cur?.color === "string" ? cur!.color : "rgba(255,255,255,0.95)",
    background:
      cur?.background
        ? {
            enabled: !!cur.background.enabled,
            padding: typeof cur.background.padding === "number" ? cur.background.padding : 24,
            color: typeof cur.background.color === "string" ? cur.background.color : "rgba(0,0,0,0.45)",
            radius: typeof cur.background.radius === "number" ? cur.background.radius : 18,
          }
        : {
            enabled: true,
            padding: 24,
            color: "rgba(0,0,0,0.45)",
            radius: 18,
          },
    ...(patch ?? {}),
  };

  return {
    ...(base.textOverlayBySlot ?? {}),
    [slot]: next,
  };
}
const burnSrc = String(d.nonAiVideoUrl || "").trim();

useEffect(() => {
  if (!burnSrc) {
    setBurnReason("焼き込みできません：非AI動画がありません（先に商品動画を作成してください）");
  }
}, [burnSrc]);
// ===========================
// ✅ 非AI専用：文字焼き込み
// - 入力動画：nonAiVideoUrl（Runway箱に触らない）
// - 出力：nonAiVideoUrl を焼き込み版に差し替え、履歴へ積む
// ===========================
async function burnVideo() {
  const src = String(d.nonAiVideoUrl || "").trim();
  if (!src) {
    setBurnReason("非AI動画がありません（先に非AI動画を生成/保存してください）");
    return;
  }

  // ✅ 文字：現在スロット → base → composite の順で拾う（事故防止）
  const pickOverlay = () => {
    const slots = [currentSlot, "base", "composite"] as const;
    for (const s of slots) {
      const ov = dRef.current.textOverlayBySlot?.[s];
      const text = (ov?.lines ?? []).join("\n").trim();
      if (ov && text.length) return ov;
    }
    return null;
  };

  const overlay = pickOverlay();
  if (!overlay) {
    setBurnReason("文字がありません（①で文字をONにして入力してください）");
    return;
  }

  const ensuredDraftId = draftId ?? (await saveDraft());
  if (!ensuredDraftId) {
    setBurnReason("draftId がありません（先に保存してください）");
    return;
  }

  setBurnReason("");

  const res = await fetch("/api/burn-text-video", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      draftId: ensuredDraftId,
      videoUrl: src, // ✅ 非AI動画だけ
      overlay,
      size: d.videoSize ?? "720x1280",
    }),
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    setBurnReason(j?.error || j?.message || "動画の文字焼き込みに失敗しました");
    return;
  }

  const burned = String(j?.videoBurnedUrl || "");
  if (!burned) {
    setBurnReason("videoBurnedUrl が取得できません");
    return;
  }

  // ✅ 履歴（重複排除＋最大10）
  const cur = Array.isArray(dRef.current.nonAiVideoUrls) ? dRef.current.nonAiVideoUrls : [];
  const nextNonAi = [burned, ...cur.filter((x) => x !== burned)].slice(0, 10);

  // ✅ 代表を焼き込み版へ
  setD((p) => ({
    ...p,
    videoSource: "nonai",
    nonAiVideoUrl: burned,
    nonAiVideoUrls: nextNonAi,
  }));

  await saveDraft({
    videoSource: "nonai",
    nonAiVideoUrl: burned,
    nonAiVideoUrls: nextNonAi,
    phase: "draft",
  } as any);

  showMsg("✅ 文字焼き込み動画を保存しました（非AI代表を更新）");
}
// ===========================
// ✅ saveDraft writeQueue（多重保存で巻き戻らない）
// - saveDraft を必ず直列実行にする
// - base(dRef.current) は「実行時」に読む（ここが本丸）
// ✅ 仕様変更：product は nonAi* だけ保存（videoSource=nonai）
// ✅ 仕様変更：CM Runway は cmVideo（塊）だけ。BrandCMPanel側の保存に統一（このsaveDraftは cmVideo のみ許可）
// ===========================
const saveQueueRef = useRef<Promise<any>>(Promise.resolve());

// 配列を「順序維持・重複排除」して最大N
function uniqKeepOrder(list: any[], limit = 10): any[] {
  const out: any[] = [];
  const seen = new Set<string>();
  for (const v of list || []) {
    const s = String(v || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

// saveQueue に積む（失敗しても次が止まらない）
function enqueueSave<T>(job: () => Promise<T>): Promise<T> {
  const next = saveQueueRef.current.then(job);
  saveQueueRef.current = next.catch(() => null);
  return next;
}

// ===========================
// - product保存：nonAiVideoUrl / nonAiVideoUrls / nonAiVideoPreset / videoSource(=nonai) のみ
// - CM保存：cmVideo（塊）だけ（BrandCMPanel側で partial に含めた時だけ保存）
// - Firestore更新で product の Runway フィールドは増えない／更新されない（videoUrl/videoUrls/videoPersona等を完全撤去）
// ===========================

async function saveDraft(partial?: Partial<DraftDoc>): Promise<string | null> {
  // ✅ saveDraft を直列化（多重実行で巻き戻らない）
  return enqueueSave(async () => {
    // ✅ 絶対条件：Auth確定前に Firestore write しない（ルールで弾かれる）
    const u = auth.currentUser;
    if (!u?.uid) {
      showMsg("ログイン確認中です（保存できません）");
      return null;
    }

    // ✅ stateのuidより「Authのuid」を正とする（ズレ事故防止）
    const realUid = u.uid;

    // ✅ base は “実行時” の最新を読む（stale closure防止の本丸）
    const base = dRef.current;

    // ✅ hasOwnProperty 判定も “実行時” に行う（partial参照はそのままでOK）
    const includeNonAiVideoUrls = !!partial && Object.prototype.hasOwnProperty.call(partial, "nonAiVideoUrls");
    const includeBgImageUrls = !!partial && Object.prototype.hasOwnProperty.call(partial, "bgImageUrls");

    // ✅ CM保存：cmVideo（塊）だけ（BrandCMPanel側から来た時だけ書く）
    const includeCmVideo = !!partial && Object.prototype.hasOwnProperty.call(partial, "cmVideo");
    const includeCmApplied = !!partial && Object.prototype.hasOwnProperty.call(partial, "cmApplied");

    // ✅ next（stateを正として組む：ただし直列化されるので巻き戻らない）
    const next: DraftDoc = { ...base, ...(partial ?? {}), userId: realUid };

    // ✅ 代表画像
    const representativeUrl =
      (partial && Object.prototype.hasOwnProperty.call(partial, "imageUrl") ? (partial as any).imageUrl : null) ||
      next.aiImageUrl ||
      next.baseImageUrl ||
      next.compositeImageUrl ||
      null;

    // ==========================================
    // ✅ Firestore対策：undefined を「完全に排除」
    // ==========================================
    function stripUndefinedDeep<T>(input: T): T {
      const walk = (v: any): any => {
        if (v === undefined) return undefined;
        if (v === null) return null;

        if (Array.isArray(v)) {
          const out: any[] = [];
          for (const item of v) {
            const w = walk(item);
            if (w !== undefined) out.push(w);
          }
          return out;
        }

        if (typeof v === "object") {
          const out: any = {};
          for (const [k, val] of Object.entries(v)) {
            const w = walk(val);
            if (w !== undefined) out[k] = w;
          }
          return out;
        }

        return v;
      };
      return walk(input);
    }

    // ✅ 配列はここで必ず “順序維持・重複排除”
    const normalizedBg = uniqKeepOrder(Array.isArray(next.bgImageUrls) ? next.bgImageUrls : [], 10);
    const normalizedNonAi = uniqKeepOrder(Array.isArray(next.nonAiVideoUrls) ? next.nonAiVideoUrls : [], 10);

    const payload: any = {
      userId: realUid,
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

      // ✅ 追加：複数素材（永続化）
      images: next.images ?? { primary: null, materials: [] },

      textOverlayBySlot: next.textOverlayBySlot ?? null,

      // -------------------------
      // ✅ product：non-ai（非AIは nonAi* の箱だけ）
      // -------------------------
      videoSource: next.videoSource ?? null,
      nonAiVideoUrl: next.nonAiVideoUrl ?? null,
      nonAiVideoPreset: next.nonAiVideoPreset ?? null,

      // -------------------------
      // ✅ CM：cmVideo（塊）だけ（partialに含めた時だけ保存）
      // -------------------------
      ...(includeCmVideo ? { cmVideo: (partial as any).cmVideo } : {}),
      ...(includeCmApplied ? { cmApplied: (partial as any).cmApplied } : {}),

      updatedAt: serverTimestamp(),
    };

    // ✅ partialで “含めた” 場合だけ配列を更新（事故防止）
    if (includeBgImageUrls) payload.bgImageUrls = normalizedBg;
    if (includeNonAiVideoUrls) payload.nonAiVideoUrls = normalizedNonAi;

    const currentDraftId = draftIdRef.current;

    // ✅ 既存更新：配列だけは「読み→マージ」で巻き戻り0にする
    let mergedBg = includeBgImageUrls ? normalizedBg : undefined;
    let mergedNonAi = includeNonAiVideoUrls ? normalizedNonAi : undefined;

    if (currentDraftId && (includeBgImageUrls || includeNonAiVideoUrls)) {
      try {
        const snap = await getDoc(doc(db, "drafts", currentDraftId));
        const cur = (snap.exists() ? (snap.data() as any) : {}) || {};

        if (includeBgImageUrls) {
          const remote = Array.isArray(cur.bgImageUrls) ? cur.bgImageUrls : [];
          mergedBg = uniqKeepOrder([...(normalizedBg ?? []), ...remote], 10);
          payload.bgImageUrls = mergedBg;
        }

        if (includeNonAiVideoUrls) {
          const remote = Array.isArray(cur.nonAiVideoUrls) ? cur.nonAiVideoUrls : [];
          mergedNonAi = uniqKeepOrder([...(normalizedNonAi ?? []), ...remote], 10);
          payload.nonAiVideoUrls = mergedNonAi;
        }
      } catch {
        // 読み失敗しても保存自体は続行（最悪でも writeQueue で同一ページ内は崩れない）
      }
    }

    // ✅ 新規作成
    if (!currentDraftId) {
      payload.createdAt = serverTimestamp();

      // ✅ 新規作成時は初期配列も必ず持つ（復元の主役）
      payload.bgImageUrls = normalizedBg;
      payload.nonAiVideoUrls = normalizedNonAi;

      const safePayload = stripUndefinedDeep(payload);

      const refDoc = await addDoc(collection(db, "drafts"), safePayload);
      draftIdRef.current = refDoc.id;
      setDraftId(refDoc.id);
      router.replace(`/flow/drafts/new?id=${encodeURIComponent(refDoc.id)}`);

      const nextState: DraftDoc = {
        ...next,
        bgImageUrls: normalizedBg,
        nonAiVideoUrls: normalizedNonAi,
      };
      setD(nextState);
      return refDoc.id;
    }

    // ✅ 既存更新
    try {
      const safePayload = stripUndefinedDeep(payload);

      await updateDoc(doc(db, "drafts", currentDraftId), safePayload);

      const nextState: DraftDoc = {
        ...next,
        ...(includeBgImageUrls ? { bgImageUrls: normalizedBg } : {}),
        ...(includeNonAiVideoUrls ? { nonAiVideoUrls: normalizedNonAi } : {}),
      };
      setD(nextState);
      return currentDraftId;
    } catch (e: any) {
      console.error("🔥 saveDraft updateDoc failed:", e);
      showMsg(`🔥 Firestore保存失敗: ${e?.message || "不明"}`);
      throw e;
    }
  });
}
async function generateCaptions() {
  if (!uid) return;

  const vision = (dRef.current.vision ?? "").trim();
  if (!vision) {
    showMsg("Vision（必須）を入力してください");
    return;
  }
  if (busy) return;

  if (inFlightRef.current["captions"]) return;
  inFlightRef.current["captions"] = true;

  setBusy(true);
  try {
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error("no token");

    const body = {
      brandId: dRef.current.brand,
      vision,
      keywords: splitKeywords(dRef.current.keywordsText),
      tone: "",
    };

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

    // ✅ 計画E：現在スロットにだけ“初期テキスト”を入れる（既存があれば絶対上書きしない）
    const slot = currentSlot;
    const existingLines = dRef.current.textOverlayBySlot?.[slot]?.lines ?? [];
    const hasText = Array.isArray(existingLines) && existingLines.join("\n").trim().length > 0;

    const nextTextOverlayBySlot = hasText
      ? dRef.current.textOverlayBySlot
      : ensureSlotOverlay(dRef.current, slot, { lines: ig ? [ig] : [] });

    // ✅ UI state
    setD((prev) => ({
      ...prev,
      ig,
      x,
      ig3,
      textOverlayBySlot: hasText ? prev.textOverlayBySlot : ensureSlotOverlay(prev, slot, { lines: ig ? [ig] : [] }),
    }));

    // ✅ Firestore（本文は ig/x/ig3 のみ。overlay は “初期だけ”）
    await saveDraft({ ig, x, ig3, phase: "draft", textOverlayBySlot: nextTextOverlayBySlot });
  } catch (e: any) {
    console.error(e);
    showMsg(`文章生成に失敗しました：${e?.message || "不明"}`);
  } finally {
    setBusy(false);
    inFlightRef.current["captions"] = false;
  }
}
async function generateAiImage() {
  if (!uid) return;

  // -----------------------------
  // ✅ 1. 構図選択があればそれを優先
  // -----------------------------
  const effectiveVision =
    (d.selectedStaticPrompt ?? d.vision ?? "").trim();

  if (!effectiveVision) {
    showMsg("Vision（必須）を入力してください");
    return;
  }

  if (inFlightRef.current["image"]) return;
  inFlightRef.current["image"] = true;

  setBusy(true);

  try {
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error("no token");

    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) throw new Error("failed to create draft");

    // -----------------------------
    // ✅ 2. APIに渡すvisionは統一
    // -----------------------------
    const body = {
      brandId: d.brand,
      vision: effectiveVision,
      keywords: splitKeywords(d.keywordsText),
      tone: "",
    };

    const r = await fetch("/api/generate-image", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "image error");

// ✅ 返り値ゆれ吸収（ここが本丸）
let outUrl = "";

// 1) URL系（imageUrl / url / outputUrl）
const urlLike =
  (typeof j?.imageUrl === "string" && j.imageUrl) ||
  (typeof j?.url === "string" && j.url) ||
  (typeof j?.outputUrl === "string" && j.outputUrl) ||
  "";

if (urlLike && /^https?:\/\//.test(urlLike)) {
  outUrl = urlLike;
} else if (typeof j?.dataUrl === "string" && j.dataUrl.startsWith("data:image/")) {
  outUrl = await uploadDataUrlToStorage(uid, ensuredDraftId, j.dataUrl);
} else if (typeof j?.b64 === "string" && j.b64) {
  const dataUrl = `data:image/png;base64,${j.b64}`;
  outUrl = await uploadDataUrlToStorage(uid, ensuredDraftId, dataUrl);
} else {
  throw new Error("生成結果が取得できません（url/imageUrl/outputUrl/dataUrl/b64 が無い）");
}

const url = outUrl; // 以降は既存のurl変数を使うなら合わせる

    // -----------------------------
    // ✅ 3. 状態更新
    // -----------------------------
    setD((prev) => ({
      ...prev,
      imageIdeaUrl: url,
    }));

    await saveDraft({
      imageIdeaUrl: url,
      phase: "draft",
    });

    // -----------------------------
    // ✅ 4. UI誘導
    // -----------------------------
    setRightTab("image");
    setPreviewMode("idea");
    setPreviewReason("イメージ画像を生成しました（③に表示）");
    showMsg("イメージ画像を保存しました（③に表示）");

  } catch (e: any) {
    console.error(e);
    showMsg(`画像生成に失敗しました\n\n原因: ${e?.message || "不明"}`);
  } finally {
    setBusy(false);
    inFlightRef.current["image"] = false;
  }
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

    // alert("文字入りプレビューを保存しました");
    showMsg("文字入り画像を保存しました（投稿用）");
  } catch (e: any) {
    console.error(e);
    showMsg(`❌ 保存に失敗：${e?.message || "不明"}`);
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

  // ① テキストだけ更新（本文は触らない）
  setD((p) => ({ ...p, overlayText: t }));

  // ② 事故防止：投稿用の表示は base に寄せる（compositeへ飛ばさない）
  setPreviewReason("");
  setPreviewMode("base");

  // ③ Firestoreへ「文字だけ」即保存（本文は絶対に触らない）
  //    ※ saveDraft は dRef を使うので、この時点の最新stateと合成される
  const slot = currentSlot;

  await saveDraft({
    textOverlayBySlot: {
      ...(dRef.current.textOverlayBySlot ?? {}),
      [slot]: {
        ...((dRef.current.textOverlayBySlot ?? {})[slot] ?? {
          lines: [],
          fontSize: 48,
          lineHeight: 1.25,
          x: 0.5,
          y: 0.75,
          color: "#ffffff",
          background: {
            enabled: true,
            padding: 24,
            color: "rgba(0,0,0,0.45)",
            radius: 0,
          },
        }),
        lines: t ? [t] : [],
      },
    },
    phase: "draft",
  } as any);

  // ④ 画面内メッセージ（alert禁止）
  showMsg("文字表示に反映しました（保存済み・本文は未変更）");
}

const secondsKey: UiSeconds = (d.videoSeconds ?? 5) === 10 ? 10 : 5;
const costStandard = pricing.standard[secondsKey];
const costHigh = pricing.high[secondsKey];
const [shownCost, setShownCost] = useState<number>(0);

const pricingMetaText = useMemo(() => {
  const t = pricingUpdatedAt ? new Date(pricingUpdatedAt) : null;
  const hhmm = t ? `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}` : "—";
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

function ratioFromVideoSize(size: UiVideoSize): string {
  if (size === "720x1280") return "720:1280";
  if (size === "960x960") return "960:960";
  return "1280:720";
}
async function replaceBackgroundAndSaveToAiImage() {
  if (!uid) return;

  if (inFlightRef.current["replaceBg"]) return;
  inFlightRef.current["replaceBg"] = true;

  setBusy(true);
  try {
    // 下書きID確定
    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) throw new Error("failed to create draft");

    // 認証
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error("no token");

    // ✅ 仕様確定：前景は baseImageUrl（文字なし）限定
    const base = (d.baseImageUrl || "").trim();
    if (!base) {
      showMsg("先に元画像（アップロード→保存）を作ってください（前景は元画像のみ）");
      return;
    }

    // ---------------------------
    // ① 前景の透過抽出
    // ---------------------------
    const fgRes = await fetch("/api/extract-foreground", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        brandId: d.brand,
        referenceImageUrl: base,
      }),
    });

    const fgJson = await fgRes.json().catch(() => ({}));
    if (!fgRes.ok) {
      throw new Error(fgJson?.error || "extract-foreground error");
    }

    // ✅ 返り値ゆれ吸収
    const fg =
      (typeof fgJson?.url === "string" && fgJson.url) ||
      (typeof fgJson?.foregroundUrl === "string" && fgJson.foregroundUrl) ||
      (typeof fgJson?.fgUrl === "string" && fgJson.fgUrl) ||
      "";

    if (!fg) {
      throw new Error("foreground url が取得できませんでした（サーバ返り値を確認）");
    }

    // ---------------------------
    // ② 背景（なければ生成）
    // ---------------------------
    const existingBg = (bgImageUrl || d.bgImageUrl || "").trim();
    const bg = existingBg ? existingBg : await generateBackgroundImage(fg);

const ratio = ratioFromVideoSize(normalizeVideoSize(d.videoSize));
    // ---------------------------
    // ③ 背景合成
    // ---------------------------
    const r = await fetch("/api/replace-background", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        foregroundImage: fg,
        backgroundImage: bg,
        ratio,
        fit: "contain",
      }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(j?.error || "replace-background error");
    }

    // ✅ 返り値ゆれ吸収（ここが本丸）
    let outUrl = "";

    // 1) URL系（imageUrl / url / outputUrl）
    const urlLike =
      (typeof j?.imageUrl === "string" && j.imageUrl) ||
      (typeof j?.url === "string" && j.url) ||
      (typeof j?.outputUrl === "string" && j.outputUrl) ||
      "";

    if (urlLike && /^https?:\/\//.test(urlLike)) {
      outUrl = urlLike;
    } else if (typeof j?.dataUrl === "string" && j.dataUrl.startsWith("data:image/")) {
      outUrl = await uploadDataUrlToStorage(uid, ensuredDraftId, j.dataUrl);
    } else if (typeof j?.b64 === "string" && j.b64) {
      const dataUrl = `data:image/png;base64,${j.b64}`;
      outUrl = await uploadDataUrlToStorage(uid, ensuredDraftId, dataUrl);
    } else {
      throw new Error("合成結果が取得できません（url/imageUrl/outputUrl/dataUrl/b64 が無い）");
    }

    // ---------------------------
    // ④ UI state & Firestore 反映（表示事故を0にする）
    // ---------------------------
    setRightTab("image");
    setBgImageUrl(bg);

    setD((p) => ({
      ...p,
      aiImageUrl: outUrl,
      imageUrl: outUrl,
      imageSource: "ai",
    }));

    console.log("AFTER COMPOSITE", {
      outUrl,
      bg,
      hasAiImageUrl: !!outUrl,
      beforePreviewMode: previewMode,
    });

    setPreviewMode("composite");

    console.log("PREVIEW MODE SET TO COMPOSITE");

    setPreviewReason("");

    await saveDraft({
      aiImageUrl: outUrl,
      imageUrl: outUrl,
      imageSource: "ai",
      phase: "draft",
      bgImageUrl: bg,
    });

    showMsg("✅ 切り抜き＋背景合成 完了（④に表示）");
  } catch (e: any) {
    console.error(e);
    showMsg(`背景合成に失敗：${e?.message || "不明"}`);
  } finally {
    setBusy(false);
    inFlightRef.current["replaceBg"] = false;
  }
}

async function clearBgHistory() {
  if (!uid) return;
  if (!draftId) {
    showMsg("この下書きはまだ作成されていません");
    return;
  }

  // ✅ confirmは禁止。ここでは実処理だけにする。
  // ✅ 確定背景(bgImageUrl)は残す。候補(bgImageUrls)だけ空にする。
  setD((p) => ({ ...p, bgImageUrls: [] }));

  // ✅ saveDraft は partial に bgImageUrls が含まれていれば確実に保存される（1回でOK）
  await saveDraft({ bgImageUrls: [] });

  showMsg("背景履歴をクリアしました（候補のみ）");
}

async function generateBackgroundImage(referenceImageUrl: string): Promise<string> {
  if (!uid) throw new Error("no uid");
  if (bgBusy) throw new Error("背景生成中です");
  setBgBusy(true);

  try {
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error("no token");

    // ✅ 静止画で採用した構図があればそれを使う。無ければ通常のvision。
    const vision = (dRef.current.selectedStaticPrompt ?? dRef.current.vision ?? "").trim();
    if (!vision) throw new Error("Vision（必須）が空です");

    // ✅ 下書きIDを先に確定（最重要）
    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) throw new Error("failed to create draft");

    // ✅ 崩壊防止の「硬い制約」：どのsceneでも必ず入れる
    const hardConstraints = [
      "商品（前景）の形状・輪郭・取手・木目・ロゴ・色は絶対に変えない",
      "手・人物・指・腕は絶対に入れない",
      "商品以外の小物を新規追加しない（生活感は光・影・ボケで示す）",
      "背景は自然な室内光（過度な演出・文字・看板・ブランドロゴは禁止）",
      "背景に文字・透かし・テキストを入れない",
    ];

    // ✅ sceneごとの「指示」：生活感は背景のみで作る
    const sceneHints: Record<BgScene, string> = {
      studio: "無地またはミニマルな撮影背景。商品が主役。影は薄く。",
      lifestyle:
        "生活空間の雰囲気。玄関棚/リビング壁際/書斎の一角の“空気感”。小物を置かず光と影で示す。",
      scale:
        "サイズ感が伝わる文脈（棚上/机上/床置き想定）。ただし小物追加は禁止。空間の奥行きで伝える。",
      detail:
        "質感が伝わる背景（素材に合う壁・床）。近接寄りの雰囲気。ノイズや過度な加工は禁止。",
    };

    const body = {
      brandId: dRef.current.brand,
      vision,
      keywords: splitKeywords(dRef.current.keywordsText),

      // ✅ サイズはlibの正（UiVideoSize）に合わせる。undefined混入防止
      size: normalizeVideoSize(dRef.current.videoSize ?? "720x1280"),

      referenceImageUrl,

      // ✅ 追加：scene + hard constraints（サーバが未対応でも無害）
      scene: bgScene,
      sceneHint: sceneHints[bgScene],
      hardConstraints,

      // ✅ 下書き隔離
      draftId: ensuredDraftId,
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

    // ✅ 生成できたら同期で履歴更新（2枚反映の本命）
    await syncBgImagesFromStorage();

    return url;
  } finally {
    setBgBusy(false);
  }
}

// - この下書きIDのフォルダだけ同期
// - timeCreated 降順で最大10
// - 代表(bgImageUrl) も必ず立てる
// - found / scanFolder / any / head再宣言 などの事故を全部潰す
async function syncBgImagesFromStorage() {
  if (!uid) return;

  const ensuredDraftId = draftId ?? (await saveDraft());
  if (!ensuredDraftId) {
    showMsg("下書きIDの確定に失敗しました");
    return;
  }

  if (inFlightRef.current["syncBgs"]) return;
  inFlightRef.current["syncBgs"] = true;

  setBusy(true);
  try {
    // ✅ 事故ゼロ：この下書きIDの背景フォルダだけを見る
    // 例: users/{uid}/drafts/{draftId}/bg/xxxx.png
    const draftBgFolder = `users/${uid}/drafts/${ensuredDraftId}/bg`;

    // ✅ このスコープで found を必ず定義（TS2304を出さない）
    const found: { url: string; t: number }[] = [];

    // ✅ サブフォルダ(prefixes)も含めて全走査（2枚あるのに1枚しか取れない事故対策）
    async function scanFolder(path: string): Promise<void> {
      const folderRef = ref(storage, path);
      const listed = await listAll(folderRef);

      for (const itemRef of listed.items) {
        const name = String(itemRef.name || "").toLowerCase();

        if (
          !(
            name.endsWith(".png") ||
            name.endsWith(".jpg") ||
            name.endsWith(".jpeg") ||
            name.endsWith(".webp")
          )
        ) {
          continue;
        }

        try {
          const meta = await getMetadata(itemRef);
          const t = meta?.timeCreated ? new Date(meta.timeCreated).getTime() : 0;
          const url = await getDownloadURL(itemRef);

          if (typeof url === "string" && url.trim().length > 0) {
            found.push({ url, t });
          }
        } catch {
          // skip
        }
      }

      for (const p of listed.prefixes) {
        await scanFolder(p.fullPath);
      }
    }

    await scanFolder(draftBgFolder);

    if (found.length === 0) {
      showMsg(
        "この下書きの背景が見つかりませんでした（背景生成の保存先が draft/bg になっているか確認）"
      );
      return;
    }

    const seen = new Set<string>();

    // ✅ timeCreated 降順でURLだけ（最大10）
    const nextBgUrls: string[] = found
      .slice()
      .sort((a, b) => (b.t ?? 0) - (a.t ?? 0))
      .map((x) => x.url)
      .filter((u) => typeof u === "string" && u.trim().length > 0)
      .filter((u) => {
        if (seen.has(u)) return false;
        seen.add(u);
        return true;
      })
      .slice(0, 10);

    // ✅ 代表（head という名前を使わない）
    const nextBgHead: string | undefined = nextBgUrls[0] || undefined;

    // ✅ UIへ即反映（state）
    setBgImageUrl(nextBgHead ?? null);

    // ✅ Draftへ即反映（Firestoreの表示元）
    setD((prev) => ({
      ...prev,
      bgImageUrl: nextBgHead,
      bgImageUrls: nextBgUrls,
    }));

    // ✅ Firestoreへ保存（この下書きだけ）
    await saveDraft({
      bgImageUrl: nextBgHead,
      bgImageUrls: nextBgUrls,
    });

    showMsg(`背景を同期しました：${nextBgUrls.length}件（この下書きのみ）`);
  } catch (e: unknown) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "不明";
    showMsg(`背景同期に失敗しました\n\n原因: ${msg}`);
  } finally {
    setBusy(false);
    inFlightRef.current["syncBgs"] = false;
  }
}
// ===========================
// ✅ 非AI専用：動画同期（Storage → Firestore）
// - Runway領域（/videos）には触れない
// - videoUrl / videoUrls は絶対に更新しない
// - nonAiVideoUrl / nonAiVideoUrls のみ更新
// ===========================
async function syncVideosFromStorage() {
  if (!uid) return;

  const ensuredDraftId = draftId ?? (await saveDraft());
  if (!ensuredDraftId) {
    showMsg("下書きIDの確定に失敗しました");
    return;
  }

  if (inFlightRef.current["syncVideos"]) return;
  inFlightRef.current["syncVideos"] = true;

  setBusy(true);
  try {
    // ✅ 非AIだけを見る（ここが本丸）
    const nonaiRef = ref(storage, `users/${uid}/drafts/${ensuredDraftId}/nonai`);
    const listedNonai = await listAll(nonaiRef).catch(() => ({ items: [] as any[] }));

    const found: { url: string; t: number; name: string }[] = [];

    for (const itemRef of listedNonai.items || []) {
      const name = String(itemRef.name || "").toLowerCase();
      if (!(name.endsWith(".mp4") || name.endsWith(".webm"))) continue;

      try {
        const meta = await getMetadata(itemRef);
        const t = meta?.timeCreated ? new Date(meta.timeCreated).getTime() : 0;
        const url = await getDownloadURL(itemRef);
        found.push({ url, t, name });
      } catch {
        // skip
      }
    }

    if (found.length === 0) {
      showMsg("この下書きの非AI動画が見つかりませんでした（保存先/拡張子を確認）");
      return;
    }

    // 新しい順
    found.sort((a, b) => (b.t || 0) - (a.t || 0));

    // ✅ mp4優先 → 足りなければwebm
    const mp4 = found.filter((x) => x.name.endsWith(".mp4")).map((x) => x.url);
    const webm = found.filter((x) => x.name.endsWith(".webm")).map((x) => x.url);
    const nonAi = [...mp4, ...webm].slice(0, 10);

    // ✅ 非AI箱だけ保存（Runway箱禁止）
    await saveDraft({
      nonAiVideoUrls: nonAi,
      nonAiVideoUrl: nonAi[0] ?? dRef.current.nonAiVideoUrl ?? null,
      videoSource: "nonai",
      phase: "draft",
    } as any);

    // ✅ UI反映
    setD((prev) => ({
      ...prev,
      nonAiVideoUrls: nonAi,
      nonAiVideoUrl: nonAi[0] ?? prev.nonAiVideoUrl ?? null,
      videoSource: "nonai",
    }));

    showMsg(`非AI動画を同期しました：${nonAi.length}件`);
  } catch (e: any) {
    console.error(e);
    showMsg(`同期に失敗しました\n\n原因: ${e?.message || "不明"}`);
  } finally {
    setBusy(false);
    inFlightRef.current["syncVideos"] = false;
  }
}

// ===========================
// ✅ Runway：参照画像を「UIで明示選択」する（事故防止）
// - 参照URLの候補：アップロード(base) / 合成(ai) / 構図案(idea) / images.primary 等
// - 実際にRunwayへ渡すのは「ユーザーが選んだ1枚」だけ
// ===========================
function isHttpUrl(u: any) {
  const s = String(u ?? "").trim();
  return s.startsWith("https://") || s.startsWith("http://");
}

// ===========================
// - 冪等（同URL二重登録しない）
// - 非AIは nonAi系のみ更新（Runway混線禁止）
// - 代表は常に nonAiVideoUrl
// - UIのプレビューも nonAiPreview 系のみ（videoPreviewUrl は触らない）
// ===========================
async function saveNonAiVideoToDraft(args: {
  url: string;
  preset: DraftDoc["nonAiVideoPreset"];
}) {
  const url = String(args.url || "").trim();
  if (!url) {
    setNonAiReason("保存できません：動画URLが空です");
    return;
  }
  if (!args.preset) {
    setNonAiReason("保存できません：動画の選択（人格）が未選択です");
    return;
  }

  setNonAiReason("");

  const ensuredDraftId = draftId ?? (await saveDraft());
  if (!ensuredDraftId) {
    setNonAiReason("保存できません：下書きIDの確定に失敗しました");
    return;
  }

  // ✅ 冪等：同URLなら終了
  if (String(dRef.current.nonAiVideoUrl || "").trim() === url) {
    showMsg("同じ非AI動画はすでに代表に設定されています");
    return;
  }

  // ✅ 履歴（重複排除＋最大10）
  const currentList = Array.isArray(dRef.current.nonAiVideoUrls) ? dRef.current.nonAiVideoUrls : [];
  const nextNonAi = [url, ...currentList.filter((x) => String(x || "").trim() !== url)].slice(0, 10);

  // ===========================
  // ✅ UI即時反映（非AIだけ）
  // ===========================
  setRightTab("video");

  // ✅ 「選択中URL」は共通stateでもOK（候補クリックなどで使うため）
  // ただし preview は nonAi 専用stateのみ触る（Runwayプレビュー禁止）
  setSelectedVideoUrl(url);
  setNonAiVideoPreviewUrl(url);

  // ✅ 非AI側の表示履歴（UI state）
  setNonAiPreset(args.preset ?? null);
  setNonAiVideoHistory(nextNonAi);

  // ===========================
  // ✅ Draft state 更新（nonAiのみ）
  // ===========================
  setD((p) => ({
    ...p,
    videoSource: "nonai",
    nonAiVideoUrl: url,
    nonAiVideoPreset: args.preset ?? undefined,
    nonAiVideoUrls: nextNonAi,
  }));

  // ===========================
  // ✅ Firestore保存（nonAiのみ）
  // ===========================
  await saveDraft({
    videoSource: "nonai",
    nonAiVideoUrl: url,
    nonAiVideoPreset: args.preset ?? undefined,
    nonAiVideoUrls: nextNonAi,
    phase: "draft",
  });

  showMsg("✅ 非AI動画を保存しました（代表動画に設定）");
}

const slot: ImageSlot = currentSlot;

// ✅ undefined 安全化（! を消して事故防止）
const previewOverlayText = (() => {
  const lines = d.textOverlayBySlot?.[slot]?.lines ?? [];
  return lines.length ? lines.join("\n").trim() : "";
})();

return (
  <>
    <style jsx>{`
      .imgPair {
        display: grid;
        grid-template-columns: 1fr; /* ✅ スマホは縦 */
        gap: 8px;
      }

      @media (min-width: 900px) {
        .imgPair {
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

      /* 置換：@media (min-width: 1024px) { ... } を丸ごとこれに */
      @media (min-width: 900px) {
        .pageWrap {
          flex-direction: row;
          align-items: flex-start;
          flex-wrap: nowrap; /* ✅ 横並び固定 */
        }
        .leftCol {
          width: 48%;
        }
        .rightCol {
          width: 52%;
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

      .rightImageGrid {
        display: grid;
        grid-template-columns: 1fr; /* スマホ/狭い幅は縦 */
        gap: 8px;
      }

      /* ✅ PCで2列にする：右カラムがある程度広い時だけ横並び */
      @media (min-width: 1100px) {
        .rightImageGrid {
          grid-template-columns: 1fr 1fr; /* ①② / ③④ を横並び */
        }
      }

      /* ===============================
         右カラム：画像プレビュー 1 | 234 レイアウト
         =============================== */

      .rightImageLayout {
        display: grid;
        grid-template-columns: 1fr; /* 狭い時は縦 */
        gap: 8px;
      }

      @media (min-width: 900px) {
        .rightImageLayout {
          grid-template-columns: 1fr 1fr; /* 左=① / 右=②③④ */
          align-items: start;
        }

        .area1 {
          grid-column: 1;
          grid-row: 1 / span 3;
        }

        .area2 {
          grid-column: 2;
          grid-row: 1;
        }

        .area3 {
          grid-column: 2;
          grid-row: 2;
        }

        .area4 {
          grid-column: 2;
          grid-row: 3;
        }
      }
    `}</style>


    <div className="pageWrap">
      {/* =========================
          左カラム
      ========================== */}
      <section className="leftCol min-h-0 flex flex-col gap-3">
        <div className="shrink-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap" />
          {UI.showLoadingText && loadBusy ? (
            <div className="text-white/75" style={{ fontSize: UI.FONT.labelPx }}>
              読み込み中...
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
          <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
            Brand
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Btn
              variant={d.brand === "vento" ? "primary" : "secondary"}
              onClick={() => {
                // ✅ ブランド切替事故防止：表示残留を消す（課金ゼロ）
                setSelectedVideoUrl(null);
                setVideoPreviewUrl(null);
                setVideoHistory([]);
                setBgImageUrl(null);
                setPreviewReason("");
                setUiMsg("");

                // ✅ 計画A：非AI動画（表示/選択/理由）の残留を消す
                setNonAiReason("");
                setNonAiPreset(null);
                setNonAiVideoPreviewUrl(null);
                setNonAiVideoHistory([]);

                setD((p) => ({
                  ...p,
                  brand: "vento",
                 // ✅ ブランドが変わったら「素材」を一旦クリア（混入事故防止）
  bgImageUrl: undefined,
  bgImageUrls: [],
  aiImageUrl: undefined,

  // ✅ product動画は非AI箱のみ
  videoSource: undefined,
  nonAiVideoUrl: undefined,
  nonAiVideoUrls: [],
  nonAiVideoPreset: undefined,

  // ✅ (あれば) 非AI焼き込み理由などは state側で消してるのでここでは不要
}));
              }}
            >
              VENTO
            </Btn>

            <Btn
              variant={d.brand === "riva" ? "primary" : "secondary"}
              onClick={() => {
                // ✅ ブランド切替事故防止：表示残留を消す（課金ゼロ）
                setSelectedVideoUrl(null);
                setVideoPreviewUrl(null);
                setVideoHistory([]);
                setBgImageUrl(null);
                setPreviewReason("");
                setUiMsg("");

                // ✅ 計画A：非AI動画（表示/選択/理由）の残留を消す
                setNonAiReason("");
                setNonAiPreset(null);
                setNonAiVideoPreviewUrl(null);
                setNonAiVideoHistory([]);

                setD((p) => ({
                  ...p,
                  brand: "riva",
                  // ✅ ブランドが変わったら「素材」を一旦クリア（混入事故防止）
                  bgImageUrl: undefined,
                  bgImageUrls: [],
                  aiImageUrl: undefined,

                  // ✅ product動画は非AI箱のみ
                  videoSource: undefined,
                  nonAiVideoUrl: undefined,
                  nonAiVideoUrls: [],
                  nonAiVideoPreset: undefined,

                  // ✅ (あれば) 非AI焼き込み理由などは state側で消してるのでここでは不要
                }));
              }}
            >
              RIVA
            </Btn>

            <Chip>
              {brandLabel} / {phaseLabel}
            </Chip>
          </div>

          {uiMsg ? (
            <div className="mt-2 text-white/70 font-bold" style={{ fontSize: UI.FONT.labelPx }}>
              {uiMsg}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2 items-center">
<label className="inline-flex items-center gap-2">
  <input
    type="file"
    accept="image/*"
    multiple
    disabled={!uid || busy}
    onChange={async (e) => {
      const files = e.target.files;
      e.currentTarget.value = "";
      if (!files || files.length === 0) return;
      await onUploadImageFiles(files);
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

            <Btn variant="ghost" disabled={!uid || busy} onClick={() => saveDraft()}>
              保存
            </Btn>
          </div>

          <div className="text-white/55 mt-2" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.5 }}>
            ※ イメージ画像は、合成や動画の素材には使用されません。
          </div>

          <div className="text-white/55 mt-2" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.5 }}>
            ※ アップロード画像は内部でJPEGに変換して保存します。
            <br />
            ※ AI画像は aiImageUrl に保存され、アップロード画像（base）は上書きされません。
          </div>

          <PhotoSubmissionGuide />

          <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
            Vision（必須）
          </div>
          <textarea
            value={d.vision ?? ""}
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

        <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
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
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-white/55" style={{ fontSize: 13 }}>
                まだ候補がありません（文章生成を実行すると入ります）
              </div>
            ) : null}

            {(d.ig3 ?? []).map((t: string, idx: number) => (
              <div key={`${idx}-${t.slice(0, 12)}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-white/90" style={{ fontSize: 14, lineHeight: 1.35, fontWeight: 800 }}>
                  {t}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Btn
                    variant="secondary"
                    disabled={busy}
                    onClick={() => applyIg3ToOverlayOnly(t)}
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
                  showMsg("先に下書きを作成しました");
                } else {
                  showMsg("この下書きはすでに作成済みです");
                }
              }}
            >
              下書きIDを確定
            </Btn>
          </div>
        </div>
      </section>

      {/* =========================
          右カラム（プレビュー）
      ========================== */}
      <section className="rightCol min-h-0">
        <div className="rightScroll flex flex-col gap-3">
          <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {isOwner ? (
                  <Chip>
                    内部表示：画像=OpenAI / 背景=OpenAI / 合成=Sharp / 動画=Runway
                    {` ｜状態：元=${d.baseImageUrl ? "✓" : "—"} / 背景=${bgDisplayUrl ? "✓" : "—"} / 合成=${
  d.aiImageUrl ? "✓" : "—"
} / 商品動画=${d.nonAiVideoUrl ? "✓" : "—"} / CM=${(d as any)?.cmVideo?.url ? "✓" : "—"}
`}
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
              <div className="mt-3 rightImageLayout">
                {/* =========================
                    静止画最適化AI
                ========================= */}
                <div className="rounded-2xl border border-blue-400/20 bg-black/20 p-4 mb-4">
                  <div className="text-blue-300 font-black text-sm mb-2">
                    🎯 静止画最適化AI（売上設計）
                  </div>

                  {/* 目的選択 */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(["sales", "branding", "trust", "story"] as ImagePurpose[]).map((p) => (
                      <Btn key={p} variant={staticPurpose === p ? "primary" : "secondary"} onClick={() => setStaticPurpose(p)}>
                        {PURPOSE_LABEL[p]}
                      </Btn>
                    ))}
                  </div>
                  {/* ✅ 背景シーン（目的とは別軸） */}
<div className="mt-2">
  <div className="text-white/70 mb-2" style={{ fontSize: 12 }}>
    背景の文脈（生活感を出すならここ）
  </div>
  <div className="flex flex-wrap gap-2">
    {(Object.keys(BG_SCENE_LABEL) as BgScene[]).map((s) => (
      <Btn key={s} variant={bgScene === s ? "primary" : "secondary"} onClick={() => setBgScene(s)}>
        {BG_SCENE_LABEL[s]}
      </Btn>
    ))}
  </div>
  <div className="text-white/55 mt-2" style={{ fontSize: 12, lineHeight: 1.6 }}>
    ※ 生活感は「背景だけ」で作る（商品は絶対に変えない／手・人物・小物追加は禁止）
  </div>
</div>

                  {/* 推奨（推奨ID → 中身を引く） */}
                  {staticRecommendation &&
                    staticVariants.length > 0 &&
                    (() => {
                      const rec = staticVariants.find((v) => v.id === staticRecommendation);
                      if (!rec) return null;
                      return (
                        <div className="text-white/75 text-xs mb-3">
                          推奨：<span className="font-black">{rec.title}</span>
                          {rec.rationale ? <span className="text-white/60">（{rec.rationale}）</span> : null}
                        </div>
                      );
                    })()}

                  {/* 生成ボタン */}
                  <Btn variant="primary" disabled={staticBusy} onClick={generateStaticVariants}>
                    3案を生成
                  </Btn>

                  {/* 3案表示 */}
                  {staticVariants.length > 0 && (
                    <div className="mt-4 flex flex-col gap-2">
                      {staticVariants.map((v) => {
                        const isRec = v.id === staticRecommendation;
                        return (
                          <div
                            key={v.id}
                            className={[
                              "rounded-xl border bg-black/30 p-3",
                              isRec ? "border-white/35 ring-2 ring-white/25" : "border-white/10",
                            ].join(" ")}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-white font-black text-sm">案 {String(v.id).replace("v", "")}</div>
                              {isRec ? (
                                <span className="text-xs font-black text-white/90 rounded-full px-2 py-1 bg-white/15 border border-white/25">
                                  推奨
                                </span>
                              ) : null}
                            </div>

                            <div className="text-white font-black text-sm mt-1">{v.title}</div>

                            <div className="text-white/70 text-xs mt-1">{v.rationale}</div>

                            <div className="text-white/60 text-[11px] mt-1">戦略：{v.strategyType}</div>

                            <Btn variant="secondary" className="mt-2" onClick={() => selectStaticVariant(v)}>
                              この案を採用
                            </Btn>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ① 元画像 + 文字 */}
                <details open className="area1 rounded-2xl border border-white/10 bg-black/20">
                  <summary className="cursor-pointer select-none p-3">
                    <div className="text-white/70" style={{ fontSize: 12 }}>
                      ① 元画像 + 文字（投稿用）
                    </div>
                  </summary>

                  <div className="p-3 pt-0">
                    {d.baseImageUrl ? (
                      <img
                        src={overlayPreviewDataUrl || d.baseImageUrl || ""}
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

                    {/* 文字編集UI */}
                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-white/80 font-bold" style={{ fontSize: 12 }}>
                          文字表示（投稿用）
                        </div>

                        {(() => {
                          const slot2 = currentSlot;
                          const ov2 = d.textOverlayBySlot?.[slot2];
                          const isOn = !!ov2 && ((ov2.lines?.join("\n").trim() ?? "").length > 0);

                          return (
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isOn}
                                onChange={(e) => {
                                  const nextOn = e.target.checked;
                                  setD((p) => {
                                    const prev = p.textOverlayBySlot?.[slot2] ?? DEFAULT_TEXT_OVERLAY;
                                    return {
                                      ...p,
                                      textOverlayBySlot: {
                                        ...(p.textOverlayBySlot ?? {}),
                                        [slot2]: nextOn
                                          ? { ...prev, lines: prev.lines?.length ? prev.lines : [""] }
                                          : { ...prev, lines: [] },
                                      },
                                    };
                                  });
                                }}
                              />
                              <span className="text-white/85" style={{ fontSize: 12 }}>
                                {isOn ? "ON" : "OFF"}
                              </span>
                            </label>
                          );
                        })()}
                      </div>

                      <div className="text-white/70 mt-2" style={{ fontSize: 12, lineHeight: 1.6 }}>
                        ※ 文字は「現在表示中のスロット」にだけ乗ります（共有・自動コピーなし）。
                      </div>

                      <div className="mt-3">
                        <div className="text-white/70 mb-2" style={{ fontSize: 12 }}>
                          テキスト（直接編集）
                        </div>

                        {(() => {
                          const slot2 = currentSlot;
                          const ov2 = d.textOverlayBySlot?.[slot2] ?? DEFAULT_TEXT_OVERLAY;
                          const textValue = (ov2.lines ?? []).join("\n");
                          return (
                            <textarea
                              value={textValue}
                              onChange={(e) => {
                                const v = e.target.value ?? "";
                                setD((p) => ({
                                  ...p,
                                  textOverlayBySlot: {
                                    ...(p.textOverlayBySlot ?? {}),
                                    [slot2]: {
                                      ...(p.textOverlayBySlot?.[slot2] ?? DEFAULT_TEXT_OVERLAY),
                                      lines: v.length ? v.split("\n") : [],
                                    },
                                  },
                                }));
                              }}
                              className="w-full rounded-xl border p-3 outline-none"
                              style={{ ...formStyle, minHeight: UI.hOverlayText }}
                              placeholder="例：静かな存在感を、あなたに。"
                              disabled={busy}
                            />
                          );
                        })()}

                        <div className="mt-2 flex flex-wrap gap-2">
                          <Btn
                            variant="secondary"
                            disabled={busy}
                            onClick={() => {
                              const slot2 = currentSlot;
                              setD((p) => ({
                                ...p,
                                textOverlayBySlot: {
                                  ...(p.textOverlayBySlot ?? {}),
                                  [slot2]: {
                                    ...(p.textOverlayBySlot?.[slot2] ?? DEFAULT_TEXT_OVERLAY),
                                    lines: [],
                                  },
                                },
                              }));
                              showMsg("文字をクリアしました（このスロットのみ）");
                            }}
                          >
                            文字を消す
                          </Btn>

                          <Btn variant="secondary" disabled={!uid || busy} onClick={saveCompositeAsImageUrl}>
                            文字入り画像を保存（PNG）
                          </Btn>

                          <Btn variant="ghost" disabled={!uid || busy} onClick={() => saveDraft()}>
                            保存
                          </Btn>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-3">
                        {(() => {
                          const slot2 = currentSlot;
                          const ov2 = d.textOverlayBySlot?.[slot2] ?? DEFAULT_TEXT_OVERLAY;

                          return (
                            <>
                              <RangeControl
                                label="文字サイズ"
                                value={ov2.fontSize ?? DEFAULT_TEXT_OVERLAY.fontSize}
                                min={18}
                                max={90}
                                step={1}
                                format={(v) => `${v}px`}
                                onChange={(v) => {
                                  setD((p) => ({
                                    ...p,
                                    textOverlayBySlot: {
                                      ...(p.textOverlayBySlot ?? {}),
                                      [slot2]: {
                                        ...(p.textOverlayBySlot?.[slot2] ?? DEFAULT_TEXT_OVERLAY),
                                        fontSize: v,
                                      },
                                    },
                                  }));
                                }}
                              />

                              <RangeControl
                                label="文字の上下位置"
                                value={ov2.y ?? DEFAULT_TEXT_OVERLAY.y}
                                min={0}
                                max={100}
                                step={1}
                                format={(v) => `${v}%`}
                                onChange={(v) => {
                                  setD((p) => ({
                                    ...p,
                                    textOverlayBySlot: {
                                      ...(p.textOverlayBySlot ?? {}),
                                      [slot2]: {
                                        ...(p.textOverlayBySlot?.[slot2] ?? DEFAULT_TEXT_OVERLAY),
                                        y: v,
                                      },
                                    },
                                  }));
                                }}
                              />

                              <RangeControl
                                label="文字背景の濃さ"
                                value={(() => {
                                  const c = ov2.background?.color ?? DEFAULT_TEXT_OVERLAY.background!.color;
                                  const m = /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/.exec(c);
                                  return m ? Number(m[1]) : 0.45;
                                })()}
                                min={0}
                                max={0.85}
                                step={0.05}
                                format={(v) => `${Math.round(v * 100)}%`}
                                onChange={(v) => {
                                  setD((p) => {
                                    const prev = p.textOverlayBySlot?.[slot2] ?? DEFAULT_TEXT_OVERLAY;
                                    return {
                                      ...p,
                                      textOverlayBySlot: {
                                        ...(p.textOverlayBySlot ?? {}),
                                        [slot2]: {
                                          ...prev,
                                          background: {
                                            ...(prev.background ?? DEFAULT_TEXT_OVERLAY.background!),
                                            enabled: true,
                                            color: `rgba(0,0,0,${v})`,
                                          },
                                        },
                                      },
                                    };
                                  });
                                }}
                              />
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </details>

                {/* ② 背景のみ（合成・動画用） */}
                <details className="area2 rounded-2xl border border-white/10 bg-black/20">
                  <summary className="cursor-pointer select-none p-3">
                    <div className="text-white/70" style={{ fontSize: 12 }}>
                      ② 背景のみ（合成・動画用）
                    </div>
                  </summary>

                  <div className="p-3 pt-0">
{bgDisplayUrl ? (
  <img
    src={bgDisplayUrl}
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
                          const base = d.baseImageUrl || "";
                          if (!base) {
                            showMsg("先に元画像を保存してください");
                            return;
                          }
                          await generateBackgroundImage(base);
                        }}
                      >
                        背景画像を生成（背景のみ）
                      </Btn>

                      <Btn variant="secondary" disabled={!uid || busy} onClick={replaceBackgroundAndSaveToAiImage}>
                        製品画像＋背景を合成（保存）
                      </Btn>

                      <Btn variant="secondary" disabled={!uid || busy} onClick={syncBgImagesFromStorage}>
                        背景を同期（Storage→Firestore）
                      </Btn>
                    </div>

                    <div className="text-white/55 mt-2" style={{ fontSize: 12, lineHeight: 1.5 }}>
                      ※ この背景が「合成」と「動画」に使われます。
                    </div>

                    {(d.bgImageUrls?.length ?? 0) > 0 ? (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-white/70" style={{ fontSize: 12 }}>
                            背景履歴（クリックで表示｜課金なし）
                          </div>

                          <Btn
                            variant="danger"
                            disabled={!uid || busy || (d.bgImageUrls?.length ?? 0) === 0}
                            onClick={clearBgHistory}
                            title="この下書きの候補リストだけ消します（Storageの画像は消えません）"
                          >
                            履歴クリア
                          </Btn>
                        </div>

                        <div className="flex flex-col gap-2">
                          {(d.bgImageUrls ?? []).slice(0, 6).map((u: string) => (
                            <button
                              key={u}
                              type="button"
                              onClick={async () => {
                                setBgImageUrl(u);
                                setD((p) => ({ ...p, bgImageUrl: u }));
                                void saveDraft({ bgImageUrl: u });
                              }}
                              className="text-left rounded-xl border px-3 py-2 transition"
                              style={{
                                borderColor: "rgba(255,255,255,0.10)",
                                background: "rgba(0,0,0,0.15)",
                                color: "rgba(255,255,255,0.78)",
                                fontSize: 12,
                              }}
                            >
                              {u.slice(0, 60)}
                              {u.length > 60 ? "…" : ""}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </details>

                {/* ③ イメージ画像（世界観・雰囲気） */}
                <details className="area3 rounded-2xl border border-white/10 bg-black/20">
                  <summary className="cursor-pointer select-none p-3">
                    <div className="text-white/70" style={{ fontSize: 12 }}>
                      ③ イメージ画像（世界観・雰囲気）
                    </div>
                  </summary>

                  <div className="p-3 pt-0">
                    {d.imageIdeaUrl ? (
                      <img
                        src={d.imageIdeaUrl}
                        alt="idea"
                        className="w-full rounded-xl border border-white/10"
                        style={{ height: 240, objectFit: "contain", background: "rgba(0,0,0,0.25)" }}
                      />
                    ) : (
                      <div
                        className="w-full rounded-xl border border-white/10 bg-black/30 flex items-center justify-center text-white/55"
                        style={{ aspectRatio: "1 / 1", fontSize: 13 }}
                      >
                        イメージ画像がありません（左で生成）
                      </div>
                    )}

                    <div className="text-white/55 mt-2" style={{ fontSize: 12, lineHeight: 1.5 }}>
                      ※ イメージ画像は、合成や動画の素材には使用されません。
                    </div>
                  </div>
                </details>

                {/* ④ 合成（動画用・文字なし） */}
                <details className="area4 rounded-2xl border border-white/10 bg-black/20">
                  <summary className="cursor-pointer select-none p-3">
                    <div className="text-white/70" style={{ fontSize: 12 }}>
                      ④ 合成（動画用・文字なし）
                    </div>
                  </summary>

                  <div className="p-3 pt-0">
                    {(previewMode === "composite" ? displayImageUrl : d.aiImageUrl || "") ? (
                      <img
                        src={previewMode === "composite" ? displayImageUrl : d.aiImageUrl || ""}
                        alt="composite"
                        className="w-full rounded-xl border border-white/10"
                        style={{ height: 240, objectFit: "contain", background: "rgba(0,0,0,0.25)" }}
                      />
                    ) : (
                      <div
                        className="w-full rounded-xl border border-white/10 bg-black/30 flex items-center justify-center text-white/55"
                        style={{ aspectRatio: "1 / 1", fontSize: 13 }}
                      >
                        合成画像がありません（製品画像＋背景を合成）
                      </div>
                    )}

                    <div className="text-white/55 mt-2" style={{ fontSize: 12, lineHeight: 1.5 }}>
                      ※ この画像が「動画」に使われます（文字なし）。
                    </div>
                  </div>
                </details>
              </div>
            ) : null}

{/* =========================
    動画タブ（商品動画 / ブランドCM）
    ✅ draft.videoMode は完全撤去。UI state（videoTab）のみ。
========================= */}
{rightTab === "video" ? (
  <div className="mt-3 flex flex-col gap-3">
    {/* ✅ ここで「商品動画 / ブランドCM」を切替（UI stateのみ） */}
    <div className="rounded-2xl border border-white/10 bg-black/20" style={{ padding: UI.cardPadding }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-white/85 font-black" style={{ fontSize: 13 }}>
          動画
        </div>

        <div className="flex items-center gap-2">
          <SelectBtn
            selected={videoTab === "product"}
            label="商品動画"
            onClick={() => setVideoTab("product")}
            disabled={busy}
          />
          <SelectBtn
            selected={videoTab === "cm"}
            label="ブランドCM"
            onClick={() => setVideoTab("cm")}
            disabled={busy}
          />
        </div>
      </div>

      <div className="text-white/55 mt-2" style={{ fontSize: 12, lineHeight: 1.6 }}>
        商品動画＝非AIテンプレ（崩壊ゼロ）／ ブランドCM＝世界観設計(OpenAI)→生成(Runway)
      </div>
    </div>

    {/* =========================
        ✅ 商品動画（非AIのみ）
        - Runway痕跡はここに置かない
    ========================== */}
    {videoTab === "product" ? (
      <div className="flex flex-col gap-3">
        {/* 動画サイズ（用途） */}
        <div className="rounded-2xl border border-white/10 bg-black/20" style={{ padding: UI.cardPadding }}>
          <div className="text-white/85 font-black" style={{ fontSize: 13 }}>
            動画サイズ（用途）
          </div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
{(
  [
    { label: "縦（IG / TikTok）", size: "720x1280" as const },
    { label: "正方形（IG投稿）", size: "960x960" as const }, // ✅ 1080→960 に統一
    { label: "横（YouTube / Web）", size: "1280x720" as const },
  ] as const
).map((opt) => {
  const active = normalizeVideoSize(d.videoSize ?? "720x1280") === opt.size;

  return (
    <Btn
      key={opt.size}
      variant={active ? "primary" : "secondary"}
      onClick={() => setD((p) => ({ ...p, videoSize: opt.size }))}
    >
      <div className="flex flex-col leading-tight">
        <span className="font-black">{opt.label}</span>
        <span className="opacity-70 text-xs">{opt.size}</span>
      </div>
    </Btn>
  );
})}
          </div>
        </div>

{/* 非AI動画アクション（唯一の入口） */}
<div className="rounded-2xl border border-white/10 bg-black/20" style={{ padding: UI.cardPadding }}>
  <NonAiVideoActions
    busy={busy || nonAiBusy}
    reason={nonAiReason}
    setReason={setNonAiReason}
    uid={uid}
    draftId={draftId}
    brand={d.brand}
    vision={d.vision ?? ""}
    keywords={splitKeywords(d.keywordsText)}
    preset={nonAiPreset}

    // ✅ 非AIの入力画像は「合成（動画用・文字なし）」を優先し、旧互換(imageUrl)は排除
    // - sourceImageUrl があればそれが使われる（NonAiVideoActions側の仕様）
    // - なければ baseImageUrl にフォールバック
    sourceImageUrl={d.aiImageUrl ?? undefined}
    baseImageUrl={d.baseImageUrl ?? undefined}

    seconds={(d.videoSeconds ?? 5) === 10 ? 10 : 5}
    quality={(d.videoQuality ?? "standard") === "high" ? "high" : "standard"}
    size={normalizeVideoSize(d.videoSize ?? "720x1280")}

    // ✅ 保存の唯一ルート：page.tsx の saveNonAiVideoToDraft へ
    // ✅ preset未選択はここで止める（reasonで返す）
    onSave={async (url: string) => {
      if (!nonAiPreset) {
        setNonAiReason("動画人格が未選択です");
        return;
      }
      await saveNonAiVideoToDraft({ url, preset: nonAiPreset });
    }}
  />
</div>
        {/* 代表動画プレビュー（非AIのみ） */}
        <div className="rounded-2xl border border-white/10 bg-black/20" style={{ padding: UI.cardPadding }}>
          <div className="text-white/85 font-black" style={{ fontSize: 13 }}>
            代表動画（非AI）
          </div>

          {d.nonAiVideoUrl ? (
            <video
              src={d.nonAiVideoUrl}
              controls
              className="w-full rounded-xl border border-white/10"
              style={{ maxHeight: 360 }}
            />
          ) : (
            <div className="w-full h-40 flex items-center justify-center text-white/55 border border-white/10 rounded-xl">
              非AI動画がまだありません
            </div>
          )}
        </div>

        {/* 焼き込み（ここは非AIの出力だけを対象にする前提） */}
        <div className="rounded-2xl border border-orange-400/30 bg-black/20" style={{ padding: UI.cardPadding }}>
          <div className="text-orange-300 font-black" style={{ fontSize: 13 }}>
            🔥 動画にする（文字焼き込み）
          </div>

          <div className="mt-3">
            <Btn variant="primary" disabled={busy} onClick={burnVideo}>
              🔥 動画にする
            </Btn>
          </div>
        </div>

        {/* ステータス */}
        <div className="rounded-2xl border border-white/10 bg-black/20" style={{ padding: UI.cardPadding }}>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn variant="ghost" disabled={!uid || busy} onClick={() => saveDraft()}>
              保存
            </Btn>

            <Btn variant={d.phase === "ready" ? "primary" : "secondary"} onClick={() => setPhase("ready")}>
              投稿待ちへ
            </Btn>

            <Btn variant={d.phase === "posted" ? "primary" : "secondary"} onClick={() => setPhase("posted")}>
              投稿済みへ
            </Btn>
          </div>
        </div>
      </div>
    ) : null}

{/* =========================
    🟣 ブランドCM（Runwayはここだけ）
    - draft.videoModeは使わない
========================== */}
{videoTab === "cm" ? (
  <BrandCMPanel
    uid={uid}
    draftId={draftId}
    idToken={idToken}
    brandId={d.brand}
    saveDraft={saveDraft}
    busy={busy}
    showMsg={showMsg}
    initial={{
      philosophy: d.vision ?? "",
      keywordsText: d.keywordsText ?? "",
      purpose: (d as any)?.purpose ?? "",
      worldSpecText: (d as any)?.cmApplied?.worldSpecText ?? "",
      cmVideo: (d as any)?.cmVideo ?? undefined,

      // 旧互換（存在すれば）
      runwayTaskId: (d as any)?.cmApplied?.runwayTaskId,
      runwayStatus: (d as any)?.cmApplied?.runwayStatus,
      runwayVideoUrl: (d as any)?.cmApplied?.runwayVideoUrl,
    }}
  />
) : null}
  </div>
) : null}
 </div>
        </div>
      </section>
    </div>
  </>
);
}