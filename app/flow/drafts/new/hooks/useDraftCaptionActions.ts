//app/flow/drafts/new/hooks/useDraftCaptionActions.ts
"use client";

import { auth } from "@/firebase";
import type { DraftDoc, TextOverlay } from "@/lib/types/draft";
import { splitKeywords } from "./useDraftEditorState";

/**
 * テキスト / キャプション専用 hook
 *
 * 役割
 * - IG / X / IG3 の生成
 * - 追加した販売用文章の生成・保存
 * - オーバーレイ文字への反映
 * - 下書き保存
 *
 * 方針
 * - 本文を勝手に壊さない
 * - textOverlayBySlot が無い旧データでも安全に補完する
 * - keywordsText / keywords の両方に対応する
 * - 文字オーバーレイは「今見ているスロット」に正しく入れる
 * - setD の直後に saveDraft しても値ズレしないよう dRef.current も更新する
 * - 既存機能は削除しない
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

/**
 * TextOverlay を安全に複製する
 *
 * 重要
 * - lines 配列
 * - background オブジェクト
 * を毎回 clone する
 */
function cloneOverlay(src?: TextOverlay | null): TextOverlay {
  return {
    lines: Array.isArray(src?.lines) ? [...src.lines] : [],
    fontSize: typeof src?.fontSize === "number" ? src.fontSize : 44,
    lineHeight: typeof src?.lineHeight === "number" ? src.lineHeight : 1.15,
    /**
     * 重要
     * - このプロジェクトの他UIは 0〜100 前提で扱っている
     * - ここも 50 / 80 に合わせる
     */
    x: typeof src?.x === "number" ? src.x : 50,
    y: typeof src?.y === "number" ? src.y : 80,
    color: typeof src?.color === "string" ? src.color : "#FFFFFF",
    bandOpacity: typeof src?.bandOpacity === "number" ? src.bandOpacity : 0.45,
    background: src?.background
      ? {
          enabled: !!src.background.enabled,
          padding:
            typeof src.background.padding === "number" ? src.background.padding : 18,
          color:
            typeof src.background.color === "string"
              ? src.background.color
              : "rgba(0,0,0,0.45)",
          radius:
            typeof src.background.radius === "number" ? src.background.radius : 16,
        }
      : {
          enabled: true,
          padding: 18,
          color: "rgba(0,0,0,0.45)",
          radius: 16,
        },
  };
}

/**
 * 現在スロット用の安全な初期オーバーレイ
 */
function createFallbackOverlay(): TextOverlay {
  return {
    lines: [],
    fontSize: 44,
    lineHeight: 1.15,
    x: 50,
    y: 80,
    color: "#FFFFFF",
    bandOpacity: 0.45,
    background: {
      enabled: true,
      padding: 18,
      color: "rgba(0,0,0,0.45)",
      radius: 16,
    },
  };
}

/**
 * 文字配列を安全に整える
 * - null / undefined を弾く
 * - 空文字を除外
 * - 最大件数も制限する
 */
function toSafeStringArray(value: unknown, max = 5): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

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
    const currentBase = base.textOverlayBySlot?.base;
    const currentMood = base.textOverlayBySlot?.mood;
    const currentComposite = base.textOverlayBySlot?.composite;

    const currentForSlot =
      slot === "base"
        ? currentBase
        : slot === "mood"
          ? currentMood
          : currentComposite;

    const currentCloned = cloneOverlay(currentForSlot ?? createFallbackOverlay());

    const nextForSlot: TextOverlay = {
      ...currentCloned,
      ...(patch ?? {}),
      lines:
        patch && "lines" in patch
          ? Array.isArray(patch.lines)
            ? [...patch.lines]
            : []
          : [...(currentCloned.lines ?? [])],
      background:
        patch && patch.background
          ? {
              ...(currentCloned.background ?? createFallbackOverlay().background!),
              ...patch.background,
            }
          : currentCloned.background,
    };

    return {
      base:
        slot === "base"
          ? nextForSlot
          : currentBase
            ? cloneOverlay(currentBase)
            : createFallbackOverlay(),
      mood:
        slot === "mood"
          ? nextForSlot
          : currentMood
            ? cloneOverlay(currentMood)
            : undefined,
      composite:
        slot === "composite"
          ? nextForSlot
          : currentComposite
            ? cloneOverlay(currentComposite)
            : undefined,
    };
  }

  /**
   * 指定スロットの TextOverlay を必ず1つ返す
   */
  function getSafeSlotOverlay(
    base: DraftDoc,
    slot: "base" | "mood" | "composite"
  ): TextOverlay {
    const existing = base.textOverlayBySlot?.[slot];
    if (existing) {
      return cloneOverlay(existing);
    }

    return createFallbackOverlay();
  }

  /**
   * dRef.current と setD のズレを防ぐための共通関数
   *
   * 重要
   * - 文字表示は「今入力した直後」に preview / save が走る
   * - React state だけだと非同期反映になる
   * - そのため dRef.current も同時更新する
   */
  function commitDraftPatch(patch: Partial<DraftDoc>) {
    const next = {
      ...dRef.current,
      ...patch,
    } as DraftDoc;

    dRef.current = next;
    setD(next);

    return next;
  }

  /**
   * 現在スロットにすでに文字があるかを確認
   */
  function hasOverlayTextInCurrentSlot(base: DraftDoc, slot: "base" | "mood" | "composite") {
    const overlay = base.textOverlayBySlot?.[slot];

    const linesText = Array.isArray(overlay?.lines)
      ? overlay.lines.join("\n").trim()
      : "";

    const legacyText =
      typeof (overlay as any)?.text === "string" ? String((overlay as any).text).trim() : "";

    return Boolean(linesText || legacyText);
  }

  /**
   * キャプション生成
   *
   * 注意
   * - brand / brandId の両方を吸収
   * - keywordsText / keywords の両方を吸収
   * - オーバーレイ文字が既にある場合は勝手に上書きしない
   * - 追加した販売用文章もここで受け取って保存する
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

      /**
       * 既存返り値
       */
      const ig = typeof j.instagram === "string" ? j.instagram : "";
      const x = typeof j.x === "string" ? j.x : "";
      const ig3 = Array.isArray(j.ig3) ? j.ig3.map(String).slice(0, 3) : [];

      /**
       * 追加返り値
       * - route.ts 側で増やした販売用文章をここで受ける
       * - 無い場合でも壊れないように全部安全化する
       */
      const instagramSales =
        typeof j.instagramSales === "string" ? j.instagramSales : "";
      const xSales =
        typeof j.xSales === "string" ? j.xSales : "";
      const ecTitle =
        typeof j.ecTitle === "string" ? j.ecTitle : "";
      const ecDescription =
        typeof j.ecDescription === "string" ? j.ecDescription : "";
      const ecBullets = toSafeStringArray(j.ecBullets, 5);

      const slot = currentSlot;
      const hasText = hasOverlayTextInCurrentSlot(dRef.current, slot);

      const nextTextOverlayBySlot = hasText
        ? {
            base: dRef.current.textOverlayBySlot?.base
              ? cloneOverlay(dRef.current.textOverlayBySlot.base)
              : createFallbackOverlay(),
            mood: dRef.current.textOverlayBySlot?.mood
              ? cloneOverlay(dRef.current.textOverlayBySlot.mood)
              : undefined,
            composite: dRef.current.textOverlayBySlot?.composite
              ? cloneOverlay(dRef.current.textOverlayBySlot.composite)
              : undefined,
          }
        : ensureSlotOverlay(dRef.current, slot, { lines: ig ? [ig] : [] });

      const patch: Partial<DraftDoc> = {
        ig,
        x,
        ig3,
        igCaption: ig,
        xCaption: x,

        /**
         * 追加保存項目
         */
        instagramSales,
        xSales,
        ecTitle,
        ecDescription,
        ecBullets,

        textOverlayBySlot: nextTextOverlayBySlot,
      };

      commitDraftPatch(patch);

      await saveDraft({
        ...patch,
        phase: "draft",
      } as any);

      /**
       * 重要
       * - 文字を入れたスロットに応じて previewMode を切り替える
       * - これで「文字は入っているのに見ている枠が違う」を防ぐ
       */
      if (slot === "base") {
        setPreviewMode("base");
      } else if (slot === "mood") {
        setPreviewMode("idea");
      } else {
        setPreviewMode("composite");
      }

      setPreviewReason("");
      showMsg(
        hasText
          ? "キャプションを生成しました（文字表示は既存を維持）"
          : "キャプションを生成しました"
      );
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

    const slot = currentSlot;

    const nextTextOverlayBySlot = {
      ...(dRef.current.textOverlayBySlot ?? {}),
      [slot]: {
        ...getSafeSlotOverlay(dRef.current, slot),
        lines: [t],
      },
    };

    commitDraftPatch({
      textOverlayBySlot: nextTextOverlayBySlot as any,
    });

    /**
     * 重要
     * - 今編集中のスロットへ表示を合わせる
     * - 以前の固定 base はやめる
     */
    if (slot === "base") {
      setPreviewMode("base");
    } else if (slot === "mood") {
      setPreviewMode("idea");
    } else {
      setPreviewMode("composite");
    }

    setPreviewReason("");

    await saveDraft({
      textOverlayBySlot: nextTextOverlayBySlot as any,
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