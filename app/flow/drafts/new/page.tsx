// /app/flow/drafts/new/page.tsx
"use client";

/**
 * AOI FLOW｜下書き 新規/編集
 *
 * ✅ 既存機能：キャプション生成 / 画像生成 / 画像アップロード / 文字入り合成 / 下書き保存 / 一覧互換
 * ✅ 復活：IG / X / IG3（3案）ブロック（本文は絶対上書きしない）
 * ✅ 追加：動画生成（秒数 5/10、品質2段階、テンプレ、サイズ選択、コスト表示）
 * ✅ 追加：画像ソース切替（UPLOAD / AI / COMPOSITE）
 * ✅ 追加：/api/config から価格取得（リアルタイム）
 * ✅ 追加：顧客向け「写真提出 指導書」をUIに常時表示（アップロード直下）※折りたたみ必須
 *
 * ✅ 最重要（課金事故対策）
 * - フロントは Idempotency-Key を送らない
 *   → サーバ側が「入力から安定キー(stableHash)」を生成し、同条件の押し直しでも課金を増やさない
 * - フロントは inFlight + busy で二重クリックを防止
 *
 * ✅ 今回の全張り替えでの修正
 * - /api/generate-video が 202(running) を返した時に「失敗扱いで落とさない」
 *   → “すでに生成中です” を表示して終了（課金事故防止）
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
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
type ImageSource = "upload" | "ai" | "composite";
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

  baseImageUrl?: string; // upload（常にJPEGに正規化）
  aiImageUrl?: string; // AI生成（PNG）
  compositeImageUrl?: string; // 文字入り（PNG）
  imageUrl?: string; // 代表（一覧互換）

  imageSource: ImageSource;

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
  onClick?: () => void;
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
      onClick={props.onClick}
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

function SelectBtn(props: { selected: boolean; label: string; onClick: () => void; disabled?: boolean; title?: string }) {
  const selected = props.selected;
  const textColor = selected ? "rgba(0,0,0,0.95)" : "rgba(255,255,255,0.95)";

  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      disabled={props.disabled}
      className={[
        "inline-flex items-center justify-center rounded-full px-4 py-2 font-black transition select-none whitespace-nowrap",
        "border",
        selected
          ? "bg-white !text-black border-white shadow-[0_0_0_3px_rgba(255,255,255,0.18),0_18px_40px_rgba(0,0,0,0.65)]"
          : "bg-transparent !text-white border-white/25 hover:bg-white/10 shadow-[0_10px_22px_rgba(0,0,0,0.35)]",
        props.disabled ? "opacity-40 cursor-not-allowed" : "active:scale-[0.99]",
      ].join(" ")}
      style={{
        fontSize: UI.FONT.buttonPx,
        color: textColor,
        WebkitTextFillColor: textColor as any,
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
    <div className="rounded-2xl border border-white/14 bg-black/25" style={{ padding: UI.RANGE.boxPad }}>
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: UI.RANGE.headerMb }}>
        <div className="text-white/85 font-bold" style={{ fontSize: UI.FONT.labelPx }}>
          {props.label}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => bump(-props.step)}
            className="rounded-full border border-white/25 bg-white/12 hover:bg-white/18 transition"
            style={{ width: size, height: size, fontWeight: 900, color: "rgba(255,255,255,0.95)" }}
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
            style={{ width: size, height: size, fontWeight: 900, color: "rgba(255,255,255,0.95)" }}
            title="大きく"
          >
            +
          </button>
        </div>
      </div>

      <input type="range" min={props.min} max={props.max} step={props.step} value={v} onChange={(e) => set(Number(e.target.value))} className="w-full" />
    </div>
  );
}

/**
 * ✅ 顧客向け「写真提出 指導書」（UI表示用）
 * - アップロード直下に常時表示（＝存在は常に見える）
 * - ただし「内容は折りたたみ必須」：details/summary で実装
 */
function PhotoSubmissionGuide() {
  return (
    <details className="rounded-2xl border border-white/12 bg-black/25 mt-3" style={{ padding: UI.cardPadding }}>
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

      <ul className="list-disc list-inside mt-2 space-y-1" style={{ color: "rgba(255,255,255,0.88)", fontSize: 13 }}>
        <li>背景は「白い壁 / 白い紙 / 単色の布」（柄・文字はNG）</li>
        <li>商品を画面の真ん中に大きく（小さいと形が崩れやすい）</li>
        <li>影を薄く（強い影は商品と誤認されやすい）</li>
      </ul>

      <div className="mt-3 text-white/70 font-bold" style={{ fontSize: UI.FONT.labelPx }}>
        NG例（失敗しやすい）
      </div>
      <ul className="list-disc list-inside mt-1 space-y-1" style={{ color: "rgba(255,255,255,0.70)", fontSize: 13 }}>
        <li>背景がごちゃごちゃ（部屋・棚・文字・柄）</li>
        <li>商品が小さい</li>
        <li>手で持ってる</li>
        <li>逆光 / 暗い / ブレている</li>
      </ul>

      <div className="mt-3 text-white/70 font-bold" style={{ fontSize: UI.FONT.labelPx }}>
        推奨
      </div>
      <ul className="list-disc list-inside mt-1 space-y-1" style={{ color: "rgba(255,255,255,0.70)", fontSize: 13 }}>
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

/** dataURL を Storage に保存（画像用：PNG） */
async function uploadDataUrlToStorage(uid: string, draftId: string, dataUrl: string) {
  const ext = "png";
  const path = `users/${uid}/drafts/${draftId}/${Date.now()}.${ext}`;
  const r = ref(storage, path);
  await uploadString(r, dataUrl, "data_url");
  return await getDownloadURL(r);
}

/** ✅ File を “必ず JPEG” に変換して Storage 保存（HEIF/HEIC対策） */
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

/** URL を blob として読み、object URL にして img/canvas で使えるようにする（CORS保険） */
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

/* =========================
   ✅ コスト表示：/api/config から取得（単一ソース）
   ========================= */
type PricingTable = {
  standard: { 5: number; 10: number };
  high: { 5: number; 10: number };
};
type ConfigResponseLike = any;

const FALLBACK_PRICING: PricingTable = {
  standard: { 5: 180, 10: 320 },
  high: { 5: 420, 10: 780 },
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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 動画（生成直後のプレビュー：URLが来たらそれを使う）
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // ✅ 二重送信・裏実行をフロントでも潰す（操作単位ロック）
  const inFlightRef = useRef<Record<string, boolean>>({});

  // ✅ 価格（/api/config 由来）
  const [pricing, setPricing] = useState<PricingTable>(FALLBACK_PRICING);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingUpdatedAt, setPricingUpdatedAt] = useState<number | null>(null);

  async function fetchPricing() {
    setPricingBusy(true);
    setPricingError(null);
    try {
      const r = await fetch("/api/config", { method: "GET", headers: { "cache-control": "no-store" } });
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

  // ✅ 読み込み（既存データ互換）
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
        const phase: Phase = data.phase === "ready" ? "ready" : data.phase === "posted" ? "posted" : "draft";

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

        const baseImageUrl = typeof data.baseImageUrl === "string" && data.baseImageUrl ? data.baseImageUrl : undefined;
        const aiImageUrl = typeof data.aiImageUrl === "string" && data.aiImageUrl ? data.aiImageUrl : undefined;
        const compositeImageUrl =
          typeof data.compositeImageUrl === "string" && data.compositeImageUrl ? data.compositeImageUrl : undefined;

        const overlayEnabled = typeof data.overlayEnabled === "boolean" ? data.overlayEnabled : true;
        const overlayText = typeof data.overlayText === "string" ? data.overlayText : ig || "";
        const overlayFontScale =
          typeof data.overlayFontScale === "number" ? clamp(data.overlayFontScale, 0.6, 1.6) : 1.0;
        const overlayY = typeof data.overlayY === "number" ? clamp(data.overlayY, 0, 100) : 75;
        const overlayBgOpacity =
          typeof data.overlayBgOpacity === "number" ? clamp(data.overlayBgOpacity, 0, 0.85) : 0.45;

        const videoUrl = typeof data.videoUrl === "string" && data.videoUrl ? data.videoUrl : undefined;
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

        const imageSource: ImageSource =
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
      } finally {
        setLoadBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, id]);

  const brandLabel = d.brand === "vento" ? "VENTO" : "RIVA";
  const phaseLabel = d.phase === "draft" ? "下書き" : d.phase === "ready" ? "投稿待ち" : "投稿済み";
  const canGenerate = d.vision.trim().length > 0 && !busy;

  /**
   * ✅ 「どの表示ソースを選んでいても、実在するベース画像（upload/ai）を必ず返す」
   */
  const baseForEditUrl = useMemo(() => {
    if (d.imageSource === "ai") return d.aiImageUrl || d.baseImageUrl || "";
    if (d.imageSource === "upload") return d.baseImageUrl || d.aiImageUrl || "";
    return d.baseImageUrl || d.aiImageUrl || "";
  }, [d.imageSource, d.baseImageUrl, d.aiImageUrl]);

  const displayImageUrl = useMemo(() => {
    if (d.imageSource === "composite") return d.compositeImageUrl || baseForEditUrl || "";
    if (d.imageSource === "ai") return d.aiImageUrl || d.baseImageUrl || "";
    return d.baseImageUrl || d.aiImageUrl || "";
  }, [d.imageSource, d.baseImageUrl, d.aiImageUrl, d.compositeImageUrl, baseForEditUrl]);

  const displayVideoUrl = videoPreviewUrl || d.videoUrl || undefined;

  async function saveDraft(partial?: Partial<DraftDoc>): Promise<string | null> {
    if (!uid) return null;

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

    if (!draftId) {
      payload.createdAt = serverTimestamp();
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
        aiImageUrl: url,
        imageSource: prev.imageSource === "upload" && prev.baseImageUrl ? "upload" : "ai",
      }));
      await saveDraft({ aiImageUrl: url, phase: "draft" });
    } catch (e: any) {
      console.error(e);
      alert(`画像生成に失敗しました\n\n原因: ${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["image"] = false;
    }
  }

  async function renderToCanvasAndGetDataUrl(): Promise<string | null> {
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

    const src = baseForEditUrl;
    if (!src) {
      alert("先に「画像をアップロード」または「AI画像生成」を行ってください（元画像がありません）");
      return null;
    }

    const loaded = await loadImageAsObjectUrl(src);
    if (!loaded) {
      alert("画像の読み込みに失敗しました（CORS/キャッシュの可能性）。少し待って再試行してください。");
      return null;
    }

    try {
      const img = new Image();
      img.src = loaded.objectUrl;

      const ok = await new Promise<boolean>((res) => {
        img.onload = () => res(true);
        img.onerror = () => res(false);
      });

      if (!ok) {
        alert("画像の読み込みに失敗しました（ブラウザ制限の可能性）。少し待って再試行してください。");
        return null;
      }

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

      const out = await renderToCanvasAndGetDataUrl();
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

  function applyIg3ToOverlayOnly(text: string) {
    const t = (text ?? "").trim();
    if (!t) return;
    setD((p) => ({ ...p, overlayText: t }));
  }

  // ==========================
  // ✅ 動画生成（/api/generate-video）
  // ==========================
  const secondsKey: UiSeconds = (d.videoSeconds ?? 5) === 10 ? 10 : 5;
  const costStandard = pricing.standard[secondsKey];
  const costHigh = pricing.high[secondsKey];
  const shownCost = (d.videoQuality ?? "standard") === "high" ? costHigh : costStandard;

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

  const sizePresets: { id: UiVideoSize; label: string; sub: string }[] = [
    { id: "1024x1792", label: "Instagram / TikTok 縦（高画質）", sub: "おすすめ（品質を選ぶ意味が残る）" },
    { id: "720x1280", label: "Instagram / TikTok 縦（軽量）", sub: "試作・回数多い時" },
    { id: "1792x1024", label: "YouTube / Web 横（高画質）", sub: "サイト・LP・YouTube向け" },
    { id: "1280x720", label: "YouTube / Web 横（軽量）", sub: "試作・軽量" },
  ];

  async function generateVideo() {
    if (!uid) return;
    const vision = d.vision.trim();
    if (!vision) return alert("Vision（必須）を入力してください");

    // ✅ 二重送信防止（最強）
    if (inFlightRef.current["video"]) return;
    inFlightRef.current["video"] = true;

    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("no token");

      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) throw new Error("failed to create draft");

      // 「composite → base → ai」順で参照画像を拾う（imageSource依存にしない）
      const reference = d.compositeImageUrl || d.baseImageUrl || d.aiImageUrl || "";
      if (!reference) {
        alert("先に「画像をアップロード」または「AI画像生成」または「文字入り画像を保存」を行ってください（参照画像がありません）");
        return;
      }

      const seconds = d.videoSeconds ?? 5;
      const templateId = d.videoTemplate ?? "slowZoomFade";
      const quality = (d.videoQuality ?? "standard") === "high" ? "high" : "standard";
      const size = d.videoSize ?? "1024x1792";

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
      };

      const r = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));

      // ✅ ここが今回の重要修正：202 = 生成中（課金事故防止で再実行しない）
      if (r.status === 202 || j?.running) {
        alert("すでに生成中です（同条件の再実行はしません）。少し待ってから、もう一度ページを開いて確認してください。");
        return;
      }

      if (!r.ok) throw new Error(j?.error || "video error");

      const url = typeof j?.url === "string" ? j.url : "";
      if (!url) throw new Error("no video url");

      setVideoPreviewUrl(url);

      setD((prev) => ({
        ...prev,
        videoUrl: url,
        videoSeconds: seconds,
        videoQuality: quality,
        videoTemplate: templateId,
        videoSize: size,
      }));

      await saveDraft({
        videoUrl: url,
        videoSeconds: seconds,
        videoQuality: quality,
        videoTemplate: templateId,
        videoSize: size,
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

  // ==========================
  // ✅ アップロード処理
  // ==========================
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
        @media (min-width: 1024px) {
          .pageWrap {
            flex-direction: row;
            align-items: flex-start;
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
        {/* 左：入力と生成 */}
        <section className="leftCol min-h-0 flex flex-col gap-3">
          <div className="shrink-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap" />
            {UI.showLoadingText && loadBusy ? (
              <div className="text-white/75" style={{ fontSize: UI.FONT.labelPx }}>
                読み込み中...
              </div>
            ) : null}
          </div>

          {/* Brand / 画像ソース / Vision / Keywords / 操作 */}
          <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
            <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
              Brand
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Btn variant={d.brand === "vento" ? "primary" : "secondary"} onClick={() => setD((p) => ({ ...p, brand: "vento" }))}>
                VENTO
              </Btn>
              <Btn variant={d.brand === "riva" ? "primary" : "secondary"} onClick={() => setD((p) => ({ ...p, brand: "riva" }))}>
                RIVA
              </Btn>
              <Chip>
                {brandLabel} / {phaseLabel}
              </Chip>
            </div>

            {/* 画像ソース */}
            <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
              画像（アップロード / AI生成 / 文字入り）
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <SelectBtn
                selected={d.imageSource === "upload"}
                label={`表示: UPLOAD（base）${d.baseImageUrl ? " ✓" : ""}`}
                onClick={() => setD((p) => ({ ...p, imageSource: "upload" }))}
                disabled={busy}
              />
              <SelectBtn
                selected={d.imageSource === "ai"}
                label={`表示: AI${d.aiImageUrl ? " ✓" : ""}`}
                onClick={() => setD((p) => ({ ...p, imageSource: "ai" }))}
                disabled={busy}
              />
              <SelectBtn
                selected={d.imageSource === "composite"}
                label={`表示: COMPOSITE${d.compositeImageUrl ? " ✓" : ""}`}
                onClick={() => setD((p) => ({ ...p, imageSource: "composite" }))}
                disabled={busy || !d.compositeImageUrl}
                title={!d.compositeImageUrl ? "まだ文字入り画像がありません" : ""}
              />
            </div>

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

              <Btn variant="secondary" disabled={!canGenerate} onClick={generateAiImage} title="AI画像は base を上書きしません（aiImageUrlへ保存）">
                AI画像を生成（正方形）
              </Btn>

              <Btn variant="ghost" disabled={!uid || busy} onClick={() => saveDraft()}>
                保存
              </Btn>
            </div>

            <div className="text-white/55 mt-2" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.5 }}>
              ※ アップロード画像は内部でJPEGに変換して保存します。<br />
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

          {/* IG */}
          <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-white/80" style={{ fontSize: UI.FONT.labelPx }}>
                Instagram本文（メイン）
              </div>
              <Btn variant="secondary" className="px-3 py-1" onClick={() => navigator.clipboard.writeText(d.ig)}>
                コピー
              </Btn>
            </div>
            <textarea
              value={d.ig}
              onChange={(e) => setD((p) => ({ ...p, ig: e.target.value }))}
              className="mt-2 w-full rounded-xl border p-3 outline-none"
              style={{ ...formStyle, minHeight: UI.hIG }}
            />
          </div>

          {/* X */}
          <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
            <div className="flex items-center justify-between">
              <div className="text-white/80" style={{ fontSize: UI.FONT.labelPx }}>
                X本文
              </div>
              <Btn variant="secondary" className="px-3 py-1" onClick={() => navigator.clipboard.writeText(d.x)}>
                コピー
              </Btn>
            </div>
            <textarea
              value={d.x}
              onChange={(e) => setD((p) => ({ ...p, x: e.target.value }))}
              className="mt-2 w-full rounded-xl border p-3 outline-none"
              style={{ ...formStyle, minHeight: UI.hX }}
            />
          </div>

          {/* メモ + 状態 */}
          <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
            <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
              メモ（任意）
            </div>
            <textarea
              value={d.memo}
              onChange={(e) => setD((p) => ({ ...p, memo: e.target.value }))}
              className="w-full rounded-xl border p-3 outline-none"
              style={{ ...formStyle, minHeight: UI.hMemo }}
            />
            <div className="mt-3 flex gap-2 flex-wrap">
              <Btn variant="primary" disabled={!uid || busy} onClick={() => setPhase("ready")}>
                投稿待ちにする
              </Btn>
              <Btn variant="secondary" disabled={!uid || busy} onClick={() => setPhase("posted")}>
                投稿済みにする
              </Btn>
            </div>
          </div>

          {/* IG3（復活） */}
          <div className="rounded-2xl border border-white/12 bg-black/20" style={{ padding: UI.cardPadding }}>
            <div className="text-white/70 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
              補助：Instagram 3案（※本文は絶対に上書きしない）
            </div>

            {d.ig3.length === 0 ? (
              <div className="text-white/45" style={{ fontSize: UI.FONT.inputPx }}>
                （まだありません）
              </div>
            ) : (
              <div className="space-y-2">
                {d.ig3.map((t, i) => (
                  <div
                    key={i}
                    className="w-full rounded-xl border p-3"
                    style={{
                      background: "rgba(0,0,0,0.35)",
                      borderColor: "rgba(255,255,255,0.18)",
                      color: UI.FORM.text,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="text-white/55" style={{ fontSize: UI.FONT.labelPx }}>
                        案 {i + 1}
                      </div>
                      <div className="flex items-center gap-2">
                        <Btn variant="secondary" className="px-3 py-1" onClick={() => applyIg3ToOverlayOnly(t)}>
                          文字に適用
                        </Btn>
                        <Btn variant="ghost" className="px-3 py-1" onClick={() => navigator.clipboard.writeText(t)}>
                          コピー
                        </Btn>
                      </div>
                    </div>

                    <div style={{ fontSize: UI.FONT.inputPx, lineHeight: UI.FONT.inputLineHeight as any, whiteSpace: "pre-wrap" }}>{t}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 動画生成セクション */}
          <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-white/90 font-black" style={{ fontSize: UI.FONT.inputPx }}>
                動画生成
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Chip className="text-white/95">
                  参照画像：{d.compositeImageUrl || d.baseImageUrl || d.aiImageUrl ? "あり" : "なし"}
                </Chip>
                <Chip className="text-white/95">{pricingMetaText}</Chip>
              </div>
            </div>

            {/* 秒数 */}
            <div className="mt-4">
              <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
                秒数（5 / 10）
              </div>
              <div className="flex flex-wrap gap-2">
                <SelectBtn selected={(d.videoSeconds ?? 5) === 5} label="5" onClick={() => setD((p) => ({ ...p, videoSeconds: 5 }))} disabled={!uid || busy} />
                <SelectBtn selected={(d.videoSeconds ?? 5) === 10} label="10" onClick={() => setD((p) => ({ ...p, videoSeconds: 10 }))} disabled={!uid || busy} />
              </div>
            </div>

            {/* 品質 */}
            <div className="mt-4">
              <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
                品質（画質で選ぶ）
              </div>

              <div className="flex flex-wrap gap-2">
                <SelectBtn
                  selected={(d.videoQuality ?? "standard") === "standard"}
                  label="確実（標準）【おすすめ】"
                  onClick={() => setD((p) => ({ ...p, videoQuality: "standard" }))}
                  disabled={!uid || busy}
                  title="雰囲気・世界観重視。通常表示向け。"
                />
                <SelectBtn
                  selected={(d.videoQuality ?? "standard") === "high"}
                  label="確実＋高精細"
                  onClick={() => setD((p) => ({ ...p, videoQuality: "high" }))}
                  disabled={!uid || busy}
                  title="商品用途・拡大表示向け。"
                />
              </div>

              <div className="text-white/55 mt-2" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.55 }}>
                委託・納品どちらも対応しています。商品用途の場合は高精細をおすすめします。
              </div>
            </div>

            {/* テンプレ */}
            <div className="mt-4">
              <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
                テンプレ（全部表示）
              </div>
              <div className="flex flex-wrap gap-2">
                {templateItems.map((t) => (
                  <SelectBtn key={t.id} selected={(d.videoTemplate ?? "slowZoomFade") === t.id} label={t.label} onClick={() => setD((p) => ({ ...p, videoTemplate: t.id }))} disabled={!uid || busy} />
                ))}
              </div>

              <div className="mt-3 rounded-2xl border border-white/12 bg-black/20" style={{ padding: UI.cardPadding }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-white/80 font-black" style={{ fontSize: UI.FONT.labelPx }}>
                    🤖 AIおすすめ（表示のみ・自動選択はしない）
                  </div>
                  <Chip className="text-white/95">判断補助コメント</Chip>
                </div>

                <div className="text-white/90 mt-2" style={{ fontSize: UI.FONT.inputPx, fontWeight: 900 }}>
                  おすすめ：ゆっくりズーム＋フェード
                </div>
                <div className="text-white/70 mt-2" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.65 }}>
                  理由：
                </div>
                <ul className="list-disc list-inside mt-1 space-y-1" style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
                  <li>商品の視認性を保ちやすい</li>
                  <li>破綻が起きにくい</li>
                  <li>SNS・商品用途どちらでも使える</li>
                </ul>

                <div className="text-white/55 mt-2" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.55 }}>
                  ※ ボタン選択はユーザー（AIはコメントのみ）
                </div>
              </div>
            </div>

            {/* サイズ */}
            <div className="mt-4">
              <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
                サイズ（用途別）
              </div>
              <div className="grid gap-2">
                {sizePresets.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-2">
                    <SelectBtn selected={(d.videoSize ?? "1024x1792") === p.id} label={p.label} onClick={() => setD((x) => ({ ...x, videoSize: p.id }))} disabled={!uid || busy} />
                    <div className="text-white/55" style={{ fontSize: UI.FONT.labelPx }}>
                      {p.id} / {p.sub}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 実コスト */}
            <div className="mt-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-white/80" style={{ fontSize: UI.FONT.labelPx }}>
                  実コスト目安（円）
                </div>
                <Btn variant="ghost" className="px-3 py-1" disabled={pricingBusy} onClick={fetchPricing} title="/api/config を再取得">
                  更新
                </Btn>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Chip className="text-white/95">標準：{yen(costStandard)} / 本</Chip>
                <Chip className="text-white/95">高精細：{yen(costHigh)} / 本</Chip>
                <Chip className="text-white/95">選択中：{yen(shownCost)} / 本</Chip>
              </div>

              {pricingError ? (
                <div className="text-white/55 mt-2" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.5 }}>
                  ※ {pricingError}（表示は継続。/api/config が直れば自動で追従）
                </div>
              ) : (
                <div className="text-white/55 mt-2" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.5 }}>
                  ※ 表示は /api/config の設定値に追従します（60秒おき＋タブ復帰時に自動更新）。
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Btn variant="primary" disabled={!uid || busy || !d.vision.trim()} onClick={generateVideo}>
                動画を生成して保存
              </Btn>
              <Btn variant="ghost" disabled={!uid || busy} onClick={() => saveDraft()}>
                設定を保存
              </Btn>
            </div>

            <div className="text-white/55 mt-2" style={{ fontSize: UI.FONT.labelPx }}>
              ※ 参照画像が無い場合は生成を止めます。
            </div>
          </div>
        </section>

        {/* 右：プレビュー */}
        <section className="rightCol min-h-0 flex flex-col gap-4">
          <div className="rightScroll min-h-0" style={{ paddingBottom: 8 }}>
            {/* 画像プレビュー */}
            <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
              <div className="rounded-2xl border border-white/12 bg-black/30 p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <Chip className="text-white/95">表示ソース：{d.imageSource.toUpperCase()}</Chip>
                </div>

                <div
                  className="mx-auto"
                  style={{
                    width: "100%",
                    maxWidth: UI.previewMaxWidth,
                    aspectRatio: "1 / 1",
                    borderRadius: UI.previewRadius,
                    overflow: "hidden",
                    position: "relative",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  {displayImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={displayImageUrl} alt="preview" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-sm text-white/55">NO IMAGE</div>
                  )}

                  {d.overlayEnabled && previewOverlayText ? (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: `${clamp(d.overlayY, 0, 100)}%`,
                        transform: "translateY(-50%)",
                        padding: "14px 14px",
                        background: `rgba(0,0,0,${clamp(d.overlayBgOpacity, 0, 0.85)})`,
                      }}
                    >
                      <div
                        style={{
                          textAlign: "center",
                          fontWeight: 900,
                          lineHeight: 1.35,
                          fontSize: `${Math.round(UI.FONT.overlayPreviewBasePx * clamp(d.overlayFontScale, 0.6, 1.6))}px`,
                          color: "rgba(255,255,255,0.95)",
                          textShadow: "0 2px 10px rgba(0,0,0,0.45)",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {previewOverlayText}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* 文字調整 */}
                <div className="mt-4 grid gap-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Chip className="text-white/95">文字表示</Chip>
                    <Btn variant="secondary" onClick={() => setD((p) => ({ ...p, overlayEnabled: !p.overlayEnabled }))}>
                      {d.overlayEnabled ? "ON" : "OFF"}
                    </Btn>
                  </div>

                  <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
                    <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
                      載せる文字（※本文とは別）
                    </div>
                    <textarea value={d.overlayText} onChange={(e) => setD((p) => ({ ...p, overlayText: e.target.value }))} className="w-full rounded-xl border p-3 outline-none" style={{ ...formStyle, minHeight: UI.hOverlayText }} />
                  </div>

                  <RangeControl label="文字サイズ" value={d.overlayFontScale} min={0.6} max={1.6} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => setD((p) => ({ ...p, overlayFontScale: v }))} />
                  <RangeControl label="位置（上下）" value={d.overlayY} min={0} max={100} step={1} format={(v) => String(Math.round(v))} onChange={(v) => setD((p) => ({ ...p, overlayY: v }))} />
                  <RangeControl label="背景帯の濃さ" value={d.overlayBgOpacity} min={0} max={0.85} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => setD((p) => ({ ...p, overlayBgOpacity: v }))} />

                  <div className="flex flex-wrap gap-2">
                    <Btn variant="primary" disabled={busy} onClick={saveCompositeAsImageUrl}>
                      文字入り画像を保存
                    </Btn>
                    <Btn variant="ghost" disabled={!uid || busy} onClick={() => saveDraft()}>
                      調整を保存
                    </Btn>
                  </div>

                  <div className="text-white/55" style={{ fontSize: UI.FONT.labelPx }}>
                    ※ 保存される画像は 1024×1024 のPNGです。<br />
                    ※ 元画像（base）は保持され、完成画像（composite）だけ追加されます。
                  </div>
                </div>

                <canvas ref={canvasRef} style={{ display: "none" }} />
              </div>
            </div>

            {/* 動画プレビュー */}
            <div className="mt-3 rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-white/90 font-black" style={{ fontSize: UI.FONT.inputPx }}>
                  動画プレビュー（保存済み）
                </div>
                <Chip className="text-white/95">
                  {(d.videoTemplate ?? "slowZoomFade")} / {(d.videoSeconds ?? 5)}s / {(d.videoSize ?? "1024x1792")}
                </Chip>
              </div>

              <div className="mt-3">
                {displayVideoUrl ? (
                  <video
                    src={displayVideoUrl}
                    controls
                    playsInline
                    style={{
                      width: "100%",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(0,0,0,0.25)",
                    }}
                  />
                ) : (
                  <div className="h-[220px] w-full grid place-items-center text-sm text-white/55 rounded-2xl border border-white/12 bg-black/20">NO VIDEO</div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Btn
                  variant="ghost"
                  disabled={!uid || busy}
                  onClick={() => {
                    setVideoPreviewUrl(null);
                    alert("ローカルプレビューを解除しました（保存済みURLがあればそれが表示されます）");
                  }}
                >
                  プレビュー解除
                </Btn>
                <Btn variant="ghost" disabled={!uid || busy} onClick={() => saveDraft()}>
                  状態を保存
                </Btn>
              </div>

              <div className="text-white/55 mt-2" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.5 }}>
                ※ 生成した動画は videoUrl と設定がFirestoreに保存されます。
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}