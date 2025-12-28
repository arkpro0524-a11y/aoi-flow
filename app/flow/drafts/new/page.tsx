// FILE: /app/flow/drafts/new/page.tsx
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
  imageUrl?: string; // data:image でもURLでもOK

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

const formStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  borderColor: "rgba(255,255,255,0.18)",
  color: "rgba(255,255,255,0.92)",
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

function Btn(props: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const variant = props.variant ?? "primary";
  const disabled = !!props.disabled;

  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 font-black transition select-none whitespace-nowrap";
  const styles: Record<string, string> = {
    primary: "bg-white text-black hover:bg-white/92 border border-white/80",
    secondary: "bg-white/18 text-white hover:bg-white/26 border border-white/40",
    ghost: "bg-black/10 text-white/92 hover:bg-white/10 border border-white/30",
  };

  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={disabled}
      className={[
        base,
        styles[variant],
        disabled ? "opacity-40 cursor-not-allowed" : "active:scale-[0.99]",
        props.className ?? "",
      ].join(" ")}
      style={{ fontSize: 13 }}
    >
      {props.children}
    </button>
  );
}

function ChipLabel({ label }: { label: string }) {
  return (
    <div
      className="inline-flex items-center rounded-full px-3 py-1 font-bold bg-black/55 border border-white/25 text-white/90"
      style={{ fontSize: 12 }}
    >
      {label}
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
  const { label, value, min, max, step, format, onChange } = props;

  return (
    <div className="rounded-2xl border border-white/12 bg-black/25 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-white/80 text-xs">{label}</div>
        <div className="text-white/90 text-xs font-black tabular-nums">
          {format(value)}
        </div>
      </div>

      <input
        className="mt-2 w-full"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />

      <div className="mt-1 flex justify-between text-[11px] text-white/40 tabular-nums">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
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

        setDraftId(id);
        setD({
          userId: uid,
          brand: data.brand === "riva" ? "riva" : "vento",
          phase:
            data.phase === "ready"
              ? "ready"
              : data.phase === "posted"
              ? "posted"
              : "draft",
          vision: typeof data.vision === "string" ? data.vision : "",
          keywordsText:
            typeof data.keywordsText === "string" ? data.keywordsText : "",
          memo: typeof data.memo === "string" ? data.memo : "",
          ig: typeof data.ig === "string" ? data.ig : "",
          x: typeof data.x === "string" ? data.x : "",
          ig3: Array.isArray(data.ig3) ? data.ig3.map(String).slice(0, 3) : [],
          imageUrl:
            typeof data.imageUrl === "string" && data.imageUrl
              ? data.imageUrl
              : undefined,
          overlayEnabled:
            typeof data.overlayEnabled === "boolean" ? data.overlayEnabled : true,
          overlayText:
            typeof data.overlayText === "string" ? data.overlayText : "",
          overlayFontScale:
            typeof data.overlayFontScale === "number"
              ? data.overlayFontScale
              : 1.0,
          overlayY: typeof data.overlayY === "number" ? data.overlayY : 75,
          overlayBgOpacity:
            typeof data.overlayBgOpacity === "number"
              ? data.overlayBgOpacity
              : 0.45,
          updatedAt: data.updatedAt,
          createdAt: data.createdAt,
        });
      } finally {
        setLoadBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, id]);

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
      imageUrl: next.imageUrl ?? null, // まず復旧優先で保存
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
    if (!d.vision.trim()) return alert("Vision（必須）を入力してください");

    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("no token");

      const r = await fetch("/api/generate-captions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          brandId: d.brand,
          vision: d.vision.trim(),
          keywords: splitKeywords(d.keywordsText),
          tone: "",
        }),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "caption error");

      const ig = typeof j.instagram === "string" ? j.instagram : "";
      const x = typeof j.x === "string" ? j.x : "";
      const ig3 = Array.isArray(j.ig3) ? j.ig3.map(String).slice(0, 3) : [];

      const nextOverlay = (d.overlayText || "").trim()
        ? d.overlayText
        : ig;

      setD((p) => ({ ...p, ig, x, ig3, overlayText: nextOverlay }));
      await saveDraft({ ig, x, ig3, overlayText: nextOverlay, phase: "draft" });
    } catch (e) {
      console.error(e);
      alert("文章生成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function generateImage() {
    if (!uid) return;
    if (!d.vision.trim()) return alert("Vision（必須）を入力してください");

    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("no token");

      const r = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          brandId: d.brand,
          vision: d.vision.trim(),
          keywords: splitKeywords(d.keywordsText),
          tone: "",
        }),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "image error");

      const b64 = typeof j.b64 === "string" ? j.b64 : "";
      if (!b64) throw new Error("no b64");

      const dataUrl = `data:image/png;base64,${b64}`;
      setD((prev) => ({ ...prev, imageUrl: dataUrl }));
      await saveDraft({ imageUrl: dataUrl, phase: "draft" }); // 復旧優先で保存
    } catch (e) {
      console.error(e);
      alert("画像生成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      {loadBusy ? (
        <div className="text-white/70 text-sm mb-3">読み込み中...</div>
      ) : null}

      {/* ✅ スマホ=1列 / PC=2列 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* 左（入力） */}
        <section className="flex flex-col gap-3">
          <div className="rounded-2xl border border-white/12 bg-black/25 p-3">
            <div className="text-white/80 text-xs mb-2">Brand</div>
            <div className="flex gap-2 flex-wrap">
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
            </div>

            <div className="text-white/80 text-xs mt-4 mb-2">Vision（必須）</div>
            <textarea
              value={d.vision}
              onChange={(e) => setD((p) => ({ ...p, vision: e.target.value }))}
              className="w-full rounded-xl border p-3 outline-none"
              style={{ ...formStyle, minHeight: 90 }}
              placeholder="例：RIVAの世界観を1〜2行で"
            />

            <div className="text-white/80 text-xs mt-4 mb-2">Keywords（任意）</div>
            <input
              value={d.keywordsText}
              onChange={(e) =>
                setD((p) => ({ ...p, keywordsText: e.target.value }))
              }
              className="w-full rounded-xl border p-3 outline-none"
              style={formStyle}
              placeholder="例：クラシック, 丁寧, 木目, 余白"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <Btn
                variant="primary"
                disabled={!d.vision.trim() || busy}
                onClick={generateCaptions}
              >
                文章を生成（IG＋X）
              </Btn>
              <Btn
                variant="secondary"
                disabled={!d.vision.trim() || busy}
                onClick={generateImage}
              >
                画像を生成（正方形）
              </Btn>
              <Btn
                variant="ghost"
                disabled={!uid || busy}
                onClick={() => saveDraft()}
              >
                保存
              </Btn>
            </div>
          </div>

          <div className="rounded-2xl border border-white/12 bg-black/25 p-3">
            <div className="flex items-center justify-between">
              <div className="text-white/80 text-xs">Instagram本文（メイン）</div>
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
              style={{ ...formStyle, minHeight: 120 }}
            />
          </div>

          <div className="rounded-2xl border border-white/12 bg-black/25 p-3">
            <div className="flex items-center justify-between">
              <div className="text-white/80 text-xs">X本文</div>
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
              style={{ ...formStyle, minHeight: 90 }}
            />
          </div>
        </section>

        {/* 右（プレビュー） */}
        <section className="flex flex-col gap-3 md:sticky md:top-[88px]">
          <div className="rounded-2xl border border-white/12 bg-black/25 p-3">
            <div className="text-white/80 text-xs mb-2">正方形プレビュー</div>

            <div className="rounded-2xl border border-white/12 bg-black/30 p-3">
              <div
                className="mx-auto"
                style={{
                  width: "100%",
                  maxWidth: 420,
                  aspectRatio: "1 / 1",
                  borderRadius: 12,
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

                {d.overlayEnabled && (d.overlayText || "").trim() ? (
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
                          18 * clamp(d.overlayFontScale, 0.6, 1.6)
                        )}px`,
                        color: "rgba(255,255,255,0.95)",
                        textShadow: "0 2px 10px rgba(0,0,0,0.45)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {(d.overlayText || "").trim()}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <ChipLabel label="文字表示" />
                <Btn
                  variant="secondary"
                  onClick={() =>
                    setD((p) => ({ ...p, overlayEnabled: !p.overlayEnabled }))
                  }
                >
                  {d.overlayEnabled ? "ON" : "OFF"}
                </Btn>
              </div>

              <div className="mt-3 rounded-2xl border border-white/12 bg-black/25 p-3">
                <div className="text-white/80 text-xs mb-2">載せる文字（本文とは別）</div>
                <textarea
                  value={d.overlayText}
                  onChange={(e) =>
                    setD((p) => ({ ...p, overlayText: e.target.value }))
                  }
                  className="w-full rounded-xl border p-3 outline-none"
                  style={{ ...formStyle, minHeight: 90 }}
                />
              </div>

              <div className="mt-3 grid gap-3">
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
                  onChange={(v) =>
                    setD((p) => ({ ...p, overlayBgOpacity: v }))
                  }
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Btn
                  variant="ghost"
                  disabled={!uid || busy}
                  onClick={() => saveDraft()}
                >
                  調整を保存
                </Btn>
              </div>

              <canvas ref={canvasRef} style={{ display: "none" }} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}