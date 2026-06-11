// /app/flow/drafts/new/components/ProductVideoPanel.tsx
"use client";

import React, { useMemo, useState } from "react";
import NonAiVideoActions from "@/components/video/NonAiVideoActions";
import type { DraftDoc, ProductPhotoMode, UiVideoSize } from "@/lib/types/draft";
import { Btn, UI } from "../ui";

type Props = {
  onExtractProductVideoClip?: (args: {
    sourceVideoUrl: string;
    backgroundImageUrl: string;
  }) => Promise<void>;

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
  onSaveDraft: (partial?: Partial<DraftDoc>) => Promise<string | null>;
  onSetPhase: (next: "draft" | "ready" | "posted") => Promise<void>;

  serverPlacementMeta?: any;
  baseImageUrl: string;
  foregroundImageUrl: string;
  bgImageUrl: string;
  aiImageUrl: string;
  compositeTextImageUrl: string;
  templateBgUrl: string;
  templateBgUrls: string[];
  aiBgUrls: string[];
  templateRecommended: any[];
  isCompositeFresh: boolean;
  productCategory: any;
  productSize: any;
  groundingType: any;
  bgScene: any;
  textOverlay: any;
  activePhotoMode: any;
  onChangePhotoMode: (next: any) => Promise<void>;
  onSelectTemplateBg: (url: string) => Promise<void>;
  onSelectAiBg: (url: string) => void | Promise<void>;
  onRecompose: () => Promise<void>;
  onGenerateVideoBackground?: (keyword: string) => Promise<string>;

  placementScale: number;
  placementX: number;
  placementY: number;
  shadowOpacity: number;
  shadowBlur: number;
  shadowScale: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  backgroundScale: number;
  backgroundX: number;
  backgroundY: number;
  setPlacementScale: React.Dispatch<React.SetStateAction<number>>;
  setPlacementX: React.Dispatch<React.SetStateAction<number>>;
  setPlacementY: React.Dispatch<React.SetStateAction<number>>;
  setShadowOpacity: React.Dispatch<React.SetStateAction<number>>;
  setShadowBlur: React.Dispatch<React.SetStateAction<number>>;
  setShadowScale: React.Dispatch<React.SetStateAction<number>>;
  setShadowOffsetX: React.Dispatch<React.SetStateAction<number>>;
  setShadowOffsetY: React.Dispatch<React.SetStateAction<number>>;
  setBackgroundScale: React.Dispatch<React.SetStateAction<number>>;
  setBackgroundX: React.Dispatch<React.SetStateAction<number>>;
  setBackgroundY: React.Dispatch<React.SetStateAction<number>>;
  editingStep: any;
  setEditingStep: React.Dispatch<any>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSavePlacement: (
    step: "background" | "product" | "shadow",
    partial?: {
      scale?: number;
      x?: number;
      y?: number;
      shadowOpacity?: number;
      shadowBlur?: number;
      shadowScale?: number;
      shadowOffsetX?: number;
      shadowOffsetY?: number;
      backgroundScale?: number;
      backgroundX?: number;
      backgroundY?: number;
      activePhotoMode?: ProductPhotoMode;
    }
  ) => Promise<void>;
  sizeTemplateType: any;
  setSizeTemplateType: React.Dispatch<any>;
  onSaveCompositeTextImageFromCompositeSlot: () => Promise<void>;
  showMsg: (msg: string) => void;
};

type VideoBgKind = "video" | "template" | "ai" | "composite";

type VideoBgCandidate = {
  label: string;
  url: string;
  kind: VideoBgKind;
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

function pickCompositeBackground(d: DraftDoc, templateBgUrl?: string, bgImageUrl?: string) {
  const candidates = [
    {
      label: String((d as any).videoBackgroundLabel ?? "動画用に選択した背景"),
      url: String((d as any).videoBackgroundImageUrl ?? "").trim(),
    },
    {
      label: "テンプレ背景",
      url: String(templateBgUrl ?? d.templateBgUrl ?? "").trim(),
    },
    {
      label: "AI背景",
      url: String(bgImageUrl ?? d.bgImageUrl ?? "").trim(),
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

function normalizeUrlList(input: unknown, limit = 20): string[] {
  const raw = Array.isArray(input) ? input : [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const s = String(item ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;

    seen.add(s);
    out.push(s);

    if (out.length >= limit) break;
  }

  return out;
}

function pickVideoBackgroundCandidates(input: {
  d: DraftDoc;
  templateBgUrl?: string;
  bgImageUrl?: string;
  templateBgUrls?: string[];
  aiBgUrls?: string[];
}): VideoBgCandidate[] {
  const { d, templateBgUrl, bgImageUrl, templateBgUrls = [], aiBgUrls = [] } = input;

  const aiUrls = normalizeUrlList(
    [
      ...aiBgUrls,
      ...(Array.isArray(d.bgImageUrls) ? d.bgImageUrls : []),
      d.bgImageUrl,
      bgImageUrl,
    ],
    30
  );

  const items: VideoBgCandidate[] = [
    {
      label: "動画用に選択中",
      url: String((d as any).videoBackgroundImageUrl ?? "").trim(),
      kind: "video",
    },
    {
      label: "現在のテンプレ背景",
      url: String(templateBgUrl ?? d.templateBgUrl ?? "").trim(),
      kind: "template",
    },
    {
      label: "現在のAI背景",
      url: String(bgImageUrl ?? d.bgImageUrl ?? "").trim(),
      kind: "ai",
    },
    ...normalizeUrlList(templateBgUrls, 30).map((url, index) => ({
      label: `テンプレ背景 ${index + 1}`,
      url,
      kind: "template" as const,
    })),
    ...aiUrls.map((url, index) => ({
      label: `AI背景 ${index + 1}`,
      url,
      kind: "ai" as const,
    })),
    {
      label: "通常合成画像",
      url: String(d.compositeImageUrl ?? "").trim(),
      kind: "composite",
    },
    {
      label: "現在の完成画像",
      url: String(d.aiImageUrl ?? "").trim(),
      kind: "composite",
    },
  ];

  const out: VideoBgCandidate[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!item.url) continue;
    if (seen.has(item.url)) continue;

    seen.add(item.url);
    out.push(item);
  }

  return out;
}

function VideoSizeSelector(props: {
  d: DraftDoc;
  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;
  normalizeVideoSize: (s: any) => UiVideoSize;
}) {
  const { d, setD, normalizeVideoSize } = props;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
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
                setD((prev: DraftDoc) => ({
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
  );
}

function VideoBackgroundSelector(props: {
  d: DraftDoc;
  busy: boolean;
  templateBgUrl?: string;
  bgImageUrl?: string;
  templateBgUrls?: string[];
  aiBgUrls?: string[];
  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;
  onSaveDraft: (partial?: Partial<DraftDoc>) => Promise<string | null>;
  onGenerateVideoBackground?: (keyword: string) => Promise<string>;
  showMsg: (msg: string) => void;
}) {
  const {
    d,
    busy,
    templateBgUrl,
    bgImageUrl,
    templateBgUrls,
    aiBgUrls,
    setD,
    onSaveDraft,
    onGenerateVideoBackground,
    showMsg,
  } = props;

  const [keyword, setKeyword] = useState(
    String((d as any).videoBackgroundKeyword ?? "商品が自然に映える明るい室内").trim()
  );
  const [localBusy, setLocalBusy] = useState(false);

  const candidates = useMemo(
    () =>
      pickVideoBackgroundCandidates({
        d,
        templateBgUrl,
        bgImageUrl,
        templateBgUrls,
        aiBgUrls,
      }),
    [d, templateBgUrl, bgImageUrl, templateBgUrls, aiBgUrls]
  );

  const selectedUrl = String((d as any).videoBackgroundImageUrl ?? "").trim();

  async function saveVideoBackground(url: string, label: string, kind?: VideoBgKind) {
    const safeUrl = String(url ?? "").trim();
    if (!safeUrl) {
      showMsg("動画用背景URLが空です");
      return;
    }

    const patch = {
      videoBackgroundImageUrl: safeUrl,
      videoBackgroundLabel: label,
      videoBackgroundKind: kind ?? "video",
      videoBackgroundKeyword: keyword,
      phase: "draft",
    } as any;

    setD((prev) => ({
      ...prev,
      ...patch,
    }));

    await onSaveDraft(patch);
    showMsg("動画用背景を選択しました。代表動画欄の合成ボタンで、この背景を使って更新できます");
  }

  async function generateAndSelectVideoBackground() {
    const k = String(keyword ?? "").trim();
    if (!k) {
      showMsg("動画用背景キーワードを入力してください");
      return;
    }

    if (typeof onGenerateVideoBackground !== "function") {
      showMsg("動画用背景生成が未接続です");
      return;
    }

    setLocalBusy(true);

    try {
      const url = await onGenerateVideoBackground(k);
      await saveVideoBackground(url, `動画用AI背景：${k}`, "ai");
      showMsg("動画用背景を生成して選択しました");
    } catch (e: any) {
      console.warn("[AOI FLOW handled]", e);
      showMsg(`動画用背景生成に失敗：${e?.message || "不明"}`);
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-cyan-400/20 bg-black/20 p-3">
      <div className="text-cyan-200 font-black" style={{ fontSize: 13 }}>
        動画専用 背景生成・選択
      </div>

      <div className="mt-2 text-white/70" style={{ fontSize: 12, lineHeight: 1.7 }}>
        商品撮影動画と合成する背景を選びます。ここは静止画の編集画面とは分けた、動画専用の背景選択です。
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-white outline-none"
          style={{ fontSize: 13 }}
          placeholder="例：商品が自然に映える明るい室内、白背景、木製テーブル"
        />

        <Btn
          variant="secondary"
          disabled={busy || localBusy || typeof onGenerateVideoBackground !== "function"}
          onClick={generateAndSelectVideoBackground}
        >
          動画用背景を生成
        </Btn>
      </div>

      {selectedUrl ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/20">
          <div className="border-b border-white/10 px-3 py-2 text-white/70" style={{ fontSize: 12 }}>
            現在の動画用背景
          </div>
          <img
            src={selectedUrl}
            alt="video background preview"
            className="h-48 w-full object-contain"
          />
        </div>
      ) : (
        <div
          className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-white/55"
          style={{ fontSize: 12 }}
        >
          現在の動画用背景：未選択
        </div>
      )}

      {candidates.length > 0 ? (
        <div className="mt-3 max-h-[340px] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-2">
            {candidates.map((item, index) => {
              const active = selectedUrl === item.url;

              return (
                <button
                  key={`${item.url}-${index}`}
                  type="button"
                  disabled={busy || localBusy}
                  onClick={() => {
                    void saveVideoBackground(item.url, item.label, item.kind);
                  }}
                  className={[
                    "rounded-xl border px-3 py-2 text-left transition",
                    active
                      ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100"
                      : "border-white/10 bg-black/20 text-white/72 hover:bg-white/5",
                    busy || localBusy ? "cursor-not-allowed opacity-50" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black" style={{ fontSize: 12 }}>
                      {item.label}
                    </span>
                    <span
                      className="rounded-full border border-white/10 px-2 py-1 text-white/55"
                      style={{ fontSize: 11 }}
                    >
                      {active ? "選択中" : item.kind}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-white/45" style={{ fontSize: 11 }}>
                    {item.url}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-white/55"
          style={{ fontSize: 12 }}
        >
          背景候補がありません。静止画タブで背景を作るか、ここで動画用背景を生成してください。
        </div>
      )}
    </div>
  );
}

export default function ProductVideoPanel({
  bgImageUrl,
  templateBgUrl,
  templateBgUrls,
  aiBgUrls,
  onGenerateVideoBackground,
  showMsg,
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
  const [videoCompositeBusy, setVideoCompositeBusy] = useState(false);

  const safeBrand: "vento" | "riva" =
    String((d as any).brand ?? d.brandId ?? "vento").trim() === "riva"
      ? "riva"
      : "vento";

  const safeKeywordsText = String((d as any).keywordsText ?? d.keywords ?? "");
  const sourceImage = useMemo(() => pickVideoSourceImage(d), [d]);
  const background = useMemo(
    () => pickCompositeBackground(d, templateBgUrl, bgImageUrl),
    [d, templateBgUrl, bgImageUrl]
  );
  const sourceVideo = useMemo(() => pickSourceProductVideo(d), [d]);

  const representativeVideoUrl = String(d.nonAiVideoUrl ?? "").trim() || sourceVideo.url;
  const representativeVideoLabel = String(d.nonAiVideoUrl ?? "").trim()
    ? "代表動画（商品確認用）"
    : "アップロード済み商品撮影動画（未合成）";

  const chromaPreviewVideoUrl = String((d as any).chromaPreviewVideoUrl ?? "").trim();
  const canBurn = !!String(d.nonAiVideoUrl ?? "").trim() && !busy;

  async function handleCompositeSelectedBackground() {
    if (!draftId) {
      showMsg("下書きIDがありません。先に保存してください");
      return;
    }

    if (!sourceVideo.url) {
      showMsg("商品撮影動画がありません");
      return;
    }

    if (!background.url) {
      showMsg("動画用背景が未選択です");
      return;
    }

    if (typeof extractProductVideoClip !== "function") {
      showMsg("動画背景合成が未接続です");
      return;
    }

    setVideoCompositeBusy(true);

    try {
      await extractProductVideoClip({
        draftId,
        sourceVideoUrl: sourceVideo.url,
        backgroundImageUrl: background.url,
        size: normalizeVideoSize(d.videoSize ?? "720x1280"),
      });
      showMsg("選択した動画用背景で代表動画を合成しました");
    } catch (e: any) {
      console.warn("[AOI FLOW handled]", e);
      showMsg(`動画背景合成に失敗：${e?.message || "不明"}`);
    } finally {
      setVideoCompositeBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-2xl border border-cyan-400/20 bg-black/20"
        style={{ padding: UI.cardPadding }}
      >
        <div className="text-cyan-200 font-black" style={{ fontSize: 13 }}>
          動画素材の確認
        </div>

        <div className="mt-2 text-white/75" style={{ fontSize: 12, lineHeight: 1.7 }}>
          商品撮影動画と動画専用背景を使って代表動画を作ります。
          <br />
          現在の背景：
          <span className="font-black text-white/95">
            {background.url ? `${background.label}` : "未選択"}
          </span>
        </div>

        <div className="mt-2 text-white/65" style={{ fontSize: 12, lineHeight: 1.7 }}>
          {displayStatus("商品動画", sourceVideo.url)}
          <br />
          背景画像：{background.url ? `選択済み（${background.label}）` : "未選択"}
        </div>

        {!sourceVideo.url ? (
          <div className="mt-2 text-white/55" style={{ fontSize: 12 }}>
            商品撮影動画が未登録です。
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/20">
            <div className="border-b border-white/10 px-3 py-2 text-white/70" style={{ fontSize: 12 }}>
              アップロード済み商品撮影動画
            </div>

            <video src={sourceVideo.url} controls className="w-full bg-black" style={{ maxHeight: 320 }} />
          </div>
        )}

        {sourceVideo.url && !background.url ? (
          <div className="mt-2 text-white/55" style={{ fontSize: 12 }}>
            背景画像が未選択です。代表動画欄の「動画専用 背景生成・選択」で選んでください。
          </div>
        ) : null}

        <div className="mt-3 text-white/75" style={{ fontSize: 12, lineHeight: 1.7 }}>
          従来方式：<span className="font-black text-white/95">{sourceImage.label}</span> から安全な確認動画を作るルートも残しています。
        </div>

        <div className="mt-2 text-white/65" style={{ fontSize: 12 }}>
          静止画：{sourceImage.url ? `選択済み（${sourceImage.label}）` : "未選択"}
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-black/20" style={{ padding: UI.cardPadding }}>
          <NonAiVideoActions
            onExtractProductVideoClip={async ({ sourceVideoUrl, backgroundImageUrl }) => {
              if (!draftId) {
                throw new Error("draftId がありません");
              }

              if (typeof extractProductVideoClip !== "function") {
                throw new Error("extractProductVideoClip が未接続です");
              }

              await extractProductVideoClip({
                draftId,
                sourceVideoUrl,
                backgroundImageUrl,
                size: normalizeVideoSize(d.videoSize ?? "720x1280"),
              });
            }}
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

              setD((prev: DraftDoc) => ({
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
      </div>

      <div className="rounded-2xl border border-green-400/20 bg-black/20" style={{ padding: UI.cardPadding }}>
        <div className="text-green-200 font-black" style={{ fontSize: 13 }}>
          クロマキー確認動画
        </div>

        <div className="mt-2 text-white/70" style={{ fontSize: 12, lineHeight: 1.7 }}>
          背景除去だけを確認する動画です。
        </div>

        {chromaPreviewVideoUrl ? (
          <video
            src={chromaPreviewVideoUrl}
            controls
            className="mt-3 w-full rounded-xl border border-white/10"
            style={{ maxHeight: 360 }}
          />
        ) : (
          <div className="mt-3 flex h-40 w-full items-center justify-center rounded-xl border border-white/10 text-white/55">
            まだクロマキー確認動画がありません
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20" style={{ padding: UI.cardPadding }}>
        <div className="text-white/85 font-black" style={{ fontSize: 13 }}>
          {representativeVideoLabel}
        </div>

        <div className="mt-2 text-white/60" style={{ fontSize: 12, lineHeight: 1.7 }}>
          現在の動画用背景：{background.url ? background.label : "未選択"}
        </div>

        {representativeVideoUrl ? (
          <video
            src={representativeVideoUrl}
            controls
            className="mt-3 w-full rounded-xl border border-white/10"
            style={{ maxHeight: 360 }}
          />
        ) : (
          <div className="mt-3 flex h-40 w-full items-center justify-center rounded-xl border border-white/10 text-white/55">
            まだ商品動画がありません
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Btn
            variant="primary"
            disabled={busy || nonAiBusy || videoCompositeBusy || !sourceVideo.url || !background.url}
            onClick={handleCompositeSelectedBackground}
          >
            クロマキー動画＋選択背景を合成
          </Btn>
        </div>

        <div className="mt-3 max-h-[620px] overflow-y-auto pr-1">
          <div className="flex flex-col gap-3">
            <VideoSizeSelector d={d} setD={setD} normalizeVideoSize={normalizeVideoSize} />

            <VideoBackgroundSelector
              d={d}
              busy={busy || nonAiBusy || videoCompositeBusy}
              templateBgUrl={templateBgUrl}
              bgImageUrl={bgImageUrl}
              templateBgUrls={templateBgUrls}
              aiBgUrls={aiBgUrls}
              setD={setD}
              onSaveDraft={onSaveDraft}
              onGenerateVideoBackground={onGenerateVideoBackground}
              showMsg={showMsg}
            />
          </div>
        </div>
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
          <Btn variant="ghost" disabled={!uid || busy} onClick={() => void onSaveDraft()}>
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
