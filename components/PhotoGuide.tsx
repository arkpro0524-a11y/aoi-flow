"use client";

import React, { useMemo, useState } from "react";

type Props = {
  /** 既に画像が選ばれている/アップロード済みなら true にすると案内の強調を少し弱める等に使える */
  hasImage?: boolean;
  /** デフォルトで開いておくか（初回ユーザー向けに true 推奨） */
  defaultOpen?: boolean;
  /** 見出し文言を変えたいとき用（通常は不要） */
  title?: string;
};

function Chip(props: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-3 py-1 font-bold",
        "bg-black/55 border border-white/25 text-white/90",
        props.className ?? "",
      ].join(" ")}
      style={{ fontSize: 12 }}
    >
      {props.children}
    </span>
  );
}

function Row(props: { label: string; ok?: boolean; children: React.ReactNode }) {
  const ok = props.ok;
  return (
    <div className="rounded-2xl border border-white/12 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-white/85 font-black" style={{ fontSize: 12 }}>
          {props.label}
        </div>
        {ok === true ? <Chip className="text-white/95">OK</Chip> : null}
        {ok === false ? <Chip className="text-white/95">NG</Chip> : null}
      </div>
      <div className="mt-2 text-white/70" style={{ fontSize: 12, lineHeight: 1.6 }}>
        {props.children}
      </div>
    </div>
  );
}

/**
 * PhotoGuide
 * - ユーザーに「撮り方（提出方法）」を示して、背景変更/動画化の成功率を上げるためのガイド
 * - “商品だけ正確に抜く” は写真品質が強く効くため、ここをUIに常設する
 */
export default function PhotoGuide(props: Props) {
  const title = props.title ?? "写真の出し方（重要）";
  const [open, setOpen] = useState<boolean>(props.defaultOpen ?? true);

  const headerHint = useMemo(() => {
    if (props.hasImage) return "（画像あり：このままでもOK。より良くしたい時に確認）";
    return "（画像なし：アップロード前に確認すると成功率UP）";
  }, [props.hasImage]);

  return (
    <div className="rounded-2xl border border-white/12 bg-black/20 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "w-full flex items-center justify-between gap-2",
          "rounded-xl border border-white/10 bg-black/25 hover:bg-black/30 transition",
          "px-3 py-2",
        ].join(" ")}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-white/90 font-black" style={{ fontSize: 13 }}>
            {title}
          </div>
          <div className="text-white/55" style={{ fontSize: 12 }}>
            {headerHint}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Chip className="text-white/95">{open ? "閉じる" : "開く"}</Chip>
        </div>
      </button>

      {open ? (
        <div className="mt-3 grid gap-3">
          <div className="text-white/70" style={{ fontSize: 12, lineHeight: 1.65 }}>
            このアプリは「アップロード画像を元に、背景変更した画像 / 動画」を作ります。  
            ただし **元写真が悪いと、商品が溶けたり・輪郭が崩れたり・背景と一体化**することがあります。  
            下のチェックを守るほど、仕上がりが安定します。
          </div>

          <div className="grid gap-2">
            <Row label="1) 商品はできるだけ大きく写す（画面の60〜85%）" ok>
              商品が小さいと、AIが「背景の一部」と誤認しやすくなります。  
              目安：**商品が画面の半分以上**。
            </Row>

            <Row label="2) 背景はシンプル（白/黒/無地/壁）" ok>
              背景の柄・物・文字が多いほど、切り抜きが不安定になります。  
              可能なら **無地の壁 / 布 / 床** で撮影。
            </Row>

            <Row label="3) 輪郭が分かる（商品色と背景色が近すぎない）" ok>
              「黒い商品 × 黒い背景」などは境界が消えます。  
              **コントラスト（色の差）**が大事です。
            </Row>

            <Row label="4) 影は薄く、光は均一（強い影・逆光は避ける）" ok>
              強い影は「商品形状」と誤認されて残ったり、商品が歪んだりします。  
              室内なら **窓の反対側**や、ライトを左右から当てて影を薄く。
            </Row>

            <Row label="5) 反射しやすい素材は角度を変える（テカり注意）" ok>
              金属・ガラス・ビニールなどは輪郭が飛びやすいです。  
              **少し斜めから**撮ると安定しやすいです。
            </Row>

            <Row label="6) 文字・ロゴ・値札・手・指は写さない" ok={false}>
              文字や手が入ると、AIがそれを「商品」の一部として残すことがあります。  
              値札は外し、商品だけを撮影してください。
            </Row>
          </div>

          <div className="rounded-2xl border border-white/12 bg-black/20 p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-white/85 font-black" style={{ fontSize: 12 }}>
                よくある失敗パターン（これを避ける）
              </div>
              <Chip className="text-white/95">崩れ原因</Chip>
            </div>

            <ul className="mt-2 list-disc pl-5 text-white/70" style={{ fontSize: 12, lineHeight: 1.7 }}>
              <li>商品が小さい（背景の情報が多すぎる）</li>
              <li>背景に物が多い（机の上、棚、部屋が写っている）</li>
              <li>商品と背景の色が同じ（境界が消える）</li>
              <li>強い影、逆光、フラッシュの白飛び（形が壊れる）</li>
              <li>手で持って撮っている（手が商品として残る）</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-white/12 bg-black/20 p-3">
            <div className="text-white/85 font-black" style={{ fontSize: 12 }}>
              「完全に商品だけ正確に抜く」について
            </div>
            <div className="mt-2 text-white/70" style={{ fontSize: 12, lineHeight: 1.65 }}>
              元写真だけで “ほぼ” はできますが、**100%安定はしません**。  
              本気で安定させる場合は、一般に<br />
              <span className="text-white/90 font-black">背景除去（切り抜き） → 背景合成</span>
              <br />
              の2段階にします。  
              ※ これは次の実装で「ボタン + 生成結果（cutout/bg/composite）」として組み込み可能です。
            </div>
          </div>

          <div className="text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
            ※ このガイドはアップロード画面に常設されます（顧客が迷わないため）。  
            ※ “迷わせない” ことが、結果的に生成品質と作業効率を上げます。
          </div>
        </div>
      ) : null}
    </div>
  );
}