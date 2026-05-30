//app/flow/drafts/new/hooks/useDraftPricing.ts
"use client";

import { useEffect } from "react";
import { normalizePricing } from "./useDraftEditorState";
import type { PricingTable } from "./useDraftEditorState";

/**
 * pricing取得専用hook
 *
 * 修正内容：
 * - /api/config の連打を防ぐ
 * - 複数回マウントされても同時通信しない
 * - 一度取得した価格は一定時間キャッシュする
 * - 既存の setPricing / error / busy / updatedAt は維持
 */

type Params = {
  setPricing: React.Dispatch<React.SetStateAction<PricingTable>>;
  setPricingBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setPricingError: React.Dispatch<React.SetStateAction<string | null>>;
  setPricingUpdatedAt: React.Dispatch<React.SetStateAction<number>>;
};

/**
 * モジュール内キャッシュ
 * React の再描画・再マウントが起きても、この値は保持されます。
 */
let cachedPricing: PricingTable | null = null;
let cachedAt = 0;
let inFlight: Promise<PricingTable> | null = null;

/**
 * 価格設定は頻繁に変わらないため、5分は再取得しない
 */
const CACHE_MS = 5 * 60 * 1000;

async function fetchPricingOnce(): Promise<PricingTable> {
  const now = Date.now();

  if (cachedPricing && now - cachedAt < CACHE_MS) {
    return cachedPricing;
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    const r = await fetch("/api/config", {
      method: "GET",
      cache: "no-store",
    });

    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      throw new Error(j?.error || "config error");
    }

    const next = normalizePricing(j);

    cachedPricing = next;
    cachedAt = Date.now();

    return next;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export default function useDraftPricing(params: Params) {
  const { setPricing, setPricingBusy, setPricingError, setPricingUpdatedAt } = params;

  useEffect(() => {
    let alive = true;

    async function run() {
      setPricingBusy(true);
      setPricingError(null);

      try {
        const next = await fetchPricingOnce();

        if (!alive) return;

        setPricing(next);
        setPricingUpdatedAt(Date.now());
      } catch {
        if (!alive) return;

        setPricingError("価格取得に失敗（暫定表示）");
        setPricingUpdatedAt(Date.now());
      } finally {
        if (!alive) return;

        setPricingBusy(false);
      }
    }

    void run();

    return () => {
      alive = false;
    };
  }, [setPricing, setPricingBusy, setPricingError, setPricingUpdatedAt]);
}