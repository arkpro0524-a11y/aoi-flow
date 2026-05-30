//app/flow/drafts/new/hooks/useDraftStaticOptimization.ts
"use client";

import type { DraftDoc, StaticImageVariant, StaticImageLog } from "@/lib/types/draft";

/**
 * 静止画最適化AI専用hook
 */

type Params = {
  idToken: string;
  dRef: React.MutableRefObject<DraftDoc>;
  staticPurpose: any;

  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;
  setStaticRecommendation: React.Dispatch<React.SetStateAction<string>>;
  setStaticVariants: React.Dispatch<React.SetStateAction<StaticImageVariant[]>>;
  setStaticBusy: React.Dispatch<React.SetStateAction<boolean>>;

  saveDraft: (partial?: Partial<DraftDoc>) => Promise<string | null>;
  showMsg: (s: string) => void;
};

export default function useDraftStaticOptimization(params: Params) {
  const {
    idToken,
    dRef,
    staticPurpose,

    setD,
    setStaticRecommendation,
    setStaticVariants,
    setStaticBusy,

    saveDraft,
    showMsg,
  } = params;

  async function generateStaticVariants() {
    if (!idToken) {
      showMsg("おすすめ生成できません：IDトークンがありません（ログイン確認中）");
      return;
    }

    setStaticBusy(true);

    try {
      const res = await fetch("/api/generate-static-variants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          vision: dRef.current.vision,
          keywords: dRef.current.keywordsText,
          purpose: staticPurpose,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showMsg(data?.error || "生成失敗");
        return;
      }

      setStaticRecommendation(data?.recommendation || "");
      setStaticVariants(Array.isArray(data?.variants) ? data.variants : []);

      setD((p) => ({
        ...p,
        imagePurpose: staticPurpose as any,
        staticImageVariants: Array.isArray(data?.variants) ? data.variants : [],
      }) as any);

      await saveDraft({
        imagePurpose: staticPurpose as any,
        staticImageVariants: Array.isArray(data?.variants) ? data.variants : [],
      } as any);
    } finally {
      setStaticBusy(false);
    }
  }

  async function selectStaticVariant(v: StaticImageVariant) {
    if (!v?.id) {
      showMsg("構図が不正です");
      return;
    }

    if (!v.prompt || !v.prompt.trim()) {
      showMsg("この構図にはプロンプトがありません");
      return;
    }

    const log: StaticImageLog = {
      purpose: staticPurpose,
      selectedVariantId: v.id,
      timestamp: Date.now(),
    };

    const nextLogs = [...(((dRef.current as any).staticImageLogs as any[]) || []), log];

    setD((prev) => ({
      ...prev,
      staticImageLogs: nextLogs,
      selectedStaticVariantId: v.id,
      selectedStaticPrompt: v.prompt,
      selectedStaticVariantTitle: v.title,
    }) as any);

    try {
      await saveDraft({
        staticImageLogs: nextLogs,
        selectedStaticVariantId: v.id,
        selectedStaticPrompt: v.prompt,
        selectedStaticVariantTitle: v.title,
      } as any);

      showMsg(`構図 ${v.id} を採用しました`);
    } catch (e: any) {
      console.error(e);
      showMsg("構図の保存に失敗しました");
    }
  }

  return {
    generateStaticVariants,
    selectStaticVariant,
  };
}