// /app/flow/drafts/new/page.tsx
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import ImageTabPanel from "./components/ImageTabPanel";
import ProductVideoPanel from "./components/ProductVideoPanel";
import BrandVisionCard from "./components/BrandVisionCard";
import CaptionEditorCard from "./components/CaptionEditorCard";
import BrandCMPanel from "@/components/cm/BrandCMPanel";

import { UI, SelectBtn, Chip } from "./ui";

import type {
  ImagePurpose,
  UiVideoSize,
  ProductPhotoMode,
  SizeTemplateType,
} from "@/lib/types/draft";
import useDraftEditorController from "./hooks/useDraftEditorController";

/**
 * このページ内で扱う、背景・商品理解レイヤー用の型です。
 * 画面側で安全に型をそろえるために定義しています。
 */
type BgScene = "studio" | "lifestyle" | "scale" | "detail";
type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";

/**
 * 静止画の目的ラベル
 */
const PURPOSE_LABEL: Record<ImagePurpose, string> = {
  sales: "売上",
  branding: "世界観",
  trust: "信頼",
  story: "物語",
};

/**
 * 背景方向ラベル
 */
const BG_SCENE_LABEL: Record<BgScene, string> = {
  studio: "スタジオ（無難）",
  lifestyle: "生活感（売れる文脈）",
  scale: "サイズ感（使用想像）",
  detail: "質感（近接）",
};

/**
 * 共通 input 見た目
 */
const formStyle: React.CSSProperties = {
  background: UI.FORM.bg,
  borderColor: UI.FORM.border,
  color: UI.FORM.text,
  caretColor: UI.FORM.text,
  fontSize: UI.FONT.inputPx,
  lineHeight: UI.FONT.inputLineHeight as any,
};

/**
 * 改行・読点・カンマを区切りとしてキーワード配列にする補助関数
 */
function splitKeywords(text: string) {
  return String(text || "")
    .split(/[\n,、]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * 動画サイズの旧値・別表現を現在の UI 用サイズにそろえる関数
 */
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
  /**
   * URL の ?id= を読んで、既存下書き編集か新規作成かを判定します。
   */
  const router = useRouter();
  const sp = useSearchParams();
  const id = sp.get("id");

  /**
   * 画面全体の状態・処理は controller からまとめて受け取ります。
   */
  const c = useDraftEditorController({
    id,
    router,
  });

  /**
   * ブランドCM用に、安全な brandId を作ります。
   * 不正値が入っても vento / riva のどちらかに必ず寄せます。
   */
  const safeBrandId: "vento" | "riva" =
    String((c.d as any).brand ?? c.d.brandId ?? "vento").trim() === "riva"
      ? "riva"
      : "vento";

  /**
   * ブランドCM用に、keywordsText の旧名 / 新名を吸収して安全に文字列化します。
   */
  const safeKeywordsText = String((c.d as any).keywordsText ?? c.d.keywords ?? "");

  /**
   * 商品理解レイヤー関連
   * controller から受けた setter を、画面側で型をそろえて扱います。
   */
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

  /**
   * ① 商品写真の配置調整関連
   */
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

  const shadowOffsetY = Number(c.shadowOffsetY ?? 0.02);
  const setShadowOffsetY =
    c.setShadowOffsetY as React.Dispatch<React.SetStateAction<number>>;

  /**
   * ③ サイズテンプレ
   */
  const sizeTemplateType = c.sizeTemplateType as SizeTemplateType;
  const setSizeTemplateType =
    c.setSizeTemplateType as React.Dispatch<React.SetStateAction<SizeTemplateType>>;

  /**
   * ⑤ ストーリー画像表示URL
   */
  const storyDisplayUrl = String(c.storyDisplayUrl ?? "");

  /**
   * 背景表示URL
   *
   * 重要:
   * - テンプレ背景選択中は templateBgUrl を優先
   * - それ以外は従来どおり controller 側の bgDisplayUrl を使用
   * - 既存の背景表示系を壊さないための最小調整
   */
  const bgDisplayUrl =
    activePhotoMode === "template"
      ? String(c.templateBgUrl ?? "")
      : String(c.bgDisplayUrl ?? "");

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

        @media (min-width: 900px) {
          .pageWrap {
            flex-direction: row;
            align-items: flex-start;
            flex-wrap: nowrap;
          }

          .leftCol {
            width: 48%;
          }

          .rightCol {
            width: 52%;
            position: sticky;
            top: ${UI.rightStickyTopPx}px;
            height: calc(100vh - ${UI.rightStickyTopPx}px);
          }

          .rightScroll {
            height: 100%;
            overflow: auto;
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

      <div className="pageWrap">
        {/* =========================
            左カラム
            ブランド / キャプション編集
        ========================= */}
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
            onEnsureDraftId={c.handleEnsureDraftId}
          />
        </section>

        {/* =========================
            右カラム
            画像 / 動画
        ========================= */}
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
                    selected={c.rightTab === "image"}
                    label="元画像｜背景(合成・動画用)"
                    onClick={() => c.setRightTab("image")}
                    disabled={c.busy}
                  />
                  <SelectBtn
                    selected={c.rightTab === "video"}
                    label="動画"
                    onClick={() => c.setRightTab("video")}
                    disabled={c.busy}
                  />
                </div>
              </div>

              {/* =========================
                  画像タブ
              ========================= */}
              {c.rightTab === "image" ? (
<ImageTabPanel
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
  onSaveCompositeAsImageUrl={c.saveCompositeAsImageUrl}
  onSaveCompositeTextImageFromCompositeSlot={c.saveCompositeTextImageFromCompositeSlot}
  onSaveDraft={() => {
    void c.saveDraft();
  }}
  onGenerateBackgroundImage={c.generateBackgroundImage}
  onReplaceBackgroundAndSaveToAiImage={c.replaceBackgroundAndSaveToAiImage}
  onSyncBgImagesFromStorage={c.syncBgImagesFromStorage}
  onClearBgHistory={c.clearBgHistory}
  onGenerateAiImage={c.generateAiImage}
  onSyncIdeaImagesFromStorage={c.syncIdeaImagesFromStorage}
  onClearIdeaHistory={c.clearIdeaHistory}
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
  onSavePlacement={c.savePlacement}
  sizeTemplateType={sizeTemplateType}
  setSizeTemplateType={setSizeTemplateType}
  storyDisplayUrl={storyDisplayUrl}
  onGenerateStoryImage={c.generateStoryImage}
  generateTemplateBackground={c.generateTemplateBackground}
  fetchTemplateRecommendations={c.fetchTemplateRecommendations}
  selectTemplateBackground={c.selectTemplateBackground}
  templateBgUrl={String(c.templateBgUrl ?? "")}
  templateBgUrls={Array.isArray(c.templateBgUrls) ? c.templateBgUrls : []}
/>
              ) : null}

              {/* =========================
                  動画タブ
              ========================= */}
              {c.rightTab === "video" ? (
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
                      normalizeVideoSize={normalizeVideoSize}
                      splitKeywords={splitKeywords}
                      onSaveNonAiVideoToDraft={c.saveNonAiVideoToDraft}
                      onBurnVideo={c.burnVideo}
                      onSaveDraft={c.saveDraft}
                      onSetPhase={c.setPhase}
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