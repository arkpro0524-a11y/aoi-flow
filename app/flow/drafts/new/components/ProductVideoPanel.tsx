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

type ImageCandidate = {
  label: string;
  url: string;
  source: string;
};

function normalizeUrl(input: unknown) {
  return String(input ?? "").trim();
}

function pushUnique(list: ImageCandidate[], seen: Set<string>, label: string, url: unknown, source = "draft") {
  const safeUrl = normalizeUrl(url);
  if (!safeUrl || seen.has(safeUrl)) return;
  seen.add(safeUrl);
  list.push({ label, url: safeUrl, source });
}

function pushArrayUrls(list: ImageCandidate[], seen: Set<string>, label: string, urls: unknown, source: string) {
  if (!Array.isArray(urls)) return;
  urls.forEach((url, index) => {
    pushUnique(list, seen, `${label} ${index + 1}`, url, source);
  });
}

function normalizeSelectedUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((x) => normalizeUrl(x)).filter(Boolean);
}

function pickVideoSourceImage(d: DraftDoc) {
  const candidates = [
    { label: "合成画像", url: normalizeUrl(d.compositeImageUrl) },
    { label: "文字入り完成画像", url: normalizeUrl((d as any).compositeTextImageUrl) },
    { label: "AI静止画", url: normalizeUrl(d.aiImageUrl) },
    { label: "切り抜き済み商品画像", url: normalizeUrl((d as any).foregroundImageUrl) },
    { label: "イメージ画像", url: normalizeUrl(d.imageIdeaUrl) },
    { label: "元画像", url: normalizeUrl(d.baseImageUrl) },
    { label: "互換画像", url: normalizeUrl((d as any).imageUrl) },
  ];
  return candidates.find((x) => x.url) ?? { label: "未選択", url: "" };
}

function pickBackground(d: DraftDoc, templateBgUrl?: string, bgImageUrl?: string) {
  const candidates = [
    { label: "テンプレ背景", url: normalizeUrl(templateBgUrl ?? d.templateBgUrl) },
    { label: "AI背景", url: normalizeUrl(bgImageUrl ?? d.bgImageUrl) },
    { label: "合成画像", url: normalizeUrl(d.compositeImageUrl) },
  ];
  return candidates.find((x) => x.url) ?? { label: "未選択", url: "" };
}

function buildBackgroundCandidates(
  d: DraftDoc,
  extra: {
    bgImageUrl?: string;
    templateBgUrl?: string;
    templateBgUrls?: string[];
    aiBgUrls?: string[];
    compositeTextImageUrl?: string;
  }
) {
  const out: ImageCandidate[] = [];
  const seen = new Set<string>();

  // 動画背景合成では「背景として使える画像」だけを小さく一覧表示します。
  // 商品画像リストとは分離し、ここで選んだ背景を background.url として合成処理へ渡します。
  pushUnique(out, seen, "テンプレ背景 現在", extra.templateBgUrl || d.templateBgUrl, "template-background");
  pushArrayUrls(out, seen, "テンプレ背景", extra.templateBgUrls || d.templateBgUrls, "template-background-history");
  pushUnique(out, seen, "AI背景 現在", extra.bgImageUrl || d.bgImageUrl, "ai-background");
  pushArrayUrls(out, seen, "AI背景", d.bgImageUrls, "ai-background-history");
  pushArrayUrls(out, seen, "生成背景素材", extra.aiBgUrls, "ai-background-assets");
  pushUnique(out, seen, "商品/背景合成画像", d.compositeImageUrl, "composite");
  pushArrayUrls(out, seen, "商品/背景合成履歴", (d as any).compositeImageUrls, "composite-history");
  pushUnique(out, seen, "文字入り完成画像", extra.compositeTextImageUrl || (d as any).compositeTextImageUrl, "text-composite");
  pushArrayUrls(out, seen, "文字入り完成画像履歴", (d as any).compositeTextImageUrls, "text-composite-history");

  return out;
}


function pickSourceProductVideo(d: DraftDoc) {
  const candidates = [
    { label: "商品撮影動画", url: normalizeUrl((d as any).sourceProductVideoUrl) },
    {
      label: "商品撮影動画履歴",
      url:
        Array.isArray((d as any).sourceProductVideoUrls) &&
        (d as any).sourceProductVideoUrls.length > 0
          ? normalizeUrl((d as any).sourceProductVideoUrls[0])
          : "",
    },
  ];
  return candidates.find((x) => x.url) ?? { label: "未選択", url: "" };
}

function buildImageCandidates(
  d: DraftDoc,
  extra: {
    foregroundImageUrl?: string;
    bgImageUrl?: string;
    aiImageUrl?: string;
    compositeTextImageUrl?: string;
    templateBgUrl?: string;
    templateBgUrls?: string[];
    aiBgUrls?: string[];
  }
) {
  const out: ImageCandidate[] = [];
  const seen = new Set<string>();

  // 動画素材は「下書きにアップロードされた商品写真」を最優先で表示する。
  // 生成画像や背景より先に出すことで、ユーザーが選びたい実写真へすぐ届くようにする。
  pushUnique(out, seen, "アップロード写真 メイン", d.images?.primary?.url, "uploaded-primary");
  if (Array.isArray(d.images?.materials)) {
    d.images!.materials.forEach((img, index) => {
      pushUnique(out, seen, `アップロード写真 ${index + 1}`, img?.url, "uploaded-materials");
    });
  }

  // ここは「アップロード画像から選択」なので、生成画像・背景画像は原則として出さない。
  // ただし過去データで d.images が空の下書きだけ、最低限の互換候補を後ろに出す。
  const hasUploadedImages = out.length > 0;
  if (hasUploadedImages) return out;

  // 互換用：古い下書きでアップロード写真配列が無い場合だけ表示する。
  pushUnique(out, seen, "元画像（旧下書き互換）", d.baseImageUrl, "legacy-upload");
  pushUnique(out, seen, "互換画像（旧下書き互換）", (d as any).imageUrl, "legacy-upload");

  return out;
}

function buildGeneratedImageCandidatesForVideo(
  d: DraftDoc,
  extra: {
    foregroundImageUrl?: string;
    bgImageUrl?: string;
    aiImageUrl?: string;
    compositeTextImageUrl?: string;
    templateBgUrl?: string;
    templateBgUrls?: string[];
    aiBgUrls?: string[];
  }
) {
  const out: ImageCandidate[] = [];
  const seen = new Set<string>();

  // 現在画面で生成・保存されている主要画像。
  pushUnique(out, seen, "合成画像", d.compositeImageUrl, "composite");
  pushArrayUrls(out, seen, "合成画像履歴", (d as any).compositeImageUrls, "composite-history");
  pushUnique(out, seen, "文字入り完成画像", extra.compositeTextImageUrl || (d as any).compositeTextImageUrl, "text-composite");
  pushArrayUrls(out, seen, "文字入り完成画像履歴", (d as any).compositeTextImageUrls, "text-composite-history");
  pushUnique(out, seen, "切り抜き済み商品画像", extra.foregroundImageUrl || (d as any).foregroundImageUrl, "foreground");
  pushUnique(out, seen, "AI静止画", extra.aiImageUrl || d.aiImageUrl, "ai-image");
  pushUnique(out, seen, "イメージ画像", d.imageIdeaUrl, "idea");
  pushArrayUrls(out, seen, "イメージ画像履歴", d.imageIdeaUrls, "idea-history");
  pushUnique(out, seen, "元画像", d.baseImageUrl, "base");
  pushUnique(out, seen, "互換画像", (d as any).imageUrl, "legacy");

  // 背景・用途別画像も動画素材として選べるようにする。
  pushUnique(out, seen, "AI背景", extra.bgImageUrl || d.bgImageUrl, "background");
  pushArrayUrls(out, seen, "AI背景履歴", d.bgImageUrls, "background-history");
  pushUnique(out, seen, "テンプレ背景", extra.templateBgUrl || d.templateBgUrl, "template-background");
  pushArrayUrls(out, seen, "テンプレ背景履歴", extra.templateBgUrls || d.templateBgUrls, "template-background-history");
  pushArrayUrls(out, seen, "背景素材", extra.aiBgUrls, "background-assets");
  pushUnique(out, seen, "利用シーン画像", d.useSceneImageUrl, "scene");
  pushArrayUrls(out, seen, "利用シーン画像履歴", d.useSceneImageUrls, "scene-history");
  pushUnique(out, seen, "詳細画像", d.detailImageUrl, "detail");
  pushArrayUrls(out, seen, "詳細画像履歴", d.detailImageUrls, "detail-history");
  pushUnique(out, seen, "ストーリー画像", d.storyImageUrl, "story");
  pushArrayUrls(out, seen, "ストーリー画像履歴", d.storyImageUrls, "story-history");
  pushUnique(out, seen, "サイズテンプレ画像", d.sizeTemplateImageUrl, "size-template");

  return out;
}

function GlowPill(props: {
  active: boolean;
  label: string;
  sub?: string;
  onClick: () => void;
  color?: "cyan" | "emerald" | "fuchsia";
}) {
  const { active, label, sub, onClick, color = "cyan" } = props;

  // スクショ上部ナビと同じ思想の「発光ピル」です。
  // Tailwind の不安定な任意透明度に頼らず、重要な見た目は inline style で固定します。
  const tone =
    color === "fuchsia"
      ? { rgb: "217,70,239", dot: "#f0abfc" }
      : color === "emerald"
        ? { rgb: "45,212,191", dot: "#99f6e4" }
        : { rgb: "34,211,238", dot: "#a5f3fc" };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="relative inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-left transition-all duration-200"
      style={{
        minHeight: 34,
        borderColor: active ? `rgba(${tone.rgb},0.78)` : "rgba(255,255,255,0.22)",
        background: active
          ? `linear-gradient(180deg, rgba(${tone.rgb},0.24), rgba(${tone.rgb},0.10))`
          : "linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.05))",
        color: active ? "#ffffff" : "rgba(255,255,255,0.72)",
        boxShadow: active
          ? `0 0 22px rgba(${tone.rgb},0.78), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 0 16px rgba(${tone.rgb},0.18)`
          : "inset 0 1px 0 rgba(255,255,255,0.14)",
        backdropFilter: "blur(10px)",
      }}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{
          background: active ? tone.dot : "rgba(255,255,255,0.38)",
          boxShadow: active ? `0 0 12px rgba(${tone.rgb},1)` : "none",
        }}
      />
      <span className="flex min-w-0 flex-col leading-none">
        <span className="whitespace-nowrap text-[12px] font-black tracking-wide">{label}</span>
        {sub ? <span className="mt-1 whitespace-nowrap text-[9px] font-bold opacity-70">{sub}</span> : null}
      </span>
      {active ? (
        <span
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: `0 0 18px rgba(${tone.rgb},0.72)` }}
        />
      ) : null}
    </button>
  );
}

function VideoSizeSelector(props: {
  d: DraftDoc;
  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;
  normalizeVideoSize: (s: any) => UiVideoSize;
}) {
  const { d, setD, normalizeVideoSize } = props;
  const options = [
    { label: "縦動画", sub: "IG / TikTok / 720x1280", size: "720x1280" as const },
    { label: "正方形", sub: "IG投稿 / 960x960", size: "960x960" as const },
    { label: "横動画", sub: "YouTube / 1280x720", size: "1280x720" as const },
  ];

  return (
    <div className="rounded-2xl border border-white/16 bg-black/18 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[12px] font-black text-white/85">動画形式</div>
        <div className="text-[10px] font-bold text-cyan-100/65">選択中のみ発光</div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {options.map((opt) => {
          const active = normalizeVideoSize(d.videoSize ?? "720x1280") === opt.size;
          return (
            <GlowPill
              key={opt.size}
              active={active}
              label={opt.label}
              sub={opt.sub}
              color="cyan"
              onClick={() => setD((prev: DraftDoc) => ({ ...prev, videoSize: opt.size }))}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function ProductVideoPanel({
  bgImageUrl,
  templateBgUrl,
  templateBgUrls,
  aiBgUrls,
  foregroundImageUrl,
  aiImageUrl,
  compositeTextImageUrl,
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
    String((d as any).brand ?? d.brandId ?? "vento").trim() === "riva" ? "riva" : "vento";
  const safeKeywordsText = String((d as any).keywordsText ?? d.keywords ?? "");

  const imageCandidates = useMemo(
    () => buildImageCandidates(d, { foregroundImageUrl, bgImageUrl, aiImageUrl, compositeTextImageUrl, templateBgUrl, templateBgUrls, aiBgUrls }),
    [d, foregroundImageUrl, bgImageUrl, aiImageUrl, compositeTextImageUrl, templateBgUrl, templateBgUrls, aiBgUrls]
  );
  const backgroundCandidates = useMemo(
    () => buildBackgroundCandidates(d, { bgImageUrl, templateBgUrl, templateBgUrls, aiBgUrls, compositeTextImageUrl }),
    [d, bgImageUrl, templateBgUrl, templateBgUrls, aiBgUrls, compositeTextImageUrl]
  );
  const selectedImage = useMemo(() => pickVideoSourceImage(d), [d]);
  const [selectedVideoBackgroundUrl, setSelectedVideoBackgroundUrl] = useState(
    normalizeUrl((d as any).nonAiVideoBackgroundImageUrl) || normalizeUrl((d as any).videoBackgroundImageUrl)
  );
  const background = useMemo(() => {
    const selectedUrl = normalizeUrl(
      selectedVideoBackgroundUrl || (d as any).nonAiVideoBackgroundImageUrl || (d as any).videoBackgroundImageUrl
    );
    const selectedCandidate = selectedUrl
      ? backgroundCandidates.find((item) => item.url === selectedUrl) || { label: "選択背景", url: selectedUrl }
      : null;
    return selectedCandidate || pickBackground(d, templateBgUrl, bgImageUrl);
  }, [backgroundCandidates, selectedVideoBackgroundUrl, d, templateBgUrl, bgImageUrl]);
  const sourceVideo = useMemo(() => pickSourceProductVideo(d), [d]);
  const canBurn = !!normalizeUrl(d.nonAiVideoUrl) && !busy;
  const selectedVideoImageUrls = normalizeSelectedUrls((d as any).nonAiVideoSourceImageUrls);

  async function saveSelectedImages(nextUrls: string[]) {
    const cleanUrls = nextUrls.filter(Boolean);
    const primaryUrl = cleanUrls[0] || "";
    const primary = imageCandidates.find((item) => item.url === primaryUrl);
    const labels = cleanUrls
      .map((url) => imageCandidates.find((item) => item.url === url)?.label || "選択画像")
      .filter(Boolean);

    const patch = {
      nonAiVideoSourceImageUrl: primaryUrl,
      nonAiVideoSourceImageLabel: primary?.label || labels[0] || "未選択",
      nonAiVideoSourceImageUrls: cleanUrls,
      nonAiVideoSourceImageLabels: labels,
      phase: "draft",
    } as any;

    setD((prev: DraftDoc) => ({ ...prev, ...patch }));
    await onSaveDraft(patch);
  }

  async function selectImage(candidate: ImageCandidate) {
    await saveSelectedImages([candidate.url]);
    showMsg("広告動画用の商品画像を選択しました");
  }

  async function selectBackground(candidate: ImageCandidate) {
    const patch = {
      // 動画背景合成専用の選択背景です。
      // 既存 hook 側は videoBackgroundImageUrl を読むため、互換名も同時に保存します。
      nonAiVideoBackgroundImageUrl: candidate.url,
      nonAiVideoBackgroundImageLabel: candidate.label,
      videoBackgroundImageUrl: candidate.url,
      videoBackgroundImageLabel: candidate.label,
      phase: "draft",
    } as any;

    setSelectedVideoBackgroundUrl(candidate.url);
    setD((prev: DraftDoc) => ({ ...prev, ...patch }));
    await onSaveDraft(patch);
    showMsg("動画背景合成用の背景を選択しました");
  }

  async function toggleImage(candidate: ImageCandidate) {
    const current = selectedVideoImageUrls.length
      ? selectedVideoImageUrls
      : normalizeUrl((d as any).nonAiVideoSourceImageUrl)
        ? [normalizeUrl((d as any).nonAiVideoSourceImageUrl)]
        : [];
    const exists = current.includes(candidate.url);
    const next = exists ? current.filter((url) => url !== candidate.url) : [...current, candidate.url];
    await saveSelectedImages(next);
    showMsg(next.length > 1 ? `${next.length}枚の画像を動画素材に選択しました` : "広告動画用の商品画像を選択しました");
  }

  const effectiveImage = selectedVideoImageUrls[0] || normalizeUrl((d as any).nonAiVideoSourceImageUrl) || selectedImage.url;
  const effectiveImageLabel = normalizeUrl((d as any).nonAiVideoSourceImageLabel) || selectedImage.label;
  const effectiveMaterials = (selectedVideoImageUrls.length > 1 ? selectedVideoImageUrls.slice(1) : []).filter((url) => url !== effectiveImage);

  // 既存機能を削らないため、確認用動画ブロックは復元します。
  // ただし画面を壊さないように、高さを抑えたコンパクト表示にします。
  const representativeVideoUrl = normalizeUrl(d.nonAiVideoUrl) || sourceVideo.url;
  const representativeVideoLabel = normalizeUrl(d.nonAiVideoUrl)
    ? "代表動画（商品確認用）"
    : "アップロード済み商品撮影動画（未合成）";
  const chromaPreviewVideoUrl = normalizeUrl((d as any).chromaPreviewVideoUrl);

  async function handleCompositeSelectedBackground() {
    // cutout方式は廃止。背景はNonAiVideoActions内のCanvas生成時に固定描画します。
    showMsg("背景は動画生成時に自動合成されます。背景を選んだ状態で「商品画像から広告動画を生成」を押してください。");
  }

  const defaultPreset = nonAiPreset ?? ({
    id: "showcase_auto",
    major: "商品広告動画",
    middle: "自動演出",
    minor: "ズーム・パン・フェード",
    tempo: "normal",
    reveal: "early",
    intensity: "balanced",
    attitude: "neutral",
    rhythm: "continuous",
  } as any);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-cyan-400/20 bg-black/20" style={{ padding: UI.cardPadding }}>
        <div className="text-cyan-200 font-black" style={{ fontSize: 13 }}>商品広告動画</div>
        <div className="mt-2 text-white/75" style={{ fontSize: 12, lineHeight: 1.7 }}>
          ここでは「商品画像から作る」と「商品撮影動画から作る」を明確に分けます。
          動画専用背景生成は廃止し、既存の素材/背景・商品/背景合成で作った画像を使います。
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-amber-100 font-black" style={{ fontSize: 13 }}>背景選択（動画生成時に固定合成）</div>
                <div className="mt-1 text-white/55" style={{ fontSize: 11 }}>
                  AI背景・テンプレ背景・合成背景から、商品動画生成時に固定する背景を選びます。
                </div>
              </div>
              <div className={[
                "rounded-full border px-3 py-1 text-[11px] font-black",
                background.url ? "border-emerald-200/40 bg-emerald-300/15 text-emerald-50" : "border-white/20 bg-white/[0.08] text-white/55",
              ].join(" ")}>
                {background.url ? "背景選択済み" : "背景未選択"}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-950/20 px-2 py-2" style={{ maxHeight: 66, overflow: "hidden" }}>
              {background.url ? (
                <img
                  src={background.url}
                  alt="selected background"
                  className="shrink-0 rounded-lg border border-amber-200/30 bg-black/30 object-cover"
                  style={{ width: 58, height: 44 }}
                />
              ) : (
                <div className="flex shrink-0 items-center justify-center rounded-lg border border-white/15 bg-black/30 text-[10px] text-white/45" style={{ width: 58, height: 44 }}>
                  未選択
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-black text-amber-50">
                  現在：{background.url ? background.label : "未選択"}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-white/50">
                  背景を選ぶと下の「動画背景合成」が有効になります。
                </div>
              </div>
            </div>

            <div className="mt-2 overflow-y-auto rounded-xl border border-white/15 bg-black/15" style={{ maxHeight: 132 }}>
              <div className="grid grid-cols-2 gap-2 p-2 md:grid-cols-3">
                {backgroundCandidates.length ? backgroundCandidates.map((item) => {
                  const active = background.url === item.url;
                  return (
                    <button
                      key={`${item.label}-${item.url}`}
                      type="button"
                      disabled={busy || nonAiBusy || videoCompositeBusy}
                      onClick={() => void selectBackground(item)}
                      className={[
                        "min-w-0 rounded-xl border p-1 text-left transition",
                        active
                          ? "border-amber-200 bg-amber-300/15 shadow-[0_0_14px_rgba(251,191,36,0.35)]"
                          : "border-white/12 bg-white/[0.05] hover:bg-white/[0.09]",
                      ].join(" ")}
                    >
                      <img
                        src={item.url}
                        alt={item.label}
                        className="h-14 w-full rounded-lg object-cover"
                        loading="lazy"
                      />
                      <div className="mt-1 truncate text-[10px] font-black text-white/80">{item.label}</div>
                      <div className="truncate text-[9px] text-white/40">{item.source}</div>
                    </button>
                  );
                }) : (
                  <div className="col-span-2 p-3 text-white/55 md:col-span-3" style={{ fontSize: 12 }}>
                    背景候補がありません。背景選択・生成タブでAI背景またはテンプレ背景を作成してください。
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3">
              <Btn
                variant="primary"
                disabled={busy || nonAiBusy || videoCompositeBusy || !sourceVideo.url && !normalizeUrl((d as any).sourceProductVideoUrl) && !normalizeUrl(d.nonAiVideoUrl) || !background.url}
                onClick={handleCompositeSelectedBackground}
              >
                {videoCompositeBusy ? "背景は生成時に合成" : "🎬 動画背景合成"}
              </Btn>
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-white/90 font-black" style={{ fontSize: 13 }}>アップロード画像から選択</div>
                <div className="mt-1 text-white/55" style={{ fontSize: 11 }}>
                  下書きにアップロードした商品写真だけを表示。生成画像・背景画像は混ぜません。
                </div>
              </div>
              {selectedVideoImageUrls.length ? (
                <button
                  type="button"
                  disabled={busy || nonAiBusy}
                  onClick={() => void saveSelectedImages([])}
                  className="rounded-full border border-white/20 bg-white/[0.08] px-3 py-1 text-[11px] font-black text-white/75 hover:bg-white/[0.12]"
                >
                  選択解除
                </button>
              ) : null}
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-950/20 px-2 py-2" style={{ maxHeight: 58, overflow: "hidden" }}>
              {effectiveImage ? (
                <img
                  src={effectiveImage}
                  alt="selected source"
                  className="shrink-0 rounded-lg border border-cyan-200/30 bg-black/30 object-cover" style={{ width: 44, height: 44 }}
                />
              ) : (
                <div className="flex shrink-0 items-center justify-center rounded-lg border border-white/15 bg-black/30 text-[10px] text-white/45" style={{ width: 44, height: 44 }}>
                  未選択
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-black text-cyan-50">
                  現在：{effectiveImage ? effectiveImageLabel : "未選択"}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-white/50">
                  行をクリックすると追加/解除。複数枚を選ぶと順番に動画へ使います。
                </div>
              </div>
              {selectedVideoImageUrls.length ? (
                <div className="shrink-0 rounded-full border border-cyan-200/40 bg-cyan-200/15 px-2 py-1 text-[10px] font-black text-cyan-50">
                  {selectedVideoImageUrls.length}枚
                </div>
              ) : null}
            </div>

            <div className="mt-2 overflow-y-auto rounded-xl border border-white/15 bg-black/15" style={{ maxHeight: 156 }}>
              <div className="divide-y divide-white/10">
                {imageCandidates.length ? imageCandidates.map((item) => {
                  const active = selectedVideoImageUrls.length ? selectedVideoImageUrls.includes(item.url) : effectiveImage === item.url;
                  const order = selectedVideoImageUrls.indexOf(item.url);
                  const displayOrder = order >= 0 ? order + 1 : "✓";
                  return (
                    <div
                      key={`${item.label}-${item.url}`}
                      className={[
                        "flex items-center gap-2 px-2 py-1 transition",
                        active
                          ? "bg-cyan-300/12 text-cyan-50 shadow-[inset_3px_0_0_rgba(103,232,249,0.9)]"
                          : "bg-transparent text-white/70 hover:bg-white/[0.08]",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        disabled={busy || nonAiBusy}
                        onClick={() => void toggleImage(item)}
                        className={[
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-black transition",
                          active
                            ? "border-cyan-100 bg-cyan-100 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.8)]"
                            : "border-white/25 bg-white/5 text-white/45 hover:bg-white/10",
                        ].join(" ")}
                        aria-label={active ? "動画素材から外す" : "動画素材に追加"}
                      >
                        {active ? displayOrder : ""}
                      </button>
                      <button
                        type="button"
                        disabled={busy || nonAiBusy}
                        onClick={() => void toggleImage(item)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <img
                          src={item.url}
                          alt={item.label}
                          className="shrink-0 rounded-md border border-white/15 bg-black/30 object-cover" style={{ width: 46, height: 46 }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-black leading-tight">{item.label}</div>
                          <div className="mt-1 truncate text-[10px] text-white/42">{item.source}</div>
                        </div>
                      </button>
                    </div>
                  );
                }) : (
                  <div className="p-3 text-white/55" style={{ fontSize: 12 }}>
                    アップロード済みの商品写真がありません。左側の素材/商品画像アップロードから写真を追加してください。
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
        <div className="mt-3">
          <VideoSizeSelector d={d} setD={setD} normalizeVideoSize={normalizeVideoSize} />
        </div>

        <NonAiVideoActions
          busy={busy || nonAiBusy || videoCompositeBusy}
          reason={nonAiReason}
          setReason={setNonAiReason}
          uid={uid}
          draftId={draftId}
          brand={safeBrand}
          vision={String(d.vision ?? "")}
          keywords={splitKeywords(safeKeywordsText)}
          preset={defaultPreset}
          sourceImageUrl={effectiveImage || undefined}
          sourceImageUrls={selectedVideoImageUrls}
          sourceLabel={effectiveImageLabel}
          materialImageUrls={effectiveMaterials}
          baseImageUrl={d.baseImageUrl ?? undefined}
          backgroundImageUrl={background.url || undefined}
          backgroundLabel={background.label}
          sourceVideoUrl={sourceVideo.url || undefined}
          sourceVideoLabel={sourceVideo.label}
          seconds={(d.videoSeconds ?? 5) === 10 ? 10 : 5}
          quality={(d.videoQuality ?? "standard") === "high" ? "high" : "standard"}
          size={normalizeVideoSize(d.videoSize ?? "720x1280")}
          onSave={async (url: string) => {
            await onSaveNonAiVideoToDraft({ url, preset: defaultPreset });
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
                ...(((prev as any).sourceProductVideoUrls || []) as string[]).filter((x) => x !== url),
              ].slice(0, 10),
            } as any));
          }}
        />
      </div>

      <div className="rounded-2xl border border-green-400/20 bg-black/20" style={{ padding: UI.cardPadding }}>
        <div className="text-green-200 font-black" style={{ fontSize: 13 }}>クロマキー確認動画</div>
        <div className="mt-2 text-white/65" style={{ fontSize: 12, lineHeight: 1.6 }}>
          背景除去だけを確認する既存機能です。通常の広告動画生成とは分けて残しています。
        </div>
        {chromaPreviewVideoUrl ? (
          <video
            src={chromaPreviewVideoUrl}
            controls
            className="mt-3 w-full rounded-xl border border-white/10 bg-black"
            style={{ maxHeight: 220 }}
          />
        ) : (
          <div className="mt-3 flex h-24 w-full items-center justify-center rounded-xl border border-white/10 bg-black/15 text-white/50" style={{ fontSize: 12 }}>
            まだクロマキー確認動画がありません
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20" style={{ padding: UI.cardPadding }}>
        <div className="text-white/85 font-black" style={{ fontSize: 13 }}>{representativeVideoLabel}</div>
        <div className="mt-2 text-white/60" style={{ fontSize: 12, lineHeight: 1.6 }}>
          上部プレビューを主確認にし、この欄は既存の代表動画確認として小さく残します。
        </div>
        {representativeVideoUrl ? (
          <video
            src={representativeVideoUrl}
            controls
            className="mt-3 w-full rounded-xl border border-white/10 bg-black"
            style={{ maxHeight: 220 }}
          />
        ) : (
          <div className="mt-3 flex h-24 w-full items-center justify-center rounded-xl border border-white/10 bg-black/15 text-white/50" style={{ fontSize: 12 }}>
            まだ商品動画がありません
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-orange-400/30 bg-black/20" style={{ padding: UI.cardPadding }}>
        <div className="text-orange-300 font-black" style={{ fontSize: 13 }}>文字焼き込み</div>
        <div className="mt-2 text-white/70" style={{ fontSize: 12, lineHeight: 1.6 }}>
          完成した広告動画に必要最小限の文字を焼き込みます。
        </div>
        <div className="mt-3">
          <Btn variant="primary" disabled={!canBurn} onClick={onBurnVideo}>🔥 文字を焼き込む</Btn>
        </div>
        {!d.nonAiVideoUrl ? <div className="mt-2 text-white/55" style={{ fontSize: 12 }}>先に広告動画を生成してください。</div> : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20" style={{ padding: UI.cardPadding }}>
        <div className="text-white/85 font-black" style={{ fontSize: 13 }}>保存</div>
        <div className="mt-2 text-white/60" style={{ fontSize: 12, lineHeight: 1.6 }}>
          下書きの状態管理は下書き一覧の「作成中 / 投稿中 / 投稿済み」ボタンで行います。
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn variant="ghost" disabled={!uid || busy} onClick={() => void onSaveDraft()}>保存する</Btn>
        </div>
      </div>
    </div>
  );
}
