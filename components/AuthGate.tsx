// /components/AuthGate.tsx
"use client";

/**
 * AuthGate（全張り替え）
 * ─────────────────────────────────────────────
 * 目的：
 * - /flow 配下は「ログイン必須」
 * - /login は「ログイン済みなら /flow/drafts へ」
 * - auth が undefined / 初期化失敗でも “落ちない”
 * - /flow で未ログイン時に「真っ白」にならず、最小の案内を出す
 *
 * 方針：
 * - onAuthStateChanged の前に auth の存在チェック
 * - redirect 中は軽い表示を出して UX を壊さない
 * - Hooks順序は固定（useMemo は early return より前）
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { auth } from "@/firebase";

const AuthUserContext = createContext<User | null>(null);
export const useAuthUser = () => useContext(AuthUserContext);

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);

  // ready: Auth状態チェックが完了したか（画面表示していいか）
  const [ready, setReady] = useState(false);

  // redirecting: いま画面遷移をかけている最中か（“真っ白”回避用）
  const [redirecting, setRedirecting] = useState(false);

  // ✅ Hooks順序固定（useMemo は上に置く）
  const ctxValue = useMemo(() => user, [user]);

  useEffect(() => {
    // ✅ ここが一番の事故ポイント対策：
    // auth が undefined だった場合、onAuthStateChanged が落ちるので先に防ぐ
    if (!auth) {
      // “落ちない” を最優先：ログイン扱いは false のまま、readyだけ true にする
      setUser(null);
      setReady(true);
      return;
    }

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setReady(true);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!ready) return;

    const isFlow = !!pathname?.startsWith("/flow");
    const isLogin = pathname === "/login";

    // 未ログインで /flow に来た → /login
    if (!user && isFlow) {
      setRedirecting(true);
      router.replace("/login");
      return;
    }

    // ログイン済みで /login に来た → /flow/drafts
    if (user && isLogin) {
      setRedirecting(true);
      router.replace("/flow/drafts");
      return;
    }

    // どこにも飛ばさないなら解除
    setRedirecting(false);
  }, [ready, user, pathname, router]);

  // まだAuthチェックが終わっていない
  if (!ready) {
    return <div className="text-white/70">Loading...</div>;
  }

  // ✅ “真っ白” をやめる：未ログインで /flow の時は最小表示を出す
  // （この表示が出た直後に /login へ飛ぶ）
  if (!user && pathname?.startsWith("/flow")) {
    return (
      <div className="text-white/70">
        ログインが必要です。ログイン画面へ移動します…
      </div>
    );
  }

  // ✅ redirect中は軽い表示（遷移中の“無”を避ける）
  if (redirecting) {
    return <div className="text-white/70">移動中...</div>;
  }

  return <AuthUserContext.Provider value={ctxValue}>{children}</AuthUserContext.Provider>;
}