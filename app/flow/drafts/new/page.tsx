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

  // ★Runway task id（task方式）
  videoTaskId?: string;

  // ✅ C案：task方式に合わせて拡張（互換維持）
  videoStatus?: "idle" | "queued" | "running" | "done" | "error"; 

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

  videoTaskId: undefined,
  videoStatus: "idle",

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
  const router = useRouter();
  const sp = useSearchParams();
  const id = sp.get("id");

  const [uid, setUid] = useState<string | null>(null);
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
  // ✅ stale closure 対策：常に最新の d を参照する（1回だけ）
  // ===========================
  const dRef = useRef<DraftDoc>({ ...DEFAULT });
  useEffect(() => {
  dRef.current = d;
  }, [d]);


  // ✅ 右カラムの表示タブ
  type RightTab = "image" | "video";
  const [rightTab, setRightTab] = useState<RightTab>("image");

  // ✅ 文字入り「一時プレビュー」用（保存はしない）
  const [overlayPreviewDataUrl, setOverlayPreviewDataUrl] = useState<string | null>(null);

    // ✅ プレビュー表示モード（UI用：Firestore互換の imageSource とは分離）
  type PreviewMode = "base" | "idea" | "composite";

  // base = 元画像（+文字プレビュー可）
  // idea = イメージ画像（世界観）
  // composite = 合成（動画用・文字なし = aiImageUrl）
  const [previewMode, setPreviewMode] = useState<PreviewMode>("base");

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

  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);

   // ✅ 背景生成の busy ※重複宣言禁止
  const [bgBusy, setBgBusy] = useState(false);

  // ✅ inFlight ※重複宣言禁止
  const inFlightRef = useRef<Record<string, boolean>>({});
  // ===========================
// ✅ polling タイマー管理（アンマウント/下書き切替で停止）
// ===========================
const pollTimerRef = useRef<number | null>(null);

// ✅ 現在poll中の taskKey を保持（stop時に inFlight を確実に解除する）
const pollKeyRef = useRef<string | null>(null);

function stopVideoPolling() {
  if (pollTimerRef.current != null) {
    window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
  }
  // ✅ inFlight解除（これが無いと再開できない）
  if (pollKeyRef.current) {
    inFlightRef.current[pollKeyRef.current] = false;
    pollKeyRef.current = null;
  }
}

  // ↓↓ここから追加↓↓（貼り付け確定位置：inFlightRef の直下）
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

  // 1) 画像アップロード（baseImageUrl に保存して previewMode を base に寄せる）
  async function onUploadImageFile(file: File) {
    if (!uid) return;

    if (inFlightRef.current["upload"]) return;
    inFlightRef.current["upload"] = true;

    setBusy(true);
    try {
      // ✅ state(draftId) は遅れることがあるので ref を正にする
      const ensuredDraftId = draftIdRef.current ?? (await saveDraft()) ?? draftIdRef.current;
      if (!ensuredDraftId) throw new Error("failed to create draft");

      const url = await uploadImageFileAsJpegToStorage(uid, ensuredDraftId, file);

      // ✅ 元画像(base)を更新（投稿用）
      setD((p) => ({
        ...p,
        baseImageUrl: url,
        imageSource: "upload",
      }));

      // ✅ 空表示事故防止：元画像が入ったら必ず base に寄せる
      setPreviewMode("base");
      setPreviewReason("");

      await saveDraft({
        baseImageUrl: url,
        imageSource: "upload",
        phase: "draft",
      });

      showMsg("元画像を保存しました（JPEG変換）");
    } catch (e: any) {
      console.error(e);
      showMsg(`画像アップロードに失敗しました：${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["upload"] = false;
    }
  }

  // 2) task を1回だけ確認する（/api/check-video-task を叩く）
  async function checkVideoTaskOnce(taskId: string, ensuredDraftId: string) {
    if (!uid) return;
    if (!taskId) return;

    // ✅ 二重実行防止（task単位）
    const key = `videoTask:${taskId}`;
    if (inFlightRef.current[key]) return;
    inFlightRef.current[key] = true;

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("no token");

      // ✅ 想定：サーバ側に task 状態確認APIがある前提
      //  - 無いなら UI に出して止める（課金事故防止）
      const r = await fetch("/api/check-video-task", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ taskId, draftId: ensuredDraftId }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(j?.error || "check-video-task error（API未実装の可能性）");
      }

      const statusRaw = String(j?.status ?? j?.state ?? "");
      const status: DraftDoc["videoStatus"] =
        statusRaw === "queued" || statusRaw === "running" || statusRaw === "done" || statusRaw === "error"
          ? (statusRaw as any)
          : (j?.running ? "running" : j?.url ? "done" : "running");

      // ✅ 完了URL（互換吸収）
      const videoUrl =
        typeof j?.url === "string"
          ? j.url
          : typeof j?.videoUrl === "string"
            ? j.videoUrl
            : typeof j?.outputUrl === "string"
              ? j.outputUrl
              : "";

      // ✅ status反映
      setD((p) => ({ ...p, videoStatus: status }));

      // ✅ done なら保存して polling 停止
      if (status === "done" && videoUrl) {
        stopVideoPolling();
        setRightTab("video");
        setSelectedVideoUrl(videoUrl);
        setVideoPreviewUrl(videoUrl);

        const nextVideoUrls = (() => {
          const cur = Array.isArray(dRef.current.videoUrls) ? dRef.current.videoUrls : [];
          return [videoUrl, ...cur.filter((x) => x !== videoUrl)].slice(0, 10);
        })();

        setD((p) => ({
          ...p,
          videoUrl,
          videoUrls: nextVideoUrls,
          videoStatus: "done",
        }));

        await saveDraft({
          videoUrl,
          videoUrls: nextVideoUrls,
          videoStatus: "done",
        });

        showMsg("動画が完成しました");
        return;
      }

      if (status === "error") {
        stopVideoPolling();
        await saveDraft({ videoStatus: "error" });
        showMsg("動画生成に失敗しました（task）");
        return;
      }

      // queued/running は何もしない（poll継続）
    } catch (e: any) {
      console.error(e);
      // ✅ APIが無い/落ちてる時は暴走させない
      stopVideoPolling();
      setD((p) => ({ ...p, videoStatus: "error" }));
      void saveDraft({ videoStatus: "error" });
      showMsg(`状態確認に失敗：${e?.message || "不明"}`);
    } finally {
      inFlightRef.current[key] = false;
    }
  }

  // 3) polling 開始（stop で必ず inFlight 解除される設計）
  function startVideoPolling(taskId: string, ensuredDraftId: string) {
    if (!taskId) return;

    // ✅ 既存pollを止める（残留事故防止）
    stopVideoPolling();

    const key = `videoTask:${taskId}`;
    pollKeyRef.current = key;

    // ✅ running表示へ
    setD((p) => ({ ...p, videoTaskId: taskId, videoStatus: "running" }));

    // ✅ まず1回即実行
    void checkVideoTaskOnce(taskId, ensuredDraftId);

    // ✅ 以降は interval
    pollTimerRef.current = window.setInterval(() => {
      void checkVideoTaskOnce(taskId, ensuredDraftId);
    }, 2500);
  }

  const [pricing, setPricing] = useState<PricingTable>(FALLBACK_PRICING);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingUpdatedAt, setPricingUpdatedAt] = useState<number | null>(null);







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
  return () => {
    stopVideoPolling();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

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

  const overlayText = (cur.overlayText || "").trim(); // ★ d → cur
  if (cur.overlayEnabled && overlayText) { // ★ d → cur
    const fontScale = clamp(cur.overlayFontScale, 0.6, 1.6); // ★
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

    const yPct = clamp(cur.overlayY, 0, 100) / 100; // ★
    const topY = Math.round((SIZE - blockH) * yPct);

    const pad = Math.round(SIZE * 0.035);
    const bgAlpha = clamp(cur.overlayBgOpacity, 0, 0.85); // ★

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

useEffect(() => {
  let cancelled = false;

  // ✅ 文字がOFF、または空ならプレビューは不要
  const text = (d.overlayText || "").trim();
  if (!d.overlayEnabled || !text) {
    setOverlayPreviewDataUrl(null);
    return;
  }

  // ✅ 文字入りは「元画像(baseImageUrl)」のみが描画元
  const srcForOverlay = getOverlaySourceUrlForPreview(d);
  if (!srcForOverlay) {
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
  d.overlayEnabled,
  d.overlayText,
  d.overlayFontScale,
  d.overlayY,
  d.overlayBgOpacity,
  d.baseImageUrl,
]);

  useEffect(() => {
    if (!uid) return;

    stopVideoPolling(); // ✅ 下書き切替の残留pollingを止める
        // ✅ 下書き切替時：右側の「動画表示残留」を全消し（別下書きの動画が出る事故防止）
    setSelectedVideoUrl(null);
    setVideoPreviewUrl(null);
    setVideoHistory([]);
    setUiMsg("");
    setPreviewReason("");

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


        const bgImageUrls: string[] = Array.isArray(data.bgImageUrls)
          ? data.bgImageUrls.filter((v: any) => typeof v === "string").slice(0, 10)
          : [];

        const videoUrls: string[] = Array.isArray(data.videoUrls)
        
          ? data.videoUrls.filter((v: any) => typeof v === "string").slice(0, 10)
          : [];
        const videoTaskId =
          typeof data.videoTaskId === "string" && data.videoTaskId ? data.videoTaskId : undefined;

        const videoStatus: DraftDoc["videoStatus"] =
          data.videoStatus === "queued" ||
          data.videoStatus === "running" ||
          data.videoStatus === "done" ||
          data.videoStatus === "error" ||
          data.videoStatus === "idle"
            ? data.videoStatus
            : "idle";
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

          videoTaskId,
          videoStatus,

          updatedAt: data.updatedAt,
          createdAt: data.createdAt,
        });
// ✅ 初期プレビュー：空表示を絶対に作らない（仕様厳守）
if (baseImageUrl) setPreviewMode("base");
else if (imageIdeaUrl) setPreviewMode("idea");
else if (aiImageUrl) setPreviewMode("composite");
else setPreviewMode("base");

// ✅ 背景プレビュー復元：Firestore単発(bgImageUrl)を最優先 → 無ければ履歴1件目
const initialBg = bgImageUrlSingle ?? (bgImageUrls.length ? bgImageUrls[0] : null);

// ✅ 別下書きへ切替時に「前のstate」が残ると事故るので、必ず上書きする
setBgImageUrl(initialBg);
        // ✅ 復元は “常に先頭” を採用（stale closure で復元しない事故防止）
        if (videoUrls.length) setVideoPreviewUrl(videoUrls[0]);
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
  const canGenerate = d.vision.trim().length > 0 && !busy;

  
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

  const displayVideoUrl = useMemo(() => {
    const u =
      selectedVideoUrl ||
      videoPreviewUrl ||
      d.videoUrl ||
      (videoHistory.length ? videoHistory[0] : "") ||
      (d.videoUrls.length ? d.videoUrls[0] : "");

    if (!u) return undefined;

    // ✅ 重要：署名付きURLに「?v=」を足すと壊れるので “絶対に足さない”
    // リロードは <video key=...> の差し替えで担保する
    return u;
  }, [selectedVideoUrl, videoPreviewUrl, d.videoUrl, videoHistory, d.videoUrls]);
  // ✅ 背景の表示は state 優先 → Firestore(d.bgImageUrl) にフォールバック
  const bgDisplayUrl = bgImageUrl || d.bgImageUrl || "";
    async function saveDraft(partial?: Partial<DraftDoc>): Promise<string | null> {
  // ✅ 絶対条件：Auth確定前に Firestore write しない（ルールで弾かれる）
  const u = auth.currentUser;
  if (!u?.uid) {
    showMsg("ログイン確認中です（保存できません）");
    return null;
  }

  // ✅ stateのuidより「Authのuid」を正とする（ズレ事故防止）
  const realUid = u.uid;

  // ✅ saveDraft は「最新 state」を必ず参照（stale closure防止）
  const base = dRef.current;

  const includeVideoUrls = !!partial && Object.prototype.hasOwnProperty.call(partial, "videoUrls");
  const includeBgImageUrls = !!partial && Object.prototype.hasOwnProperty.call(partial, "bgImageUrls");

  const next: DraftDoc = { ...base, ...(partial ?? {}), userId: realUid };

  const representativeUrl =
    (partial && Object.prototype.hasOwnProperty.call(partial, "imageUrl")
      ? (partial as any).imageUrl
      : null) ||
    next.aiImageUrl ||
    next.baseImageUrl ||
    next.compositeImageUrl ||
    null;

  const payload: any = {
    userId: realUid, // ✅ ここが最重要（ルール一致）
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

    videoTaskId: next.videoTaskId ?? null,
    videoStatus: next.videoStatus ?? "idle",

    updatedAt: serverTimestamp(),
  };

  if (includeBgImageUrls) {
    payload.bgImageUrls = Array.isArray(next.bgImageUrls) ? next.bgImageUrls.slice(0, 10) : [];
  }
  if (includeVideoUrls) {
    payload.videoUrls = Array.isArray(next.videoUrls) ? next.videoUrls.slice(0, 10) : [];
  }

  const currentDraftId = draftIdRef.current;

  if (!currentDraftId) {
    payload.createdAt = serverTimestamp();
    payload.bgImageUrls = Array.isArray(next.bgImageUrls) ? next.bgImageUrls.slice(0, 10) : [];
    payload.videoUrls = Array.isArray(next.videoUrls) ? next.videoUrls.slice(0, 10) : [];

    const refDoc = await addDoc(collection(db, "drafts"), payload);

    draftIdRef.current = refDoc.id;
    setDraftId(refDoc.id);
    router.replace(`/flow/drafts/new?id=${encodeURIComponent(refDoc.id)}`);

    setD(next);
    return refDoc.id;
  }

  // ✅ 既存下書き更新
  try {
    await updateDoc(doc(db, "drafts", currentDraftId), payload);
    setD(next);
    return currentDraftId;
  } catch (e: any) {
    console.error("🔥 saveDraft updateDoc failed:", e);
    showMsg(`🔥 Firestore保存失敗: ${e?.message || "不明"}`);
    throw e;
  }
} // ← ✅ これが無いのが致命傷（saveDraft の閉じ）

  async function generateCaptions() {
    if (!uid) return;
    const vision = d.vision.trim();
    

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
  showMsg(`文章生成に失敗しました：${e?.message || "不明"}`);
} finally {
      setBusy(false);
      inFlightRef.current["captions"] = false;
    }
  }

    async function generateAiImage() {
    if (!uid) return;
    const vision = d.vision.trim();
    if (!vision) { showMsg("Vision（必須）を入力してください"); return; }

    if (inFlightRef.current["image"]) return;
    inFlightRef.current["image"] = true;

    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("no token");

            // ✅ state(draftId) は遅れることがあるので ref を正にする
      const ensuredDraftId = draftIdRef.current ?? (await saveDraft()) ?? draftIdRef.current;
      if (!ensuredDraftId) throw new Error("failed to create draft");

      const body = { brandId: d.brand, vision, keywords: splitKeywords(d.keywordsText), tone: "" };

      const r = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));
if (!r.ok) throw new Error(j?.error || "image error");

// ✅ サーバは url を返す
const url = typeof j?.url === "string" ? j.url : "";
if (!url) throw new Error("no url");

setD((prev) => ({
  ...prev,
  imageIdeaUrl: url,
}));

await saveDraft({ imageIdeaUrl: url, phase: "draft" });

// 表示も③へ寄せる
setRightTab("image");
setPreviewMode("idea");
setPreviewReason("イメージ画像を生成しました（③に表示）");
showMsg("イメージ画像を保存しました（③に表示）");

      // ✅ 生成直後の事故防止：③へ“表示も意識も”寄せる
      setRightTab("image");
      setPreviewMode("idea"); // ★追加：生成後は③に寄せる
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
            // ✅ state(draftId) は遅れることがあるので ref を正にする
      const ensuredDraftId = draftIdRef.current ?? (await saveDraft()) ?? draftIdRef.current;
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
  await saveDraft({ overlayText: t, phase: "draft" });

  // ④ 画面内メッセージ（alert禁止）
  showMsg("文字表示に反映しました（保存済み・本文は未変更）");
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
    // 下書きID確定
        // ✅ state(draftId) は遅れることがあるので ref を正にする
    const ensuredDraftId = draftIdRef.current ?? (await saveDraft()) ?? draftIdRef.current;
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

    const ratio = ratioFromVideoSize(d.videoSize ?? "1024x1792");

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
    // ✅ state(draftId) は遅れることがあるので ref を正にする
  if (!draftIdRef.current) {
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

const curBg = Array.isArray(dRef.current.bgImageUrls) ? dRef.current.bgImageUrls : [];
const nextBgUrls = [url, ...curBg.filter((x) => x !== url)].slice(0, 10);

// ✅ d.bgImageUrl（単発）も更新しておく（ロード復元の主役）
setD((prev) => ({ ...prev, bgImageUrl: url, bgImageUrls: nextBgUrls }));

const ensuredDraftId = draftIdRef.current ?? (await saveDraft()) ?? draftIdRef.current;
if (!ensuredDraftId) throw new Error("failed to create draft");

// ✅ Firestoreへも「単発(bgImageUrl) + 履歴(bgImageUrls)」を両方保存
await saveDraft({ bgImageUrl: url, bgImageUrls: nextBgUrls });

return url;
    } finally {
      setBgBusy(false);
    }
  }
async function syncBgImagesFromStorage() {
  if (!uid) return;

  // 下書きIDが無くても「共通背景」同期はできるが、
  // ついでに下書きIDを確定させて Firestore へ保存できるようにする
    // ✅ state(draftId) は遅れることがあるので ref を正にする
  const ensuredDraftId = draftIdRef.current ?? (await saveDraft()) ?? draftIdRef.current;
  if (!ensuredDraftId) {
    showMsg("下書きIDの確定に失敗しました");
    return;
  }

  if (inFlightRef.current["syncBgs"]) return;
  inFlightRef.current["syncBgs"] = true;

  setBusy(true);
  try {
    // ✅ 実際の保存場所に合わせる（あなたが提示したパス）
    // 例: users/{uid}/drafts/_bg/vento/xxxx.png
    const primaryFolder = `users/${uid}/drafts/_bg/${d.brand}`;

    // ⚠️ これは背景以外も混ざる可能性あり（使うなら“補助”）
    const secondaryFolder = `users/${uid}/generations/images`;

    const found: { url: string; t: number }[] = [];

    async function scanFolder(path: string) {
      const folderRef = ref(storage, path);
      const listed = await listAll(folderRef);

      for (const itemRef of listed.items) {
        const name = itemRef.name.toLowerCase();

        // 画像だけ
        if (
          !(
            name.endsWith(".png") ||
            name.endsWith(".jpg") ||
            name.endsWith(".jpeg") ||
            name.endsWith(".webp")
          )
        ) continue;

        try {
          const meta = await getMetadata(itemRef);
          const t = meta?.timeCreated ? new Date(meta.timeCreated).getTime() : 0;
          const url = await getDownloadURL(itemRef);
          found.push({ url, t });
        } catch {
          // skip
        }
      }
    }

    // 1) ✅ 正：共通背景フォルダ（brand別）
    try {
      await scanFolder(primaryFolder);
    } catch {
      // ignore
    }

    // 2) 補助：generations/images（混入注意）
    //    _bg が0件のときだけ見る（事故防止）
    if (found.length === 0) {
      try {
        await scanFolder(secondaryFolder);
      } catch {
        // ignore
      }
    }

    if (found.length === 0) {
      showMsg("背景候補が見つかりませんでした（保存先や権限を確認してください）");
      return;
    }

    // 新しい順（timeCreated）
    found.sort((a, b) => (b.t || 0) - (a.t || 0));
    const urls = found.map((x) => x.url);

    // ✅ 既知の画像（元/文字入り/合成/イメージ）は背景候補から除外（混入事故防止）
    const known = new Set(
      [
        d.baseImageUrl,
        d.compositeImageUrl,
        d.aiImageUrl,
        d.imageIdeaUrl,
      ].filter(Boolean) as string[]
    );

    const bgOnly = urls.filter((u) => !known.has(u));
    const finalBgUrls = (bgOnly.length ? bgOnly : urls).slice(0, 10);

    const head = finalBgUrls[0] || undefined;

    // ✅ UIへ即反映（プレビュー）
    setBgImageUrl(head ?? null);
    setD((prev) => ({
      ...prev,
      bgImageUrl: head,          // ★ string | undefined に統一（null禁止）
      bgImageUrls: finalBgUrls,
    }));

    // ✅ Firestoreへ保存（単発 + 履歴）
    // saveDraft 側が undefined→null へ落とすので、ここは undefined でOK
    await saveDraft({ bgImageUrl: head, bgImageUrls: finalBgUrls });

    showMsg(`背景を同期しました：${finalBgUrls.length}件（ブランド=${d.brand}）`);
  } catch (e: any) {
    console.error(e);
    showMsg(`背景同期に失敗しました\n\n原因: ${e?.message || "不明"}`);
  } finally {
    setBusy(false);
    inFlightRef.current["syncBgs"] = false;
  }
}
  async function syncVideosFromStorage() {
    if (!uid) return;

        // ✅ state(draftId) は遅れることがあるので ref を正にする
    const ensuredDraftId = draftIdRef.current ?? (await saveDraft()) ?? draftIdRef.current;
    if (!ensuredDraftId) {
      showMsg("下書きIDの確定に失敗しました");
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
        showMsg("この下書きの動画が見つかりませんでした（まだ生成が無い / 保存先不一致）");
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
      showMsg(`同期しました：${foundUrls.length}件（この下書きのみ）`);
    } catch (e: any) {
      console.error(e);
      showMsg(`同期に失敗しました\n\n原因: ${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["syncVideos"] = false;
    }
  }

async function generateVideo() {
  if (!uid) return;

  const visionText = d.vision.trim();
  if (!visionText) {
    showMsg("Vision（必須）を入力してください");
    return;
  }

  // ✅ 生成中 task があるなら「課金ゼロで復帰」
  if (d.videoTaskId && (d.videoStatus === "running" || d.videoStatus === "queued")) {
        const ensuredDraftId = draftIdRef.current ?? (await saveDraft()) ?? draftIdRef.current;
    if (!ensuredDraftId) {
      showMsg("下書きIDの確定に失敗しました");
      return;
    }
    setRightTab("video");
    showMsg("すでに生成中です。課金せずに状態確認を再開します。");
    startVideoPolling(d.videoTaskId, ensuredDraftId);
    return;
  }

  // ✅ 新規生成時のみ
  if (inFlightRef.current["video"]) return;
  inFlightRef.current["video"] = true;

  setBusy(true);
  try {
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error("no token");

        const ensuredDraftId = draftIdRef.current ?? (await saveDraft()) ?? draftIdRef.current;
    if (!ensuredDraftId) throw new Error("failed to create draft");

    // ✅ 仕様確定：動画は aiImageUrl（背景合成・文字なし）限定
    const reference = d.aiImageUrl || "";
    if (!reference) {
      showMsg(
        "先に「製品画像＋背景を合成（保存）」で aiImageUrl を作ってください（動画は文字なし合成画像のみ）"
      );
      return;
    }

    const seconds = (d.videoSeconds ?? 5) === 10 ? 10 : 5;
    const templateId = d.videoTemplate ?? "slowZoomFade";
    const quality: UiVideoQuality = (d.videoQuality ?? "standard") === "high" ? "high" : "standard";
    const size = d.videoSize ?? "1024x1792";

    // 背景：無ければ生成
    const ensuredBgUrl = bgImageUrl ? bgImageUrl : await generateBackgroundImage(reference);

    const body = {
      draftId: ensuredDraftId,
      brandId: d.brand,
      vision: visionText,
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

    // ✅ 202/running は「失敗扱いで落とさない」
    if (r.status === 202 || j?.running) {
      const taskId =
        typeof j?.taskId === "string"
          ? j.taskId
          : typeof j?.id === "string"
            ? j.id
            : "";

      if (taskId) {
        setD((prev) => ({ ...prev, videoTaskId: taskId, videoStatus: "running" }));
        await saveDraft({ videoTaskId: taskId, videoStatus: "running" });
        setRightTab("video");
        showMsg("生成中です（taskId を保存しました）。自動で確認します。");
        startVideoPolling(taskId, ensuredDraftId);
      } else {
        showMsg("すでに生成中です。少し待ってから「状態を確認」を押してください。");
      }
      return;
    }

    if (!r.ok) throw new Error(j?.error || "video error");

    // ✅ 互換吸収（url / videoUrl / outputUrl など）
    const videoUrl =
      typeof j?.url === "string"
        ? j.url
        : typeof j?.videoUrl === "string"
          ? j.videoUrl
          : typeof j?.outputUrl === "string"
            ? j.outputUrl
            : "";

    // ✅ taskId も拾う（C案）
    const taskId =
      typeof j?.taskId === "string"
        ? j.taskId
        : typeof j?.id === "string"
          ? j.id
          : "";

    // ✅ 1) URLが返った → 即完了（互換）
    if (videoUrl) {
      setRightTab("video");
      setSelectedVideoUrl(videoUrl);
      setVideoPreviewUrl(videoUrl);

      const nextVideoUrls = (() => {
        const cur = Array.isArray(dRef.current.videoUrls) ? dRef.current.videoUrls : [];
        return [videoUrl, ...cur.filter((x) => x !== videoUrl)].slice(0, 10);
      })();

      setD((prev) => ({
        ...prev,
        videoUrl,
        videoSeconds: seconds,
        videoQuality: quality,
        videoTemplate: templateId,
        videoSize: size,
        videoUrls: nextVideoUrls,
        videoTaskId: taskId || prev.videoTaskId,
        videoStatus: "done",
      }));

      await saveDraft({
        videoUrl,
        videoSeconds: seconds,
        videoQuality: quality,
        videoTemplate: templateId,
        videoSize: size,
        videoUrls: nextVideoUrls,
        videoTaskId: taskId || undefined,
        videoStatus: "done",
      });

      showMsg("動画を生成して保存しました");
      return;
    }

    // ✅ 2) URLが無いが taskId がある → running として残す
    if (taskId) {
      setRightTab("video");
      setD((prev) => ({
        ...prev,
        videoTaskId: taskId,
        videoStatus: "running",
        videoSeconds: seconds,
        videoQuality: quality,
        videoTemplate: templateId,
        videoSize: size,
      }));

      await saveDraft({
        videoTaskId: taskId,
        videoStatus: "running",
        videoSeconds: seconds,
        videoQuality: quality,
        videoTemplate: templateId,
        videoSize: size,
      });

      showMsg("動画生成を開始しました（taskId を保存しました）。自動で確認します。");
      startVideoPolling(taskId, ensuredDraftId);
      return;
    }

    // ✅ 3) URLもtaskIdも無い
    showMsg("動画生成の応答に taskId / url がありません。サーバ側の返却形式を確認してください。");
  } catch (e: any) {
    console.error(e);
    showMsg(`動画生成に失敗しました\n\n原因: ${e?.message || "不明"}`);
  } finally {
    setBusy(false);
    inFlightRef.current["video"] = false;
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
    .rightImageGrid{
  display: grid;
  grid-template-columns: 1fr; /* スマホ/狭い幅は縦 */
  gap: 8px;
}

/* ✅ PCで2列にする：右カラムがある程度広い時だけ横並び */
@media (min-width: 1100px){
  .rightImageGrid{
    grid-template-columns: 1fr 1fr; /* ①② / ③④ を横並び */
  }
}
  /* ===============================
   右カラム：画像プレビュー 1 | 234 レイアウト
   =============================== */

.rightImageLayout{
  display: grid;
  grid-template-columns: 1fr; /* 狭い時は縦 */
  gap: 8px;
}

@media (min-width: 900px){
  .rightImageLayout{
    grid-template-columns: 1fr 1fr; /* 左=① / 右=②③④ */
    align-items: start;
  }

  .area1{
    grid-column: 1;
    grid-row: 1 / span 3;
  }

  .area2{
    grid-column: 2;
    grid-row: 1;
  }

  .area3{
    grid-column: 2;
    grid-row: 2;
  }

  .area4{
    grid-column: 2;
    grid-row: 3;
  }
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
  onClick={() => {
    // ✅ ブランド切替事故防止：表示残留を消す（課金ゼロ）
    stopVideoPolling();
    setSelectedVideoUrl(null);
    setVideoPreviewUrl(null);
    setVideoHistory([]);
    setBgImageUrl(null);
    setPreviewReason("");
    setUiMsg("");

    setD((p) => ({
      ...p,
      brand: "vento",
      // ✅ ブランドが変わったら「素材」を一旦クリア（混入事故防止）
      bgImageUrl: undefined,
      bgImageUrls: [],
      aiImageUrl: undefined,
      videoUrl: undefined,
      videoUrls: [],
      videoTaskId: undefined,
      videoStatus: "idle",
    }));
  }}
>
  VENTO
</Btn>

<Btn
  variant={d.brand === "riva" ? "primary" : "secondary"}
  onClick={() => {
    // ✅ ブランド切替事故防止：表示残留を消す（課金ゼロ）
    stopVideoPolling();
    setSelectedVideoUrl(null);
    setVideoPreviewUrl(null);
    setVideoHistory([]);
    setBgImageUrl(null);
    setPreviewReason("");
    setUiMsg("");

    setD((p) => ({
      ...p,
      brand: "riva",
      // ✅ ブランドが変わったら「素材」を一旦クリア（混入事故防止）
      bgImageUrl: undefined,
      bgImageUrls: [],
      aiImageUrl: undefined,
      videoUrl: undefined,
      videoUrls: [],
      videoTaskId: undefined,
      videoStatus: "idle",
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
                 if (!draftIdRef.current) {
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
              {` ｜状態：元=${d.baseImageUrl ? "✓" : "—"} / 背景=${bgDisplayUrl ? "✓" : "—"} / 合成=${d.aiImageUrl ? "✓" : "—"} / 動画=${d.videoUrl ? "✓" : "—"}`}
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
              ① 元画像 + 文字レイヤー（投稿用）
              - 文字編集UIをこの枠に内包（重要）
          ========================== */}
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
                  style={{
                    height: 240,
                    objectFit: "contain",
                    background: "rgba(0,0,0,0.25)",
                  }}
                />
              ) : (
                <div
                  className="w-full rounded-xl border border-white/10 bg-black/30 flex items-center justify-center text-white/55"
                  style={{ aspectRatio: "1 / 1", fontSize: 13 }}
                >
                  元画像がありません（アップロード→保存）
                </div>
              )}

              {/* 文字編集UI（ここが重要） */}
              <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-white/80 font-bold" style={{ fontSize: 12 }}>
                    文字表示（投稿用）
                  </div>

                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={d.overlayEnabled}
                      onChange={(e) =>
                        setD((p) => ({ ...p, overlayEnabled: e.target.checked }))
                      }
                    />
                    <span className="text-white/85" style={{ fontSize: 12 }}>
                      {d.overlayEnabled ? "ON" : "OFF"}
                    </span>
                  </label>
                </div>

                <div className="text-white/70 mt-2" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  ※ 文字は「元画像」にだけ乗ります（合成・動画には使われません）。
                </div>

                {/* ✅ 直接編集（復活） */}
                <div className="mt-3">
                  <div className="text-white/70 mb-2" style={{ fontSize: 12 }}>
                    テキスト（直接編集）
                  </div>

                  <textarea
                    value={d.overlayText}
                    onChange={(e) =>
                      setD((p) => ({ ...p, overlayText: e.target.value }))
                    }
                    className="w-full rounded-xl border p-3 outline-none"
                    style={{ ...formStyle, minHeight: UI.hOverlayText }}
                    placeholder="例：静かな存在感を、あなたに。"
                    disabled={busy}
                  />

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Btn
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setD((p) => ({ ...p, overlayText: "" }));
                        showMsg("文字をクリアしました（投稿用）");
                      }}
                    >
                      文字を消す
                    </Btn>

                    <Btn
                      variant="secondary"
                      disabled={!uid || busy}
                      onClick={saveCompositeAsImageUrl}
                    >
                      文字入り画像を保存（PNG）
                    </Btn>

                    <Btn variant="ghost" disabled={!uid || busy} onClick={() => saveDraft()}>
                      保存
                    </Btn>
                  </div>
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
          </details>

          {/* =========================
              ② 背景のみ（合成・動画用）
          ========================== */}
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
                  style={{
                    height: 240,
                    objectFit: "contain",
                    background: "rgba(0,0,0,0.25)",
                  }}
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

                <Btn
                  variant="secondary"
                  disabled={!uid || busy}
                  onClick={replaceBackgroundAndSaveToAiImage}
                >
                  製品画像＋背景を合成（保存）
                </Btn>

                <Btn
                  variant="secondary"
                  disabled={!uid || busy}
                  onClick={syncBgImagesFromStorage}
                >
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
                    {d.bgImageUrls.slice(0, 6).map((u: string) => (
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

          {/* =========================
              ③ イメージ画像（世界観・雰囲気）
              - 合成/動画には使用しない（表示専用）
          ========================== */}
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
                  style={{
                    height: 240,
                    objectFit: "contain",
                    background: "rgba(0,0,0,0.25)",
                  }}
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

          {/* =========================
              ④ 合成（動画用・文字なし）
          ========================== */}
          <details className="area4 rounded-2xl border border-white/10 bg-black/20">
            <summary className="cursor-pointer select-none p-3">
              <div className="text-white/70" style={{ fontSize: 12 }}>
                ④ 合成（動画用・文字なし）
              </div>
            </summary>

            <div className="p-3 pt-0">
  {(previewMode === "composite" ? displayImageUrl : d.aiImageUrl || "") ? (
  <img
    src={previewMode === "composite" ? displayImageUrl : (d.aiImageUrl || "")}
    alt="composite"
    className="w-full rounded-xl border border-white/10"
    style={{
      height: 240,
      objectFit: "contain",
      background: "rgba(0,0,0,0.25)",
    }}
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

  {/* ✅ C案：task方式の保険（running の時だけ） */}
  <Btn
    variant="secondary"
    disabled={!uid || busy || !d.videoTaskId || (d.videoStatus !== "running" && d.videoStatus !== "queued")}
    onClick={async () => {
            const ensuredDraftId = draftIdRef.current ?? (await saveDraft()) ?? draftIdRef.current;
      if (!ensuredDraftId) {
        showMsg("下書きIDの確定に失敗しました");
        return;
      }
      if (!d.videoTaskId) {
        showMsg("taskId がありません（先に動画生成を開始してください）");
        return;
      }
      setRightTab("video");
      showMsg("状態を確認しています…");
      await checkVideoTaskOnce(d.videoTaskId, ensuredDraftId);
    }}
  >
    状態を確認（task）
  </Btn>

  {/* 互換：Storage同期は残しても良いが、C案では基本不要。
      残すなら「旧方式の復旧用」として意味を明示した方が事故らない */}
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