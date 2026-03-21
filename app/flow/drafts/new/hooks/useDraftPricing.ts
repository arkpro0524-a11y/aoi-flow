//app/flow/drafts/new/hooks/useDraftPricing.ts
"use client";

import { useEffect } from "react";
import { normalizePricing } from "./useDraftEditorState";
import type { PricingTable } from "./useDraftEditorState";

/**
 * pricing取得専用hook
 */

type Params = {
  setPricing: React.Dispatch<React.SetStateAction<PricingTable>>;
  setPricingBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setPricingError: React.Dispatch<React.SetStateAction<string | null>>;
  setPricingUpdatedAt: React.Dispatch<React.SetStateAction<number>>;
};

export default function useDraftPricing(params: Params) {
  const { setPricing, setPricingBusy, setPricingError, setPricingUpdatedAt } = params;

  useEffect(() => {
    async function fetchPricing() {
      setPricingBusy(true);
      setPricingError(null);

      try {
        const r = await fetch("/api/config", {
          method: "GET",
          headers: { "cache-control": "no-store" },
        });

        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || "config error");

        setPricing(normalizePricing(j));
        setPricingUpdatedAt(Date.now());
      } catch {
        setPricingError("価格取得に失敗（暫定表示）");
        setPricingUpdatedAt(Date.now());
      } finally {
        setPricingBusy(false);
      }
    }

    void fetchPricing();

    const t = setInterval(() => {
      void fetchPricing();
    }, 60_000);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void fetchPricing();
      }
    };

    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [setPricing, setPricingBusy, setPricingError, setPricingUpdatedAt]);
}