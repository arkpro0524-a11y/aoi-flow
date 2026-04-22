// /app/flow/drafts/new/components/ProductVideoPanel.tsx
"use client";

import React, { useMemo } from "react";
import NonAiVideoActions from "@/components/video/NonAiVideoActions";
import type { DraftDoc, UiVideoSize } from "@/lib/types/draft";
import { Btn, UI } from "../ui";

/**
 * 商品動画パネル
 *
 * 今回の修正ポイント
 * - 商品動画は「検品・理解・信頼」優先の見せ方に寄せる
 * - Runway系の思想をここへ混ぜない
 * - 入力画像ソースの優先順位を整理する
 * - 文字焼き込みは「元動画がある時だけ」押せるようにする
 * - 文言も "かっこよさ" より "確認" に寄せる
 */

type Props = {
  d: DraftDoc;
  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;
  uid: string | null;
  busy: boolean;
  nonAiBusy: boolean;
  nonAiReason: string;
  setNonAiReason: React.Dispatch<React.SetStateAction<string>>;
  nonAiPreset: NonNullable<DraftDoc["nonAiVideoPreset"]> | null;
  draftId: string | null;

  normalizeVideoSize: (s: any) => UiVideoSize;
  splitKeywords: (text: string) => string[];

  onSaveNonAiVideoToDraft: (args: {
    url: string;
    preset: DraftDoc["nonAiVideoPreset"];
  }) => Promise<void>;

  onBurnVideo: () => Promise<void>;
  onSaveDraft: () => Promise<string | null>;
  onSetPhase: (next: "draft" | "ready" | "posted") => Promise<void>;
};

function pickVideoSource(d: DraftDoc) {
  /**
   * 優先順位
   * 1) 合成画像
   * 2) AI静止画
   * 3) イメージ画像
   * 4) 元画像
   * 5) 互換 imageUrl
   */
  const candidates = [
    {
      label: "合成画像",
      url: String(d.compositeImageUrl ?? "").trim(),
    },
    {
      label: "AI静止画",
      url: String(d.aiImageUrl ?? "").trim(),
    },
    {
      label: "イメージ画像",
      url: String(d.imageIdeaUrl ?? "").trim(),
    },
    {
      label: "元画像",
      url: String(d.baseImageUrl ?? "").trim(),
    },
    {
      label: "互換画像",
      url: String((d as any).imageUrl ?? "").trim(),
    },
  ];

  return candidates.find((x) => x.url) ?? { label: "未選択", url: "" };
}

export default function ProductVideoPanel({
  d,
  setD,
  uid,
  busy,
  nonAiBusy,
  nonAiReason,
  setNonAiReason,
  nonAiPreset,
  draftId,
  normalizeVideoSize,
  splitKeywords,
  onSaveNonAiVideoToDraft,
  onBurnVideo,
  onSaveDraft,
  onSetPhase,
}: Props) {
  const safeBrand: "vento" | "riva" =
    String((d as any).brand ?? d.brandId ?? "vento").trim() === "riva" ? "riva" : "vento";

  const safeKeywordsText = String((d as any).keywordsText ?? d.keywords ?? "");

  const source = useMemo(() => pickVideoSource(d), [d]);
  const canBurn = !!String(d.nonAiVideoUrl ?? "").trim() && !busy;

  return (
    <div className="flex flex-col gap-3">
      {/* 説明 */}
      <div
        className="rounded-2xl border border-white/10 bg-black/20"
        style={{ padding: UI.cardPadding }}
      >
        <div className="text-white/90 font-black" style={{ fontSize: 13 }}>
          商品動画の方針
        </div>

        <div className="mt-2 text-white/75" style={{ fontSize: 12, lineHeight: 1.7 }}>
          このブロックは「派手な演出」ではなく、
          <span className="font-black text-white/90"> 商品の確認・理解・信頼 </span>
          を優先します。
          <br />
          まず全体、次に質感や視点差、最後に締めの確認という順で見せるのが基本です。
        </div>
      </div>

      {/* 動画サイズ（用途） */}
      <div
        className="rounded-2xl border border-white/10 bg-black/20"
        style={{ padding: UI.cardPadding }}
      >
        <div className="text-white/85 font-black" style={{ fontSize: 13 }}>
          動画サイズ（用途）
        </div>

        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
          {(
            [
              { label: "縦（IG / TikTok）", size: "720x1280" as const },
              { label: "正方形（IG投稿）", size: "960x960" as const },
              { label: "横（YouTube / Web）", size: "1280x720" as const },
            ] as const
          ).map((opt) => {
            const active = normalizeVideoSize(d.videoSize ?? "720x1280") === opt.size;

            return (
              <Btn
                key={opt.size}
                variant={active ? "primary" : "secondary"}
                onClick={() =>
                  setD((prev) => ({
                    ...prev,
                    videoSize: opt.size,
                  }))
                }
              >
                <div className="flex flex-col leading-tight">
                  <span className="font-black">{opt.label}</span>
                  <span className="opacity-70 text-xs">{opt.size}</span>
                </div>
              </Btn>
            );
          })}
        </div>
      </div>

      {/* 入力画像の確認 */}
      <div
        className="rounded-2xl border border-cyan-400/20 bg-black/20"
        style={{ padding: UI.cardPadding }}
      >
        <div className="text-cyan-200 font-black" style={{ fontSize: 13 }}>
          動画の元になる画像
        </div>

        <div className="mt-2 text-white/75" style={{ fontSize: 12, lineHeight: 1.7 }}>
          現在は
          <span className="font-black text-white/95"> {source.label} </span>
          を優先して動画化します。
          <br />
          合成画像がある場合は合成画像を優先し、無い場合はAI静止画、さらに無い場合は元画像へ自動で落とします。
        </div>

        <div className="mt-2 text-white/55 break-all" style={{ fontSize: 11 }}>
          {source.url || "まだ動画化できる画像がありません"}
        </div>
      </div>

      {/* 非AI動画アクション */}
      <div
        className="rounded-2xl border border-white/10 bg-black/20"
        style={{ padding: UI.cardPadding }}
      >
        <NonAiVideoActions
          busy={busy || nonAiBusy}
          reason={nonAiReason}
          setReason={setNonAiReason}
          uid={uid}
          draftId={draftId}
          brand={safeBrand}
          vision={String(d.vision ?? "")}
          keywords={splitKeywords(safeKeywordsText)}
          preset={nonAiPreset}
          sourceImageUrl={source.url || undefined}
          sourceLabel={source.label}
          baseImageUrl={d.baseImageUrl ?? undefined}
          seconds={(d.videoSeconds ?? 5) === 10 ? 10 : 5}
          quality={(d.videoQuality ?? "standard") === "high" ? "high" : "standard"}
          size={normalizeVideoSize(d.videoSize ?? "720x1280")}
          onSave={async (url: string) => {
            if (!nonAiPreset) {
              setNonAiReason("動画テンプレが未選択です");
              return;
            }

            await onSaveNonAiVideoToDraft({
              url,
              preset: nonAiPreset,
            });
          }}
        />
      </div>

      {/* 代表動画プレビュー */}
      <div
        className="rounded-2xl border border-white/10 bg-black/20"
        style={{ padding: UI.cardPadding }}
      >
        <div className="text-white/85 font-black" style={{ fontSize: 13 }}>
          代表動画（商品確認用）
        </div>

        {d.nonAiVideoUrl ? (
          <video
            src={d.nonAiVideoUrl}
            controls
            className="w-full rounded-xl border border-white/10"
            style={{ maxHeight: 360 }}
          />
        ) : (
          <div className="w-full h-40 flex items-center justify-center text-white/55 border border-white/10 rounded-xl">
            まだ非AI動画がありません
          </div>
        )}
      </div>

      {/* 焼き込み */}
      <div
        className="rounded-2xl border border-orange-400/30 bg-black/20"
        style={{ padding: UI.cardPadding }}
      >
        <div className="text-orange-300 font-black" style={{ fontSize: 13 }}>
          文字焼き込み
        </div>

        <div className="mt-2 text-white/70" style={{ fontSize: 12, lineHeight: 1.6 }}>
          まず非AI動画を完成させてから、必要な時だけ文字を焼き込みます。
          <br />
          商品動画は文字を入れすぎると安っぽく見えやすいため、短く最小限が安全です。
        </div>

        <div className="mt-3">
          <Btn variant="primary" disabled={!canBurn} onClick={onBurnVideo}>
            🔥 文字を焼き込む
          </Btn>
        </div>

        {!d.nonAiVideoUrl ? (
          <div className="mt-2 text-white/55" style={{ fontSize: 12 }}>
            先に非AI動画を生成してください。
          </div>
        ) : null}
      </div>

      {/* ステータス */}
      <div
        className="rounded-2xl border border-white/10 bg-black/20"
        style={{ padding: UI.cardPadding }}
      >
        <div className="text-white/85 font-black" style={{ fontSize: 13 }}>
          ステータス
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Btn variant="ghost" disabled={!uid || busy} onClick={onSaveDraft}>
            保存
          </Btn>

          <Btn
            variant={d.phase === "ready" ? "primary" : "secondary"}
            disabled={!uid || busy}
            onClick={() => onSetPhase("ready")}
          >
            投稿待ちへ
          </Btn>

          <Btn
            variant={d.phase === "posted" ? "primary" : "secondary"}
            disabled={!uid || busy}
            onClick={() => onSetPhase("posted")}
          >
            投稿済みへ
          </Btn>
        </div>
      </div>
    </div>
  );
}