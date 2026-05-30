// /app/flow/drafts/new/ui.tsx
"use client";

import React from "react";

export const UI = {
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
} as const;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function SectionCard(props: {
  children: React.ReactNode;
  className?: string;
  padding?: number;
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-white/12 bg-black/25",
        props.className ?? "",
      ].join(" ")}
      style={{ padding: props.padding ?? UI.cardPadding }}
    >
      {props.children}
    </div>
  );
}

export function PanelTitle(props: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["text-white/80 mb-2", props.className ?? ""].join(" ")}
      style={{ fontSize: UI.FONT.labelPx }}
    >
      {props.children}
    </div>
  );
}

export function FieldLabel(props: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["text-white/80 mb-2", props.className ?? ""].join(" ")}
      style={{ fontSize: UI.FONT.labelPx }}
    >
      {props.children}
    </div>
  );
}

export function HelpText(props: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["text-white/55", props.className ?? ""].join(" ")}
      style={{ fontSize: 12, lineHeight: 1.5 }}
    >
      {props.children}
    </div>
  );
}

export function LoadingText(props: {
  text?: string;
  className?: string;
}) {
  return (
    <div
      className={["text-white/75", props.className ?? ""].join(" ")}
      style={{ fontSize: UI.FONT.labelPx }}
    >
      {props.text ?? "読み込み中..."}
    </div>
  );
}

export function UiMessage(props: {
  message?: string | null;
  className?: string;
}) {
  if (!props.message) return null;

  return (
    <div
      className={["mt-2 text-white/70 font-bold", props.className ?? ""].join(" ")}
      style={{ fontSize: UI.FONT.labelPx }}
    >
      {props.message}
    </div>
  );
}

export function Btn(props: {
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

export function SelectBtn(props: {
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

export function Chip(props: { children: React.ReactNode; className?: string }) {
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

export function EmptyStateBox(props: {
  children: React.ReactNode;
  className?: string;
  aspectRatio?: string;
  fontSize?: number;
  minHeight?: number;
}) {
  return (
    <div
      className={[
        "w-full rounded-xl border border-white/10 bg-black/30 flex items-center justify-center text-white/55",
        props.className ?? "",
      ].join(" ")}
      style={{
        aspectRatio: props.aspectRatio ?? "1 / 1",
        fontSize: props.fontSize ?? 13,
        minHeight: props.minHeight,
        textAlign: "center",
        padding: 10,
      }}
    >
      {props.children}
    </div>
  );
}

export function RangeControl(props: {
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

export function PhotoSubmissionGuide() {
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
          <Chip className="text-white/95">検品情報を増やす</Chip>
        </div>

        <div className="text-white/70 mt-2" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.6 }}>
          ※ 仕上がりを安定させるだけでなく、
          <span className="font-black text-white/90"> 商品の確認情報 </span>
          を増やすための提出ルールです。
        </div>
      </summary>

      <div className="mt-3 text-white/80" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.7 }}>
        提出写真は、下のルールに統一してください。
      </div>

      <ul
        className="list-disc list-inside mt-2 space-y-1"
        style={{ color: "rgba(255,255,255,0.88)", fontSize: 13 }}
      >
        <li>背景は「白・薄グレー・無地」にする（白い壁 / 白い紙 / 単色の布でOK）</li>
        <li>商品を画面の中央に大きく写す（小さいと切り抜きも検品も弱くなる）</li>
        <li>影は薄くする（強い影は商品本体や傷と混同しやすい）</li>
        <li>明るい場所で撮る（昼間の窓際が安定）</li>
        <li>色味補正しすぎない（実物との差が出やすい）</li>
      </ul>

      <div className="mt-3 text-white/70 font-bold" style={{ fontSize: UI.FONT.labelPx }}>
        推奨カット
      </div>
      <ul
        className="list-disc list-inside mt-1 space-y-1"
        style={{ color: "rgba(255,255,255,0.70)", fontSize: 13 }}
      >
        <li>正面 1枚</li>
        <li>斜め 1枚</li>
        <li>側面または背面 1枚</li>
        <li>傷・擦れ・木目・金属部などの寄り 1枚</li>
      </ul>

      <div className="mt-3 text-white/70 font-bold" style={{ fontSize: UI.FONT.labelPx }}>
        さらにあると強い
      </div>
      <ul
        className="list-disc list-inside mt-1 space-y-1"
        style={{ color: "rgba(255,255,255,0.70)", fontSize: 13 }}
      >
        <li>底面 / 天面</li>
        <li>開閉前 / 開閉後</li>
        <li>サイズ比較用の補助物（定規など）</li>
      </ul>

      <div className="mt-3 text-white/70 font-bold" style={{ fontSize: UI.FONT.labelPx }}>
        NG例（失敗しやすい）
      </div>
      <ul
        className="list-disc list-inside mt-1 space-y-1"
        style={{ color: "rgba(255,255,255,0.70)", fontSize: 13 }}
      >
        <li>背景がごちゃごちゃしている（部屋・棚・文字・柄）</li>
        <li>商品が小さい</li>
        <li>手で持っている</li>
        <li>逆光 / 暗い / ブレている</li>
        <li>背景の柄・木目・影の筋が強い</li>
      </ul>

      <div className="mt-3 text-white/55" style={{ fontSize: UI.FONT.labelPx, lineHeight: 1.6 }}>
        ※ AOI FLOW では、この情報をもとに
        <span className="font-black text-white/80"> 壊れない制御動画 </span>
        を作る前提です。
        <br />
        ※ 商品自体を勝手に変形させる生成ではなく、
        <span className="font-black text-white/80"> 確認しやすい見せ方 </span>
        を優先します。
      </div>
    </details>
  );
}

export function OriginMetaView(props: { meta: any | undefined }) {
  const { meta } = props;

  if (!meta) {
    return (
      <div className="mt-2 text-white/45" style={{ fontSize: 12 }}>
        生成元：未記録
      </div>
    );
  }

  return (
    <div className="mt-2 text-white/70" style={{ fontSize: 12, lineHeight: 1.6 }}>
      <div className="font-black text-white/80">生成元</div>
      <div>・{meta.label}</div>
      {meta.detail ? <div>・{meta.detail}</div> : null}
      {meta.usedVision ? <div>・使用Vision：{meta.usedVision}</div> : null}
      {typeof meta.at === "number" ? (
        <div>・生成時刻：{new Date(meta.at).toLocaleString("ja-JP")}</div>
      ) : null}
    </div>
  );
}