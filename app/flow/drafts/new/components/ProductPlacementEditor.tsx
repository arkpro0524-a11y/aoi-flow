// /app/flow/drafts/new/components/ProductPlacementEditor.tsx
"use client";

import React, { useMemo } from "react";
import { Btn } from "../ui";
import type { ProductPhotoMode } from "@/lib/types/draft";

/**
 * ① 商品写真の配置調整UI
 *
 * この部品の役割
 * - 商品写真モードを切り替える
 * - 商品の大きさを調整する
 * - 商品の左右位置を調整する
 * - 商品の上下位置を調整する
 * - 調整後の状態をその場で見せる
 *
 * 重要
 * - ここでは「見た目の調整UI」だけを担当する
 * - Firestore保存そのものは親から渡された関数で行う
 * - page.tsx / controller / actions 側の配線を前提にしている
 *
 * 今回の修正
 * - ProductPhotoMode の型に合わせて
 *   "template_bg" ではなく "template" を使う
 */

/**
 * ProductPhotoMode の実際の値に合わせる
 *
 * 想定:
 * - template: テンプレ背景
 * - ai_bg: AI背景
 */
const TEMPLATE_MODE: ProductPhotoMode = "template";
const AI_BG_MODE: ProductPhotoMode = "ai_bg";

type Props = {
  baseImageUrl?: string;
  bgImageUrl?: string;
  aiImageUrl?: string;

  /**
   * 商品写真モード
   * - template: テンプレ背景
   * - ai_bg: AI背景
   */
  activePhotoMode: ProductPhotoMode;
  onChangePhotoMode: (next: ProductPhotoMode) => void | Promise<void>;

  /**
   * 配置値
   * - scale: 商品の大きさ
   * - x: 左右位置
   * - y: 上下位置
   *
   * どれも 0〜100 系で扱う
   */
  placementScale: number;
  placementX: number;
  placementY: number;

  setPlacementScale: React.Dispatch<React.SetStateAction<number>>;
  setPlacementX: React.Dispatch<React.SetStateAction<number>>;
  setPlacementY: React.Dispatch<React.SetStateAction<number>>;

  onSavePlacement: (partial?: {
    scale?: number;
    x?: number;
    y?: number;
    activePhotoMode?: ProductPhotoMode;
  }) => void | Promise<void>;

  busy?: boolean;
  showMsg?: (msg: string) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ModeButton({
  active,
  label,
  onClick,
  disabled,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded-xl border px-3 py-2 text-xs transition",
        active
          ? "border-white/60 bg-white/10 text-white"
          : "border-white/10 bg-black/20 text-white/70 hover:bg-white/5",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  help,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  help?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-white/82 font-semibold" style={{ fontSize: 12 }}>
          {label}
        </div>
        <div className="text-white/60" style={{ fontSize: 12 }}>
          {Math.round(value)}
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full"
      />

      {help ? (
        <div
          className="mt-2 text-white/50"
          style={{ fontSize: 11, lineHeight: 1.5 }}
        >
          {help}
        </div>
      ) : null}
    </div>
  );
}

export default function ProductPlacementEditor({
  baseImageUrl,
  bgImageUrl,
  aiImageUrl,
  activePhotoMode,
  onChangePhotoMode,
  placementScale,
  placementX,
  placementY,
  setPlacementScale,
  setPlacementX,
  setPlacementY,
  onSavePlacement,
  busy = false,
  showMsg,
}: Props) {
  /**
   * 背景プレビュー
   *
   * 注意
   * - template モードの時は aiImageUrl をテンプレ背景側のプレビューとして使う前提
   * - ai_bg モードの時は bgImageUrl を使う
   * - どちらか無い時は、ある方を代わりに出す
   */
  const previewBgUrl = useMemo(() => {
    if (activePhotoMode === AI_BG_MODE && bgImageUrl) return bgImageUrl;
    if (activePhotoMode === TEMPLATE_MODE && aiImageUrl) return aiImageUrl;
    if (bgImageUrl) return bgImageUrl;
    if (aiImageUrl) return aiImageUrl;
    return "";
  }, [activePhotoMode, bgImageUrl, aiImageUrl]);

  const safeScale = clamp(placementScale || 42, 20, 95);
  const safeX = clamp(placementX || 50, 0, 100);
  const safeY = clamp(placementY || 62, 0, 100);

  /**
   * プレビュー用の見た目計算
   *
   * width%
   * - 商品の横幅をざっくり比率で見せる
   *
   * left / top
   * - 中心位置で合わせるために translate を使う
   */
  const productStyle: React.CSSProperties = {
    position: "absolute",
    width: `${safeScale}%`,
    maxWidth: "92%",
    left: `${safeX}%`,
    top: `${safeY}%`,
    transform: "translate(-50%, -50%)",
    objectFit: "contain",
    filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.28))",
    pointerEvents: "none",
    userSelect: "none",
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-white/86 font-bold" style={{ fontSize: 13 }}>
            配置調整
          </div>
          <div
            className="mt-1 text-white/55"
            style={{ fontSize: 12, lineHeight: 1.5 }}
          >
            商品の大きさと場所を動かして、いちばん自然に見える位置に合わせます。
          </div>
        </div>

        <Btn
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            await onSavePlacement({
              scale: safeScale,
              x: safeX,
              y: safeY,
              activePhotoMode,
            });
            showMsg?.("配置を保存しました");
          }}
        >
          配置を保存
        </Btn>
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 p-3">
        <div className="text-white/72 mb-2" style={{ fontSize: 12 }}>
          背景モード
        </div>

        <div className="flex flex-wrap gap-2">
          <ModeButton
            active={activePhotoMode === TEMPLATE_MODE}
            label="テンプレ背景"
            disabled={busy}
            onClick={() => {
              void onChangePhotoMode(TEMPLATE_MODE);
            }}
          />

          <ModeButton
            active={activePhotoMode === AI_BG_MODE}
            label="AI背景"
            disabled={busy}
            onClick={() => {
              void onChangePhotoMode(AI_BG_MODE);
            }}
          />
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/25">
        <div
          className="border-b border-white/10 px-3 py-2 text-white/72"
          style={{ fontSize: 12 }}
        >
          プレビュー
        </div>

        <div
          className="relative w-full"
          style={{
            aspectRatio: "1 / 1",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          {previewBgUrl ? (
            <img
              src={previewBgUrl}
              alt="preview background"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center text-white/40"
              style={{ fontSize: 12 }}
            >
              背景プレビューなし
            </div>
          )}

          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(255,255,255,0.03), rgba(0,0,0,0.06))",
            }}
          />

          {baseImageUrl ? (
            <img
              src={baseImageUrl}
              alt="product preview"
              style={productStyle}
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center text-white/50"
              style={{ fontSize: 12 }}
            >
              元画像がありません
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 border border-white/10" />
          <div
            className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-white/10"
            style={{ transform: "translateX(-0.5px)" }}
          />
          <div
            className="pointer-events-none absolute top-1/2 left-0 h-px w-full bg-white/10"
            style={{ transform: "translateY(-0.5px)" }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <SliderRow
          label="大きさ"
          value={safeScale}
          min={20}
          max={95}
          step={1}
          disabled={busy}
          help="数字が大きいほど商品が大きく見えます。"
          onChange={(n) => setPlacementScale(clamp(n, 20, 95))}
        />

        <SliderRow
          label="左右位置"
          value={safeX}
          min={0}
          max={100}
          step={1}
          disabled={busy}
          help="50 が真ん中です。数字を小さくすると左、大きくすると右です。"
          onChange={(n) => setPlacementX(clamp(n, 0, 100))}
        />

        <SliderRow
          label="上下位置"
          value={safeY}
          min={0}
          max={100}
          step={1}
          disabled={busy}
          help="数字を小さくすると上、大きくすると下です。"
          onChange={(n) => setPlacementY(clamp(n, 0, 100))}
        />
      </div>

      <div
        className="mt-3 rounded-2xl border border-white/10 bg-black/15 px-3 py-3 text-white/60"
        style={{ fontSize: 12, lineHeight: 1.7 }}
      >
        <div>おすすめの考え方</div>
        <div>・家具は少し下寄せにすると置いてある感じが出やすいです。</div>
        <div>・雑貨は大きくしすぎると不自然なので、まず 35〜50 くらいから始めます。</div>
        <div>・迷ったら「真ん中より少し下」に置くと失敗しにくいです。</div>
      </div>
    </div>
  );
}