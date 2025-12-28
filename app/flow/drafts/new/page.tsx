// /app/flow/drafts/new/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
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

const UI = {
  gap: 12,
  leftWidth: "56%",
  rightWidth: "44%",
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
    placeholder: "rgba(255,255,255,0.45)",
    ring: "rgba(255,255,255,0.22)",
  },

  rightStickyTopPx: 96,

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

// 省略：Btn / Chip / RangeControl はあなたのまま（そのままコピペでOK）
function Btn(props: any) {
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

function Chip(props: any) {
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

function RangeControl(props: any) {
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

      <input type="range" min={props.min} max={props.max} step={props.step} value={v} onChange={(e) => set(Number(e.target.value))} className="w-full" />
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
        const phase: Phase = data.phase === "ready" ? "ready" : data.phase === "posted" ? "posted" : "draft";

        const vision = typeof data.vision === "string" ? data.vision : "";
        const keywordsText = typeof data.keywordsText === "string" ? data.keywordsText : "";
        const memo = typeof data.memo === "string" ? data.memo : "";

        const ig =
          typeof data.ig === "string" ? data.ig : typeof data.caption_final === "string" ? data.caption_final : "";
        const x = typeof data.x === "string" ? data.x : "";

        const ig3 = Array.isArray(data.ig3) ? data.ig3.map(String).slice(0, 3) : [];
        const imageUrl = typeof data.imageUrl === "string" && data.imageUrl ? data.imageUrl : undefined;

        const overlayEnabled = typeof data.overlayEnabled === "boolean" ? data.overlayEnabled : true;
        const overlayText = typeof data.overlayText === "string" ? data.overlayText : (ig || "");

        const overlayFontScale =
          typeof data.overlayFontScale === "number" ? clamp(data.overlayFontScale, 0.6, 1.6) : 1.0;
        const overlayY = typeof data.overlayY === "number" ? clamp(data.overlayY, 0, 100) : 75;
        const overlayBgOpacity =
          typeof data.overlayBgOpacity === "number" ? clamp(data.overlayBgOpacity, 0, 0.85) : 0.45;

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

  const brandLabel = d.brand === "vento" ? "VENTO" : "RIVA";
  const phaseLabel = d.phase === "draft" ? "下書き" : d.phase === "ready" ? "投稿待ち" : "投稿済み";
  const canGenerate = d.vision.trim().length > 0 && !busy;

  // ✅ Firestoreへ保存する画像URLを軽くする（data:image/... は保存しない）
  function safeImageUrlForFirestore(url?: string) {
    const s = (url ?? "").trim();
    if (!s) return null;
    if (s.startsWith("data:image/")) return null; // ← ここがポイント（壊れ方を止める）
    return s;
  }

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

      // ✅ ここだけ “軽量化” （base64はDBに入れない）
      imageUrl: safeImageUrlForFirestore(next.imageUrl),

      caption_final: next.ig,

      overlayEnabled: next.overlayEnabled,
      overlayText: next.overlayText,
      overlayFontScale: next.overlayFontScale,
      overlayY: next.overlayY,
      overlayBgOpacity: next.overlayBgOpacity,

      updatedAt: serverTimestamp(),
    };

    try {
      if (!draftId) {
        payload.createdAt = serverTimestamp();
        const ref = await addDoc(collection(db, "drafts"), payload);
        setDraftId(ref.id);
        router.replace(`/flow/drafts/new?id=${encodeURIComponent(ref.id)}`);
      } else {
        await updateDoc(doc(db, "drafts", draftId), payload);
      }

      // ✅ 保存した内容と画面の内容を必ず一致させる
      setD(next);
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました（画像が大きすぎる可能性）");
      // ここで落ちても画面は維持（編集継続できる）
    }
  }

  // 以下：あなたのコード（generateCaptions / generateImage / canvas合成 / UI表示）はそのまま使ってOK
  // ただし「保存される画像」は Firestore には入らないので、一覧で表示したいなら次は Storage 化が必要

  // --- ここから下、あなたの元コードをそのまま貼り付けてOK ---
  // （省略：この先は貼ると長すぎるので、今のあなたのファイルの saveDraft 以外は変更不要です）
  return (
    <div className="h-full min-h-0 flex" style={{ gap: UI.gap }}>
      {/* ここはあなたの元コードのままでOK */}
      <div className="text-white/70 p-6">
        ✅ saveDraft のみ “data:image をFirestoreへ保存しない” 修正を入れました。<br />
        このファイルはあなたの元のUIをそのまま残して、saveDraft関数だけ置き換えてください。
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}