// app/flow/source-check/page.tsx
// SOURCE CHECK画面。
// 商品ではなく、出品者・出品一覧・供給源としての価値を評価します。

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/firebase";
import type { SourceCheckResult } from "@/lib/vento/marketResearch";

function scoreTone(score: number): string {
  if (score >= 72) return "border-emerald-300/40 bg-emerald-300/10 text-emerald-50";
  if (score >= 48) return "border-sky-300/40 bg-sky-300/10 text-sky-50";
  if (score >= 24) return "border-amber-300/40 bg-amber-300/10 text-amber-50";
  return "border-rose-300/40 bg-rose-300/10 text-rose-50";
}

function Section(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      <div className="mb-4">
        <div className="text-lg font-black tracking-[0.08em] text-white">{props.title}</div>
        {props.subtitle ? <div className="mt-1 text-sm leading-6 text-white/58">{props.subtitle}</div> : null}
      </div>
      {props.children}
    </section>
  );
}

function ScoreBox(props: { label: string; score: number }) {
  return (
    <div className={`rounded-2xl border p-4 ${scoreTone(Math.round((props.score / 3) * 100))}`}>
      <div className="text-xs font-black opacity-75">{props.label}</div>
      <div className="mt-2 text-3xl font-black">{props.score}/3</div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm leading-6 text-white/72">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-200/70" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function SourceCheckPage() {
  const [user, setUser] = useState<User | null>(null);
  const [sellerScreenshotNotes, setSellerScreenshotNotes] = useState("");
  const [listingText, setListingText] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<SourceCheckResult | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => setUser(nextUser ?? null));
    return () => unsub();
  }, []);

  async function analyze() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!auth.currentUser) throw new Error("ログイン状態が確認できません。再ログインしてください。");
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/source-check/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ input: { sellerScreenshotNotes, listingText, itemDescription }, save: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "SOURCE CHECKに失敗しました。");
      setResult(json.result as SourceCheckResult);
      if (json.savedId) setMessage("SOURCE CHECK結果を保存しました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "SOURCE CHECKに失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-white/12 bg-black/25 p-5 md:p-7">
        <div className="text-xs font-black tracking-[0.3em] text-cyan-100/60">AOI FLOW / SOURCE CHECK</div>
        <h1 className="mt-3 text-2xl font-black tracking-[0.1em] text-white md:text-4xl">出品者・供給源評価</h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-white/70">
          商品ではなく出品者を評価します。ジモティーやメルカリでは、単品よりも「継続仕入れできる相手」そのものに価値がある場合があります。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/flow/market-research" className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white">市場研究へ</Link>
          <Link href="/flow/trend-knowledge" className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white">TREND KNOWLEDGEへ</Link>
        </div>
      </section>

      <Section title="入力" subtitle="出品者スクショは、見えている情報をメモとして貼り付けます。出品一覧・商品説明も分けて入力します。">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <textarea value={sellerScreenshotNotes} onChange={(e) => setSellerScreenshotNotes(e.target.value)} rows={8} placeholder="出品者スクショのメモ：評価、返信、出品数、所在地、プロフィールなど" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35" />
          <textarea value={listingText} onChange={(e) => setListingText(e.target.value)} rows={8} placeholder="出品一覧：大量、同ジャンル、倉庫整理、まとめ売りなど" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35" />
          <textarea value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} rows={8} placeholder="商品説明：未使用、長期保管、郵送、値下げ、セット、一括など" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35" />
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="button" onClick={analyze} disabled={busy || !user} className="rounded-2xl bg-cyan-200 px-5 py-4 text-sm font-black text-[#0f1e30] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "評価中..." : "SOURCE CHECKを実行"}
          </button>
          {message ? <div className="rounded-2xl border border-emerald-300/35 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100">{message}</div> : null}
          {error ? <div className="rounded-2xl border border-rose-300/35 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-100">{error}</div> : null}
        </div>
      </Section>

      {result ? (
        <Section title="SOURCE CHECK結果" subtitle="各項目は0〜3点。AIの直接採点ではなく、入力特徴量からルールで判定しています。">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <ScoreBox label="repeatSupplyPotential" score={result.repeatSupplyPotential} />
            <ScoreBox label="deadStockPotential" score={result.deadStockPotential} />
            <ScoreBox label="warehousePotential" score={result.warehousePotential} />
            <ScoreBox label="bundlePotential" score={result.bundlePotential} />
            <ScoreBox label="contactValue" score={result.contactValue} />
            <ScoreBox label="negotiationPotential" score={result.negotiationPotential} />
            <ScoreBox label="shippingCompatibility" score={result.shippingCompatibility} />
            <div className={`rounded-2xl border p-4 ${scoreTone(result.totalScore)}`}>
              <div className="text-xs font-black opacity-75">totalScore</div>
              <div className="mt-2 text-3xl font-black">{result.totalScore}</div>
              <div className="mt-2 text-xs font-bold opacity-75">{result.judgement}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 text-sm font-black text-white">理由</div>
              <BulletList items={result.reasons} />
            </div>
            <div className="rounded-2xl border border-cyan-200/25 bg-cyan-200/10 p-4">
              <div className="text-xs font-black text-cyan-100/70">次の行動</div>
              <div className="mt-2 text-sm font-bold leading-7 text-white">{result.nextAction}</div>
            </div>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
