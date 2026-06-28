// /app/flow/cutout-admin/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/firebase";

type AdminEvent = {
  id: string;
  provider: string;
  engine: string;
  quality: number;
  elapsed: number;
  createdAt: string;
};

type AdminData = {
  month: string;
  usage: { count: number; limit: number; month: string };
  summary: { averageQuality: number; averageElapsed: number; totalEvents: number };
  events: AdminEvent[];
};

const emptyData: AdminData = {
  month: "",
  usage: { count: 0, limit: 0, month: "" },
  summary: { averageQuality: 0, averageElapsed: 0, totalEvents: 0 },
  events: [],
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs font-black tracking-[0.16em] text-white/45">{label}</div>
      <div className="mt-2 text-2xl font-black text-white">{value}</div>
    </div>
  );
}

export default function CutoutAdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<AdminData>(emptyData);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => setUser(nextUser ?? null));
    return () => unsub();
  }, []);

  async function load() {
    if (!auth.currentUser) return;
    setBusy(true);
    setError("");
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/cutout/admin", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "切り抜き管理情報を取得できませんでした。");
      setData({
        month: String(json.month || ""),
        usage: {
          count: Number(json.usage?.count || 0),
          limit: Number(json.usage?.limit || 0),
          month: String(json.usage?.month || ""),
        },
        summary: {
          averageQuality: Number(json.summary?.averageQuality || 0),
          averageElapsed: Number(json.summary?.averageElapsed || 0),
          totalEvents: Number(json.summary?.totalEvents || 0),
        },
        events: Array.isArray(json.events) ? json.events : [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "切り抜き管理情報を取得できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (user) void load();
  }, [user]);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-white/12 bg-black/25 p-5 md:p-7">
        <div className="text-xs font-black tracking-[0.3em] text-cyan-100/60">AOI FLOW / CUTOUT ADMIN</div>
        <h1 className="mt-3 text-2xl font-black tracking-[0.1em] text-white md:text-4xl">切り抜き管理</h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={busy || !user}
            className="rounded-full border border-cyan-200/30 bg-cyan-200/10 px-4 py-2 text-xs font-black text-cyan-50 disabled:opacity-50"
          >
            {busy ? "更新中" : "再読み込み"}
          </button>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-300/35 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Provider" value={data.events[0]?.provider || "-"} />
        <Stat label="Quality" value={data.summary.averageQuality} />
        <Stat label="Engine" value={data.events[0]?.engine || "-"} />
        <Stat label="Elapsed" value={`${data.summary.averageElapsed}ms`} />
        <Stat label="Usage" value={`${data.usage.count}/${data.usage.limit || "-"}`} />
        <Stat label="Month" value={data.month || "-"} />
      </div>

      <section className="rounded-3xl border border-white/10 bg-black/30 p-5">
        <div className="text-lg font-black tracking-[0.08em] text-white">最近の切り抜き</div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs font-black tracking-[0.16em] text-white/45">
              <tr>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Quality</th>
                <th className="px-3 py-2">Engine</th>
                <th className="px-3 py-2">Elapsed</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((event) => (
                <tr key={event.id} className="bg-white/5 text-white/78">
                  <td className="rounded-l-2xl px-3 py-3 font-bold">{event.provider}</td>
                  <td className="px-3 py-3">{event.quality}</td>
                  <td className="px-3 py-3">{event.engine}</td>
                  <td className="px-3 py-3">{event.elapsed}ms</td>
                  <td className="rounded-r-2xl px-3 py-3">{event.createdAt || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.events.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">まだ記録がありません。</div> : null}
        </div>
      </section>
    </div>
  );
}
