// /app/flow/drafts/new/components/ProductVideoPanel.tsx
"use client";

import React, { useMemo } from "react";
import NonAiVideoActions from "@/components/video/NonAiVideoActions";
import type { DraftDoc, UiVideoSize } from "@/lib/types/draft";
import { Btn, UI } from "../ui";

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

  onSaveSourceProductVideoToDraft?: (args: {
    url: string;
    path: string;
  }) => Promise<void>;

  extractProductVideoClip?: (args: {
    draftId: string;
    sourceVideoUrl: string;
    backgroundImageUrl: string;
    size: UiVideoSize;
  }) => Promise<void>;

  onBurnVideo: () => Promise<void>;
  onSaveDraft: () => Promise<string | null>;
  onSetPhase: (next: "draft" | "ready" | "posted") => Promise<void>;
};

function pickVideoSourceImage(d: DraftDoc) {
  const candidates = [
    { label: "合成画像", url: String(d.compositeImageUrl ?? "").trim() },
    { label: "AI静止画", url: String(d.aiImageUrl ?? "").trim() },
    { label: "イメージ画像", url: String(d.imageIdeaUrl ?? "").trim() },
    { label: "元画像", url: String(d.baseImageUrl ?? "").trim() },
    { label: "互換画像", url: String((d as any).imageUrl ?? "").trim() },
  ];

  return candidates.find((x) => x.url) ?? { label: "未選択", url: "" };
}

function pickCompositeBackground(d: DraftDoc) {
  const candidates = [
    { label: "テンプレ背景", url: String(d.templateBgUrl ?? "").trim() },
    { label: "AI背景", url: String(d.bgImageUrl ?? "").trim() },
    {
      label: "AI背景履歴",
      url:
        Array.isArray(d.bgImageUrls) && d.bgImageUrls.length > 0
          ? String(d.bgImageUrls[0] ?? "").trim()
          : "",
    },
  ];

  return candidates.find((x) => x.url) ?? { label: "未選択", url: "" };
}

function pickSourceProductVideo(d: DraftDoc) {
  const candidates = [
    {
      label: "商品撮影動画",
      url: String((d as any).sourceProductVideoUrl ?? "").trim(),
    },
    {
      label: "商品撮影動画履歴",
      url:
        Array.isArray((d as any).sourceProductVideoUrls) &&
        (d as any).sourceProductVideoUrls.length > 0
          ? String((d as any).sourceProductVideoUrls[0] ?? "").trim()
          : "",
    },
  ];

  return candidates.find((x) => x.url) ?? { label: "未選択", url: "" };
}

function displayStatus(label: string, url: string) {
  if (!url) return `${label}：未登録`;
  return `${label}：選択済み（${url.startsWith("http") ? "保存済み" : "登録済み"}）`;
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
  onSaveSourceProductVideoToDraft,
  extractProductVideoClip,
  onBurnVideo,
  onSaveDraft,
  onSetPhase,
}: Props) {
  const safeBrand: "vento" | "riva" =
    String((d as any).brand ?? d.brandId ?? "vento").trim() === "riva"
      ? "riva"
      : "vento";

  const safeKeywordsText = String((d as any).keywordsText ?? d.keywords ?? "");

  const sourceImage = useMemo(() => pickVideoSourceImage(d), [d]);
  const background = useMemo(() => pickCompositeBackground(d), [d]);
  const sourceVideo = useMemo(() => pickSourceProductVideo(d), [d]);

  const canBurn = !!String(d.nonAiVideoUrl ?? "").trim() && !busy;

  const canExtractProductVideoClip =
    !!sourceVideo.url &&
    !!background.url &&
    !!draftId &&
    !busy &&
    !nonAiBusy &&
    typeof extractProductVideoClip === "function";

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-white/10 bg-black/20" style={{ padding: UI.cardPadding }}>
        <div className="text-white/90 font-black" style={{ fontSize: 13 }}>
          商品動画の方針
        </div>

        <div className="mt-2 text-white/75" style={{ fontSize: 12, lineHeight: 1.7 }}>
          商品動画は「撮影済みの商品動画 × 生成背景」を主軸にします。
          <br />
          従来の静止画ベース動画も残し、素材がない時の安全ルートとして使います。
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20" style={{ padding: UI.cardPadding }}>
        <div className="text-white/85 font-black" style={{ fontSize: 13 }}>
          動画サイズ（用途）
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
          {[
            { label: "縦（IG / TikTok）", size: "720x1280" as const },
            { label: "正方形（IG投稿）", size: "960x960" as const },
            { label: "横（YouTube / Web）", size: "1280x720" as const },
          ].map((opt) => {
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
                  <span className="text-xs opacity-70">{opt.size}</span>
                </div>
              </Btn>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-cyan-400/20 bg-black/20" style={{ padding: UI.cardPadding }}>
        <div className="text-cyan-200 font-black" style={{ fontSize: 13 }}>
          動画素材の確認
        </div>

        <div className="mt-2 text-white/75" style={{ fontSize: 12, lineHeight: 1.7 }}>
          新方式：<span className="font-black text-white/95">{sourceVideo.label}</span> と{" "}
          <span className="font-black text-white/95">{background.label}</span> を合成します。
        </div>

        <div className="mt-2 text-white/65" style={{ fontSize: 12, lineHeight: 1.7 }}>
          {displayStatus("商品動画", sourceVideo.url)}
          <br />
          背景画像：{background.url ? `選択済み（${background.label}）` : "未選択"}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Btn
            variant="primary"
            disabled={!canExtractProductVideoClip}
            onClick={() => {
              if (!draftId || !sourceVideo.url || !background.url) return;

              void extractProductVideoClip?.({
                draftId,
                sourceVideoUrl: sourceVideo.url,
                backgroundImageUrl: background.url,
                size: normalizeVideoSize(d.videoSize ?? "720x1280"),
              });
            }}
          >
            🎬 動画切り抜き（背景合成）
          </Btn>
        </div>

        {!sourceVideo.url ? (
          <div className="mt-2 text-white/55" style={{ fontSize: 12 }}>
            商品撮影動画が未登録です。
          </div>
        ) : null}

        {sourceVideo.url && !background.url ? (
          <div className="mt-2 text-white/55" style={{ fontSize: 12 }}>
            背景画像が未選択です。
          </div>
        ) : null}

        <div className="mt-3 text-white/75" style={{ fontSize: 12, lineHeight: 1.7 }}>
          従来方式：<span className="font-black text-white/95">{sourceImage.label}</span> から安全な確認動画を作ります。
        </div>

        <div className="mt-2 text-white/65" style={{ fontSize: 12 }}>
          静止画：{sourceImage.url ? `選択済み（${sourceImage.label}）` : "未選択"}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20" style={{ padding: UI.cardPadding }}>
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
          sourceImageUrl={sourceImage.url || undefined}
          sourceLabel={sourceImage.label}
          baseImageUrl={d.baseImageUrl ?? undefined}
          backgroundImageUrl={background.url || undefined}
          backgroundLabel={background.label}
          sourceVideoUrl={sourceVideo.url || undefined}
          sourceVideoLabel={sourceVideo.label}
          seconds={(d.videoSeconds ?? 5) === 10 ? 10 : 5}
          quality={(d.videoQuality ?? "standard") === "high" ? "high" : "standard"}
          size={normalizeVideoSize(d.videoSize ?? "720x1280")}
          onSave={async (url: string) => {
            const fallbackPreset =
              nonAiPreset ??
              ({
                id: "source_video_background_composite",
                major: "商品撮影動画",
                middle: "背景合成",
                minor: "実写ベース",
                tempo: "normal",
                reveal: "early",
                intensity: "balanced",
                attitude: "neutral",
                rhythm: "continuous",
              } as any);

            await onSaveNonAiVideoToDraft({
              url,
              preset: fallbackPreset,
            });
          }}
          onSaveSourceVideo={async ({ url, path }) => {
            if (typeof onSaveSourceProductVideoToDraft === "function") {
              await onSaveSourceProductVideoToDraft({ url, path });
              return;
            }

            setD((prev) => ({
              ...prev,
              sourceProductVideoUrl: url,
              sourceProductVideoPath: path,
              sourceProductVideoUrls: [
                url,
                ...(((prev as any).sourceProductVideoUrls || []) as string[]).filter(
                  (x) => x !== url
                ),
              ].slice(0, 10),
            } as any));
          }}
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20" style={{ padding: UI.cardPadding }}>
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
          <div className="flex h-40 w-full items-center justify-center rounded-xl border border-white/10 text-white/55">
            まだ商品動画がありません
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-orange-400/30 bg-black/20" style={{ padding: UI.cardPadding }}>
        <div className="text-orange-300 font-black" style={{ fontSize: 13 }}>
          文字焼き込み
        </div>

        <div className="mt-2 text-white/70" style={{ fontSize: 12, lineHeight: 1.6 }}>
          完成した代表動画にだけ、必要最小限の文字を焼き込みます。
        </div>

        <div className="mt-3">
          <Btn variant="primary" disabled={!canBurn} onClick={onBurnVideo}>
            🔥 文字を焼き込む
          </Btn>
        </div>

        {!d.nonAiVideoUrl ? (
          <div className="mt-2 text-white/55" style={{ fontSize: 12 }}>
            先に商品動画を生成してください。
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20" style={{ padding: UI.cardPadding }}>
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