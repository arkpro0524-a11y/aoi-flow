//app/flow/drafts/new/components/BaseImagePanel.tsx
"use client";

import React from "react";
import ImageUploader from "@/components/upload/ImageUploader";
import type { DraftDoc, TextOverlay } from "@/lib/types/draft";
import { Btn, RangeControl, UI } from "../ui";

/**
 * ① 元画像 + 文字（投稿用）
 *
 * ✅ この部品の責務
 * - 元画像プレビュー
 * - 元画像アップロード
 * - 透過して元画像にする
 * - 元画像候補一覧
 * - 文字編集UI
 *
 * ✅ 重要
 * - state本体や副作用は page.tsx 側に残す
 * - この部品は「表示」と「親へ通知」に専念する
 * - saveDraft / upload / cutout / setD の実処理は親が持つ
 */

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
  onSaveCompositeAsImageUrl: () => Promise<void> | void;
  onSaveDraft: () => Promise<void> | void;
  showMsg: (msg: string) => void;
  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;
};

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
    onSaveCompositeAsImageUrl,
    onSaveDraft,
    showMsg,
    setD,
  } = props;

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
            <div className="mt-2 flex items-center gap-2">
              <Btn
                variant="secondary"
                disabled={busy || cutoutBusy}
                onClick={onCutoutCurrentBaseToReplace}
                title="いまの元画像を透過PNGにして置き換える"
              >
                透過して元画像にする
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

        {baseCandidates.length > 1 ? (
          <div className="mt-2">
            <div className="text-white/70 font-bold" style={{ fontSize: 12 }}>
              元画像を選ぶ（タップで①に反映）
            </div>

            <div className="mt-2 grid grid-cols-4 gap-2">
              {baseCandidates.map((u) => {
                const isActive = String(d.baseImageUrl || "").trim() === u;

                return (
                  <button
                    key={u}
                    type="button"
                    disabled={!uid || busy}
                    onClick={() => {
                      void onPromoteMaterialToBase(u);
                    }}
                    className={[
                      "rounded-xl border p-1 transition",
                      isActive
                        ? "border-white/70 bg-white/10"
                        : "border-white/15 bg-black/20 hover:bg-white/5",
                      !uid || busy ? "opacity-40" : "",
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