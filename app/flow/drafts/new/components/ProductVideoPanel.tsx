// /app/flow/drafts/new/components/ProductVideoPanel.tsx
"use client";

import React from "react";
import NonAiVideoActions from "@/components/video/NonAiVideoActions";
import type { DraftDoc, UiVideoSize } from "@/lib/types/draft";
import { Btn, UI } from "../ui";

/**
 * 商品動画パネル
 *
 * この部品の責務
 * - 動画サイズの切替表示
 * - 非AI動画アクション表示
 * - 代表動画プレビュー表示
 * - 文字焼き込みボタン表示
 * - 保存 / 投稿待ち / 投稿済みボタン表示
 *
 * 重要
 * - 実処理は親(page.tsx)が持つ
 * - この部品は「商品動画」ブロックの見た目をまとめる
 * - Runway系のCM処理はここに入れない
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
  /**
   * brand は旧データや読込直後で undefined の可能性があるため、
   * 必ず vento / riva のどちらかに丸める。
   */
  const safeBrand: "vento" | "riva" =
    (String((d as any).brand ?? d.brandId ?? "vento").trim() === "riva" ? "riva" : "vento");

  /**
   * keywordsText も undefined の可能性があるため必ず文字列化する。
   * 旧データ互換で keywords も拾う。
   */
  const safeKeywordsText = String((d as any).keywordsText ?? d.keywords ?? "");

  return (
    <div className="flex flex-col gap-3">
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

      {/* 非AI動画アクション（唯一の入口） */}
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
          sourceImageUrl={d.aiImageUrl ?? undefined}
          baseImageUrl={d.baseImageUrl ?? undefined}
          seconds={(d.videoSeconds ?? 5) === 10 ? 10 : 5}
          quality={(d.videoQuality ?? "standard") === "high" ? "high" : "standard"}
          size={normalizeVideoSize(d.videoSize ?? "720x1280")}
          onSave={async (url: string) => {
            if (!nonAiPreset) {
              setNonAiReason("動画人格が未選択です");
              return;
            }

            await onSaveNonAiVideoToDraft({
              url,
              preset: nonAiPreset,
            });
          }}
        />
      </div>

      {/* 代表動画プレビュー（非AIのみ） */}
      <div
        className="rounded-2xl border border-white/10 bg-black/20"
        style={{ padding: UI.cardPadding }}
      >
        <div className="text-white/85 font-black" style={{ fontSize: 13 }}>
          代表動画（非AI）
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
            非AI動画がまだありません
          </div>
        )}
      </div>

      {/* 焼き込み */}
      <div
        className="rounded-2xl border border-orange-400/30 bg-black/20"
        style={{ padding: UI.cardPadding }}
      >
        <div className="text-orange-300 font-black" style={{ fontSize: 13 }}>
          🔥 動画にする（文字焼き込み）
        </div>

        <div className="mt-3">
          <Btn variant="primary" disabled={busy} onClick={onBurnVideo}>
            🔥 動画にする
          </Btn>
        </div>
      </div>

      {/* ステータス */}
      <div
        className="rounded-2xl border border-white/10 bg-black/20"
        style={{ padding: UI.cardPadding }}
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn variant="ghost" disabled={!uid || busy} onClick={onSaveDraft}>
            保存
          </Btn>

          <Btn
            variant={d.phase === "ready" ? "primary" : "secondary"}
            onClick={() => onSetPhase("ready")}
          >
            投稿待ちへ
          </Btn>

          <Btn
            variant={d.phase === "posted" ? "primary" : "secondary"}
            onClick={() => onSetPhase("posted")}
          >
            投稿済みへ
          </Btn>
        </div>
      </div>
    </div>
  );
}