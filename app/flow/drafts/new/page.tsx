// /app/flow/drafts/new/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import ImageTabPanel from "./components/ImageTabPanel";
import ProductVideoPanel from "./components/ProductVideoPanel";
import BrandVisionCard from "./components/BrandVisionCard";
import CaptionEditorCard from "./components/CaptionEditorCard";
import BrandCMPanel from "@/components/cm/BrandCMPanel";

import { UI, SelectBtn, Chip, Btn } from "./ui";

import type {
  ImagePurpose,
  UiVideoSize,
  ProductPhotoMode,
  SizeTemplateType,
} from "@/lib/types/draft";
import useDraftEditorController from "./hooks/useDraftEditorController";

type BgScene = "studio" | "lifestyle" | "scale" | "detail";
type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";
type WorkTab = "material" | "background" | "composite" | "video";
type CompositePreviewMode = "edit" | "final";

const PURPOSE_LABEL: Record<ImagePurpose, string> = {
  sales: "売上",
  branding: "世界観",
  trust: "信頼",
  story: "物語",
};

const BG_SCENE_LABEL: Record<BgScene, string> = {
  studio: "スタジオ（無難）",
  lifestyle: "生活感（売れる文脈）",
  scale: "サイズ感（使用想像）",
  detail: "質感（近接）",
};

const formStyle: React.CSSProperties = {
  background: UI.FORM.bg,
  borderColor: UI.FORM.border,
  color: UI.FORM.text,
  caretColor: UI.FORM.text,
  fontSize: UI.FONT.inputPx,
  lineHeight: UI.FONT.inputLineHeight as any,
};

function splitKeywords(text: string) {
  return String(text || "")
    .split(/[\n,、]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeVideoSize(s: any): UiVideoSize {
  const v = String(s ?? "");

  if (v === "720x1280") return "720x1280";
  if (v === "1280x720") return "1280x720";
  if (v === "960x960") return "960x960";

  if (v === "1024x1792") return "720x1280";
  if (v === "1792x1024") return "1280x720";
  if (v === "1080x1080") return "960x960";
  if (v === "1024x1024") return "960x960";

  return "720x1280";
}

export default function NewDraftPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const id = sp.get("id");
  const [workTab, setWorkTab] = React.useState<WorkTab>("material");
  const [compositePreviewMode, setCompositePreviewMode] = React.useState<CompositePreviewMode>("edit");

  const c = useDraftEditorController({
    id,
    router,
  });

  /**
   * 売れる診断へ進む導線
   *
   * 重要:
   * - controller 側に openSellCheckForCurrentDraft がある場合はそれを使う
   * - まだ未接続でも、この page.tsx 単体で型エラーにしない
   * - 未接続時は保存してから draftId 付きで遷移する
   */
  const openSellCheckForCurrentDraft = async () => {
    const controllerFn = (c as any).openSellCheckForCurrentDraft;

    if (typeof controllerFn === "function") {
      await controllerFn();
      return;
    }

    let targetDraftId = String(c.draftId || "").trim();

    if (!targetDraftId) {
      const savedId = await c.saveDraft();
      targetDraftId = String(savedId || "").trim();
    }

    if (!targetDraftId) {
      c.showMsg("売れる診断へ進む前に下書きIDを作成してください");
      return;
    }

    router.push(`/flow/sell-check?draftId=${encodeURIComponent(targetDraftId)}`);
  };

  const safeBrandId: "vento" | "riva" =
    String((c.d as any).brand ?? c.d.brandId ?? "vento").trim() === "riva"
      ? "riva"
      : "vento";

  const safeKeywordsText = String((c.d as any).keywordsText ?? c.d.keywords ?? "");

  const productCategory = c.productCategory as ProductCategory;
  const setProductCategory =
    c.setProductCategory as React.Dispatch<React.SetStateAction<ProductCategory>>;

  const productSize = c.productSize as ProductSize;
  const setProductSize =
    c.setProductSize as React.Dispatch<React.SetStateAction<ProductSize>>;

  const groundingType = c.groundingType as GroundingType;
  const setGroundingType =
    c.setGroundingType as React.Dispatch<React.SetStateAction<GroundingType>>;

  const sellDirection = c.sellDirection as SellDirection;
  const setSellDirection =
    c.setSellDirection as React.Dispatch<React.SetStateAction<SellDirection>>;

  const bgScene = c.bgScene as BgScene;
  const setBgScene = c.setBgScene as React.Dispatch<React.SetStateAction<BgScene>>;

  const activePhotoMode = c.activePhotoMode as ProductPhotoMode;
  const setActivePhotoMode =
    c.setActivePhotoMode as React.Dispatch<React.SetStateAction<ProductPhotoMode>>;

  const placementScale = Number(c.placementScale ?? 1);
  const setPlacementScale =
    c.setPlacementScale as React.Dispatch<React.SetStateAction<number>>;

  const placementX = Number(c.placementX ?? 0.5);
  const setPlacementX =
    c.setPlacementX as React.Dispatch<React.SetStateAction<number>>;

  const placementY = Number(c.placementY ?? 0.5);
  const setPlacementY =
    c.setPlacementY as React.Dispatch<React.SetStateAction<number>>;

  const shadowOpacity = Number(c.shadowOpacity ?? 0.12);
  const setShadowOpacity =
    c.setShadowOpacity as React.Dispatch<React.SetStateAction<number>>;

  const shadowBlur = Number(c.shadowBlur ?? 12);
  const setShadowBlur =
    c.setShadowBlur as React.Dispatch<React.SetStateAction<number>>;

  const shadowScale = Number(c.shadowScale ?? 1);
  const setShadowScale =
    c.setShadowScale as React.Dispatch<React.SetStateAction<number>>;

  const shadowOffsetX = Number(c.shadowOffsetX ?? 0);
  const setShadowOffsetX =
    c.setShadowOffsetX as React.Dispatch<React.SetStateAction<number>>;

  const shadowOffsetY = Number(c.shadowOffsetY ?? 0);
  const setShadowOffsetY =
    c.setShadowOffsetY as React.Dispatch<React.SetStateAction<number>>;

  const backgroundScale = Number(c.backgroundScale ?? 1);
  const setBackgroundScale =
    c.setBackgroundScale as React.Dispatch<React.SetStateAction<number>>;

  const backgroundX = Number(c.backgroundX ?? 0);
  const setBackgroundX =
    c.setBackgroundX as React.Dispatch<React.SetStateAction<number>>;

  const backgroundY = Number(c.backgroundY ?? 0);
  const setBackgroundY =
    c.setBackgroundY as React.Dispatch<React.SetStateAction<number>>;

  const sizeTemplateType = c.sizeTemplateType as SizeTemplateType;
  const setSizeTemplateType =
    c.setSizeTemplateType as React.Dispatch<React.SetStateAction<SizeTemplateType>>;

  const storyDisplayUrl = String(c.storyDisplayUrl ?? "");

  const bgDisplayUrl =
    activePhotoMode === "template"
      ? String(c.templateBgUrl ?? "")
      : String(c.bgDisplayUrl ?? "");

  /**
   * 上部プレビューに出す画像を、現在選択中の操作タブに合わせて切り替えます。
   *
   * 重要:
   * - 下の操作欄に散らばっていた「確認用プレビュー」を、画面上部へ集約する
   * - 下側は操作項目として使い、上側は常に結果確認エリアとして使う
   * - API / Firestore / 保存構造は変更しない
   */
  const materialPreviewUrl = String(
    c.d.baseImageUrl ||
      c.d.imageUrl ||
      c.d.imageIdeaUrl ||
      ""
  ).trim();

  const backgroundPreviewUrl = String(
    bgDisplayUrl ||
      c.templateBgUrl ||
      c.d.bgImageUrl ||
      ""
  ).trim();

  const compositeFinalPreviewUrl = String(
    (c.d as any).compositeTextImageUrl ||
      (c.d as any).compositeImageUrl ||
      c.d.aiImageUrl ||
      ""
  ).trim();

  const compositePreviewUrl = compositePreviewMode === "final" ? compositeFinalPreviewUrl : "";

  const foregroundPreviewUrl = String(
    (c.d as any).foregroundImageUrl ||
      c.d.baseImageUrl ||
      c.d.imageUrl ||
      ""
  ).trim();

  const videoPreviewUrl = String(
    c.d.nonAiVideoUrl ||
      (c.d as any)?.cmVideo?.url ||
      (c.d as any)?.cmApplied?.runwayVideoUrl ||
      ""
  ).trim();

  const fallbackPreviewUrl = String(
    compositeFinalPreviewUrl ||
      backgroundPreviewUrl ||
      materialPreviewUrl ||
      c.d.aiImageUrl ||
      c.d.imageIdeaUrl ||
      ""
  ).trim();

  const previewLabel =
    workTab === "material"
      ? materialPreviewUrl
        ? "素材プレビュー"
        : "素材未設定"
      : workTab === "background"
        ? backgroundPreviewUrl
          ? activePhotoMode === "template"
            ? "テンプレ背景プレビュー"
            : "AI背景プレビュー"
          : "背景未設定"
        : workTab === "composite"
          ? compositePreviewMode === "edit"
            ? "合成前編集プレビュー"
            : compositeFinalPreviewUrl
              ? (c.d as any).compositeTextImageUrl
                ? "文字入り完成画像"
                : "合成完成画像"
              : "合成後未作成"
          : videoPreviewUrl
            ? "動画プレビュー"
            : "動画未作成";

  const topPreviewHelp =
    workTab === "material"
      ? "画像アップロード・透過・文字焼き込みの確認画面です。"
      : workTab === "background"
        ? "テンプレ背景・AI背景の確認画面です。背景生成結果はここで確認します。"
        : workTab === "composite"
          ? compositePreviewMode === "edit"
            ? "合成前プレビューです。下の合成タブで背景・商品・影を調整します。"
            : "合成後プレビューです。下の合成タブの④合成で更新した最終画像を確認します。"
          : "静止画から動画・ブランドCMの確認画面です。";

  return (
    <>
      <style jsx>{`
        .imgPair {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
        }

        @media (min-width: 900px) {
          .imgPair {
            grid-template-columns: 1fr 1fr;
          }
        }

        .pageWrap {
          min-height: 100vh;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: ${UI.gap}px;
        }

        .leftCol,
        .rightCol {
          width: 100%;
        }

        .previewStage {
          min-height: 260px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        @media (max-width: 899px) {
          .topPreviewShell {
            position: sticky;
            top: 0;
            z-index: 30;
          }

          .previewStage {
            min-height: 220px;
            padding: 10px;
          }

          .topPreviewCanvas {
            height: min(34vh, 260px);
            min-height: 180px;
          }

          .pageWrap {
            flex-direction: row;
            overflow-x: auto;
            overflow-y: visible;
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
            padding-bottom: 10px;
          }

          .leftCol,
          .rightCol {
            min-width: 88vw;
            scroll-snap-align: start;
          }

          .rightScroll {
            max-height: none;
            overflow: visible;
          }
        }

        .topPreviewCanvas {
          position: relative;
          width: min(100%, 760px);
          height: min(38vh, 320px);
          min-height: 220px;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(0, 0, 0, 0.24);
        }

        .topPreviewImage {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .topPreviewBackground {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .topPreviewForeground {
          position: absolute;
          left: 50%;
          top: 50%;
          max-width: 70%;
          max-height: 70%;
          object-fit: contain;
          transform: translate(-50%, -50%);
          filter: drop-shadow(0 20px 28px rgba(0, 0, 0, 0.24));
        }

        @media (min-width: 900px) {
          .pageWrap {
            flex-direction: row;
            align-items: flex-start;
            flex-wrap: nowrap;
          }

          .leftCol {
            width: 42%;
          }

          .rightCol {
            width: 58%;
            position: relative;
            top: auto;
            height: auto;
            min-height: calc(100vh - ${UI.rightStickyTopPx}px);
          }

          .rightScroll {
            height: auto;
            min-height: calc(100vh - ${UI.rightStickyTopPx}px);
            overflow: visible;
          }
        }

        details > summary::-webkit-details-marker {
          display: none;
        }

        .rightImageGrid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
        }

        @media (min-width: 1100px) {
          .rightImageGrid {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>

      <div className="mb-3 rounded-2xl border border-white/12 bg-black/25 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-xs font-black tracking-[0.18em] text-white/55">
            商品画像作成
          </span>
          <Link href="/flow/drafts/new" className="rounded-full border border-cyan-200/30 bg-cyan-200/12 px-3 py-1 text-xs font-black text-white no-underline">
            新規作成
          </Link>
          <Link href="/flow/drafts" className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-black text-white/80 no-underline">
            下書き一覧
          </Link>
          <Link href="/flow/posted" className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-black text-white/80 no-underline">
            投稿済み
          </Link>
          <Link href="/flow/library" className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-black text-white/80 no-underline">
            画像ライブラリ
          </Link>
        </div>
      </div>

      <div
        className="topPreviewShell mb-3 rounded-3xl border border-cyan-100/20 bg-black/25 p-3 shadow-2xl shadow-cyan-950/20"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black tracking-[0.18em] text-cyan-100/60">
              EDIT PREVIEW
            </div>
            <div className="mt-1 text-sm font-black text-white/90">
              編集プレビュー画面
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Chip>{previewLabel}</Chip>
            <Chip>{`元=${c.d.baseImageUrl ? "✓" : "—"} / 背景=${bgDisplayUrl ? "✓" : "—"} / 合成=${c.d.aiImageUrl || (c.d as any).compositeImageUrl ? "✓" : "—"} / 動画=${c.d.nonAiVideoUrl ? "✓" : "—"}`}</Chip>
          </div>
        </div>

        <div className="previewStage rounded-3xl border border-white/10 bg-black/30 p-4">
          {workTab === "video" && videoPreviewUrl ? (
            <div className="topPreviewCanvas">
              <video
                src={videoPreviewUrl}
                controls
                playsInline
                className="absolute inset-0 h-full w-full object-contain"
              />
            </div>
          ) : workTab === "composite" ? (
            <div className="topPreviewCanvas">
              {compositePreviewUrl ? (
                <img
                  src={compositePreviewUrl}
                  alt="AOI FLOW composite preview"
                  className="topPreviewImage"
                  draggable={false}
                />
              ) : backgroundPreviewUrl || foregroundPreviewUrl ? (
                <>
                  {backgroundPreviewUrl ? (
                    <img
                      src={backgroundPreviewUrl}
                      alt="AOI FLOW background preview"
                      className="topPreviewBackground"
                      style={{
                        transform: `scale(${backgroundScale}) translate(${backgroundX * 12}%, ${backgroundY * 12}%)`,
                      }}
                      draggable={false}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-black/30" />
                  )}

                  {foregroundPreviewUrl ? (
                    <img
                      src={foregroundPreviewUrl}
                      alt="AOI FLOW product preview"
                      className="topPreviewForeground"
                      style={{
                        left: `${placementX * 100}%`,
                        top: `${placementY * 100}%`,
                        transform: `translate(-50%, -50%) scale(${placementScale})`,
                      }}
                      draggable={false}
                    />
                  ) : null}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-white/55">
                  合成プレビューに使う商品画像または背景がありません。
                </div>
              )}
            </div>
          ) : (workTab === "background" ? backgroundPreviewUrl : materialPreviewUrl || fallbackPreviewUrl) ? (
            <div className="topPreviewCanvas">
              <img
                src={workTab === "background" ? backgroundPreviewUrl : materialPreviewUrl || fallbackPreviewUrl}
                alt="AOI FLOW editing preview"
                className="topPreviewImage"
                draggable={false}
              />
            </div>
          ) : (
            <div className="text-center text-sm text-white/55" style={{ lineHeight: 1.8 }}>
              まだプレビュー画像がありません。
              <br />
              下の「素材」タブから画像をアップロードしてください。
            </div>
          )}
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/58">
          {topPreviewHelp}
        </div>
      </div>

      <div className="pageWrap">
        <section className="leftCol min-h-0 flex flex-col gap-3">
          <div className="shrink-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap" />

            {UI.showLoadingText && c.loadBusy ? (
              <div className="text-white/75" style={{ fontSize: UI.FONT.labelPx }}>
                読み込み中...
              </div>
            ) : null}
          </div>

          <BrandVisionCard
            d={c.d}
            brandLabel={c.brandLabel}
            phaseLabel={c.phaseLabel}
            uiMsg={c.uiMsg}
            canGenerate={c.canGenerate}
            formStyle={formStyle}
            onSelectVento={c.handleSelectVento}
            onSelectRiva={c.handleSelectRiva}
            onGenerateCaptions={c.generateCaptions}
            setD={c.setD}
          />

          <div className="rounded-2xl border border-white/12 bg-black/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-white/90 font-black" style={{ fontSize: 13 }}>
                  売れる診断
                </div>
                <div className="mt-1 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  現在の下書き画像を使って、価格・状態・画像の売れやすさを確認します。
                </div>
              </div>

              <Btn
                variant="secondary"
                disabled={!c.uid || c.busy}
                onClick={() => {
                  void openSellCheckForCurrentDraft();
                }}
              >
                この下書きを診断する
              </Btn>
            </div>
          </div>

          <CaptionEditorCard
            d={c.d}
            busy={c.busy}
            uid={c.uid}
            formStyle={formStyle}
            setD={c.setD}
            onApplyIg3ToOverlayOnly={c.applyIg3ToOverlayOnly}
            onSaveDraft={() => {
              void c.saveDraft();
            }}
            onSaveCaptionSet={() => {
              void c.saveCurrentCaptionSet();
            }}
            onRestoreCaptionSet={(id) => {
              void c.restoreCaptionSet(id);
            }}
            onClearCurrentCaptions={() => {
              void c.clearCurrentCaptions();
            }}
            onEnsureDraftId={c.handleEnsureDraftId}
          />
        </section>

        <section className="rightCol min-h-0">
          <div className="rightScroll flex flex-col gap-3">
            <div
              className="rounded-2xl border border-white/12 bg-black/25"
              style={{ padding: UI.cardPadding }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {c.isOwner ? (
                    <Chip>
                      内部表示：画像=OpenAI / 背景=OpenAI / 合成=Sharp / 動画=Runway
                      {` ｜状態：元=${c.d.baseImageUrl ? "✓" : "—"} / 背景=${c.bgDisplayUrl ? "✓" : "—"} / 合成=${
                        c.d.aiImageUrl ? "✓" : "—"
                      } / 商品動画=${c.d.nonAiVideoUrl ? "✓" : "—"} / CM=${
                        (c.d as any)?.cmVideo?.url ? "✓" : "—"
                      }`}
                    </Chip>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 whitespace-nowrap">
                  <SelectBtn
                    selected={workTab === "material"}
                    label="素材"
                    onClick={() => setWorkTab("material")}
                    disabled={c.busy}
                  />
                  <SelectBtn
                    selected={workTab === "background"}
                    label="背景"
                    onClick={() => setWorkTab("background")}
                    disabled={c.busy}
                  />
                  <SelectBtn
                    selected={workTab === "composite"}
                    label="商品/背景合成"
                    onClick={() => setWorkTab("composite")}
                    disabled={c.busy}
                  />
                  <SelectBtn
                    selected={workTab === "video"}
                    label="動画"
                    onClick={() => setWorkTab("video")}
                    disabled={c.busy}
                  />
                </div>
              </div>

              {workTab !== "video" ? (
                <ImageTabPanel
                  activePanel={workTab === "composite" ? "composite" : workTab === "background" ? "background" : "material"}
                  compositePreviewMode={compositePreviewMode}
                  setCompositePreviewMode={setCompositePreviewMode}
                  d={c.d}
                  uid={c.uid}
                  busy={c.busy}
                  cutoutBusy={c.cutoutBusy}
                  cutoutReason={c.cutoutReason}
                  overlayPreviewDataUrl={c.overlayPreviewDataUrl}
                  baseCandidates={c.baseCandidates}
                  currentSlot={c.currentSlot}
                  formStyle={formStyle}
                  defaultTextOverlay={c.DEFAULT_TEXT_OVERLAY}
                  textOverlay={c.d.textOverlayBySlot?.[c.currentSlot] ?? null}
                  compositeTextImageUrl={String((c.d as any).compositeTextImageUrl ?? "")}
                  staticPurpose={c.staticPurpose}
                  setStaticPurpose={c.setStaticPurpose}
                  productCategory={productCategory}
                  setProductCategory={setProductCategory}
                  productSize={productSize}
                  setProductSize={setProductSize}
                  groundingType={groundingType}
                  setGroundingType={setGroundingType}
                  sellDirection={sellDirection}
                  setSellDirection={setSellDirection}
                  bgScene={bgScene}
                  setBgScene={setBgScene}
                  staticRecommendation={c.staticRecommendation}
                  staticVariants={c.staticVariants}
                  staticBusy={c.staticBusy}
                  purposeLabel={PURPOSE_LABEL}
                  bgSceneLabel={BG_SCENE_LABEL}
                  bgDisplayUrl={bgDisplayUrl}
                  backgroundKeyword={c.backgroundKeyword}
                  setBackgroundKeyword={c.setBackgroundKeyword}
                  canGenerate={c.canGenerate}
                  isCompositeFresh={c.isCompositeFresh}
                  onGenerateStaticVariants={c.generateStaticVariants}
                  onSelectStaticVariant={c.selectStaticVariant}
                  onUploadImageFilesNew={c.onUploadImageFilesNew}
                  onCutoutCurrentBaseToReplace={c.cutoutCurrentBaseToReplace}
                  onPromoteMaterialToBase={c.promoteMaterialToBase}
                  onRemoveBaseOrMaterialImage={c.removeBaseOrMaterialImage}
                  onSyncBaseAndMaterialImagesFromStorage={c.syncBaseAndMaterialImagesFromStorage}
                  onSaveCompositeAsImageUrl={c.saveCompositeAsImageUrl}
                  onSaveCompositeTextImageFromCompositeSlot={c.saveCompositeTextImageFromCompositeSlot}
                  onSaveDraft={() => {
                    void c.saveDraft();
                  }}
                  onGenerateBackgroundImage={c.generateBackgroundImage}
                  onReplaceBackgroundAndSaveToAiImage={c.replaceBackgroundAndSaveToAiImage}
                  onSyncBgImagesFromStorage={c.syncBgImagesFromStorage}
                  onSyncTemplateBgImagesFromStorage={c.syncTemplateBgImagesFromStorage}
                  onSyncCompositeImagesFromStorage={c.syncCompositeImagesFromStorage}
                  onSyncCompositeTextImagesFromStorage={c.syncCompositeTextImagesFromStorage}
                  onClearBgHistory={c.clearBgHistory}
                  onRemoveTemplateBgImage={c.removeTemplateBgImage}
                  onRemoveAiBgImage={c.removeAiBgImage}
                  onRemoveCompositeImage={c.removeCompositeImage}
                  onRemoveCompositeTextImage={c.removeCompositeTextImage}
                  onGenerateAiImage={c.generateAiImage}
                  onSyncIdeaImagesFromStorage={c.syncIdeaImagesFromStorage}
                  onClearIdeaHistory={c.clearIdeaHistory}
                  onSyncStoryImagesFromStorage={c.syncStoryImagesFromStorage}
                  setBgImageUrl={c.setBgImageUrl}
                  setD={c.setD}
                  saveDraft={c.saveDraft}
                  showMsg={c.showMsg}
                  activePhotoMode={activePhotoMode}
                  setActivePhotoMode={setActivePhotoMode}
                  placementScale={placementScale}
                  setPlacementScale={setPlacementScale}
                  placementX={placementX}
                  setPlacementX={setPlacementX}
                  placementY={placementY}
                  setPlacementY={setPlacementY}
                  shadowOpacity={shadowOpacity}
                  setShadowOpacity={setShadowOpacity}
                  shadowBlur={shadowBlur}
                  setShadowBlur={setShadowBlur}
                  shadowScale={shadowScale}
                  setShadowScale={setShadowScale}
                  shadowOffsetX={shadowOffsetX}
                  setShadowOffsetX={setShadowOffsetX}
                  shadowOffsetY={shadowOffsetY}
                  setShadowOffsetY={setShadowOffsetY}
                  backgroundScale={backgroundScale}
                  setBackgroundScale={setBackgroundScale}
                  backgroundX={backgroundX}
                  setBackgroundX={setBackgroundX}
                  backgroundY={backgroundY}
                  setBackgroundY={setBackgroundY}
                  onSavePlacement={c.savePlacement}
                  editingStep={c.editingStep}
                  setEditingStep={c.setEditingStep}
                  canUndo={c.canUndo}
                  canRedo={c.canRedo}
                  onUndo={c.undoPlacement}
                  onRedo={c.redoPlacement}
                  sizeTemplateType={sizeTemplateType}
                  setSizeTemplateType={setSizeTemplateType}
                  storyDisplayUrl={storyDisplayUrl}
                  onGenerateStoryImage={c.generateStoryImage}
                  generateTemplateBackground={c.generateTemplateBackground}
                  fetchTemplateRecommendations={c.fetchTemplateRecommendations}
                  selectTemplateBackground={c.selectTemplateBackground}
                  templateBgUrl={String(c.templateBgUrl ?? "")}
                  templateBgUrls={Array.isArray(c.templateBgUrls) ? c.templateBgUrls : []}
                  serverPlacementMeta={(c.d as any).compositeServerPlacementMeta ?? null}
                />
              ) : null}

              {workTab === "video" ? (
                <div className="mt-3 flex flex-col gap-3">
                  <div
                    className="rounded-2xl border border-white/10 bg-black/20"
                    style={{ padding: UI.cardPadding }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-white/85 font-black" style={{ fontSize: 13 }}>
                        動画
                      </div>

                      <div className="flex items-center gap-2">
                        <SelectBtn
                          selected={c.videoTab === "product"}
                          label="商品動画"
                          onClick={() => c.setVideoTab("product")}
                          disabled={c.busy}
                        />
                        <SelectBtn
                          selected={c.videoTab === "cm"}
                          label="ブランドCM"
                          onClick={() => c.setVideoTab("cm")}
                          disabled={c.busy}
                        />
                      </div>
                    </div>

                    <div
                      className="text-white/55 mt-2"
                      style={{ fontSize: 12, lineHeight: 1.6 }}
                    >
                      商品動画＝非AIテンプレ（崩壊ゼロ）／ ブランドCM＝世界観設計(OpenAI)→生成(Runway)
                    </div>
                  </div>

{c.videoTab === "product" ? (
  <ProductVideoPanel
    d={c.d}
    setD={c.setD}
    uid={c.uid}
    busy={c.busy}
    nonAiBusy={c.nonAiBusy}
    nonAiReason={c.nonAiReason}
    setNonAiReason={c.setNonAiReason}
    nonAiPreset={c.nonAiPreset}
    draftId={c.draftId}

    extractProductVideoClip={c.extractProductVideoClip}

    normalizeVideoSize={normalizeVideoSize}
    splitKeywords={splitKeywords}

    onSaveSourceProductVideoToDraft={
      c.saveSourceProductVideoToDraft
    }

    onSaveNonAiVideoToDraft={
      c.saveNonAiVideoToDraft
    }

    onBurnVideo={c.burnVideo}
    onSaveDraft={c.saveDraft}
    onSetPhase={c.setPhase}

    serverPlacementMeta={
      (c.d as any).compositeServerPlacementMeta ?? null
    }

    baseImageUrl={String(c.d.baseImageUrl ?? "")}

    foregroundImageUrl={
      String(
        (c.d as any).foregroundImageUrl ??
        c.d.baseImageUrl ??
        ""
      )
    }

    bgImageUrl={String(c.bgDisplayUrl ?? "")}

    aiImageUrl={String(c.d.aiImageUrl ?? "")}

    compositeTextImageUrl={
      String((c.d as any).compositeTextImageUrl ?? "")
    }

    templateBgUrl={String(c.templateBgUrl ?? "")}

    templateBgUrls={
      Array.isArray(c.templateBgUrls)
        ? c.templateBgUrls
        : []
    }

    aiBgUrls={
      Array.isArray(c.d.bgImageUrls)
        ? c.d.bgImageUrls
        : []
    }

    templateRecommended={
      Array.isArray((c.d as any)?.templateRecommendations)
        ? (c.d as any).templateRecommendations
        : []
    }

    isCompositeFresh={c.isCompositeFresh}

    productCategory={productCategory}
    productSize={productSize}
    groundingType={groundingType}
    bgScene={bgScene}

    textOverlay={
      c.d.textOverlayBySlot?.[c.currentSlot] ?? null
    }

    activePhotoMode={activePhotoMode}

    onChangePhotoMode={async (next) => {
      setActivePhotoMode(next);
    }}

    onSelectTemplateBg={async (url) => {
      await c.selectTemplateBackground(url);
    }}

    onSelectAiBg={async (url) => {
      c.setBgImageUrl(url);
    }}

    onRecompose={async () => {
      await c.replaceBackgroundAndSaveToAiImage();
    }}

    onGenerateVideoBackground={async (keyword: string) => {
      return await c.generateBackgroundImage(keyword);
    }}

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

    editingStep={c.editingStep}
    setEditingStep={c.setEditingStep}

    canUndo={c.canUndo}
    canRedo={c.canRedo}

    onUndo={c.undoPlacement}
    onRedo={c.redoPlacement}

    onSavePlacement={c.savePlacement}

    sizeTemplateType={sizeTemplateType}
    setSizeTemplateType={setSizeTemplateType}

    onSaveCompositeTextImageFromCompositeSlot={
      c.saveCompositeTextImageFromCompositeSlot
    }

    showMsg={c.showMsg}

    /* ▲ ここまで追加 ▲ */
  />
) : null}
                  {c.videoTab === "cm" ? (
                    <BrandCMPanel
                      uid={c.uid}
                      draftId={c.draftId}
                      idToken={c.idToken}
                      brandId={safeBrandId}
                      saveDraft={c.saveDraft}
                      busy={c.busy}
                      showMsg={c.showMsg}
                      initial={{
                        philosophy: c.d.vision ?? "",
                        keywordsText: safeKeywordsText,
                        purpose: (c.d as any)?.purpose ?? "",
                        worldSpecText: (c.d as any)?.cmApplied?.worldSpecText ?? "",
                        cmVideo: (c.d as any)?.cmVideo ?? undefined,
                        runwayTaskId: (c.d as any)?.cmApplied?.runwayTaskId,
                        runwayStatus: (c.d as any)?.cmApplied?.runwayStatus,
                        runwayVideoUrl: (c.d as any)?.cmApplied?.runwayVideoUrl,
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}