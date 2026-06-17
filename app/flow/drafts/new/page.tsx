// /app/flow/drafts/new/page.tsx
"use client";

import React from "react";
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
type WorkTab = "material" | "background" | "composite" | "video" | "text";
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
          : workTab === "video"
        ? videoPreviewUrl
          ? "動画プレビュー"
          : "動画未作成"
        : "テキスト投稿";

  const topPreviewHelp =
    workTab === "material"
      ? "画像アップロード・透過・文字焼き込みの確認画面です。"
      : workTab === "background"
        ? "テンプレ背景・AI背景の確認画面です。背景生成結果はここで確認します。"
        : workTab === "composite"
          ? compositePreviewMode === "edit"
            ? "合成前プレビューです。下の合成タブで背景・商品・影を調整します。"
            : "合成後プレビューです。下の合成タブの④合成で更新した最終画像を確認します。"
          : workTab === "video"
            ? "静止画から動画・ブランドCMの確認画面です。"
            : "Instagram本文・X投稿文・文字焼き込みを調整します。";

  const stepTabs: Array<{ key: WorkTab; label: string; note: string }> = [
    { key: "material", label: "素材準備", note: "商品画像・切り抜き" },
    { key: "background", label: "背景選択・生成", note: "AI背景・テンプレ背景" },
    { key: "composite", label: "商品/背景合成", note: "配置・影・完成画像" },
    { key: "video", label: "動画作成", note: "商品動画・ブランドCM" },
    { key: "text", label: "テキスト投稿", note: "Instagram・X・保存" },
  ];

  return (
    <>
      <style jsx>{`
        .studioRoot {
          width: 100%;
          display: grid;
          gap: 16px;
        }

        .studioHero {
          border: 1px solid rgba(125, 211, 252, 0.20);
          border-radius: 28px;
          background:
            radial-gradient(circle at 18% 0%, rgba(34, 211, 238, 0.14), transparent 30%),
            linear-gradient(135deg, rgba(2, 17, 32, 0.82), rgba(3, 28, 48, 0.56));
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.26);
          padding: 18px;
        }

        .studioHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .studioTitle {
          margin: 0;
          color: white;
          font-size: clamp(24px, 3vw, 38px);
          font-weight: 950;
          letter-spacing: 0.02em;
        }

        .studioLead {
          margin-top: 8px;
          max-width: 720px;
          color: rgba(226, 246, 255, 0.66);
          font-size: 13px;
          line-height: 1.8;
        }

        .statusChips {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 8px;
        }

        .stepRail {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
        }

        .stepButton {
          min-height: 74px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.055);
          color: rgba(255, 255, 255, 0.74);
          cursor: pointer;
          text-align: left;
          padding: 12px;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
        }

        .stepButton:hover {
          transform: translateY(-1px);
          border-color: rgba(125, 211, 252, 0.32);
          background: rgba(255, 255, 255, 0.08);
        }

        .stepButtonActive {
          border-color: rgba(103, 232, 249, 0.58);
          background: linear-gradient(135deg, rgba(34, 211, 238, 0.22), rgba(37, 99, 235, 0.16));
          box-shadow: 0 0 24px rgba(34, 211, 238, 0.18), inset 0 0 18px rgba(255, 255, 255, 0.045);
          color: white;
        }

        .stepNumber {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: rgba(34, 211, 238, 0.16);
          border: 1px solid rgba(103, 232, 249, 0.32);
          font-size: 11px;
          font-weight: 950;
          margin-right: 8px;
        }

        .stepLabel {
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.02em;
        }

        .stepNote {
          margin-top: 8px;
          color: rgba(255, 255, 255, 0.50);
          font-size: 11px;
          line-height: 1.5;
        }

        .studioGrid {
          display: grid;
          grid-template-columns: minmax(300px, 0.9fr) minmax(420px, 1.6fr);
          gap: 16px;
          align-items: start;
        }

        .studioCard {
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 24px;
          background: rgba(2, 13, 25, 0.56);
          box-shadow: 0 20px 55px rgba(0, 0, 0, 0.18);
          padding: 14px;
        }

        .studioCardTitle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .studioCardTitleText {
          color: rgba(255, 255, 255, 0.92);
          font-size: 14px;
          font-weight: 950;
        }

        .studioCardSubText {
          margin-top: 4px;
          color: rgba(255, 255, 255, 0.52);
          font-size: 12px;
          line-height: 1.6;
        }

        .previewStage {
          min-height: 260px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background:
            linear-gradient(45deg, rgba(255,255,255,0.035) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(255,255,255,0.035) 25%, transparent 25%),
            rgba(0, 0, 0, 0.22);
          background-size: 22px 22px;
          background-position: 0 0, 0 11px;
          padding: 12px;
        }

        .topPreviewCanvas {
          position: relative;
          width: min(100%, 780px);
          height: min(42vh, 360px);
          min-height: 240px;
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

        .detailBox {
          margin-top: 14px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.045);
          padding: 12px;
        }

        .detailBox summary {
          list-style: none;
          cursor: pointer;
          color: rgba(255, 255, 255, 0.86);
          font-size: 13px;
          font-weight: 950;
        }

        details > summary::-webkit-details-marker {
          display: none;
        }

        .statusGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }

        .statusCard {
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.045);
          padding: 10px;
        }

        .statusLabel {
          color: rgba(255, 255, 255, 0.52);
          font-size: 11px;
          font-weight: 900;
        }

        .statusValue {
          margin-top: 5px;
          color: white;
          font-size: 14px;
          font-weight: 950;
        }

        .mainOperationPanel {
          min-width: 0;
        }

        .mainOperationPanel :global(.rightImageGrid) {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        @media (max-width: 1180px) {
          .studioGrid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 820px) {
          .studioHero {
            padding: 14px;
            border-radius: 22px;
          }

          .stepRail {
            display: flex;
            overflow-x: auto;
            padding-bottom: 6px;
            scroll-snap-type: x mandatory;
          }

          .stepButton {
            min-width: 190px;
            scroll-snap-align: start;
          }

          .previewStage {
            min-height: 220px;
          }

          .topPreviewCanvas {
            height: min(36vh, 300px);
            min-height: 210px;
          }
        }
      `}</style>

      <div className="studioRoot">
        <section className="studioHero">
          <div className="studioHeader">
            <div>
              <p className="m-0 text-xs font-black tracking-[0.28em] text-cyan-100/55">
                AOI FLOW STUDIO
              </p>
              <h1 className="studioTitle">商品画像作成</h1>
              <div className="studioLead">
                既存の素材準備・背景生成・商品背景合成・動画作成・テキスト投稿機能はそのまま使い、作業の見通しだけをスタジオ型に整理しています。
              </div>
            </div>

            <div className="statusChips">
              <Chip>{previewLabel}</Chip>
              {c.isOwner ? <Chip>内部表示 ON</Chip> : null}
              {UI.showLoadingText && c.loadBusy ? <Chip>読み込み中</Chip> : null}
            </div>
          </div>

          <div className="stepRail" aria-label="商品画像作成の工程">
            {stepTabs.map((tab, index) => {
              const active = workTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`stepButton ${active ? "stepButtonActive" : ""}`}
                  onClick={() => setWorkTab(tab.key)}
                  disabled={c.busy}
                >
                  <div>
                    <span className="stepNumber">{index + 1}</span>
                    <span className="stepLabel">{tab.label}</span>
                  </div>
                  <div className="stepNote">{tab.note}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="studioGrid">
          <aside className="studioCard">
            <div className="studioCardTitle">
              <div>
                <div className="studioCardTitleText">プレビュー</div>
                <div className="studioCardSubText">{topPreviewHelp}</div>
              </div>
              <Chip>{previewLabel}</Chip>
            </div>

            <div className="previewStage">
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
                  「素材準備」から画像をアップロードしてください。
                </div>
              )}
            </div>

            <div className="statusGrid">
              <div className="statusCard">
                <div className="statusLabel">元画像</div>
                <div className="statusValue">{c.d.baseImageUrl ? "設定済み" : "未設定"}</div>
              </div>
              <div className="statusCard">
                <div className="statusLabel">背景</div>
                <div className="statusValue">{bgDisplayUrl ? "設定済み" : "未設定"}</div>
              </div>
              <div className="statusCard">
                <div className="statusLabel">合成</div>
                <div className="statusValue">{c.d.aiImageUrl || (c.d as any).compositeImageUrl ? "作成済み" : "未作成"}</div>
              </div>
              <div className="statusCard">
                <div className="statusLabel">動画</div>
                <div className="statusValue">{c.d.nonAiVideoUrl ? "保存済み" : "未作成"}</div>
              </div>
            </div>

            <div className="detailBox">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-white/90">売れる診断</div>
                  <div className="mt-1 text-xs text-white/55" style={{ lineHeight: 1.6 }}>
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
          </aside>

          <main className="mainOperationPanel studioCard">
            <div className="studioCardTitle">
              <div>
                <div className="studioCardTitleText">
                  {workTab === "material"
                    ? "素材準備"
                    : workTab === "background"
                      ? "背景選択・生成"
                      : workTab === "composite"
                        ? "商品/背景合成"
                        : workTab === "video"
                          ? "動画作成"
                          : "テキスト投稿"}
                </div>
                <div className="studioCardSubText">
                  既存の操作部品をそのまま使用しています。保存先・API・Firestore構造は変更していません。
                </div>
              </div>
              <Chip>{c.busy ? "処理中" : "操作可能"}</Chip>
            </div>

            {workTab !== "video" && workTab !== "text" ? (
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
              <div className="flex flex-col gap-3">
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

                  <div className="text-white/55 mt-2" style={{ fontSize: 12, lineHeight: 1.6 }}>
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
                    onSaveSourceProductVideoToDraft={c.saveSourceProductVideoToDraft}
                    onSaveNonAiVideoToDraft={c.saveNonAiVideoToDraft}
                    onBurnVideo={c.burnVideo}
                    onSaveDraft={c.saveDraft}
                    onSetPhase={c.setPhase}
                    serverPlacementMeta={(c.d as any).compositeServerPlacementMeta ?? null}
                    baseImageUrl={String(c.d.baseImageUrl ?? "")}
                    foregroundImageUrl={String((c.d as any).foregroundImageUrl ?? c.d.baseImageUrl ?? "")}
                    bgImageUrl={String(c.bgDisplayUrl ?? "")}
                    aiImageUrl={String(c.d.aiImageUrl ?? "")}
                    compositeTextImageUrl={String((c.d as any).compositeTextImageUrl ?? "")}
                    templateBgUrl={String(c.templateBgUrl ?? "")}
                    templateBgUrls={Array.isArray(c.templateBgUrls) ? c.templateBgUrls : []}
                    aiBgUrls={Array.isArray(c.d.bgImageUrls) ? c.d.bgImageUrls : []}
                    templateRecommended={Array.isArray((c.d as any)?.templateRecommendations) ? (c.d as any).templateRecommendations : []}
                    isCompositeFresh={c.isCompositeFresh}
                    productCategory={productCategory}
                    productSize={productSize}
                    groundingType={groundingType}
                    bgScene={bgScene}
                    textOverlay={c.d.textOverlayBySlot?.[c.currentSlot] ?? null}
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
                    onSaveCompositeTextImageFromCompositeSlot={c.saveCompositeTextImageFromCompositeSlot}
                    showMsg={c.showMsg}
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

            {workTab === "text" ? (
              <div className="grid gap-3">
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
              </div>
            ) : null}
          </main>
        </section>
      </div>
    </>
  );
}
