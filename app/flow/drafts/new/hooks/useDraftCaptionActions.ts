// /app/flow/drafts/new/hooks/useDraftCaptionActions.ts
"use client";

import { auth } from "@/firebase";
import type { DraftDoc, TextOverlay } from "@/lib/types/draft";
import { splitKeywords } from "./useDraftEditorState";

/**
 * テキスト / キャプション専用 hook
 *
 * 役割
 * - IG / X / IG3 の生成
 * - オーバーレイ文字への反映
 * - 下書き保存
 *
 * 方針
 * - 本文を勝手に壊さない
 * - textOverlayBySlot が無い旧データでも安全に補完する
 * - keywordsText / keywords の両方に対応する
 */

type Params = {
  uid: string | null;
  busy: boolean;
  dRef: React.MutableRefObject<DraftDoc>;
  currentSlot: "base" | "mood" | "composite";
  inFlightRef: React.MutableRefObject<Record<string, boolean>>;

  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;
  setPreviewMode: React.Dispatch<React.SetStateAction<"base" | "idea" | "composite">>;
  setPreviewReason: React.Dispatch<React.SetStateAction<string>>;

  saveDraft: (partial?: Partial<DraftDoc>) => Promise<string | null>;
  showMsg: (s: string) => void;
};

export default function useDraftCaptionActions(params: Params) {
  const {
    uid,
    busy,
    dRef,
    currentSlot,
    inFlightRef,

    setBusy,
    setD,
    setPreviewMode,
    setPreviewReason,

    saveDraft,
    showMsg,
  } = params;

  /**
   * 指定スロットのオーバーレイを必ず作る
   *
   * 旧データや未設定データでも安全に使えるように、
   * 足りない項目をここで全部補完する。
   */
  function ensureSlotOverlay(
    base: DraftDoc,
    slot: "base" | "mood" | "composite",
    patch?: Partial<TextOverlay>
  ): DraftDoc["textOverlayBySlot"] {
    const cur = base.textOverlayBySlot?.[slot];

    const next: TextOverlay = {
      lines: Array.isArray(cur?.lines) ? cur.lines : [],
      fontSize: typeof cur?.fontSize === "number" ? cur.fontSize : 64,
      lineHeight: typeof cur?.lineHeight === "number" ? cur.lineHeight : 1.25,
      x: typeof cur?.x === "number" ? cur.x : 0.5,
      y: typeof cur?.y === "number" ? cur.y : 0.75,
      color: typeof cur?.color === "string" ? cur.color : "rgba(255,255,255,0.95)",
      bandOpacity: typeof cur?.bandOpacity === "number" ? cur.bandOpacity : 0.45,
      background: cur?.background
        ? {
            enabled: !!cur.background.enabled,
            padding: typeof cur.background.padding === "number" ? cur.background.padding : 24,
            color:
              typeof cur.background.color === "string"
                ? cur.background.color
                : "rgba(0,0,0,0.45)",
            radius: typeof cur.background.radius === "number" ? cur.background.radius : 18,
          }
        : {
            enabled: true,
            padding: 24,
            color: "rgba(0,0,0,0.45)",
            radius: 18,
          },
      ...(patch ?? {}),
    };

    return {
      ...(base.textOverlayBySlot ?? {}),
      [slot]: next,
    };
  }

  /**
   * 指定スロットの TextOverlay を必ず1つ返す
   *
   * ここを使うことで
   * - ensureSlotOverlay(...)[slot] が undefined 扱いになる問題
   * - textOverlayBySlot が未作成な旧データ
   *
   * を安全に吸収する。
   */
  function getSafeSlotOverlay(
    base: DraftDoc,
    slot: "base" | "mood" | "composite"
  ): TextOverlay {
    const existing = base.textOverlayBySlot?.[slot];
    if (existing) {
      return existing;
    }

    const ensured = ensureSlotOverlay(base, slot);
    const fallback = ensured?.[slot];

    if (fallback) {
      return fallback;
    }

    return {
      lines: [],
      fontSize: 48,
      lineHeight: 1.25,
      x: 0.5,
      y: 0.75,
      color: "#ffffff",
      bandOpacity: 0.45,
      background: {
        enabled: true,
        padding: 24,
        color: "rgba(0,0,0,0.45)",
        radius: 0,
      },
    };
  }

  /**
   * キャプション生成
   *
   * 注意
   * - brand / brandId の両方を吸収
   * - keywordsText / keywords の両方を吸収
   * - オーバーレイ文字が既にある場合は勝手に上書きしない
   */
  async function generateCaptions() {
    if (!uid) return;

    const vision = String(dRef.current.vision ?? "").trim();
    if (!vision) {
      showMsg("Vision（必須）を入力してください");
      return;
    }

    if (busy) return;

    if (inFlightRef.current["captions"]) return;
    inFlightRef.current["captions"] = true;

    setBusy(true);

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        throw new Error("no token");
      }

      const brandId =
        (String((dRef.current as any).brand ?? "").trim() ||
          String(dRef.current.brandId ?? "").trim() ||
          "vento") as "vento" | "riva";

      const keywordsText = String(
        (dRef.current as any).keywordsText ?? dRef.current.keywords ?? ""
      );

      const body = {
        brandId,
        vision,
        keywords: splitKeywords(keywordsText),
        tone: "",
      };

      const r = await fetch("/api/generate-captions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(j?.error || "caption error");
      }

      const ig = typeof j.instagram === "string" ? j.instagram : "";
      const x = typeof j.x === "string" ? j.x : "";
      const ig3 = Array.isArray(j.ig3) ? j.ig3.map(String).slice(0, 3) : [];

      const slot = currentSlot;
      const existingLines = dRef.current.textOverlayBySlot?.[slot]?.lines ?? [];
      const hasText = Array.isArray(existingLines) && existingLines.join("\n").trim().length > 0;

      const nextTextOverlayBySlot = hasText
        ? dRef.current.textOverlayBySlot
        : ensureSlotOverlay(dRef.current, slot, { lines: ig ? [ig] : [] });

      setD((prev) => ({
        ...prev,
        ig,
        x,
        ig3,
        igCaption: ig,
        xCaption: x,
        textOverlayBySlot: hasText
          ? prev.textOverlayBySlot
          : ensureSlotOverlay(prev, slot, { lines: ig ? [ig] : [] }),
      }));

      await saveDraft({
        ig,
        x,
        ig3,
        igCaption: ig,
        xCaption: x,
        phase: "draft",
        textOverlayBySlot: nextTextOverlayBySlot,
      } as any);

      showMsg("キャプションを生成しました");
    } catch (e: any) {
      console.error(e);
      showMsg(`文章生成に失敗しました：${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["captions"] = false;
    }
  }

  /**
   * IG3の1案をオーバーレイにだけ反映する
   *
   * 本文そのものは変えず、
   * 文字表示だけ差し替える。
   */
  async function applyIg3ToOverlayOnly(text: string) {
    const t = String(text ?? "").trim();
    if (!t) return;

    setD((prev) => ({
      ...prev,
      overlayText: t,
      textOverlayBySlot: {
        ...(prev.textOverlayBySlot ?? {}),
        [currentSlot]: {
          ...getSafeSlotOverlay(prev, currentSlot),
          lines: [t],
        },
      },
    }) as any);

    setPreviewReason("");
    setPreviewMode("base");

    const slot = currentSlot;

    await saveDraft({
      textOverlayBySlot: {
        ...(dRef.current.textOverlayBySlot ?? {}),
        [slot]: {
          ...getSafeSlotOverlay(dRef.current, slot),
          lines: t ? [t] : [],
        },
      },
      phase: "draft",
    } as any);

    showMsg("文字表示に反映しました（保存済み・本文は未変更）");
  }

  return {
    ensureSlotOverlay,
    getSafeSlotOverlay,
    generateCaptions,
    applyIg3ToOverlayOnly,
  };
}