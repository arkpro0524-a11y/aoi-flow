"use client";

import React, { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase";

type OutcomeLog = {
  id: string;
  title: string;
  status: string;
  platform: string;
  purchasePrice: number;
  listedPrice: number;
  soldPrice: number;
  shippingCost: number;
  packagingCost: number;
  platformFee: number;
  netProfit: number;
  views: number;
  likes: number;
  daysToSell: number;
  memo: string;
  failureReason: string;
  createdAt: number;
};

function yen(n: number) {
  return `${Math.round(Number(n || 0)).toLocaleString()}円`;
}

function statusLabel(v: string) {
  if (v === "watching") return "調査中";
  if (v === "purchased") return "仕入れ済み";
  if (v === "listed") return "出品中";
  if (v === "sold") return "売却済み";
  if (v === "unsold") return "売れ残り";
  if (v === "stopped") return "中止";
  return "不明";
}

export default function SellCheckOutcomesPage() {
  const [idToken, setIdToken] = useState("");
  const [logs, setLogs] = useState<OutcomeLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    status: "watching",
    platform: "mercari",
    purchasePrice: "",
    listedPrice: "",
    soldPrice: "",
    shippingCost: "",
    packagingCost: "",
    platformFee: "",
    views: "",
    likes: "",
    daysToSell: "",
    memo: "",
    failureReason: "",
  });

  const summary = useMemo(() => {
    const sold = logs.filter((x) => x.status === "sold");
    const totalProfit = sold.reduce((sum, x) => sum + Number(x.netProfit || 0), 0);
    const avgDays =
      sold.length > 0
        ? Math.round(sold.reduce((sum, x) => sum + Number(x.daysToSell || 0), 0) / sold.length)
        : 0;

    return {
      count: logs.length,
      soldCount: sold.length,
      totalProfit,
      avgDays,
    };
  }, [logs]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setIdToken("");
        return;
      }

      const token = await u.getIdToken(true).catch(() => "");
      setIdToken(token);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!idToken) return;
    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idToken]);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function loadLogs() {
    if (!idToken) return;

    try {
      const res = await fetch("/api/sell-check/outcomes", {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "実務ログの取得に失敗しました");
      }

      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "実務ログの取得に失敗しました");
    }
  }

  async function saveLog() {
    setMsg("");
    setError("");

    if (!idToken) {
      setError("ログイン確認が必要です。");
      return;
    }

    if (!form.title.trim()) {
      setError("商品名を入力してください。");
      return;
    }

    setBusy(true);

    try {
      const res = await fetch("/api/sell-check/outcomes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "実務ログの保存に失敗しました");
      }

      setMsg("実務ログを保存しました。");
      setForm({
        title: "",
        status: "watching",
        platform: "mercari",
        purchasePrice: "",
        listedPrice: "",
        soldPrice: "",
        shippingCost: "",
        packagingCost: "",
        platformFee: "",
        views: "",
        likes: "",
        daysToSell: "",
        memo: "",
        failureReason: "",
      });

      await loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "実務ログの保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="border-b border-white/10 pb-4">
        <h1 className="text-2xl font-black tracking-wide">仕入れ・売却 実務ログ</h1>
        <p className="mt-2 text-sm text-white/65">
          仕入れ価格、売却価格、送料、利益、売れるまでの日数を記録します。
          SellCheckを「診断」から「実務改善OS」に変えるための中心ログです。
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="記録件数" value={`${summary.count}件`} />
        <Card label="売却済み" value={`${summary.soldCount}件`} />
        <Card label="累計実利益" value={yen(summary.totalProfit)} />
        <Card label="平均回転日数" value={`${summary.avgDays}日`} />
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/30 p-5">
        <div className="mb-4 text-lg font-black">実務ログ入力</div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="商品名">
            <input value={form.title} onChange={(e) => update("title", e.target.value)} className="input" />
          </Field>

          <Field label="状態">
            <select value={form.status} onChange={(e) => update("status", e.target.value)} className="input">
              <option value="watching">調査中</option>
              <option value="purchased">仕入れ済み</option>
              <option value="listed">出品中</option>
              <option value="sold">売却済み</option>
              <option value="unsold">売れ残り</option>
              <option value="stopped">中止</option>
            </select>
          </Field>

          <Field label="販売先">
            <select value={form.platform} onChange={(e) => update("platform", e.target.value)} className="input">
              <option value="mercari">メルカリ</option>
              <option value="yahoo_auction">ヤフオク</option>
              <option value="jmty">ジモティー</option>
              <option value="rakuma">ラクマ</option>
              <option value="other">その他</option>
            </select>
          </Field>

          <Field label="仕入れ価格">
            <input value={form.purchasePrice} onChange={(e) => update("purchasePrice", e.target.value)} inputMode="numeric" className="input" />
          </Field>

          <Field label="出品価格">
            <input value={form.listedPrice} onChange={(e) => update("listedPrice", e.target.value)} inputMode="numeric" className="input" />
          </Field>

          <Field label="売却価格">
            <input value={form.soldPrice} onChange={(e) => update("soldPrice", e.target.value)} inputMode="numeric" className="input" />
          </Field>

          <Field label="送料">
            <input value={form.shippingCost} onChange={(e) => update("shippingCost", e.target.value)} inputMode="numeric" className="input" />
          </Field>

          <Field label="梱包費">
            <input value={form.packagingCost} onChange={(e) => update("packagingCost", e.target.value)} inputMode="numeric" className="input" />
          </Field>

          <Field label="手数料">
            <input value={form.platformFee} onChange={(e) => update("platformFee", e.target.value)} inputMode="numeric" className="input" />
          </Field>

          <Field label="閲覧数">
            <input value={form.views} onChange={(e) => update("views", e.target.value)} inputMode="numeric" className="input" />
          </Field>

          <Field label="いいね">
            <input value={form.likes} onChange={(e) => update("likes", e.target.value)} inputMode="numeric" className="input" />
          </Field>

          <Field label="売れるまでの日数">
            <input value={form.daysToSell} onChange={(e) => update("daysToSell", e.target.value)} inputMode="numeric" className="input" />
          </Field>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="メモ">
            <textarea value={form.memo} onChange={(e) => update("memo", e.target.value)} rows={3} className="input" />
          </Field>

          <Field label="失敗理由・売れ残り理由">
            <textarea value={form.failureReason} onChange={(e) => update("failureReason", e.target.value)} rows={3} className="input" />
          </Field>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
        {msg ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/75">{msg}</div> : null}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={saveLog}
            disabled={busy}
            className="rounded-2xl bg-white px-6 py-3 text-sm font-black text-black disabled:opacity-50"
          >
            {busy ? "保存中..." : "実務ログを保存"}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/30 p-5">
        <div className="mb-4 text-lg font-black">保存済みログ</div>

        {logs.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
            まだ実務ログがありません。
          </div>
        ) : (
          <div className="overflow-auto rounded-2xl border border-white/10">
            <table className="min-w-[1200px] border-collapse text-left text-xs text-white/75">
              <thead className="bg-[#10131a] text-white">
                <tr>
                  <Th>商品名</Th>
                  <Th>状態</Th>
                  <Th>販売先</Th>
                  <Th>仕入れ</Th>
                  <Th>出品</Th>
                  <Th>売却</Th>
                  <Th>送料</Th>
                  <Th>手数料</Th>
                  <Th>実利益</Th>
                  <Th>回転日数</Th>
                  <Th>メモ</Th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-white/10 odd:bg-white/[0.03]">
                    <Td>{log.title}</Td>
                    <Td>{statusLabel(log.status)}</Td>
                    <Td>{log.platform}</Td>
                    <Td>{yen(log.purchasePrice)}</Td>
                    <Td>{yen(log.listedPrice)}</Td>
                    <Td>{yen(log.soldPrice)}</Td>
                    <Td>{yen(log.shippingCost)}</Td>
                    <Td>{yen(log.platformFee)}</Td>
                    <Td>{yen(log.netProfit)}</Td>
                    <Td>{log.daysToSell}日</Td>
                    <Td>{log.memo || log.failureReason || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.45);
          padding: 0.75rem 1rem;
          color: white;
          outline: none;
        }
      `}</style>
    </div>
  );
}

function Card(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/50">{props.label}</div>
      <div className="mt-1 text-2xl font-black">{props.value}</div>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs font-bold text-white/70">
      {props.label}
      <div className="mt-1">{props.children}</div>
    </label>
  );
}

function Th(props: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap border-r border-white/10 px-3 py-3 font-black">{props.children}</th>;
}

function Td(props: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap border-r border-white/10 px-3 py-2">{props.children}</td>;
}