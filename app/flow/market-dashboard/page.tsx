// app/flow/market-dashboard/page.tsx
// 市場研究ダッシュボード。
// 既存画面は削除せず、保存済み市場カードの件数・状態・上位市場だけを一覧します。

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/firebase";

type TopMarket = {
  id: string;
  marketName: string;
  status: string;
  marketFormationScore: number;
  domesticDemand: string;
  overseasDemand: string;
  updatedAt: string;
};

type Dashboard = {
  marketCardsCount: number;
  validatedCount: number;
  watchCount: number;
  passCount: number;
  topMarkets: TopMarket[];
};

const emptyDashboard: Dashboard = {
  marketCardsCount: 0,
  validatedCount: 0,
  watchCount: 0,
  passCount: 0,
  topMarkets: [],
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="text-xs font-black tracking-[0.16em] text-white/45">{label}</div>
      <div className="mt-3 text-3xl font-black text-white">{value}</div>
    </div>
  );
}

export default function MarketDashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<Dashboard>(emptyDashboard);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => setUser(nextUser ?? null));
    return () => unsub();
  }, []);

  async function loadDashboard() {
    if (!auth.currentUser) return;
    setBusy(true);
    setError("");
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/market/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "市場研究ダッシュボードを取得できませんでした。");
      setData({
        marketCardsCount: Number(json.marketCardsCount ?? 0),
        validatedCount: Number(json.validatedCount ?? 0),
        watchCount: Number(json.watchCount ?? 0),
        passCount: Number(json.passCount ?? 0),
        topMarkets: Array.isArray(json.topMarkets) ? json.topMarkets : [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "市場研究ダッシュボードを取得できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (user) void loadDashboard();
  }, [user]);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-white/12 bg-black/25 p-5 md:p-7">
        <div className="text-xs font-black tracking-[0.3em] text-cyan-100/60">AOI FLOW / MARKET DASHBOARD</div>
        <h1 className="mt-3 text-2xl font-black tracking-[0.1em] text-white md:text-4xl">市場研究ダッシュボード</h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-white/70">
          市場カード数、検証済み、監視、見送り、上位市場を一画面で確認します。
          既存SELL CHECK / PRODUCT SELECTOR / AOI FLOW生成機能は変更しません。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/flow/trend-knowledge" className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white">TREND KNOWLEDGEへ</Link>
          <Link href="/flow/market-research" className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white">市場研究へ</Link>
          <button type="button" onClick={loadDashboard} disabled={busy} className="rounded-full border border-cyan-200/30 bg-cyan-200/10 px-4 py-2 text-xs font-black text-cyan-50 disabled:opacity-50">
            {busy ? "更新中" : "再読み込み"}
          </button>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-300/35 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="marketCardsCount" value={data.marketCardsCount} />
        <StatCard label="validatedCount" value={data.validatedCount} />
        <StatCard label="watchCount" value={data.watchCount} />
        <StatCard label="passCount" value={data.passCount} />
      </div>

      <section className="rounded-3xl border border-white/10 bg-black/30 p-5">
        <div className="text-lg font-black tracking-[0.08em] text-white">topMarkets</div>
        <div className="mt-4 space-y-3">
          {data.topMarkets.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">市場カードがまだありません。</div> : null}
          {data.topMarkets.map((market) => (
            <article key={market.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xs font-black tracking-[0.16em] text-cyan-100/55">{market.status}</div>
                  <div className="mt-1 text-xl font-black text-white">{market.marketName}</div>
                </div>
                <div className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs font-black text-white/75">
                  市場形成 {market.marketFormationScore}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm leading-6 text-white/68 md:grid-cols-2">
                <div>国内：{market.domesticDemand}</div>
                <div>海外：{market.overseasDemand}</div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
