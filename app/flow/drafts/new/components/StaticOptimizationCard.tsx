//app/flow/drafts/new/components/StaticOptimizationCard.tsx
"use client";

import React from "react";
import type { ImagePurpose, StaticImageVariant } from "@/lib/types/draft";

/**
 * 静止画最適化AIカード
 *
 * ✅ 役割
 * - 静止画の「目的」を選ぶ
 * - 背景の文脈を選ぶ
 * - 推奨案を表示する
 * - 3案生成を押す
 * - 採用する案を選ぶ
 *
 * ✅ 注意
 * - この部品は「表示」に専念
 * - 実際の state や API 実行は page.tsx 側で持つ
 * - Btn を page.tsx から import しないように、この部品の中に専用ボタンを置く
 */

// 背景シーンの型
type BgScene = "studio" | "lifestyle" | "scale" | "detail";

// props
type Props = {
  staticPurpose: ImagePurpose;
  setStaticPurpose: React.Dispatch<React.SetStateAction<ImagePurpose>>;

  bgScene: BgScene;
  setBgScene: React.Dispatch<React.SetStateAction<BgScene>>;

  staticRecommendation: string;
  staticVariants: StaticImageVariant[];
  staticBusy: boolean;

  purposeLabel: Record<ImagePurpose, string>;
  bgSceneLabel: Record<BgScene, string>;

  onGenerateStaticVariants: () => void | Promise<void>;
  onSelectStaticVariant: (variant: StaticImageVariant) => void | Promise<void>;
};

/**
 * この部品専用のボタン
 *
 * ✅ 理由
 * - page.tsx の Btn はローカル関数なので import できない
 * - ここで同等デザインの小さなボタンを持っておけば、この部品だけで完結してコンパイルが安定する
 */
function CardBtn(props: {
  children: React.ReactNode;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const variant = props.variant ?? "primary";
  const disabled = !!props.disabled;

  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 font-black transition select-none whitespace-nowrap";

  const styles: Record<"primary" | "secondary", string> = {
    primary:
      "bg-white text-black hover:bg-white/92 border border-white/80 shadow-[0_14px_34px_rgba(0,0,0,0.60)]",
    secondary:
      "bg-white/18 text-white hover:bg-white/26 border border-white/40 shadow-[0_12px_28px_rgba(0,0,0,0.55)]",
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        void Promise.resolve(props.onClick?.()).catch((e) => console.error(e));
      }}
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

export default function StaticOptimizationCard(props: Props) {
  const {
    staticPurpose,
    setStaticPurpose,
    bgScene,
    setBgScene,
    staticRecommendation,
    staticVariants,
    staticBusy,
    purposeLabel,
    bgSceneLabel,
    onGenerateStaticVariants,
    onSelectStaticVariant,
  } = props;

  return (
    <div className="rounded-2xl border border-blue-400/20 bg-black/20 p-4 mb-4">
      <div className="text-blue-300 font-black text-sm mb-2">
        🎯 静止画最適化AI（売上設計）
      </div>

      {/* 目的選択 */}
      <div className="flex flex-wrap gap-2 mb-3">
        {(["sales", "branding", "trust", "story"] as ImagePurpose[]).map((p) => (
          <CardBtn
            key={p}
            variant={staticPurpose === p ? "primary" : "secondary"}
            onClick={() => setStaticPurpose(p)}
          >
            {purposeLabel[p]}
          </CardBtn>
        ))}
      </div>

      {/* 背景シーン */}
      <div className="mt-2">
        <div className="text-white/70 mb-2" style={{ fontSize: 12 }}>
          背景の文脈（生活感を出すならここ）
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(bgSceneLabel) as BgScene[]).map((s) => (
            <CardBtn
              key={s}
              variant={bgScene === s ? "primary" : "secondary"}
              onClick={() => setBgScene(s)}
            >
              {bgSceneLabel[s]}
            </CardBtn>
          ))}
        </div>

        <div className="text-white/55 mt-2" style={{ fontSize: 12, lineHeight: 1.6 }}>
          ※ 生活感は「背景だけ」で作る（商品は絶対に変えない／手・人物・小物追加は禁止）
        </div>
      </div>

      {/* 推奨表示 */}
      {staticRecommendation &&
        staticVariants.length > 0 &&
        (() => {
          const rec = staticVariants.find((v) => v.id === staticRecommendation);
          if (!rec) return null;

          return (
            <div className="text-white/75 text-xs mb-3 mt-3">
              推奨：<span className="font-black">{rec.title}</span>
              {rec.rationale ? (
                <span className="text-white/60">（{rec.rationale}）</span>
              ) : null}
            </div>
          );
        })()}

      {/* 生成ボタン */}
      <CardBtn
        variant="primary"
        disabled={staticBusy}
        onClick={onGenerateStaticVariants}
      >
        3案を生成
      </CardBtn>

      {/* 3案表示 */}
      {staticVariants.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2">
          {staticVariants.map((v) => {
            const isRec = v.id === staticRecommendation;

            return (
              <div
                key={v.id}
                className={[
                  "rounded-xl border bg-black/30 p-3",
                  isRec
                    ? "border-white/35 ring-2 ring-white/25"
                    : "border-white/10",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-white font-black text-sm">
                    案 {String(v.id).replace("v", "")}
                  </div>

                  {isRec ? (
                    <span className="text-xs font-black text-white/90 rounded-full px-2 py-1 bg-white/15 border border-white/25">
                      推奨
                    </span>
                  ) : null}
                </div>

                <div className="text-white font-black text-sm mt-1">
                  {v.title}
                </div>

                <div className="text-white/70 text-xs mt-1">
                  {v.rationale}
                </div>

                <div className="text-white/60 text-[11px] mt-1">
                  戦略：{v.strategyType}
                </div>

                <CardBtn
                  variant="secondary"
                  className="mt-2"
                  onClick={() => onSelectStaticVariant(v)}
                >
                  この案を採用
                </CardBtn>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}