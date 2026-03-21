//app/flow/drafts/new/hooks/useDraftAuth.ts
"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * 認証監視専用hook
 *
 * ✅ 目的
 * - uid取得
 * - idToken取得
 * - 未ログイン時の /login 遷移
 */

type Params = {
  router: AppRouterInstance;
  uid: string | null;

  setUid: Dispatch<SetStateAction<string | null>>;
  setIdToken: Dispatch<SetStateAction<string>>;
  setLoadBusy: Dispatch<SetStateAction<boolean>>;
  setRecommendReason: Dispatch<SetStateAction<string>>;
};

export default function useDraftAuth(params: Params) {
  const { router, uid, setUid, setIdToken, setLoadBusy, setRecommendReason } = params;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        const token = await user.getIdToken().catch(() => "");
        setIdToken(token || "");
      } else {
        setUid(null);
        setIdToken("");
      }
    });

    return () => unsub();
  }, [setUid, setIdToken]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setLoadBusy(false);

      if (!u) {
        router.replace("/login");
      }
    });

    return () => unsub();
  }, [router, setUid, setLoadBusy]);

  useEffect(() => {
    let cancelled = false;

    async function loadToken() {
      try {
        const user = auth.currentUser;

        if (!user) {
          if (!cancelled) {
            setIdToken("");
            setRecommendReason("おすすめは使えません：ログイン確認中です");
          }
          return;
        }

        const token = await user.getIdToken();

        if (!cancelled) {
          setIdToken(token);
          setRecommendReason("");
        }
      } catch {
        if (!cancelled) {
          setIdToken("");
          setRecommendReason("おすすめは使えません：合言葉の取得に失敗しました");
        }
      }
    }

    void loadToken();

    return () => {
      cancelled = true;
    };
  }, [uid, setIdToken, setRecommendReason]);
}