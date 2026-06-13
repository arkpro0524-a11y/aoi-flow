//app/flow/drafts/new/components/BackgroundPanel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  DraftDoc,
  ProductPhotoMode,
  TextOverlay,
  SizeTemplateType,
} from "@/lib/types/draft";
import { ref, uploadBytes, getDownloadURL, listAll } from "firebase/storage";
import { storage } from "@/firebase";
import { Btn } from "../ui";
import ProductPlacementEditor from "./ProductPlacementEditor";

type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";
type BgScene = "studio" | "lifestyle" | "scale" | "detail";

type InnerTab = "background" | "composite";
type CompositePreviewMode = "edit" | "final";
type ImageUsePreset = "ec" | "sns" | "usage";

type TemplateRecommendItem = {
  url: string;
  reason: string;
  score?: number;
};

type TemplateRecommendResult = {
  topReason?: string;
  recommended?: Array<{
    url?: string;
    imageUrl?: string;
    reason?: string;
    score?: number;
  }>;
  picked?: {
    reason?: string;
  } | null;
};

type UserLibraryBackground = {
  url: string;
  name: string;
  source: "template" | "bg-stock" | "uploaded";
};

type Props = {
  /**
   * 上位レイアウトから「背景」タブ/「商品/背景合成」タブを直接開きたい場合に使います。
   * 商品画像作成の親タブ側で分離するため、singleMode=true の時は内部タブボタンを隠します。
   */
  initialInnerTab?: InnerTab;
  singleMode?: boolean;

  serverPlacementMeta?: {
    canvas?: number;
    placementInput?: {
      scale?: number;
      x?: number;
      y?: number;
      shadow?: {
        opacity?: number;
        blur?: number;
        scale?: number;
        offsetX?: number;
        offsetY?: number;
      };
      background?: {
        scale?: number;
        x?: number;
        y?: number;
      };
    } | null;
    placement?: {
      left?: number;
      top?: number;
      width?: number;
      height?: number;
      centerX?: number;
      centerY?: number;
      contactY?: number;
      bottomMarginBase?: number;
      usedDefaultLeft?: boolean;
      usedDefaultTop?: boolean;
    } | null;
    updatedAt?: number;
  } | null;

  bgDisplayUrl: string;
  backgroundKeyword: string;
  setBackgroundKeyword: React.Dispatch<React.SetStateAction<string>>;
  uid: string | null;
  busy: boolean;
  d: DraftDoc;
  textOverlay?: TextOverlay | null;
  compositeTextImageUrl?: string;
  onSaveCompositeTextImageFromCompositeSlot?: () => Promise<void> | void;

  generateBackgroundImage: (keyword: string, referenceImageUrl?: string) => Promise<string>;
  replaceBackgroundAndSaveToAiImage: () => Promise<void>;
  syncBgImagesFromStorage: () => Promise<void>;
  syncTemplateBgImagesFromStorage?: () => Promise<void> | void;
  syncCompositeImagesFromStorage?: () => Promise<void> | void;
  syncCompositeTextImagesFromStorage?: () => Promise<void> | void;
  clearBgHistory: () => Promise<void>;
  onRemoveTemplateBgImage?: (url: string) => Promise<void> | void;
  onRemoveAiBgImage?: (url: string) => Promise<void> | void;
  onRemoveCompositeImage?: (url?: string) => Promise<void> | void;
  onRemoveCompositeTextImage?: (url: string) => Promise<void> | void;

  templateBgUrl?: string;
  templateBgUrls?: string[];
  generateTemplateBackground?: () => Promise<string | void>;
  fetchTemplateRecommendations?: () => Promise<TemplateRecommendResult | void>;
  selectTemplateBackground?: (url: string) => Promise<void> | void;

  setBgImageUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;
  saveDraft: (partial?: Partial<DraftDoc>) => Promise<string | null>;

  formStyle: React.CSSProperties;
  showMsg: (msg: string) => void;

  productCategory?: ProductCategory;
  setProductCategory?: React.Dispatch<React.SetStateAction<ProductCategory>>;

  productSize?: ProductSize;
  setProductSize?: React.Dispatch<React.SetStateAction<ProductSize>>;

  groundingType?: GroundingType;
  setGroundingType?: React.Dispatch<React.SetStateAction<GroundingType>>;

  sellDirection?: SellDirection;
  setSellDirection?: React.Dispatch<React.SetStateAction<SellDirection>>;

  bgScene?: BgScene;
  setBgScene?: React.Dispatch<React.SetStateAction<BgScene>>;

  aiImageUrl?: string;
  isCompositeFresh?: boolean;

  activePhotoMode: ProductPhotoMode;
  setActivePhotoMode: React.Dispatch<React.SetStateAction<ProductPhotoMode>>;

  /**
   * サイズテンプレ種別
   * - simple
   * - measure
   * - human
   * など
   */
  sizeTemplateType: SizeTemplateType;

  /**
   * サイズテンプレ変更
   */
  setSizeTemplateType: React.Dispatch<
    React.SetStateAction<SizeTemplateType>
  >;

  placementScale: number;
  setPlacementScale: React.Dispatch<React.SetStateAction<number>>;

  placementX: number;
  setPlacementX: React.Dispatch<React.SetStateAction<number>>;

  placementY: number;
  setPlacementY: React.Dispatch<React.SetStateAction<number>>;

  shadowOpacity: number;
  setShadowOpacity: React.Dispatch<React.SetStateAction<number>>;

  shadowBlur: number;
  setShadowBlur: React.Dispatch<React.SetStateAction<number>>;

  shadowScale: number;
  setShadowScale: React.Dispatch<React.SetStateAction<number>>;

  shadowOffsetX: number;
  setShadowOffsetX: React.Dispatch<React.SetStateAction<number>>;

  shadowOffsetY: number;
  setShadowOffsetY: React.Dispatch<React.SetStateAction<number>>;

  backgroundScale: number;
  setBackgroundScale: React.Dispatch<React.SetStateAction<number>>;

  backgroundX: number;
  setBackgroundX: React.Dispatch<React.SetStateAction<number>>;

  backgroundY: number;
  setBackgroundY: React.Dispatch<React.SetStateAction<number>>;

  editingStep: "background" | "product" | "shadow";
  setEditingStep: React.Dispatch<
    React.SetStateAction<"background" | "product" | "shadow">
  >;

  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => Promise<void> | void;
  onRedo: () => Promise<void> | void;

  /**
   * 上部の共通 EDIT PREVIEW にプレビューを集約した時、
   * 背景生成/合成タブ内の重複プレビューを隠します。
   */
  hideLowerPreview?: boolean;
  compositePreviewMode?: CompositePreviewMode;
  setCompositePreviewMode?: React.Dispatch<React.SetStateAction<CompositePreviewMode>>;

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
  ) => Promise<void> | void;
};

const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  furniture: "家具",
  goods: "雑貨",
  apparel: "アパレル",
  small: "小型商品",
  other: "その他",
};

const PRODUCT_SIZE_LABEL: Record<ProductSize, string> = {
  large: "大",
  medium: "中",
  small: "小",
};

const GROUNDING_TYPE_LABEL: Record<GroundingType, string> = {
  floor: "床置き",
  table: "卓上",
  hanging: "吊り下げ",
  wall: "壁寄せ",
};

const SELL_DIRECTION_LABEL: Record<SellDirection, string> = {
  sales: "売上重視",
  branding: "世界観重視",
  trust: "信頼重視",
  story: "ストーリー重視",
};

const BG_SCENE_LABEL: Record<BgScene, string> = {
  studio: "スタジオ",
  lifestyle: "ライフスタイル",
  scale: "スケール訴求",
  detail: "ディテール訴求",
};

const PRESET_LABEL: Record<ImageUsePreset, string> = {
  ec: "EC販売用",
  sns: "広告・SNS用",
  usage: "使用イメージ用",
};

function TopTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-xl border px-3 py-2 text-xs transition",
        active
          ? "border-white/60 bg-white/10 text-white"
          : "border-white/10 bg-black/20 text-white/65 hover:bg-white/5",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function SegButton({
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
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function SmallBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <div
      className={[
        "inline-flex items-center rounded-full border px-2 py-1",
        active
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
          : "border-white/10 bg-black/20 text-white/55",
      ].join(" ")}
      style={{ fontSize: 11 }}
    >
      {label}
    </div>
  );
}

function PresetButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-xl border px-4 py-2 text-sm font-semibold transition",
        active
          ? "border-white/60 bg-white/10 text-white"
          : "border-white/10 bg-black/20 text-white/70 hover:bg-white/5",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function buildReferenceText(d: DraftDoc, backgroundKeyword: string): string {
  const vision = String((d as any).selectedStaticPrompt ?? d.vision ?? "").trim();
  const keywordsText = String((d as any).keywordsText ?? d.keywords ?? "").trim();
  const extra = String(backgroundKeyword || "").trim();

  return [vision, keywordsText, extra].filter(Boolean).join("\n").toLowerCase();
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

function inferProductCategory(input: {
  text: string;
  current: ProductCategory;
}): ProductCategory {
  const { text, current } = input;

  if (current !== "other") return current;

  if (
    includesAny(text, [
      "chair",
      "table",
      "desk",
      "sofa",
      "shelf",
      "cabinet",
      "stool",
      "家具",
      "椅子",
      "机",
      "テーブル",
      "棚",
      "チェスト",
      "ソファ",
      "ラック",
    ])
  ) {
    return "furniture";
  }

  if (
    includesAny(text, [
      "shirt",
      "jacket",
      "coat",
      "pants",
      "bag",
      "shoes",
      "apparel",
      "fashion",
      "服",
      "シャツ",
      "ジャケット",
      "コート",
      "パンツ",
      "バッグ",
      "靴",
      "アパレル",
    ])
  ) {
    return "apparel";
  }

  if (
    includesAny(text, [
      "watch",
      "vase",
      "cup",
      "plate",
      "wallet",
      "accessory",
      "時計",
      "花瓶",
      "マグ",
      "カップ",
      "皿",
      "財布",
      "アクセサリー",
      "雑貨",
    ])
  ) {
    return "goods";
  }

  if (
    includesAny(text, [
      "small",
      "mini",
      "tiny",
      "compact",
      "小型",
      "ミニ",
      "コンパクト",
      "小物",
    ])
  ) {
    return "small";
  }

  return "other";
}

function inferGroundingFromCategory(
  category: ProductCategory,
  current: GroundingType
): GroundingType {
  if (category === "furniture") return "floor";
  if (category === "goods") return "table";
  if (category === "small") return "table";
  if (category === "apparel") return "hanging";
  return current;
}

function inferSizeFromCategory(
  category: ProductCategory,
  current: ProductSize
): ProductSize {
  if (category === "furniture") return "large";
  if (category === "small") return "small";
  if (category === "goods") return "medium";
  if (category === "apparel") return "medium";
  return current;
}

function inferBgSceneFromPreset(input: {
  preset: ImageUsePreset;
  text: string;
}): BgScene {
  const { preset, text } = input;

  if (preset === "ec") {
    if (
      includesAny(text, [
        "size",
        "scale",
        "比較",
        "サイズ",
        "大きさ",
        "寸法",
        "設置感",
      ])
    ) {
      return "scale";
    }

    return "studio";
  }

  if (preset === "sns") {
    if (
      includesAny(text, [
        "texture",
        "detail",
        "質感",
        "素材感",
        "ディテール",
        "手仕事",
        "craft",
      ])
    ) {
      return "detail";
    }

    return "lifestyle";
  }

  if (
    includesAny(text, [
      "room",
      "living",
      "interior",
      "玄関",
      "リビング",
      "部屋",
      "室内",
      "暮らし",
      "使用シーン",
    ])
  ) {
    return "lifestyle";
  }

  return "scale";
}

function inferSellDirectionFromPreset(input: {
  preset: ImageUsePreset;
  text: string;
}): SellDirection {
  const { preset, text } = input;

  if (preset === "ec") return "sales";
  if (preset === "sns") return "branding";

  if (
    includesAny(text, [
      "story",
      "物語",
      "ストーリー",
      "history",
      "背景",
      "想い",
    ])
  ) {
    return "story";
  }

  return "trust";
}

function inferPhotoModeFromPreset(preset: ImageUsePreset): ProductPhotoMode {
  if (preset === "ec") return "template";
  return "ai_bg";
}

export default function BackgroundPanel({
  initialInnerTab = "background",
  singleMode = false,
  serverPlacementMeta,
  bgDisplayUrl,
  backgroundKeyword,
  setBackgroundKeyword,
  uid,
  busy,
  d,
  textOverlay = null,
  compositeTextImageUrl = "",
  onSaveCompositeTextImageFromCompositeSlot,

  generateBackgroundImage,
  replaceBackgroundAndSaveToAiImage,
  syncBgImagesFromStorage,
  syncTemplateBgImagesFromStorage,
  syncCompositeImagesFromStorage,
  syncCompositeTextImagesFromStorage,
  clearBgHistory,
  onRemoveTemplateBgImage,
  onRemoveAiBgImage,
  onRemoveCompositeImage,
  onRemoveCompositeTextImage,

  templateBgUrl = "",
  templateBgUrls: templateBgUrlsFromParent = [],
  generateTemplateBackground,
  fetchTemplateRecommendations,
  selectTemplateBackground,

  setBgImageUrl,
  setD,
  saveDraft,

  formStyle,
  showMsg,

  productCategory = "other",
  setProductCategory,
  productSize = "medium",
  setProductSize,
  groundingType = "floor",
  setGroundingType,
  sellDirection = "sales",
  setSellDirection,
  bgScene = "studio",
  setBgScene,

  aiImageUrl = "",
  isCompositeFresh = false,

  activePhotoMode,
  setActivePhotoMode,

  /**
   * サイズテンプレ
   */
  sizeTemplateType,
  setSizeTemplateType,

  placementScale,
  setPlacementScale,
  placementX,
  setPlacementX,
  placementY,
  setPlacementY,
  shadowOpacity,
  setShadowOpacity,
  shadowBlur,
  setShadowBlur,
  shadowScale,
  setShadowScale,
  shadowOffsetX,
  setShadowOffsetX,
  shadowOffsetY,
  setShadowOffsetY,

  backgroundScale,
  setBackgroundScale,
  backgroundX,
  setBackgroundX,
  backgroundY,
  setBackgroundY,

  editingStep,
  setEditingStep,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSavePlacement,
  hideLowerPreview = false,
  compositePreviewMode = "edit",
  setCompositePreviewMode,
}: Props) {
  const [innerTab, setInnerTab] = useState<InnerTab>(initialInnerTab);

  useEffect(() => {
    setInnerTab(initialInnerTab);
  }, [initialInnerTab]);

  const [templateRecommendBusy, setTemplateRecommendBusy] = useState(false);
  const [templateRecommendTopReason, setTemplateRecommendTopReason] = useState("");
  const [templateRecommended, setTemplateRecommended] = useState<TemplateRecommendItem[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [aiBgReferenceUrl, setAiBgReferenceUrl] = useState("");
  const [aiBgReferenceBusy, setAiBgReferenceBusy] = useState(false);

  const [libraryBackgrounds, setLibraryBackgrounds] = useState<UserLibraryBackground[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);

  async function loadUserBackgroundLibrary() {
    if (!uid) return;

    setLibraryBusy(true);

    try {
      const targets: Array<{ source: UserLibraryBackground["source"]; path: string }> = [
        // テンプレ背景の共通ライブラリ。
        // ここを読み込まないと、画像ライブラリに保存したテンプレ背景を
        // 商品/背景合成側から選べません。
        { source: "template" as const, path: `users/${uid}/asset-library/template-backgrounds` },
        { source: "bg-stock" as const, path: `users/${uid}/bg-stock` },
        { source: "uploaded" as const, path: `users/${uid}/asset-library/uploaded` },
      ];

      // 既存下書きのテンプレ背景も救済して表示します。
      // 以前の実装ではテンプレ背景が下書き配下だけに保存されるため、
      // 共通ライブラリが空だと「テンプレ背景がない」ように見えていました。
      const draftRoot = await listAll(ref(storage, `users/${uid}/drafts`)).catch(() => ({
        prefixes: [] as any[],
      }));

      for (const draftPrefix of draftRoot.prefixes || []) {
        if (!draftPrefix?.fullPath) continue;
        targets.push({
          source: "template" as const,
          path: `${draftPrefix.fullPath}/template-bg`,
        });
      }

      const next: UserLibraryBackground[] = [];

      for (const target of targets) {
        const listed = await listAll(ref(storage, target.path)).catch(() => ({ items: [] as any[] }));

        for (const item of listed.items) {
          const url = await getDownloadURL(item).catch(() => "");
          if (!url) continue;

          next.push({
            url,
            name: item.name,
            source: target.source,
          });
        }
      }

      const seen = new Set<string>();
      setLibraryBackgrounds(
        next.filter((asset) => {
          if (seen.has(asset.url)) return false;
          seen.add(asset.url);
          return true;
        })
      );
    } catch (e: any) {
      console.warn("[AOI FLOW handled]", e);
      showMsg(`画像ライブラリの取得に失敗：${e?.message || "不明"}`);
    } finally {
      setLibraryBusy(false);
    }
  }

  useEffect(() => {
    if (!uid) {
      setLibraryBackgrounds([]);
      return;
    }

    void loadUserBackgroundLibrary();
  }, [uid]);

  async function uploadAiBackgroundReference(file: File | null) {
    if (!file || !uid) return;
    setAiBgReferenceBusy(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const path = `users/${uid}/bg-reference/${Date.now()}_${safeName}`;
      const sref = ref(storage, path);
      await uploadBytes(sref, file, { contentType: file.type || "image/png" });
      const url = await getDownloadURL(sref);
      setAiBgReferenceUrl(url);
      showMsg("参考画像を読み込みました");
    } catch (e: any) {
      console.warn("[AOI FLOW handled]", e);
      showMsg(`参考画像の読み込みに失敗：${e?.message || "不明"}`);
    } finally {
      setAiBgReferenceBusy(false);
    }
  }

  /**
   * AI背景履歴の自動復旧
   *
   * 目的:
   * - Firestore の bgImageUrls が古い/少ない状態でも、画面を開いた時点で
   *   Storage 側の背景履歴を自動で読み直す
   * - これまで必要だった「背景を同期」ボタンの手押しを減らす
   *
   * 注意:
   * - 1下書きにつき1回だけ実行する
   * - Storage の実ファイルは消さない
   */
  const autoSyncBgKeyRef = useRef("");

  const templatePreviewBackgroundUrl = useMemo(() => {
    return String(templateBgUrl || d.templateBgUrl || "").trim();
  }, [templateBgUrl, d.templateBgUrl]);

  const aiOnlyPreviewBackgroundUrl = useMemo(() => {
    return String(d.bgImageUrl || bgDisplayUrl || "").trim();
  }, [d.bgImageUrl, bgDisplayUrl]);

  const fixedBackgroundPreviewUrl = useMemo(() => {
    if (activePhotoMode === "template") {
      return templatePreviewBackgroundUrl || aiOnlyPreviewBackgroundUrl;
    }

    return aiOnlyPreviewBackgroundUrl || templatePreviewBackgroundUrl;
  }, [activePhotoMode, aiOnlyPreviewBackgroundUrl, templatePreviewBackgroundUrl]);

  const templateBgUrls = useMemo(() => {
    const raw =
      Array.isArray(templateBgUrlsFromParent) && templateBgUrlsFromParent.length > 0
        ? templateBgUrlsFromParent
        : Array.isArray(d.templateBgUrls)
          ? d.templateBgUrls
          : [];

    return Array.from(new Set(raw.map((u) => String(u || "").trim()).filter(Boolean)));
  }, [templateBgUrlsFromParent, d.templateBgUrls]);

  const aiBgUrls = useMemo(() => {
    const raw = Array.isArray(d.bgImageUrls) ? d.bgImageUrls : [];
    return Array.from(new Set(raw.map((u) => String(u || "").trim()).filter(Boolean)));
  }, [d.bgImageUrls]);

  useEffect(() => {
    if (!uid) return;
    if (busy) return;
    if (typeof syncBgImagesFromStorage !== "function") return;

    // 新規作成画面を開いただけでは下書きを作らない。
    // 以前は d.userId や "new-draft" をキーにして背景履歴同期を走らせていたため、
    // syncBgImagesFromStorage() -> saveDraft() の流れで空下書きが作成されていた。
    // 自動同期は、URLに既存の draft id がある編集画面だけで許可する。
    const search = typeof window !== "undefined" ? window.location.search : "";
    const urlDraftId = new URLSearchParams(search).get("id")?.trim() ?? "";
    if (!urlDraftId) return;

    const key = urlDraftId;
    if (autoSyncBgKeyRef.current === key) return;

    autoSyncBgKeyRef.current = key;
    void syncBgImagesFromStorage();
  }, [uid, busy, syncBgImagesFromStorage]);

  const compositeTextOverlay = useMemo<TextOverlay | null>(() => {
    if (textOverlay) return textOverlay;

    const overlay = d.textOverlayBySlot?.composite;
    return overlay ?? null;
  }, [textOverlay, d.textOverlayBySlot]);

  const selectedPreset = useMemo<ImageUsePreset | null>(() => {
    if (sellDirection === "sales" && activePhotoMode === "template") return "ec";
    if (sellDirection === "branding") return "sns";
    if (sellDirection === "trust" || sellDirection === "story") return "usage";

    return null;
  }, [sellDirection, activePhotoMode]);

  function applyPreset(preset: ImageUsePreset) {
    const referenceText = buildReferenceText(d, backgroundKeyword);

    const nextCategory = inferProductCategory({
      text: referenceText,
      current: productCategory,
    });

    const nextGrounding = inferGroundingFromCategory(nextCategory, groundingType);
    const nextSize = inferSizeFromCategory(nextCategory, productSize);

    const nextSellDirection = inferSellDirectionFromPreset({
      preset,
      text: referenceText,
    });

    const nextBgScene = inferBgSceneFromPreset({
      preset,
      text: referenceText,
    });

    const nextPhotoMode = inferPhotoModeFromPreset(preset);

    setProductCategory?.(nextCategory);
    setGroundingType?.(nextGrounding);
    setProductSize?.(nextSize);
    setSellDirection?.(nextSellDirection);
    setBgScene?.(nextBgScene);
    setActivePhotoMode(nextPhotoMode);

    showMsg(`${PRESET_LABEL[preset]}に自動設定しました`);
  }

  async function handleSelectTemplateBackground(url: string) {
    const picked = String(url || "").trim();
    if (!picked) return;

    try {
      if (typeof selectTemplateBackground === "function") {
        await selectTemplateBackground(picked);
        setActivePhotoMode("template");
      } else {
        setD((prev) => ({
          ...prev,
          templateBgUrl: picked,
          activePhotoMode: "template",
        }));

await saveDraft({
  templateBgUrl: picked,
  activePhotoMode: "template",

  // 動画合成でも同じ背景を使うため、動画用背景として明示保存します
  videoBackgroundImageUrl: picked,
  videoBackgroundLabel: "テンプレ背景",
} as any);
      }

      setActivePhotoMode("template");
      showMsg("テンプレ背景を選択しました");
    } catch (e: any) {
      console.warn("[AOI FLOW handled]", e);
      showMsg(`テンプレ背景の選択に失敗：${e?.message || "不明"}`);
    }
  }

  async function handleFetchTemplateRecommendations() {
    if (!uid || busy || templateBgUrls.length === 0) return;

    if (typeof fetchTemplateRecommendations !== "function") {
      showMsg("テンプレ背景おすすめ取得がまだ配線されていません");
      return;
    }

    try {
      setTemplateRecommendBusy(true);

      const result = await fetchTemplateRecommendations();

      const topReason = String(result?.topReason || result?.picked?.reason || "").trim();

      const recommended = Array.isArray(result?.recommended)
        ? result.recommended
            .map((item) => {
              const url = String(item?.url || item?.imageUrl || "").trim();
              const reason = String(item?.reason || "").trim();
              const score =
                typeof item?.score === "number" && Number.isFinite(item.score)
                  ? item.score
                  : undefined;

              return {
                url,
                reason,
                score,
              };
            })
            .filter((item) => item.url)
        : [];

      setTemplateRecommendTopReason(topReason);
      setTemplateRecommended(recommended);

      if (recommended.length > 0) {
        showMsg("テンプレ背景のおすすめを取得しました");
      } else {
        showMsg("おすすめ候補は取得できましたが、表示対象がありませんでした");
      }
    } catch (e: any) {
      console.warn("[AOI FLOW handled]", e);
      showMsg(`おすすめ取得に失敗：${e?.message || "不明"}`);
    } finally {
      setTemplateRecommendBusy(false);
    }
  }

  async function handleGenerateTemplateBackground() {
    if (!uid || busy) return;

    if (typeof generateTemplateBackground !== "function") {
      showMsg("テンプレ背景生成がまだ配線されていません");
      return;
    }

    try {
      await generateTemplateBackground();
      setActivePhotoMode("template");
      showMsg("テンプレ背景を生成しました");
    } catch (e: any) {
      console.warn("[AOI FLOW handled]", e);
      showMsg(`テンプレ背景生成に失敗：${e?.message || "不明"}`);
    }
  }

  async function handleSelectAiBackground(url: string) {
    const picked = String(url || "").trim();
    if (!picked) return;

    setBgImageUrl(picked);

    setD((p) => ({
      ...p,
      bgImageUrl: picked,
      activePhotoMode: "ai_bg",
    }));

await saveDraft({
  bgImageUrl: picked,
  activePhotoMode: "ai_bg",

  // 動画合成でも同じ背景を使うため、動画用背景として明示保存します
  videoBackgroundImageUrl: picked,
  videoBackgroundLabel: "AI背景",
} as any);

    setActivePhotoMode("ai_bg");
    showMsg("AI背景を選択しました");
  }

  return (
    <details className="area2 rounded-2xl border border-white/10 bg-black/20" open>
      <style jsx>{`
        .backgroundFixedPreview {
          position: sticky;
          top: 0;
          z-index: 8;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.26);
          backdrop-filter: blur(10px);
          padding: 10px;
        }

.backgroundControlScroll {
  display: flex;
  flex-direction: column;

  /*
    gap は既存UIの余白維持
  */
  gap: 12px;

  /*
    現在の背景生成プレビューは上に固定し、
    画像の目的 / 背景生成 / テンプレ背景 / AI背景だけを
    この枠の中で独立スクロールさせます。

    重要:
    - 大外の画面スクロールとは分離
    - プレビュー画像はスクロールに巻き込まない
    - Safariでも動くように overflow-y を明示
  */
  max-height: min(58vh, 620px);
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;

  /*
    スクロールバー分の右余白を確保します。
  */
  padding-right: 8px;
  padding-bottom: 12px;
}

.backgroundControlScroll::-webkit-scrollbar {
  width: 8px;
}

.backgroundControlScroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.24);
}

.backgroundControlScroll::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.12);
}


      `}</style>

      <summary className="cursor-pointer select-none p-3">
        <div className="text-white/70" style={{ fontSize: 12 }}>
          【商品画像】静止画
        </div>
      </summary>

      <div className="flex flex-col gap-3 p-3 pt-0">
        {!singleMode ? (
          <div className="flex flex-wrap items-center gap-2">
            <TopTabButton
              active={innerTab === "background"}
              label="背景生成"
              onClick={() => setInnerTab("background")}
            />
            <TopTabButton
              active={innerTab === "composite"}
              label="商品/背景合成"
              onClick={() => setInnerTab("composite")}
            />
          </div>
        ) : null}

        {innerTab === "background" ? (
          <>
            {!hideLowerPreview ? (
              <div className="backgroundFixedPreview">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-white/80 font-bold" style={{ fontSize: 12 }}>
                  現在の背景生成プレビュー
                </div>

                <SmallBadge
                  active={Boolean(fixedBackgroundPreviewUrl)}
                  label={
                    activePhotoMode === "template"
                      ? "テンプレ背景"
                      : "AI背景"
                  }
                />
              </div>

              {fixedBackgroundPreviewUrl ? (
                <img
                  src={fixedBackgroundPreviewUrl}
                  alt="selected background preview"
                  className="w-full rounded-xl border border-white/10"
                  style={{
                    height: 240,
                    objectFit: "contain",
                    background: "rgba(0,0,0,0.25)",
                  }}
                  draggable={false}
                />
              ) : (
                <div
                  className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/55"
                  style={{ aspectRatio: "1 / 1", fontSize: 13 }}
                >
                  背景がありません
                </div>
              )}

              <div className="mt-2 text-white/50" style={{ fontSize: 11, lineHeight: 1.5 }}>
                ここは背景を生成して確認する場所です。背景を使う選択は「商品/背景合成」タブで行います。
              </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
                背景プレビューは上部の EDIT PREVIEW に集約しました。ここでは用途設定・テンプレ背景・AI背景生成だけを操作します。
              </div>
            )}

            <div className="backgroundControlScroll flex flex-col gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
                <div className="text-white/85 font-bold" style={{ fontSize: 12 }}>
                  画像の目的
                </div>

                <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  まず用途だけ選んでください。Vision・Keywords・現在の商品状態を見て、内部設定を自動で寄せます。
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <PresetButton
                    label="EC販売用"
                    active={selectedPreset === "ec"}
                    onClick={() => applyPreset("ec")}
                  />

                  <PresetButton
                    label="広告・SNS用"
                    active={selectedPreset === "sns"}
                    onClick={() => applyPreset("sns")}
                  />

                  <PresetButton
                    label="使用イメージ用"
                    active={selectedPreset === "usage"}
                    onClick={() => applyPreset("usage")}
                  />
                </div>

                <div
                  className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/60"
                  style={{ fontSize: 12, lineHeight: 1.6 }}
                >
                  自動設定中：{" "}
                  {SELL_DIRECTION_LABEL[sellDirection]}
                  {" / "}
                  {BG_SCENE_LABEL[bgScene]}
                  {" / "}
                  {PRODUCT_CATEGORY_LABEL[productCategory]}
                  {" / "}
                  {GROUNDING_TYPE_LABEL[groundingType]}
                  {" / "}
                  {PRODUCT_SIZE_LABEL[productSize]}
                  {" / "}
                  {activePhotoMode === "template" ? "テンプレ背景" : "AI背景"}
                </div>

                <button
                  type="button"
                  onClick={() => setDetailOpen((prev) => !prev)}
                  className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left text-white/70 transition hover:bg-white/5"
                  style={{ fontSize: 12 }}
                >
                  {detailOpen ? "自動設定を調整する（閉じる）" : "自動設定を調整する"}
                </button>
              </div>

              {detailOpen ? (
                <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
                  <div className="text-white/85 font-bold" style={{ fontSize: 12 }}>
                    詳細調整
                  </div>

                  <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
                    自動設定のあとに、必要な時だけ手で直してください。
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      1. 商品カテゴリ
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(PRODUCT_CATEGORY_LABEL) as ProductCategory[]).map((key) => (
                        <SegButton
                          key={key}
                          active={productCategory === key}
                          label={PRODUCT_CATEGORY_LABEL[key]}
                          disabled={!setProductCategory || busy}
                          onClick={() => {
                            if (!setProductCategory) return;
                            setProductCategory(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      2. サイズ感
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(PRODUCT_SIZE_LABEL) as ProductSize[]).map((key) => (
                        <SegButton
                          key={key}
                          active={productSize === key}
                          label={PRODUCT_SIZE_LABEL[key]}
                          disabled={!setProductSize || busy}
                          onClick={() => {
                            if (!setProductSize) return;
                            setProductSize(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      3. 接地タイプ
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(GROUNDING_TYPE_LABEL) as GroundingType[]).map((key) => (
                        <SegButton
                          key={key}
                          active={groundingType === key}
                          label={GROUNDING_TYPE_LABEL[key]}
                          disabled={!setGroundingType || busy}
                          onClick={() => {
                            if (!setGroundingType) return;
                            setGroundingType(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      4. 売り方向
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(SELL_DIRECTION_LABEL) as SellDirection[]).map((key) => (
                        <SegButton
                          key={key}
                          active={sellDirection === key}
                          label={SELL_DIRECTION_LABEL[key]}
                          disabled={!setSellDirection || busy}
                          onClick={() => {
                            if (!setSellDirection) return;
                            setSellDirection(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      5. 背景方向
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(BG_SCENE_LABEL) as BgScene[]).map((key) => (
                        <SegButton
                          key={key}
                          active={bgScene === key}
                          label={BG_SCENE_LABEL[key]}
                          disabled={!setBgScene || busy}
                          onClick={() => {
                            if (!setBgScene) return;
                            setBgScene(key);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div
                    className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/65"
                    style={{ fontSize: 12, lineHeight: 1.6 }}
                  >
                    現在：{" "}
                    {PRODUCT_CATEGORY_LABEL[productCategory]}
                    {" / "}
                    {PRODUCT_SIZE_LABEL[productSize]}
                    {" / "}
                    {GROUNDING_TYPE_LABEL[groundingType]}
                    {" / "}
                    {SELL_DIRECTION_LABEL[sellDirection]}
                    {" / "}
                    {BG_SCENE_LABEL[bgScene]}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
                <div className="text-white/85 font-bold" style={{ fontSize: 12 }}>
                  背景生成
                </div>

                <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  ここではテンプレ背景とAI背景を生成・同期し、生成結果を確認します。背景の選択は「商品/背景合成」タブで行います。
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-white/85 font-bold" style={{ fontSize: 12 }}>
                    テンプレ背景
                  </div>

                  <SmallBadge
                    active={activePhotoMode === "template"}
                    label={activePhotoMode === "template" ? "現在の編集対象" : "切替可能"}
                  />
                </div>

                <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  テンプレ背景は「売るための整った背景」です。
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn
                    variant="secondary"
                    disabled={!uid || busy}
                    onClick={handleGenerateTemplateBackground}
                  >
                    テンプレ背景を生成
                  </Btn>

                  <Btn
                    variant="secondary"
                    disabled={!uid || busy || typeof syncTemplateBgImagesFromStorage !== "function"}
                    onClick={() => {
                      void syncTemplateBgImagesFromStorage?.();
                    }}
                  >
                    テンプレ背景を同期
                  </Btn>
                </div>

                <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  ※ テンプレ背景は、商品を主役に見せる販売向け背景です。
                </div>

                {templateBgUrls.length > 0 ? (
                  <div className="mt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-white/70" style={{ fontSize: 12 }}>
                        テンプレ背景一覧
                      </div>
                      <div className="text-white/45" style={{ fontSize: 11 }}>
                        {templateBgUrls.length}件
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {templateBgUrls.slice(0, 8).map((u, index) => {
                        const isCurrentTemplate =
                          String(templateBgUrl || d.templateBgUrl || "").trim() === u;

                        const recommendedItem = templateRecommended.find(
                          (item) => item.url === u
                        );

                        return (
                          <div
                            key={`${u}-${index}`}
                            className="rounded-xl border px-3 py-3 text-left"
                            style={{
                              borderColor: isCurrentTemplate
                                ? "rgba(255,255,255,0.34)"
                                : "rgba(255,255,255,0.10)",
                              background: isCurrentTemplate
                                ? "rgba(255,255,255,0.06)"
                                : "rgba(0,0,0,0.15)",
                              color: "rgba(255,255,255,0.82)",
                            }}
                          >
                            <div className="block w-full text-left">
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-semibold" style={{ fontSize: 12 }}>
                                  テンプレ背景 {index + 1}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  {recommendedItem ? (
                                    <SmallBadge active={false} label="おすすめ候補" />
                                  ) : null}
                                  <SmallBadge
                                    active={isCurrentTemplate}
                                    label={isCurrentTemplate ? "選択中" : "未選択"}
                                  />
                                </div>
                              </div>

                              <div className="mt-2 text-white/55" style={{ fontSize: 12 }}>
                                {u.slice(0, 72)}
                                {u.length > 72 ? "…" : ""}
                              </div>

                              {recommendedItem?.reason ? (
                                <div
                                  className="mt-2 rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-white/60"
                                  style={{ fontSize: 11, lineHeight: 1.5 }}
                                >
                                  理由：{recommendedItem.reason}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div
                    className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white/55"
                    style={{ fontSize: 12, lineHeight: 1.6 }}
                  >
                    まだテンプレ背景がありません。先に「テンプレ背景を生成」を押してください。
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-white/85 font-bold" style={{ fontSize: 12 }}>
                    AI背景
                  </div>

                  <SmallBadge
                    active={activePhotoMode === "ai_bg"}
                    label={activePhotoMode === "ai_bg" ? "現在の編集対象" : "切替可能"}
                  />
                </div>

                <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  AI背景は「希望背景の文章どおりに空間を作る背景」です。
                </div>

                <div className="mt-3">
                  <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                    希望背景を入力
                  </div>

                  <input
                    value={backgroundKeyword}
                    onChange={(e) => setBackgroundKeyword(e.target.value)}
                    placeholder="例：コレクションケース / レトロな棚 / 木製の飾り棚 / 白飛びしないグレー背景"
                    className="w-full rounded-xl border p-2 outline-none"
                    style={formStyle}
                    disabled={!uid || busy}
                  />

                  <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    ※ ここに入力した希望背景を優先して生成します。商品そのものではなく、置かれる背景だけを書いてください。
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3">
                  <div className="text-white/70" style={{ fontSize: 12 }}>
                    参考画像・スクショ（任意）
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={!uid || busy || aiBgReferenceBusy}
                    className="mt-2 w-full rounded-xl border p-2 outline-none"
                    style={formStyle}
                    onChange={async (e) => {
                      const file = e.target.files?.[0] ?? null;
                      await uploadAiBackgroundReference(file);
                      e.currentTarget.value = "";
                    }}
                  />
                  {aiBgReferenceUrl ? (
                    <div className="mt-2 flex items-center gap-2">
                      <img
                        src={aiBgReferenceUrl}
                        alt="AI背景参考画像"
                        className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                      />
                      <button
                        type="button"
                        className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-900"
                        onClick={() => setAiBgReferenceUrl("")}
                      >
                        参考画像を外す
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    ※ 参考画像がある場合は、色味・明るさ・余白・棚/ケース感などを読み取って、希望背景の文章と組み合わせます。文章だけ/画像だけでも生成できます。
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn
                    variant="secondary"
                    disabled={!uid || busy || (!backgroundKeyword.trim() && !aiBgReferenceUrl)}
                    onClick={async () => {
                      try {
                        await generateBackgroundImage(backgroundKeyword || "参考画像に近い販売背景", aiBgReferenceUrl);
                        showMsg("背景を生成しました");
                      } catch (e: any) {
                        console.warn("[AOI FLOW handled]", e);
                        showMsg(`背景生成に失敗：${e?.message || "不明"}`);
                      }
                    }}
                  >
                    背景を生成
                  </Btn>

                  <Btn
                    variant="secondary"
                    disabled={!uid || busy}
                    onClick={syncBgImagesFromStorage}
                  >
                    背景を同期（Storage→Firestore）
                  </Btn>
                </div>

                <div className="mt-2 text-white/55" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  ※ ここはAI背景を生成して確認する場所です。背景の選択と合成保存は「商品/背景合成」タブで行います。
                </div>

                {aiBgUrls.length > 0 ? (
                  <div className="mt-3">
                    <div className="mb-2 text-white/70" style={{ fontSize: 12 }}>
                      AI背景生成履歴（確認用）
                    </div>

                    <div className="flex flex-col gap-2">
                      {aiBgUrls.slice(0, 6).map((u: string) => (
                        <div
                          key={u}
                          className="rounded-xl border px-3 py-2"
                          style={{
                            borderColor: "rgba(255,255,255,0.10)",
                            background: "rgba(0,0,0,0.15)",
                            color: "rgba(255,255,255,0.78)",
                            fontSize: 12,
                          }}
                        >
                          <div className="block w-full text-left">
                            {u.slice(0, 60)}
                            {u.length > 60 ? "…" : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}

        {innerTab === "composite" ? (
          <div className="flex flex-col gap-3">
            <ProductPlacementEditor
              serverPlacementMeta={serverPlacementMeta}
              compositePreviewMode={compositePreviewMode}
              setCompositePreviewMode={setCompositePreviewMode}
              baseImageUrl={d.baseImageUrl}
              foregroundImageUrl={d.foregroundImageUrl}
              bgImageUrl={String(d.bgImageUrl || "").trim()}
              aiImageUrl={aiImageUrl}
              compositeTextImageUrl={String(
                compositeTextImageUrl || (d as any).compositeTextImageUrl || ""
              ).trim()}
              onSaveCompositeTextImageFromCompositeSlot={onSaveCompositeTextImageFromCompositeSlot}
              templateBgUrl={templateBgUrl}
              templateBgUrls={templateBgUrls}
              aiBgUrls={aiBgUrls}
              libraryBackgrounds={libraryBackgrounds}
              templateRecommended={templateRecommended}
              templateRecommendTopReason={templateRecommendTopReason}
              isCompositeFresh={isCompositeFresh}
              productCategory={productCategory}
              productSize={productSize}
              groundingType={groundingType}
              bgScene={bgScene}
              textOverlay={compositeTextOverlay}
              activePhotoMode={activePhotoMode}
              onChangePhotoMode={setActivePhotoMode}

              /**
               * サイズテンプレ
               */
              sizeTemplateType={sizeTemplateType}
              setSizeTemplateType={setSizeTemplateType}

              onSelectTemplateBg={handleSelectTemplateBackground}
              onSelectAiBg={handleSelectAiBackground}
              onRecompose={replaceBackgroundAndSaveToAiImage}
              placementScale={placementScale}
              placementX={placementX}
              placementY={placementY}
              shadowOpacity={shadowOpacity}
              shadowBlur={shadowBlur}
              shadowScale={shadowScale}
              shadowOffsetX={shadowOffsetX}
              shadowOffsetY={shadowOffsetY}
              backgroundScale={backgroundScale}
              backgroundX={backgroundX}
              backgroundY={backgroundY}
              setPlacementScale={setPlacementScale}
              setPlacementX={setPlacementX}
              setPlacementY={setPlacementY}
              setShadowOpacity={setShadowOpacity}
              setShadowBlur={setShadowBlur}
              setShadowScale={setShadowScale}
              setShadowOffsetX={setShadowOffsetX}
              setShadowOffsetY={setShadowOffsetY}
              setBackgroundScale={setBackgroundScale}
              setBackgroundX={setBackgroundX}
              setBackgroundY={setBackgroundY}
              editingStep={editingStep}
              setEditingStep={setEditingStep}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={onUndo}
              onRedo={onRedo}
              onSavePlacement={onSavePlacement}
              busy={busy}
              showMsg={showMsg}
              hideMainPreview={hideLowerPreview}
            />

            <div className="flex flex-wrap gap-2">
              <Btn
                variant="secondary"
                disabled={!uid || busy || typeof syncCompositeImagesFromStorage !== "function"}
                onClick={() => {
                  void syncCompositeImagesFromStorage?.();
                }}
                title="Storage から合成画像を復活します"
              >
                合成画像を同期
              </Btn>

              <Btn
                variant="danger"
                disabled={
                  !uid ||
                  busy ||
                  !String(aiImageUrl || "").trim() ||
                  typeof onRemoveCompositeImage !== "function"
                }
                onClick={() => {
                  void onRemoveCompositeImage?.(String(aiImageUrl || "").trim());
                }}
                title="画面上と下書き上だけから外します。Storageの本体は消しません"
              >
                合成画像を外す
              </Btn>

              <Btn
                variant="secondary"
                disabled={!uid || busy || typeof syncCompositeTextImagesFromStorage !== "function"}
                onClick={() => {
                  void syncCompositeTextImagesFromStorage?.();
                }}
                title="Storage から文字入り保存画像を復活します"
              >
                文字入り保存画像を同期
              </Btn>

              <Btn
                variant="danger"
                disabled={
                  !uid ||
                  busy ||
                  !String(compositeTextImageUrl || (d as any).compositeTextImageUrl || "").trim() ||
                  typeof onRemoveCompositeTextImage !== "function"
                }
                onClick={() => {
                  void onRemoveCompositeTextImage?.(
                    String(compositeTextImageUrl || (d as any).compositeTextImageUrl || "").trim()
                  );
                }}
                title="画面上と下書き上だけから外します。Storageの本体は消しません"
              >
                文字入り保存画像を外す
              </Btn>
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}