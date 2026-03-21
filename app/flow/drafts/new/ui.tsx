// /app/flow/drafts/new/ui.tsx
"use client";

import React from "react";

/**
 * =========================================================
 * このファイルは何をするもの？
 * =========================================================
 * AOI FLOW の「見た目の部品」をまとめているファイルです。
 *
 * 画面の中で何度も使う
 * 「ボタン」「選択ボタン」「小さなラベル」「数値調整UI」
 * 「共通カード」「見出し」「空表示」「画面内メッセージ」
 * などを、ここでひとまとめにしています。
 *
 * このファイルの役割は、
 * 画面をきれいに作るための“部品箱”です。
 *
 * ---------------------------------------------------------
 * このファイルでやること
 * ---------------------------------------------------------
 * 1. 見た目の共通ルール（UI定数）をまとめる
 * 2. ボタン部品を作る
 * 3. 選択ボタン部品を作る
 * 4. 小さいラベル（Chip）部品を作る
 * 5. 数値を増減する部品を作る
 * 6. 写真提出ガイド表示の部品を作る
 * 7. 共通カード枠を作る
 * 8. 見出しや補助テキストの部品を作る
 * 9. 空状態表示の部品を作る
 * 10. 画面内メッセージ表示の部品を作る
 * 11. 生成元表示の部品を作る
 *
 * ---------------------------------------------------------
 * このファイルでやらないこと
 * ---------------------------------------------------------
 * - Firestoreへの保存
 * - Firebaseとの通信
 * - API呼び出し
 * - 画像生成
 * - 動画生成
 * - ログイン判定
 * - 状態管理の本体
 *
 * つまり、
 * 「処理」はしないで、
 * 「見た目」だけを担当するファイルです。
 *
 * ---------------------------------------------------------
 * 主にどのファイルとつながる？
 * ---------------------------------------------------------
 * 一番大きくつながるのは下のファイルです。
 *
 * /app/flow/drafts/new/page.tsx
 *
 * この page.tsx から、
 * ここで作った部品を import して使います。
 *
 * 例：
 * import {
 *   UI,
 *   Btn,
 *   SelectBtn,
 *   Chip,
 *   RangeControl,
 *   PhotoSubmissionGuide,
 *   SectionCard,
 *   FieldLabel,
 *   EmptyStateBox,
 *   UiMessage,
 *   LoadingText,
 *   OriginMetaView,
 * } from "./ui";
 *
 * ---------------------------------------------------------
 * 小学生向けにたとえると
 * ---------------------------------------------------------
 * page.tsx ＝ 司令塔（何をするか決める）
 * ui.tsx   ＝ 道具箱（ボタンや表示部品を用意する）
 *
 * 司令塔が
 * 「このボタンを出して」
 * 「このガイドを表示して」
 * 「空の時の箱を出して」
 * 「メッセージを見せて」
 * とお願いすると、
 * ui.tsx の部品が画面に出てくるイメージです。
 * =========================================================
 */

// =========================================================
// UI 定数
// =========================================================
/**
 * UI = 画面の見た目ルールをまとめた設定
 *
 * ここで数字をまとめておくと、
 * あとでデザインを直したい時にここだけ見ればよくなります。
 *
 * 例：
 * - 余白を広くしたい
 * - ボタン文字を少し大きくしたい
 * - プレビューの角丸を変えたい
 *
 * そういう時に便利です。
 */
export const UI = {
  // 部品どうしの基本のすき間
  gap: 12,

  // カードの内側の余白
  cardPadding: 12,

  // 各入力欄の高さ
  hVision: 64,
  hIG: 110,
  hX: 90,
  hMemo: 72,
  hOverlayText: 84,

  // 画像プレビューの最大幅と角丸
  previewMaxWidth: 400,
  previewRadius: 11,

  // 数値増減ボタンのサイズ
  stepBtnSize: 36,

  // 読み込み中テキストを表示する設計用のフラグ
  showLoadingText: true,

  // 文字サイズ関係
  FONT: {
    labelPx: 12,
    chipPx: 12,
    inputPx: 14,
    inputLineHeight: 1.55,
    buttonPx: 13,
    overlayPreviewBasePx: 18,
    overlayCanvasBasePx: 44,
  },

  // 入力欄の基本色
  FORM: {
    bg: "rgba(0,0,0,0.55)",
    border: "rgba(255,255,255,0.18)",
    text: "rgba(255,255,255,0.96)",
  },

  // 右側固定表示の上からの余白
  rightStickyTopPx: 25,

  // RangeControl専用の細かい余白設定
  RANGE: {
    boxPad: 8,
    headerMb: 6,
    valuePadY: 5,
    valuePadX: 10,
  },
} as const;

// =========================================================
// clamp
// =========================================================
/**
 * 数字が小さすぎたり大きすぎたりしないように、
 * 最低値〜最高値の間におさめる関数です。
 *
 * 例：
 * clamp(200, 0, 100) → 100
 * clamp(-5, 0, 100) → 0
 * clamp(50, 0, 100) → 50
 *
 * 主に RangeControl の中で使います。
 */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// =========================================================
// SectionCard
// =========================================================
/**
 * 画面の大きなまとまりを包む共通カードです。
 *
 * 使い道：
 * - Brand の箱
 * - 本文編集の箱
 * - 動画設定の箱
 * - プレビュー側の箱
 *
 * これを使うと、
 * 「ここからここまでが1つのエリア」
 * だと分かりやすくなります。
 */
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

// =========================================================
// PanelTitle
// =========================================================
/**
 * カードの中の見出しです。
 *
 * 使い道：
 * - Brand
 * - Vision（必須）
 * - Instagram 本文
 * - 動画サイズ
 *
 * どこが見出しかを揃えるための部品です。
 */
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

// =========================================================
// FieldLabel
// =========================================================
/**
 * 入力欄の上に出す小さいラベルです。
 *
 * 使い道：
 * - Vision（必須）
 * - Keywords（任意）
 * - テキスト（直接編集）
 *
 * PanelTitle より少し用途を狭くしたラベルです。
 */
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

// =========================================================
// HelpText
// =========================================================
/**
 * 補足説明の小さい文字です。
 *
 * 使い道：
 * - 注意文
 * - 補足説明
 * - 操作ヒント
 */
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

// =========================================================
// LoadingText
// =========================================================
/**
 * 読み込み中の表示です。
 *
 * 使い道：
 * - 読み込み中...
 * - 保存中...
 * - 同期中...
 *
 * 画面の上などに、短い状態表示を出したい時に使います。
 */
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

// =========================================================
// UiMessage
// =========================================================
/**
 * alert の代わりに画面の中へ出すメッセージです。
 *
 * 使い道：
 * - 保存しました
 * - 生成しました
 * - 失敗しました
 *
 * この部品は「表示だけ」を担当します。
 * メッセージを出すかどうかは page.tsx が決めます。
 */
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

// =========================================================
// Btn
// =========================================================
/**
 * ふつうの共通ボタンです。
 *
 * 使い道：
 * - 保存ボタン
 * - 生成ボタン
 * - 削除ボタン
 * - 戻るボタン
 *
 * variant を変えると見た目が変わります。
 * - primary   : いちばん大事なボタン
 * - secondary : 次に大事なボタン
 * - ghost     : 目立ちすぎないボタン
 * - danger    : 危険系（削除など）
 */
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

// =========================================================
// SelectBtn
// =========================================================
/**
 * これは「選ばれている / 選ばれていない」があるボタンです。
 *
 * 使い道：
 * - タブ切替
 * - ON/OFFのような選択
 * - 複数候補から1つ選ぶUI
 *
 * selected が true なら、
 * 「今これが選ばれています」という見た目になります。
 */
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

// =========================================================
// Chip
// =========================================================
/**
 * 小さい丸いラベル表示です。
 *
 * 使い道：
 * - 「おすすめ」
 * - 「重要」
 * - 「3条件」
 * - 「公開中」
 *
 * みたいな、短い目印を表示したい時に使います。
 */
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

// =========================================================
// EmptyStateBox
// =========================================================
/**
 * まだ何も無い時の表示箱です。
 *
 * 使い道：
 * - 元画像がありません
 * - 背景がありません
 * - イメージ画像がありません
 * - 動画がまだありません
 *
 * 「空の状態」を見た目として統一したい時に使います。
 */
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

// =========================================================
// RangeControl
// =========================================================
/**
 * 数字をスライダーと + / - ボタンで調整する部品です。
 *
 * 使い道：
 * - 文字サイズ変更
 * - 位置調整
 * - 透明度調整
 * - 拡大率調整
 *
 * つまり「数値をいじるUI」をまとめた部品です。
 */
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

// =========================================================
// PhotoSubmissionGuide
// =========================================================
/**
 * 写真提出の説明を表示する部品です。
 *
 * これはユーザーに
 * 「どんな写真をアップすると失敗しにくいか」
 * を伝えるためのガイドです。
 *
 * 開閉できる説明パネルになっています。
 */
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

// =========================================================
// OriginMetaView
// =========================================================
/**
 * 生成元の情報を表示する部品です。
 *
 * これは、
 * 「この画像や背景が、どこから作られたか」
 * を見せるための表示専用部品です。
 *
 * 注意：
 * この部品は表示だけします。
 * データを作るのは page.tsx 側です。
 */
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