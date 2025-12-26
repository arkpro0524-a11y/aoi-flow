// /app/flow/drafts/new/page.tsx
"use client";

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
import { auth, db } from "@/firebase";

type Brand = "vento" | "riva";
type Phase = "draft" | "ready" | "posted";

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
  imageUrl: undefined,

  overlayEnabled: true,
  overlayText: "",
  overlayFontScale: 1.0,
  overlayY: 75,
  overlayBgOpacity: 0.45,
};

/**
 * ✅ ここだけ触ればOK（見た目＆文字サイズ）
 * - 入力文字が見えない/白いボタンが見えない問題を「強制固定」で潰す
 * - 文字サイズもここで全部管理
 */
const UI = {
  // 2カラムの間隔
  gap: 12,

  // 左右カラム幅
  leftWidth: "56%",
  rightWidth: "44%", // ✅ 安定（%で指定）

  // カード余白
  cardPadding: 12,

  // 入力欄の高さ
  hVision: 64,
  hIG: 110,
  hX: 90,
  hMemo: 72,
  hOverlayText: 84,

  // プレビュー（この値が唯一の正）
  previewMaxWidth: 520,
  previewRadius: 11,

  // RangeControl の +/- ボタンサイズ
  stepBtnSize: 36,

  // “読み込み中...” 表示
  showLoadingText: true,

  // ✅ 文字サイズ（ここが本命）
  FONT: {
    labelPx: 12,
    chipPx: 12,
    inputPx: 14,
    inputLineHeight: 1.55,
    buttonPx: 13,
    overlayPreviewBasePx: 18,
    overlayCanvasBasePx: 44,
  },

  // ✅ “見えない” を根絶するための強制配色
  FORM: {
    bg: "rgba(0,0,0,0.55)",
    border: "rgba(255,255,255,0.18)",
    text: "rgba(255,255,255,0.96)",
    placeholder: "rgba(255,255,255,0.45)",
    ring: "rgba(255,255,255,0.22)",
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

/** ✅ “入力が見えない” 対策：フォーム系を強制スタイル */
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
      style={{ padding: UI.cardPadding }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-white/85" style={{ fontSize: UI.FONT.labelPx }}>
          {props.label}
        </div>

        <div className="flex items-center gap-2">
          <Btn
            variant="secondary"
            className="px-0"
            onClick={() => bump(-props.step)}
            title="小さく"
          >
            <span
              style={{ width: size, height: size, display: "grid", placeItems: "center" }}
            >
              −
            </span>
          </Btn>

          <div
            className="min-w-[88px] text-center font-black text-white/95 rounded-full px-3 py-2 bg-black/60 border border-white/25"
            style={{ fontSize: UI.FONT.labelPx }}
          >
            {props.format(v)}
          </div>

          <Btn
            variant="secondary"
            className="px-0"
            onClick={() => bump(props.step)}
            title="大きく"
          >
            <span
              style={{ width: size, height: size, display: "grid", placeItems: "center" }}
            >
              +
            </span>
          </Btn>
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setLoadBusy(false);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

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

        const ref = doc(db, "drafts", id);
        const snap = await getDoc(ref);

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
        const imageUrl =
          typeof data.imageUrl === "string" && data.imageUrl ? data.imageUrl : undefined;

        const overlayEnabled =
          typeof data.overlayEnabled === "boolean" ? data.overlayEnabled : true;
        const overlayText = typeof data.overlayText === "string" ? data.overlayText : ig || "";
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

  useEffect(() => {
    setD((prev) => ({
      ...prev,
      overlayText: prev.overlayText || prev.ig || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.ig]);

  const brandLabel = d.brand === "vento" ? "VENTO" : "RIVA";
  const phaseLabel = d.phase === "draft" ? "下書き" : d.phase === "ready" ? "投稿待ち" : "投稿済み";
  const canGenerate = d.vision.trim().length > 0 && !busy;
  const previewOverlayText = d.overlayText || d.ig || "";

  async function saveDraft(partial?: Partial<DraftDoc>) {
    if (!uid) return;

    const next: DraftDoc = { ...d, ...(partial ?? {}), userId: uid };

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
      imageUrl: next.imageUrl ?? null,

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
      const ref = await addDoc(collection(db, "drafts"), payload);
      setDraftId(ref.id);
      router.replace(`/flow/drafts/new?id=${encodeURIComponent(ref.id)}`);
    } else {
      await updateDoc(doc(db, "drafts", draftId), payload);
    }

    setD(next);
  }

  async function generateCaptions() {
    if (!uid) return;

    const vision = d.vision.trim();
    if (!vision) {
      alert("Vision（必須）を入力してください");
      return;
    }

    setBusy(true);
    try {
      const body = {
        brand: d.brand,
        vision,
        keywords: splitKeywords(d.keywordsText),
        tone: "",
      };

      const r = await fetch("/api/generate-captions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "caption error");

      const ig = typeof j.instagram === "string" ? j.instagram : "";
      const x = typeof j.x === "string" ? j.x : "";
      const ig3 = Array.isArray(j.ig3) ? j.ig3.map(String).slice(0, 3) : [];

      setD((prev) => ({
        ...prev,
        ig,
        x,
        ig3,
        overlayText: prev.overlayText || ig,
      }));

      await saveDraft({ ig, x, ig3, phase: "draft", overlayText: ig });
    } catch (e) {
      console.error(e);
      alert("文章生成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function generateImage() {
    if (!uid) return;

    const vision = d.vision.trim();
    if (!vision) {
      alert("Vision（必須）を入力してください");
      return;
    }

    setBusy(true);
    try {
      const body = {
        brand: d.brand,
        vision,
        keywords: splitKeywords(d.keywordsText),
        tone: "",
      };

      const r = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "image error");

      const b64 = typeof j.b64 === "string" ? j.b64 : "";
      if (!b64) throw new Error("no b64");

      const dataUrl = `data:image/png;base64,${b64}`;
      setD((prev) => ({ ...prev, imageUrl: dataUrl }));

      await saveDraft({ imageUrl: dataUrl, phase: "draft" });
    } catch (e) {
      console.error(e);
      alert("画像生成に失敗しました");
    } finally {
      setBusy(false);
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

    const imgUrl = d.imageUrl;
    if (imgUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imgUrl;

      await new Promise<void>((res) => {
        img.onload = () => res();
        img.onerror = () => res();
      });

      const iw = img.naturalWidth || SIZE;
      const ih = img.naturalHeight || SIZE;
      const scale = Math.min(SIZE / iw, SIZE / ih);
      const w = iw * scale;
      const h = ih * scale;
      const x = (SIZE - w) / 2;
      const y = (SIZE - h) / 2;

      ctx.drawImage(img, x, y, w, h);
    }

    if (d.overlayEnabled && d.overlayText.trim()) {
      const text = d.overlayText.trim();

      const fontScale = clamp(d.overlayFontScale, 0.6, 1.6);
      const fontPx = Math.round(UI.FONT.overlayCanvasBasePx * fontScale);

      ctx.font = `900 ${fontPx}px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
      ctx.textBaseline = "top";

      const maxWidth = Math.floor(SIZE * 0.86);

      const fixedLines: string[] = [];
      let buf = "";
      for (const ch of text) {
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
    setBusy(true);
    try {
      const out = await renderToCanvasAndGetDataUrl();
      if (!out) throw new Error("no canvas");
      setD((prev) => ({ ...prev, imageUrl: out }));
      await saveDraft({ imageUrl: out });
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

  return (
    <div className="h-full min-h-0 flex" style={{ gap: UI.gap }}>
      {/* 左 */}
      <section className="min-h-0 flex flex-col gap-3" style={{ width: UI.leftWidth }}>
        {/* 状態（表示は消したいが、読み込み中は残す） */}
        <div className="shrink-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap" />
          {UI.showLoadingText && loadBusy ? (
            <div className="text-white/75" style={{ fontSize: UI.FONT.labelPx }}>
              読み込み中...
            </div>
          ) : null}
        </div>

        {/* Brand / Vision / Keywords / 操作 */}
        <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
          <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
            Brand
          </div>
          <div className="flex items-center gap-2">
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
            <Chip className="ml-2">
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
            placeholder="例：RIVAの世界観（誠実・丁寧・クラシック）を1〜2行で"
          />

          <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
            Keywords（任意）
          </div>
          <input
            value={d.keywordsText}
            onChange={(e) => setD((p) => ({ ...p, keywordsText: e.target.value }))}
            className="w-full rounded-xl border p-3 outline-none"
            style={formStyle}
            placeholder="例：クラシック, 丁寧, 木目, 余白"
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
        <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
          <div className="flex items-center justify-between">
            <div className="text-white/80" style={{ fontSize: UI.FONT.labelPx }}>
              Instagram本文
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

        {/* IG3 */}
        <div className="rounded-2xl border border-white/12 bg-black/20" style={{ padding: UI.cardPadding }}>
          <div className="text-white/70 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
            補助：Instagram 3案
          </div>
          {d.ig3.length === 0 ? (
            <div className="text-white/45" style={{ fontSize: UI.FONT.inputPx }}>
              （まだありません）
            </div>
          ) : (
            <div className="space-y-2">
              {d.ig3.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setD((p) => ({ ...p, ig: t, overlayText: t }))}
                  className="w-full text-left rounded-xl border hover:bg-black/35 transition p-3"
                  style={{
                    background: "rgba(0,0,0,0.35)",
                    borderColor: "rgba(255,255,255,0.18)",
                    color: UI.FORM.text,
                    fontSize: UI.FONT.inputPx,
                    lineHeight: UI.FONT.inputLineHeight as any,
                  }}
                >
                  <div className="text-white/55 mb-1" style={{ fontSize: UI.FONT.labelPx }}>
                    案 {i + 1}（クリックで採用）
                  </div>
                  <div className="line-clamp-3">{t}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 右 */}
      <section className="min-h-0 flex flex-col gap-4" style={{ width: UI.rightWidth }}>
        <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
          <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
            正方形プレビュー（成果物）
          </div>

          <div className="rounded-2xl border border-white/12 bg-black/30 p-3">
            <div
              className="mx-auto"
              style={{
                width: "100%",
                maxWidth: UI.previewMaxWidth, // ✅ 直書き禁止：ここだけで制御
                aspectRatio: "1 / 1",
                borderRadius: UI.previewRadius,
                overflow: "hidden",
                position: "relative",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              {d.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={d.imageUrl}
                  alt="preview"
                  draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                />
              ) : (
                <div className="h-full w-full grid place-items-center text-sm text-white/55">
                  NO IMAGE
                </div>
              )}

              {d.overlayEnabled && previewOverlayText.trim() ? (
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
                        UI.FONT.overlayPreviewBasePx * clamp(d.overlayFontScale, 0.6, 1.6)
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
                <Btn variant="secondary" onClick={() => setD((p) => ({ ...p, overlayEnabled: !p.overlayEnabled }))}>
                  {d.overlayEnabled ? "ON" : "OFF"}
                </Btn>
              </div>

              <div className="rounded-2xl border border-white/12 bg-black/25" style={{ padding: UI.cardPadding }}>
                <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
                  載せる文字
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
                ※ 保存される画像は 1024×1024 のPNGです。
              </div>
            </div>

            <canvas ref={canvasRef} style={{ display: "none" }} />
          </div>
        </div>
      </section>
    </div>
  );
}