// /app/flow/drafts/new/components/BaseImagePanel.tsx
"use client";

import React from "react";
import { auth, storage } from "@/firebase";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import ImageUploader from "@/components/upload/ImageUploader";
import type { DraftDoc, TextOverlay } from "@/lib/types/draft";
import { Btn, RangeControl, UI } from "../ui";

type ImageSlot = "base" | "mood" | "composite";

type Props = {
  d: DraftDoc;
  uid: string | null;
  busy: boolean;
  cutoutBusy: boolean;
  cutoutReason: string;
  overlayPreviewDataUrl: string | null;
  baseCandidates: string[];
  currentSlot: ImageSlot;
  formStyle: React.CSSProperties;
  defaultTextOverlay: TextOverlay;

  onUploadImageFilesNew: (files: File[]) => Promise<void> | void;
  onCutoutCurrentBaseToReplace: () => Promise<void> | void;
  onPromoteMaterialToBase: (url: string) => Promise<void> | void;
  onRemoveBaseOrMaterialImage: (url: string) => Promise<void> | void;
  onSyncBaseAndMaterialImagesFromStorage: () => Promise<void> | void;
  onSaveCompositeAsImageUrl: () => Promise<void> | void;
  onSaveDraft: () => Promise<void> | void;
  showMsg: (msg: string) => void;
  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;
};

type EditMode = "erase" | "restore";

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function cloneImageData(source: ImageData) {
  return new ImageData(
    new Uint8ClampedArray(source.data),
    source.width,
    source.height
  );
}

function getCanvasPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
) {
  const rect = canvas.getBoundingClientRect();

  const x = ((clientX - rect.left) / rect.width) * canvas.width;
  const y = ((clientY - rect.top) / rect.height) * canvas.height;

  return {
    x: Math.max(0, Math.min(canvas.width - 1, x)),
    y: Math.max(0, Math.min(canvas.height - 1, y)),
  };
}

export default function BaseImagePanel(props: Props) {
  const {
    d,
    uid,
    busy,
    cutoutBusy,
    cutoutReason,
    overlayPreviewDataUrl,
    baseCandidates,
    currentSlot,
    formStyle,
    defaultTextOverlay,
    onUploadImageFilesNew,
    onCutoutCurrentBaseToReplace,
    onPromoteMaterialToBase,
    onRemoveBaseOrMaterialImage,
    onSyncBaseAndMaterialImagesFromStorage,
    onSaveCompositeAsImageUrl,
    onSaveDraft,
    showMsg,
    setD,
  } = props;

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorBusy, setEditorBusy] = React.useState(false);
  const [editMode, setEditMode] = React.useState<EditMode>("erase");
  const [brushSize, setBrushSize] = React.useState<number>(22);
  const [editorReady, setEditorReady] = React.useState(false);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const originalImageRef = React.useRef<ImageData | null>(null);
  const workingImageRef = React.useRef<ImageData | null>(null);
  const historyRef = React.useRef<ImageData[]>([]);
  const drawingRef = React.useRef(false);
  const objectUrlRef = React.useRef<string | null>(null);

  const editorSourceUrl = String(d.baseImageUrl || "").trim();

  const checkerStyle: React.CSSProperties = {
    backgroundImage: `
      linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%),
      linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)
    `,
    backgroundSize: "24px 24px",
    backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
    backgroundColor: "rgba(255,255,255,0.03)",
  };

  const redrawCanvas = React.useCallback(() => {
    const canvas = canvasRef.current;
    const imageData = workingImageRef.current;

    if (!canvas || !imageData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(imageData, 0, 0);
  }, []);

  const loadEditorImage = React.useCallback(async () => {
    const src = String(editorSourceUrl || "").trim();

    if (!src) {
      setEditorReady(false);
      return;
    }

    setEditorBusy(true);
    setEditorReady(false);

    try {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      const res = await fetch(src, { method: "GET", cache: "no-store" });
      if (!res.ok) {
        throw new Error("元画像の取得に失敗しました");
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;

      const img = new Image();

      const loaded = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = objectUrl;
      });

      if (!loaded) {
        throw new Error("画像の読込に失敗しました");
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error("編集キャンバスが見つかりません");
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("編集キャンバスを初期化できません");
      }

      canvas.width = img.naturalWidth || img.width || 1024;
      canvas.height = img.naturalHeight || img.height || 1024;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      originalImageRef.current = cloneImageData(imageData);
      workingImageRef.current = cloneImageData(imageData);
      historyRef.current = [];

      redrawCanvas();
      setEditorReady(true);
    } catch (e: any) {
      console.error(e);
      showMsg(`手修正UIの読込に失敗: ${e?.message || "不明"}`);
      setEditorReady(false);
    } finally {
      setEditorBusy(false);
    }
  }, [editorSourceUrl, redrawCanvas, showMsg]);

  React.useEffect(() => {
    if (!editorOpen) return;
    if (!editorSourceUrl) return;

    void loadEditorImage();
  }, [editorOpen, editorSourceUrl, loadEditorImage]);

  React.useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const applyBrush = React.useCallback(
    (x: number, y: number, mode: EditMode) => {
      const working = workingImageRef.current;
      const original = originalImageRef.current;

      if (!working || !original) return;

      const radius = Math.max(1, Math.round(brushSize));
      const width = working.width;
      const height = working.height;
      const x0 = Math.round(x);
      const y0 = Math.round(y);

      const minX = Math.max(0, x0 - radius);
      const maxX = Math.min(width - 1, x0 + radius);
      const minY = Math.max(0, y0 - radius);
      const maxY = Math.min(height - 1, y0 + radius);

      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          const dx = px - x0;
          const dy = py - y0;

          if (dx * dx + dy * dy > radius * radius) {
            continue;
          }

          const idx = (py * width + px) * 4;

          if (mode === "erase") {
            working.data[idx + 3] = 0;
          } else {
            working.data[idx] = original.data[idx];
            working.data[idx + 1] = original.data[idx + 1];
            working.data[idx + 2] = original.data[idx + 2];
            working.data[idx + 3] = original.data[idx + 3];
          }
        }
      }

      redrawCanvas();
    },
    [brushSize, redrawCanvas]
  );

  const startDraw = React.useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      const working = workingImageRef.current;

      if (!canvas || !working) return;

      historyRef.current.push(cloneImageData(working));

      if (historyRef.current.length > 20) {
        historyRef.current.shift();
      }

      drawingRef.current = true;

      const p = getCanvasPoint(canvas, clientX, clientY);
      applyBrush(p.x, p.y, editMode);
    },
    [applyBrush, editMode]
  );

  const moveDraw = React.useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !drawingRef.current) return;

      const p = getCanvasPoint(canvas, clientX, clientY);
      applyBrush(p.x, p.y, editMode);
    },
    [applyBrush, editMode]
  );

  const endDraw = React.useCallback(() => {
    drawingRef.current = false;
  }, []);

  const undoOnce = React.useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) {
      showMsg("これ以上戻せません");
      return;
    }

    workingImageRef.current = cloneImageData(prev);
    redrawCanvas();
    showMsg("1手戻しました");
  }, [redrawCanvas, showMsg]);

  const saveEditedBaseToDraft = React.useCallback(async () => {
    if (!uid) {
      showMsg("ログインしてください");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      showMsg("編集キャンバスがありません");
      return;
    }

    if (!editorReady) {
      showMsg("編集画像の準備がまだです");
      return;
    }

    setEditorBusy(true);

    try {
      await onSaveDraft();

      let ensuredDraftId =
        String((d as any)?.id || "").trim() ||
        new URL(window.location.href).searchParams.get("id") ||
        "";

      if (!ensuredDraftId) {
        for (let i = 0; i < 10; i++) {
          await sleep(150);
          ensuredDraftId =
            String((d as any)?.id || "").trim() ||
            new URL(window.location.href).searchParams.get("id") ||
            "";

          if (ensuredDraftId) break;
        }
      }

      if (!ensuredDraftId) {
        throw new Error("下書きIDが確定できませんでした");
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png");
      });

      if (!blob) {
        throw new Error("PNG化に失敗しました");
      }

      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        throw new Error("ログイン情報が取得できません");
      }

      const fd = new FormData();
      fd.append("draftId", ensuredDraftId);
      fd.append(
        "file",
        new File([blob], `cutout_manual_${Date.now()}.png`, {
          type: "image/png",
        })
      );

      const res = await fetch("/api/upload/image", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: fd,
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `upload failed (${res.status})`);
      }

      const url = String(json?.url || "").trim();
      if (!url) {
        throw new Error("保存後URLが空です");
      }

      await onPromoteMaterialToBase(url);
      await onSaveDraft();

      setD((prev) => ({
        ...prev,
        baseImageUrl: url,
      }));

      showMsg("✅ 手修正した透過画像を元画像として保存しました");
      setEditorOpen(false);
    } catch (e: any) {
      console.error(e);
      showMsg(`手修正の保存に失敗: ${e?.message || "不明"}`);
    } finally {
      setEditorBusy(false);
    }
  }, [d, editorReady, onPromoteMaterialToBase, onSaveDraft, setD, showMsg, uid]);

  return (
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

        <div className="mt-3">
          <ImageUploader
            disabled={!uid || busy}
            multiple
            label="元画像をアップロード"
            onPick={(files) => {
              console.log("[UI] picked files:", files.map((f) => `${f.name} ${f.size}`));
              void (async () => {
                try {
                  await onUploadImageFilesNew(files);
                  showMsg("アップロード開始しました");
                } catch (e: any) {
                  console.error("upload failed:", e);
                  showMsg(`アップロード失敗: ${e?.message || "不明"}`);
                }
              })();
            }}
          />

          {d.baseImageUrl ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Btn
                variant="secondary"
                disabled={busy || cutoutBusy}
                onClick={onCutoutCurrentBaseToReplace}
                title="いまの元画像を透過PNGにして置き換える"
              >
                透過して元画像にする
              </Btn>

              <Btn
                variant="danger"
                disabled={!d.baseImageUrl || busy || cutoutBusy || editorBusy}
                onClick={() => {
                  void onRemoveBaseOrMaterialImage(String(d.baseImageUrl || "").trim());
                }}
                title="画面上と下書き上だけから外します。Storageの本体は消しません"
              >
                元画像を外す
              </Btn>

              <Btn
                variant="secondary"
                disabled={!uid || busy || cutoutBusy || editorBusy}
                onClick={() => {
                  void onSyncBaseAndMaterialImagesFromStorage();
                }}
                title="Storage から元画像 / 素材画像を復活します"
              >
                元画像を同期
              </Btn>

              <Btn
                variant="secondary"
                disabled={!d.baseImageUrl || busy || cutoutBusy || editorBusy}
                onClick={() => {
                  setEditorOpen((prev) => !prev);
                }}
                title="AI切り抜き後に、人の手で細部を直します"
              >
                {editorOpen ? "手修正UIを閉じる" : "手修正UIを開く"}
              </Btn>

              {cutoutReason ? (
                <div className="text-white/70" style={{ fontSize: 12 }}>
                  {cutoutReason}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="text-white/55 mt-2" style={{ fontSize: 12, lineHeight: 1.5 }}>
            ※ 画像を選ぶとすぐアップロードが始まります（別のボタンは不要）
          </div>
        </div>

        {editorOpen ? (
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-white/85 font-bold" style={{ fontSize: 12 }}>
                手修正UI（AI切り抜きの最後の仕上げ）
              </div>

              <div className="text-white/60" style={{ fontSize: 12 }}>
                消す＝余計な背景を消す / 戻す＝消しすぎた所を戻す
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Btn
                variant={editMode === "erase" ? "primary" : "secondary"}
                disabled={editorBusy}
                onClick={() => setEditMode("erase")}
              >
                消す
              </Btn>

              <Btn
                variant={editMode === "restore" ? "primary" : "secondary"}
                disabled={editorBusy}
                onClick={() => setEditMode("restore")}
              >
                戻す
              </Btn>

              <Btn
                variant="secondary"
                disabled={editorBusy}
                onClick={undoOnce}
              >
                1手戻す
              </Btn>

              <Btn
                variant="secondary"
                disabled={editorBusy}
                onClick={() => {
                  void loadEditorImage();
                }}
              >
                元に戻す
              </Btn>

              <Btn
                variant="ghost"
                disabled={editorBusy || !editorReady}
                onClick={() => {
                  const canvas = canvasRef.current;
                  if (!canvas) return;

                  const a = document.createElement("a");
                  a.href = canvas.toDataURL("image/png");
                  a.download = `cutout_preview_${Date.now()}.png`;
                  a.click();
                }}
              >
                PNGで確認保存
              </Btn>

              <Btn
                variant="primary"
                disabled={editorBusy || !editorReady || !uid}
                onClick={() => {
                  void saveEditedBaseToDraft();
                }}
              >
                修正結果を元画像として保存
              </Btn>
            </div>

            <div className="mt-3">
              <RangeControl
                label="ブラシ太さ"
                value={brushSize}
                min={4}
                max={80}
                step={1}
                format={(v) => `${v}px`}
                onChange={(v) => setBrushSize(v)}
              />
            </div>

            <div className="mt-3 rounded-xl border border-white/10 p-2" style={checkerStyle}>
              <canvas
                ref={canvasRef}
                className="w-full rounded-lg border border-white/10 bg-transparent touch-none"
                style={{
                  display: "block",
                  maxHeight: 420,
                  objectFit: "contain",
                  cursor: editMode === "erase" ? "crosshair" : "cell",
                }}
                onPointerDown={(e) => {
                  if (!editorReady || editorBusy) return;
                  (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
                  startDraw(e.clientX, e.clientY);
                }}
                onPointerMove={(e) => {
                  if (!editorReady || editorBusy) return;
                  moveDraw(e.clientX, e.clientY);
                }}
                onPointerUp={(e) => {
                  (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId);
                  endDraw();
                }}
                onPointerLeave={() => {
                  endDraw();
                }}
              />
            </div>

            <div className="mt-2 text-white/60" style={{ fontSize: 12, lineHeight: 1.6 }}>
              {editorBusy
                ? "編集処理中..."
                : editorReady
                  ? "画像上をなぞって修正します。背景の残りを消し、消しすぎた部分は戻してください。"
                  : "編集画像を準備中です。"}
            </div>
          </div>
        ) : null}

        {baseCandidates.length > 1 ? (
          <div className="mt-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-white/70 font-bold" style={{ fontSize: 12 }}>
                元画像を選ぶ（タップで①に反映）
              </div>

              <Btn
                variant="secondary"
                disabled={!uid || busy || editorBusy}
                onClick={() => {
                  void onSyncBaseAndMaterialImagesFromStorage();
                }}
                title="Storage から元画像 / 素材画像を復活します"
              >
                同期
              </Btn>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {baseCandidates.map((u) => {
                const isActive = String(d.baseImageUrl || "").trim() === u;

                return (
                  <div
                    key={u}
                    className={[
                      "rounded-xl border p-1 transition",
                      isActive
                        ? "border-white/70 bg-white/10"
                        : "border-white/15 bg-black/20",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      disabled={!uid || busy}
                      onClick={() => {
                        void onPromoteMaterialToBase(u);
                      }}
                      className={[
                        "block w-full rounded-lg transition",
                        !uid || busy ? "opacity-40" : "hover:bg-white/5",
                      ].join(" ")}
                      title={isActive ? "現在の元画像" : "この画像を元画像（①）にする"}
                    >
                      <img
                        src={u}
                        alt="base-candidate"
                        className="w-full rounded-lg"
                        style={{ aspectRatio: "1 / 1", objectFit: "cover" }}
                      />
                    </button>

                    <div className="mt-2 flex gap-2">
                      <Btn
                        variant="secondary"
                        disabled={!uid || busy}
                        onClick={() => {
                          void onPromoteMaterialToBase(u);
                        }}
                      >
                        使う
                      </Btn>

                      <Btn
                        variant="danger"
                        disabled={!uid || busy}
                        onClick={() => {
                          void onRemoveBaseOrMaterialImage(u);
                        }}
                        title="画面上と下書き上だけから外します。Storageの本体は消しません"
                      >
                        外す
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-white/80 font-bold" style={{ fontSize: 12 }}>
              文字表示（投稿用）
            </div>

            {(() => {
              const ov = d.textOverlayBySlot?.[currentSlot];
              const isOn = !!ov && ((ov.lines?.join("\n").trim() ?? "").length > 0);

              return (
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={(e) => {
                      const nextOn = e.target.checked;

                      setD((p) => {
                        const prev = p.textOverlayBySlot?.[currentSlot] ?? defaultTextOverlay;

                        return {
                          ...p,
                          textOverlayBySlot: {
                            ...(p.textOverlayBySlot ?? {}),
                            [currentSlot]: nextOn
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
              const ov = d.textOverlayBySlot?.[currentSlot] ?? defaultTextOverlay;
              const textValue = (ov.lines ?? []).join("\n");

              return (
                <textarea
                  value={textValue}
                  onChange={(e) => {
                    const v = e.target.value ?? "";

                    setD((p) => ({
                      ...p,
                      textOverlayBySlot: {
                        ...(p.textOverlayBySlot ?? {}),
                        [currentSlot]: {
                          ...(p.textOverlayBySlot?.[currentSlot] ?? defaultTextOverlay),
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
                  setD((p) => ({
                    ...p,
                    textOverlayBySlot: {
                      ...(p.textOverlayBySlot ?? {}),
                      [currentSlot]: {
                        ...(p.textOverlayBySlot?.[currentSlot] ?? defaultTextOverlay),
                        lines: [],
                      },
                    },
                  }));
                  showMsg("文字をクリアしました（このスロットのみ）");
                }}
              >
                文字を消す
              </Btn>

              <Btn
                variant="secondary"
                disabled={!uid || busy}
                onClick={onSaveCompositeAsImageUrl}
              >
                文字入り画像を保存（PNG）
              </Btn>

              <Btn
                variant="ghost"
                disabled={!uid || busy}
                onClick={onSaveDraft}
              >
                保存
              </Btn>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3">
            {(() => {
              const ov = d.textOverlayBySlot?.[currentSlot] ?? defaultTextOverlay;

              return (
                <>
                  <RangeControl
                    label="文字サイズ"
                    value={ov.fontSize ?? defaultTextOverlay.fontSize}
                    min={18}
                    max={90}
                    step={1}
                    format={(v) => `${v}px`}
                    onChange={(v) => {
                      setD((p) => ({
                        ...p,
                        textOverlayBySlot: {
                          ...(p.textOverlayBySlot ?? {}),
                          [currentSlot]: {
                            ...(p.textOverlayBySlot?.[currentSlot] ?? defaultTextOverlay),
                            fontSize: v,
                          },
                        },
                      }));
                    }}
                  />

                  <RangeControl
                    label="文字の上下位置"
                    value={ov.y ?? defaultTextOverlay.y}
                    min={0}
                    max={100}
                    step={1}
                    format={(v) => `${v}%`}
                    onChange={(v) => {
                      setD((p) => ({
                        ...p,
                        textOverlayBySlot: {
                          ...(p.textOverlayBySlot ?? {}),
                          [currentSlot]: {
                            ...(p.textOverlayBySlot?.[currentSlot] ?? defaultTextOverlay),
                            y: v,
                          },
                        },
                      }));
                    }}
                  />

                  <RangeControl
                    label="文字背景の濃さ"
                    value={(() => {
                      const c = ov.background?.color ?? defaultTextOverlay.background!.color;
                      const m = /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/.exec(c);
                      return m ? Number(m[1]) : 0.45;
                    })()}
                    min={0}
                    max={0.85}
                    step={0.05}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => {
                      setD((p) => {
                        const prev = p.textOverlayBySlot?.[currentSlot] ?? defaultTextOverlay;

                        return {
                          ...p,
                          textOverlayBySlot: {
                            ...(p.textOverlayBySlot ?? {}),
                            [currentSlot]: {
                              ...prev,
                              background: {
                                ...(prev.background ?? defaultTextOverlay.background!),
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
  );
}