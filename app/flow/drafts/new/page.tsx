// /app/flow/drafts/new/page.tsx
"use client";

/**
 * AOI FLOW｜新規作成ページ（作業画面）
 *
 * ✅ このファイルの目的
 * - 「元画像（base）」と「文字入り完成画像（composite）」を分離して管理し、
 *   文字入り保存で「黒い画像（文字だけ）」が量産される問題を防ぐ。
 *
 * ✅ 重要なルール（仕様書準拠）
 * - 下書き一覧 / 投稿待ち一覧 / ブランド反映は壊さない
 * - UIの機能追加はしない（内部品質の改善のみ）
 * - 文章生成は IG + X を1回で出す（既存仕様維持）
 */

import React, { useEffect, useRef, useState } from "react";
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
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/firebase";

type Brand = "vento" | "riva";
type Phase = "draft" | "ready" | "posted";

/**
 * DraftDoc（画面内の状態）
 * - baseImageUrl: 画像生成（正方形）の元画像URL（絶対に保持する）
 * - compositeImageUrl: 「文字入り画像を保存」した完成画像URL
 * - imageUrl: 既存互換用の代表URL（一覧表示など既存ロジック用）
 */
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

  // ✅ 新規（壊さず拡張）
  baseImageUrl?: string;
  compositeImageUrl?: string;

  // ✅ 既存互換（今までの実装が使っている可能性が高い）
  imageUrl?: string;

  overlayEnabled: boolean;
  overlayText: string;
  overlayFontScale: number;
  overlayY: number;
  overlayBgOpacity: number;

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
  compositeImageUrl: undefined,
  imageUrl: undefined,

  overlayEnabled: true,
  overlayText: "",
  overlayFontScale: 1.0,
  overlayY: 75,
  overlayBgOpacity: 0.45,
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
            style={{ width: size, height: size, fontWeight: 900 }}
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
            style={{ width: size, height: size, fontWeight: 900 }}
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

/**
 * Storageへ dataURL を保存し、ダウンロードURLを返す
 * - 画像生成（base）も、文字入り保存（composite）も、ここで統一
 */
async function uploadDataUrlToStorage(uid: string, draftId: string, dataUrl: string) {
  const path = `users/${uid}/drafts/${draftId}/${Date.now()}.png`;
  const r = ref(storage, path);
  await uploadString(r, dataUrl, "data_url");
  return await getDownloadURL(r);
}

/**
 * ✅ Canvas汚染（CORS）を避けるための読み込み関数
 * - StorageのURLをそのまま Image().src に入れると、環境によってCanvasが壊れることがある
 * - いったん fetch → blob → objectURL にして読み込むと安定しやすい
 *
 * もしCORSがまだ反映されていない場合は fetch が失敗するので、
 * その場合は「保存を中断」して黒画像を作らない。
 */
async function loadImageAsObjectUrl(src: string): Promise<{ objectUrl: string; revoke: () => void } | null> {
  try {
    const res = await fetch(src, { method: "GET" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    return {
      objectUrl,
      revoke: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    return null;
  }
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

  // -------------------------
  // 認証チェック（ログイン必須）
  // -------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setLoadBusy(false);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  // -------------------------
  // 既存下書きの読み込み（idがある場合）
  // -------------------------
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

        // ✅ 新フィールド（あれば読む）
        const baseImageUrl =
          typeof data.baseImageUrl === "string" && data.baseImageUrl ? data.baseImageUrl : undefined;
        const compositeImageUrl =
          typeof data.compositeImageUrl === "string" && data.compositeImageUrl ? data.compositeImageUrl : undefined;

        // ✅ 旧フィールド（互換）
        const imageUrl =
          typeof data.imageUrl === "string" && data.imageUrl ? data.imageUrl : undefined;

        const overlayEnabled =
          typeof data.overlayEnabled === "boolean" ? data.overlayEnabled : true;

        const overlayText =
          typeof data.overlayText === "string" ? data.overlayText : (ig || "");

        const overlayFontScale =
          typeof data.overlayFontScale === "number"
            ? clamp(data.overlayFontScale, 0.6, 1.6)
            : 1.0;
        const overlayY =
          typeof data.overlayY === "number" ? clamp(data.overlayY, 0, 100) : 75;
        const overlayBgOpacity =
          typeof data.overlayBgOpacity === "number"
            ? clamp(data.overlayBgOpacity, 0, 0.85)
            : 0.45;

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
          compositeImageUrl,
          imageUrl,
          overlayEnabled,
          overlayText,
          overlayFontScale,
          overlayY,
          overlayBgOpacity,
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
  const phaseLabel =
    d.phase === "draft" ? "下書き" : d.phase === "ready" ? "投稿待ち" : "投稿済み";
  const canGenerate = d.vision.trim().length > 0 && !busy;

  /**
   * 表示に使う画像URL
   * - composite があれば完成画像を優先
   * - なければ base
   * - 旧互換の imageUrl もフォールバックとして利用
   */
  const displayImageUrl =
    d.compositeImageUrl || d.baseImageUrl || d.imageUrl || undefined;

  /**
   * ✅ 保存（Firestore）
   * - null / undefined をそのまま保存しない（Firebase側で見え方が崩れるため）
   * - 既存互換の imageUrl は残す
   *   -> 一覧表示が imageUrl を参照している場合が多いので壊さない
   */
  async function saveDraft(partial?: Partial<DraftDoc>): Promise<string | null> {
    if (!uid) return null;

    const next: DraftDoc = { ...d, ...(partial ?? {}), userId: uid };

    // ✅ imageUrl は「代表画像」として運用
    // - composite があるなら composite を代表に
    // - なければ base を代表に
    const representativeUrl =
      next.compositeImageUrl || next.baseImageUrl || next.imageUrl || null;

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

      // ✅ 新：分離管理（未設定なら null で統一）
      baseImageUrl: next.baseImageUrl ?? null,
      compositeImageUrl: next.compositeImageUrl ?? null,

      // ✅ 旧：互換（一覧表示などのため残す）
      imageUrl: representativeUrl,

      // 旧互換フィールド（残す）
      caption_final: next.ig,

      overlayEnabled: next.overlayEnabled,
      overlayText: next.overlayText,
      overlayFontScale: next.overlayFontScale,
      overlayY: next.overlayY,
      overlayBgOpacity: next.overlayBgOpacity,

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

  // -------------------------
  // 文章生成（IG + X）
  // -------------------------
  async function generateCaptions() {
    if (!uid) return;
    const vision = d.vision.trim();
    if (!vision) return alert("Vision（必須）を入力してください");

    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("no token");

      const body = {
        brandId: d.brand,
        vision,
        keywords: splitKeywords(d.keywordsText),
        tone: "",
      };

      const r = await fetch("/api/generate-captions", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const j = await r.json();
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
    } catch (e) {
      console.error(e);
      alert("文章生成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  // -------------------------
  // 画像生成（正方形）
  // -------------------------
  async function generateImage() {
    if (!uid) return;
    const vision = d.vision.trim();
    if (!vision) return alert("Vision（必須）を入力してください");

    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("no token");

      // ✅ draftId を確実に作る（Storageの保存先に必要）
      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) throw new Error("failed to create draft");

      const body = {
        brandId: d.brand,
        vision,
        keywords: splitKeywords(d.keywordsText),
        tone: "",
      };

      const r = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "image error");

      const b64 = typeof j.b64 === "string" ? j.b64 : "";
      if (!b64) throw new Error("no b64");

      // ✅ dataURL にして Storageへアップ → URLだけ保存
      const dataUrl = `data:image/png;base64,${b64}`;
      const url = await uploadDataUrlToStorage(uid, ensuredDraftId, dataUrl);

      // ✅ base画像として保持（絶対に消さない）
      setD((prev) => ({
        ...prev,
        baseImageUrl: url,
        // 代表URL（一覧表示向け）も更新しておく（互換維持）
        imageUrl: url,
        // baseが変わったら、古いcompositeは残すかどうか迷うが
        // ここでは「残す」（ユーザーが意図して保存した完成物を消さない）
      }));

      await saveDraft({ baseImageUrl: url, imageUrl: url, phase: "draft" });
    } catch (e) {
      console.error(e);
      alert("画像生成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  /**
   * ✅ Canvas合成して dataURL を得る（黒画像量産を防ぐ）
   *
   * 重要：
   * - 元画像は baseImageUrl を使う（compositeを再合成しない）
   * - base がない場合は保存できない（黒背景だけで保存しない）
   * - 画像読み込みに失敗したら「中断」して null を返す
   */
  async function renderToCanvasAndGetDataUrl(): Promise<string | null> {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const SIZE = 1024;
    canvas.width = SIZE;
    canvas.height = SIZE;

    // 背景（万一画像がない場合でも真っ黒を保存しないため、後で中断する）
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "#0b0f18";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // ✅ 元画像は base を使う（ないなら保存禁止）
    const src = d.baseImageUrl || d.imageUrl; // 旧互換で imageUrl も使えるようにしておく
    if (!src) {
      alert("先に「画像を生成（正方形）」を押してください（元画像がありません）");
      return null;
    }

    // ✅ fetch→blob→objectURL で読み込む（CORSが通っていないとここで失敗する）
    const loaded = await loadImageAsObjectUrl(src);
    if (!loaded) {
      alert(
        "画像の読み込みに失敗しました（CORS反映待ち/キャッシュの可能性）。\n" +
          "少し待ってから、また「文字入り画像を保存」を押してください。"
      );
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
        alert(
          "画像の読み込みに失敗しました（ブラウザ側の制限の可能性）。\n" +
            "少し待ってから、もう一度試してください。"
        );
        return null;
      }

      const iw = img.naturalWidth || SIZE;
      const ih = img.naturalHeight || SIZE;

      // contain で中央に収める（既存仕様維持）
      const scale = Math.min(SIZE / iw, SIZE / ih);
      const w = iw * scale;
      const h = ih * scale;
      const x = (SIZE - w) / 2;
      const y = (SIZE - h) / 2;
      ctx.drawImage(img, x, y, w, h);
    } finally {
      // ✅ objectURLは使い終わったら解放
      loaded.revoke();
    }

    // -------------------------
    // 文字オーバーレイ
    // -------------------------
    const overlayText = (d.overlayText || "").trim();
    if (d.overlayEnabled && overlayText) {
      const fontScale = clamp(d.overlayFontScale, 0.6, 1.6);
      const fontPx = Math.round(UI.FONT.overlayCanvasBasePx * fontScale);

      ctx.font = `900 ${fontPx}px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
      ctx.textBaseline = "top";

      const maxWidth = Math.floor(SIZE * 0.86);

      // 文字を自動改行（1行がmaxWidthを超えないように分割）
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

      // 背景帯
      ctx.fillStyle = `rgba(0,0,0,${bgAlpha})`;
      const rectY = Math.max(0, topY - Math.round(pad * 0.6));
      const rectH = Math.min(SIZE - rectY, blockH + Math.round(pad * 1.2));
      ctx.fillRect(0, rectY, SIZE, rectH);

      // 文字
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      for (let i = 0; i < fixedLines.length; i++) {
        const ln = fixedLines[i];
        const textW = ctx.measureText(ln).width;
        const tx = Math.round((SIZE - textW) / 2);
        const ty = topY + i * lineH;
        ctx.fillText(ln, tx, ty);
      }
    }

    // ✅ ここまで来たら「ちゃんと画像が描けた」ので dataURL を返す
    return canvas.toDataURL("image/png");
  }

  /**
   * ✅ 文字入り画像を保存（黒画像量産を防ぐ版）
   *
   * - 合成に失敗したら保存しない（nullで中断）
   * - compositeImageUrl に保存
   * - 互換のため imageUrl も composite を代表に更新（一覧表示が壊れない）
   * - baseImageUrl は絶対に上書きしない（元画像を守る）
   */
  async function saveCompositeAsImageUrl() {
    if (!uid) return;

    setBusy(true);
    try {
      const ensuredDraftId = draftId ?? (await saveDraft());
      if (!ensuredDraftId) throw new Error("failed to create draft");

      const out = await renderToCanvasAndGetDataUrl();
      if (!out) return; // ✅ 失敗時は保存しない（黒画像を作らない）

      const url = await uploadDataUrlToStorage(uid, ensuredDraftId, out);

      setD((prev) => ({
        ...prev,
        compositeImageUrl: url,
        // ✅ 代表画像も更新（一覧表示の互換維持）
        imageUrl: url,
      }));

      await saveDraft({ compositeImageUrl: url, imageUrl: url });

      alert("文字入りプレビューを保存しました");
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました");
    } finally {
      setBusy(false);
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

          {/* Brand / Vision / Keywords / 操作 */}
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
              <Btn variant="secondary" disabled={!canGenerate} onClick={generateImage}>
                画像を生成（正方形）
              </Btn>
              <Btn variant="ghost" disabled={!uid || busy} onClick={() => saveDraft()}>
                保存
              </Btn>
            </div>
          </div>

          {/* IG */}
          <div
            className="rounded-2xl border border-white/12 bg-black/25"
            style={{ padding: UI.cardPadding }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-white/80" style={{ fontSize: UI.FONT.labelPx }}>
                Instagram本文（メイン）
              </div>
              <Btn
                variant="secondary"
                className="px-3 py-1"
                onClick={() => navigator.clipboard.writeText(d.ig)}
              >
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
          <div
            className="rounded-2xl border border-white/12 bg-black/25"
            style={{ padding: UI.cardPadding }}
          >
            <div className="flex items-center justify-between">
              <div className="text-white/80" style={{ fontSize: UI.FONT.labelPx }}>
                X本文
              </div>
              <Btn
                variant="secondary"
                className="px-3 py-1"
                onClick={() => navigator.clipboard.writeText(d.x)}
              >
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
          <div
            className="rounded-2xl border border-white/12 bg-black/25"
            style={{ padding: UI.cardPadding }}
          >
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

          {/* IG3 */}
          <div
            className="rounded-2xl border border-white/12 bg-black/20"
            style={{ padding: UI.cardPadding }}
          >
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
                        <Btn
                          variant="secondary"
                          className="px-3 py-1"
                          onClick={() => applyIg3ToOverlayOnly(t)}
                        >
                          文字に適用
                        </Btn>
                        <Btn
                          variant="ghost"
                          className="px-3 py-1"
                          onClick={() => navigator.clipboard.writeText(t)}
                        >
                          コピー
                        </Btn>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: UI.FONT.inputPx,
                        lineHeight: UI.FONT.inputLineHeight as any,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {t}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 右：完成プレビュー＋文字調整 */}
        <section className="rightCol min-h-0 flex flex-col gap-4">
          <div className="rightScroll min-h-0" style={{ paddingBottom: 8 }}>
            <div
              className="rounded-2xl border border-white/12 bg-black/25"
              style={{ padding: UI.cardPadding }}
            >
              <div className="rounded-2xl border border-white/12 bg-black/30 p-3">
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
                    <img
                      src={displayImageUrl}
                      alt="preview"
                      draggable={false}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-sm text-white/55">
                      NO IMAGE
                    </div>
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
                          fontSize: `${Math.round(
                            UI.FONT.overlayPreviewBasePx *
                              clamp(d.overlayFontScale, 0.6, 1.6)
                          )}px`,
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

                <div className="mt-4 grid gap-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Chip className="text-white/95">文字表示</Chip>
                    <Btn
                      variant="secondary"
                      onClick={() => setD((p) => ({ ...p, overlayEnabled: !p.overlayEnabled }))}
                    >
                      {d.overlayEnabled ? "ON" : "OFF"}
                    </Btn>
                  </div>

                  <div
                    className="rounded-2xl border border-white/12 bg-black/25"
                    style={{ padding: UI.cardPadding }}
                  >
                    <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
                      載せる文字（※本文とは別）
                    </div>
                    <textarea
                      value={d.overlayText}
                      onChange={(e) => setD((p) => ({ ...p, overlayText: e.target.value }))}
                      className="w-full rounded-xl border p-3 outline-none"
                      style={{ ...formStyle, minHeight: UI.hOverlayText }}
                    />
                  </div>

                  <RangeControl
                    label="文字サイズ"
                    value={d.overlayFontScale}
                    min={0.6}
                    max={1.6}
                    step={0.05}
                    format={(v) => v.toFixed(2)}
                    onChange={(v) => setD((p) => ({ ...p, overlayFontScale: v }))}
                  />
                  <RangeControl
                    label="位置（上下）"
                    value={d.overlayY}
                    min={0}
                    max={100}
                    step={1}
                    format={(v) => String(Math.round(v))}
                    onChange={(v) => setD((p) => ({ ...p, overlayY: v }))}
                  />
                  <RangeControl
                    label="背景帯の濃さ"
                    value={d.overlayBgOpacity}
                    min={0}
                    max={0.85}
                    step={0.05}
                    format={(v) => v.toFixed(2)}
                    onChange={(v) => setD((p) => ({ ...p, overlayBgOpacity: v }))}
                  />

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

                {/* Canvasは画面には見せない（保存用） */}
                <canvas ref={canvasRef} style={{ display: "none" }} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}