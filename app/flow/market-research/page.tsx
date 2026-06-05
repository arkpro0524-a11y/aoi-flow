// app/flow/market-research/page.tsx
// Ventoの市場発見OS画面。
// 既存のTREND RADAR / TREND KNOWLEDGE / PRODUCT SELECTOR / SOURCE CHECK / SELL CHECK接続を残し、
// MARKET THEORY ENGINE / DESIGN LEARNING / 複数データ統合を追加しています。

"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/firebase";
import type { MarketResearchInput, MarketResearchResult } from "@/lib/vento/marketResearch";

type TabKey = "radar" | "knowledge" | "theory" | "design" | "integration" | "selector" | "source" | "sell";

function yen(n: number) {
  // 予算入力の確認用表示です。計算ロジックではなく、ユーザーが入力ミスに気づけるように円表記へ整えます。
  if (!Number.isFinite(n)) return "5,000円";
  return `${Math.round(n).toLocaleString()}円`;
}

function scoreTone(score: number) {
  if (score >= 76) return "border-emerald-300/40 bg-emerald-300/10 text-emerald-50";
  if (score >= 60) return "border-sky-300/40 bg-sky-300/10 text-sky-50";
  if (score >= 45) return "border-amber-300/40 bg-amber-300/10 text-amber-50";
  return "border-rose-300/40 bg-rose-300/10 text-rose-50";
}

function judgementTone(label: string) {
  if (label === "有望") return "border-emerald-300/40 bg-emerald-300/10 text-emerald-50";
  if (label === "検証優先") return "border-sky-300/40 bg-sky-300/10 text-sky-50";
  if (label === "監視") return "border-amber-300/40 bg-amber-300/10 text-amber-50";
  if (label === "見送り") return "border-rose-300/40 bg-rose-300/10 text-rose-50";
  return "border-white/15 bg-white/5 text-white/80";
}

function Pill(props: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black ${props.className || "border-white/15 bg-white/5 text-white/70"}`}>
      {props.children}
    </span>
  );
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

function MiniScore(props: { label: string; score: number; note?: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${scoreTone(props.score)}`}>
      <div className="text-xs font-black opacity-70">{props.label}</div>
      <div className="mt-2 text-3xl font-black">{props.score}</div>
      {props.note ? <div className="mt-2 text-xs leading-5 opacity-75">{props.note}</div> : null}
    </div>
  );
}

function ZeroThreeScore(props: { label: string; score: number }) {
  const percent = Math.round((props.score / 3) * 100);
  return <MiniScore label={`${props.label} 0〜3`} score={percent} note={`内部評価：${props.score}/3`} />;
}

function BulletList({ items }: { items: string[] }) {
  const xs = (items || []).filter(Boolean);
  if (xs.length === 0) return null;

  return (
    <ul className="mt-3 space-y-2 text-sm leading-6 text-white/72">
      {xs.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-200/70" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ResultHeader({ result }: { result: MarketResearchResult }) {
  const top = result.trendKnowledge.cards[0];

  return (
    <Section
      title="市場発見OS 統合結果"
      subtitle="商品→価格ではなく、市場候補→市場理論→デザイン文法→供給源→価格判断の順で判定します。"
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-black text-white/45">INPUT CLASSIFIER</div>
          <div className="mt-2 text-2xl font-black text-white">{result.inputClass}</div>
          <div className="mt-2 text-xs leading-5 text-white/58">{result.inputClassReason}</div>
        </div>
        <div className={`rounded-2xl border p-4 ${judgementTone(result.marketTheoryEngine.marketExistence)}`}>
          <div className="text-xs font-black opacity-70">市場存在性</div>
          <div className="mt-2 text-2xl font-black">{result.marketTheoryEngine.marketExistence}</div>
          <div className="mt-2 text-xs leading-5 opacity-75">データ不足でも理論構築で止めません。</div>
        </div>
        <div className={`rounded-2xl border p-4 ${judgementTone(top?.dataJudgement || "弱い")}`}>
          <div className="text-xs font-black opacity-70">データ判定</div>
          <div className="mt-2 text-2xl font-black">{top?.dataJudgement || "弱い"}</div>
          <div className="mt-2 text-xs leading-5 opacity-75">売却履歴・出品数の強さです。</div>
        </div>
        <MiniScore label="Design Grammar" score={Math.round((result.designScore.total / 21) * 100)} note={`${result.designScore.total}/21`} />
        <MiniScore label="Market Formation" score={result.marketTheoryEngine.marketFormationScore} note={`信頼度：${result.marketTheoryEngine.confidence}`} />
      </div>
    </Section>
  );
}

export default function MarketResearchPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<TabKey>("radar");
  const [theme, setTheme] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [visualNotes, setVisualNotes] = useState("");
  const [productCandidates, setProductCandidates] = useState("");
  const [sourceNotes, setSourceNotes] = useState("");
  const [budget, setBudget] = useState("5000");
  const [images, setImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [result, setResult] = useState<MarketResearchResult | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    const urls = images.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [images]);

  const input: MarketResearchInput = useMemo(
    () => ({
      theme,
      sourceText,
      visualNotes,
      productCandidates,
      sourceNotes,
      budget: Number(budget) || 5000,
      imageNames: images.map((file) => file.name),
    }),
    [theme, sourceText, visualNotes, productCandidates, sourceNotes, budget, images]
  );

  async function analyze() {
    setBusy(true);
    setError("");
    setSavedMessage("");

    try {
      if (!auth.currentUser) {
        throw new Error("ログイン状態が確認できません。再ログインしてください。");
      }

      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/market-research/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ input, save: true }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "市場調査に失敗しました。");
      }

      setResult(json.result);
      if (json.savedLogId) {
        setSavedMessage("市場調査ログ、TREND KNOWLEDGEカード、市場理論を保存しました。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "市場調査に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  const tabs: { key: TabKey; label: string; desc: string }[] = [
    { key: "radar", label: "TREND RADAR", desc: "市場候補" },
    { key: "knowledge", label: "TREND KNOWLEDGE", desc: "調査ガイド" },
    { key: "theory", label: "THEORY ENGINE", desc: "市場存在性" },
    { key: "design", label: "DESIGN LEARNING", desc: "市場文法" },
    { key: "integration", label: "DATA INTEGRATION", desc: "複数統合" },
    { key: "selector", label: "PRODUCT SELECTOR", desc: "商品候補" },
    { key: "source", label: "SOURCE CHECK", desc: "供給源" },
    { key: "sell", label: "SELL CHECK接続", desc: "最後の価格判断" },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-white/12 bg-black/25 p-5 md:p-7">
        <div className="text-xs font-black tracking-[0.3em] text-cyan-100/60">AOI FLOW / VENTO</div>
        <h1 className="mt-3 text-2xl font-black tracking-[0.1em] text-white md:text-4xl">市場発見OS</h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-white/70">
          Ventoは「安く買って高く売る」アプリではありません。市場を観測し、理論化し、商品と供給源を見つけ、最後にSELL CHECKで価格判断します。
        </p>

        {/* 既存の市場研究画面は置き換えず、市場研究レイヤーとして追加した管理画面への入口だけを置きます。 */}
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/flow/trend-knowledge"
            className="rounded-full border border-cyan-200/25 bg-cyan-200/10 px-4 py-2 text-xs font-black tracking-[0.08em] text-cyan-50 hover:bg-cyan-200/15"
          >
            TREND KNOWLEDGE 市場カード管理
          </Link>
          <Link
            href="/flow/source-check"
            className="rounded-full border border-emerald-200/25 bg-emerald-200/10 px-4 py-2 text-xs font-black tracking-[0.08em] text-emerald-50 hover:bg-emerald-200/15"
          >
            SOURCE CHECK 供給源評価
          </Link>
        </div>
      </section>

      <Section
        title="1. 市場調査に投入する素材"
        subtitle="画像・商品・検索結果・Google画像・eBay・SNS・YouTube・Reddit・記事・ジモティー本文などを貼り付けてください。スクレイピングではなく、ユーザー投入データを統合します。"
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-black text-white/75">観測テーマ / 気になる市場</label>
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="例：昭和婦人時計、Shoemaker's Dream、群馬厚生年金会館時計、ミニチュアハウス"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-white/75">記事・SNS・出品本文・URLメモ</label>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={5}
                placeholder="Google画像、eBay SOLD、Reddit、YouTube、メルカリ、ジモティー本文などを貼り付け"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-white/75">視覚メモ</label>
              <textarea
                value={visualNotes}
                onChange={(e) => setVisualNotes(e.target.value)}
                rows={3}
                placeholder="色、形、素材感、サイズ感、装飾、シリーズ感、世界観、物語性、写真映えなど"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-white/75">商品候補リスト</label>
              <textarea
                value={productCandidates}
                onChange={(e) => setProductCandidates(e.target.value)}
                rows={3}
                placeholder="1行に1商品。例：Shoemaker's Dream / Citizen Poppy / 記念時計 / 企業ロゴ文具"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-white/75">供給源メモ</label>
              <textarea
                value={sourceNotes}
                onChange={(e) => setSourceNotes(e.target.value)}
                rows={3}
                placeholder="倉庫整理、店舗在庫、まとめ仕入れ、返信品質、郵送対応、価格交渉余地など"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <label className="mb-1 block text-sm font-black text-white/75">想定予算</label>
              <input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                inputMode="numeric"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none"
              />
              <div className="mt-3 text-xs leading-5 text-white/50">SELL CHECK接続時の安全仕入れ判断に使う前提値です。現在の市場観測予算：{yen(Number(budget) || 5000)}</div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <label className="mb-2 block text-sm font-black text-white/75">画像メモ</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setImages(Array.from(e.target.files || []))}
                className="block w-full text-xs text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-xs file:font-black file:text-black"
              />
              {previewUrls.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {previewUrls.map((url) => (
                    <img key={url} src={url} alt="preview" className="h-20 w-full rounded-2xl object-cover" />
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-white/15 p-4 text-xs leading-5 text-white/45">画像ファイル名も分析素材として扱います。</div>
              )}
            </div>

            <button
              type="button"
              disabled={busy || !user}
              onClick={analyze}
              className="w-full rounded-2xl bg-cyan-100 px-5 py-4 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "市場を分析中..." : "市場発見OSで分析する"}
            </button>
            {!user ? <div className="text-xs text-amber-200">ログイン確認中です。</div> : null}
            {error ? <div className="rounded-2xl border border-rose-300/30 bg-rose-400/10 p-3 text-sm text-rose-50">{error}</div> : null}
            {savedMessage ? <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-3 text-sm text-emerald-50">{savedMessage}</div> : null}
          </aside>
        </div>
      </Section>

      {!result ? (
        <Section title="2. 結果プレビュー">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm leading-7 text-white/62">
            まだ市場調査を実行していません。まずは記事・スクショ・商品候補を投入してください。
            結果は「TREND RADAR」「TREND KNOWLEDGE」「MARKET THEORY ENGINE」「DESIGN LEARNING」「複数データ統合」「PRODUCT SELECTOR」「SOURCE CHECK」「SELL CHECK接続」に分かれて表示されます。
          </div>
        </Section>
      ) : (
        <>
          <ResultHeader result={result} />

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`rounded-2xl border p-3 text-left transition ${active ? "border-cyan-200/50 bg-cyan-200/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                >
                  <div className="text-xs font-black text-white">{t.label}</div>
                  <div className="mt-1 text-[11px] leading-4 text-white/45">{t.desc}</div>
                </button>
              );
            })}
          </div>

          {tab === "radar" ? (
            <Section title="TREND RADAR" subtitle="商品単体ではなく、調べるべき市場タイプを出します。">
              <div className="space-y-3">
                {result.trendRadar.marketCandidates.map((m) => (
                  <div key={m.marketName} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-black text-white">{m.marketName}</div>
                      <Pill className={scoreTone(m.score)}>市場候補 {m.score}/100</Pill>
                      <Pill className={scoreTone(m.ventoFit)}>Vento相性 {m.ventoFit}/100</Pill>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-white/70">{m.reason}</div>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                        <div className="text-xs font-black text-white/45">国内需要仮説</div>
                        <div className="mt-2 text-sm leading-6 text-white/70">{m.domesticHypothesis}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                        <div className="text-xs font-black text-white/45">海外需要仮説</div>
                        <div className="mt-2 text-sm leading-6 text-white/70">{m.overseasHypothesis}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">{m.searchWords.map((w) => <Pill key={w}>{w}</Pill>)}</div>
                    <BulletList items={m.risks} />
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {tab === "knowledge" ? (
            <Section title="TREND KNOWLEDGE" subtitle="市場候補、調査先、検索ワード、観測件数、観測項目、市場仮説を出します。">
              <div className="space-y-4">
                {result.trendKnowledge.cards.map((c) => (
                  <div key={c.marketId} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-black text-white">{c.marketName}</div>
                      <Pill>{c.status}</Pill>
                      <Pill className={judgementTone(c.theoryJudgement)}>理論：{c.theoryJudgement}</Pill>
                      <Pill className={judgementTone(c.dataJudgement)}>データ：{c.dataJudgement}</Pill>
                      <Pill className={judgementTone(c.integratedJudgement)}>統合：{c.integratedJudgement}</Pill>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <MiniScore label="市場形成" score={c.marketFormationScore} />
                      <MiniScore label="市場成長性" score={c.marketGrowthScore} />
                      <MiniScore label="Vento相性" score={c.ventoFitScore} />
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                        <div className="text-xs font-black text-white/45">理論根拠</div>
                        <BulletList items={c.theoryReasons} />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                        <div className="text-xs font-black text-white/45">不足データ</div>
                        <BulletList items={c.missingData} />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">{c.nextResearch.map((w) => <Pill key={w}>{w}</Pill>)}</div>
                  </div>
                ))}

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  {result.trendKnowledge.observationPlans.map((plan) => (
                    <div key={plan.sourceName} className="rounded-2xl border border-cyan-200/15 bg-cyan-200/10 p-4">
                      <div className="text-sm font-black text-cyan-50">{plan.sourceName}</div>
                      <div className="mt-2 text-xs leading-5 text-cyan-50/70">観測件数：{plan.targetCount}件</div>
                      <BulletList items={plan.observationItems} />
                      <div className="mt-3 flex flex-wrap gap-2">{plan.searchWords.map((w) => <Pill key={w}>{w}</Pill>)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          ) : null}

          {tab === "theory" ? (
            <Section title="MARKET THEORY ENGINE" subtitle="売却履歴が少ない時に終了せず、理論構築→仮説→追加観測→市場評価へ進めます。">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className={`rounded-2xl border p-4 ${judgementTone(result.marketTheoryEngine.marketExistence)}`}>
                  <div className="text-xs font-black opacity-70">市場存在性</div>
                  <div className="mt-2 text-2xl font-black">{result.marketTheoryEngine.marketExistence}</div>
                </div>
                <MiniScore label="市場形成スコア" score={result.marketTheoryEngine.marketFormationScore} />
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">信頼度</div>
                  <div className="mt-2 text-2xl font-black text-white">{result.marketTheoryEngine.confidence}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-7">
                <ZeroThreeScore label="seriesScore" score={result.marketTheoryEngine.seriesScore} />
                <ZeroThreeScore label="storyScore" score={result.marketTheoryEngine.storyScore} />
                <ZeroThreeScore label="overseasDistributionScore" score={result.marketTheoryEngine.overseasDistributionScore} />
                <ZeroThreeScore label="collectorScore" score={result.marketTheoryEngine.collectorScore} />
                <ZeroThreeScore label="communityScore" score={result.marketTheoryEngine.communityScore} />
                <ZeroThreeScore label="searchCultureScore" score={result.marketTheoryEngine.searchCultureScore} />
                <ZeroThreeScore label="snsScore" score={result.marketTheoryEngine.snsScore} />
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/75">{result.marketTheoryEngine.marketTheory}</div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="text-xs font-black text-white/45">スコア理由</div>
                  <BulletList items={result.marketTheoryEngine.scoreReasons} />
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="text-xs font-black text-white/45">根拠</div>
                  <BulletList items={result.marketTheoryEngine.evidence} />
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3 md:col-span-2">
                  <div className="text-xs font-black text-white/45">不足情報 / 次の仮説検証</div>
                  <BulletList items={[...result.marketTheoryEngine.missingInformation, ...result.marketTheoryEngine.nextHypothesisTests]} />
                </div>
              </div>
            </Section>
          ) : null}

          {tab === "design" ? (
            <Section title="DESIGN LEARNING / DESIGN SCORE" subtitle="単なるデザイン評価ではなく、市場の共通文法を抽出し、理論として蓄積します。">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-7">
                <ZeroThreeScore label="シリーズ性" score={result.designScore.series} />
                <ZeroThreeScore label="世界観" score={result.designScore.worldview} />
                <ZeroThreeScore label="物語性" score={result.designScore.story} />
                <ZeroThreeScore label="ディスプレイ性" score={result.designScore.display} />
                <ZeroThreeScore label="写真映え" score={result.designScore.photogenic} />
                <ZeroThreeScore label="ブランド性" score={result.designScore.brand} />
                <ZeroThreeScore label="収集文化" score={result.designScore.collectingCulture} />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">colorPattern</div>
                  <div className="mt-2 text-sm leading-6 text-white/72">{result.designLearning.colorPattern}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">shapePattern</div>
                  <div className="mt-2 text-sm leading-6 text-white/72">{result.designLearning.shapePattern}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">materialTexture</div>
                  <div className="mt-2 text-sm leading-6 text-white/72">{result.designLearning.materialTexture}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">sizeFeeling</div>
                  <div className="mt-2 text-sm leading-6 text-white/72">{result.designLearning.sizeFeeling}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">decorativeElements</div>
                  <div className="mt-2 text-sm leading-6 text-white/72">{result.designLearning.decorativeElements}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">displayValue</div>
                  <div className="mt-2 text-sm leading-6 text-white/72">{result.designLearning.displayValue}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">photoValue</div>
                  <div className="mt-2 text-sm leading-6 text-white/72">{result.designLearning.photoValue}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">worldview</div>
                  <div className="mt-2 text-sm leading-6 text-white/72">{result.designLearning.worldview}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">市場文法</div>
                  <BulletList items={result.designLearning.designGrammar} />
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">市場カード theory 保存対象</div>
                  <div className="text-sm leading-7 text-white/75">{result.designLearning.marketTheory}</div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-cyan-200/20 bg-cyan-200/10 p-4 text-sm leading-7 text-cyan-50">
                {result.designLearning.marketTheory}<br />{result.designLearning.storedTheoryNote}
              </div>
            </Section>
          ) : null}

          {tab === "integration" ? (
            <Section title="複数データ統合 / MARKET FORMATION SCORE" subtitle="AIは商品ではなく、Google画像・eBay・メルカリ・ジモティー・Reddit・YouTube・記事・SNSに共通する市場を抽出します。">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-black text-white/45">共通市場</div>
                <div className="mt-2 text-2xl font-black text-white">{result.multiDataIntegration.commonMarket}</div>
                <div className="mt-3 text-sm leading-6 text-white/70">{result.multiDataIntegration.conclusion}</div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="text-xs font-black text-white/45">統合済みソース</div>
                  <BulletList items={result.multiDataIntegration.integratedSources} />
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="text-xs font-black text-white/45">共通信号</div>
                  <BulletList items={result.multiDataIntegration.extractedCommonSignals} />
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="text-xs font-black text-white/45">不足ソース</div>
                  <BulletList items={result.multiDataIntegration.sourceGaps} />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <ZeroThreeScore label="シリーズ" score={result.marketFormation.series} />
                <ZeroThreeScore label="海外流通" score={result.marketFormation.overseasDistribution} />
                <ZeroThreeScore label="検索語" score={result.marketFormation.searchWords} />
                <ZeroThreeScore label="コミュニティ" score={result.marketFormation.community} />
                <ZeroThreeScore label="コレクター" score={result.marketFormation.collectors} />
                <ZeroThreeScore label="売買履歴" score={result.marketFormation.soldHistory} />
                <ZeroThreeScore label="SNS" score={result.marketFormation.sns} />
                <ZeroThreeScore label="YouTube" score={result.marketFormation.youtube} />
                <ZeroThreeScore label="Reddit" score={result.marketFormation.reddit} />
              </div>
            </Section>
          ) : null}

          {tab === "selector" ? (
            <Section title="PRODUCT SELECTOR" subtitle="市場を見た後に、次に調べるべき商品を選びます。価格判断はまだ最後です。">
              <div className="space-y-3">
                {result.productSelector.picks.map((p) => (
                  <div key={p.name} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-black text-white">{p.name}</div>
                      <Pill className={scoreTone(p.score)}>{p.score}/100</Pill>
                      <Pill>{p.action}</Pill>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-white/70">{p.reason}</div>
                    <BulletList items={p.checkPoints} />
                    <div className="mt-3 flex flex-wrap gap-2">{p.sellCheckKeywords.map((w) => <Pill key={w}>{w}</Pill>)}</div>
                    <Link
                      href={`/flow/sell-check?source=market-research&title=${encodeURIComponent(p.name)}&keywords=${encodeURIComponent(p.sellCheckKeywords.join(" "))}&memo=${encodeURIComponent(p.reason)}`}
                      className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-black no-underline"
                    >
                      SELL CHECKへ渡す
                    </Link>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {tab === "source" ? (
            <Section title="SOURCE CHECK" subtitle="商品ではなく、出品者・供給源・倉庫整理・まとめ仕入れ可能性を見ます。">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-lg font-black text-white">{result.sourceCheck.sourceType}</div>
                  <Pill className={scoreTone(result.sourceCheck.sourceScore)}>供給源 {result.sourceCheck.sourceScore}/100</Pill>
                  <Pill>{result.sourceCheck.sellerPotential}</Pill>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-xs font-black text-white/45">強み</div>
                    <BulletList items={result.sourceCheck.reasons} />
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-xs font-black text-white/45">リスク</div>
                    <BulletList items={result.sourceCheck.risks} />
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-cyan-200/20 bg-cyan-200/10 p-3 text-sm leading-6 text-cyan-50">次の行動：{result.sourceCheck.nextAction}</div>
              </div>
            </Section>
          ) : null}

          {tab === "sell" ? (
            <Section title="SELL CHECK接続" subtitle="SELL CHECKは市場発見機能ではなく、最後の価格判断です。市場形成・デザイン・供給源も加味します。">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                <MiniScore label="Series Score" score={result.sellCheckUpgradePreview.seriesScore} />
                <MiniScore label="Design Score" score={result.sellCheckUpgradePreview.designScore} />
                <MiniScore label="Display Score" score={result.sellCheckUpgradePreview.displayScore} />
                <MiniScore label="Market Formation" score={result.sellCheckUpgradePreview.marketFormationScore} />
                <MiniScore label="Monopoly" score={result.sellCheckUpgradePreview.monopolyScore} />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className={`rounded-2xl border p-4 ${judgementTone(result.sellCheckUpgradePreview.theoryJudgement)}`}>
                  <div className="text-xs font-black opacity-70">理論判定</div>
                  <div className="mt-2 text-2xl font-black">{result.sellCheckUpgradePreview.theoryJudgement}</div>
                </div>
                <div className={`rounded-2xl border p-4 ${judgementTone(result.sellCheckUpgradePreview.dataJudgement)}`}>
                  <div className="text-xs font-black opacity-70">データ判定</div>
                  <div className="mt-2 text-2xl font-black">{result.sellCheckUpgradePreview.dataJudgement}</div>
                </div>
                <div className={`rounded-2xl border p-4 ${judgementTone(result.sellCheckUpgradePreview.integratedJudgement)}`}>
                  <div className="text-xs font-black opacity-70">統合判定</div>
                  <div className="mt-2 text-2xl font-black">{result.sellCheckUpgradePreview.integratedJudgement}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-white/70"><b className="text-white">即売価格帯</b><br />{result.sellCheckUpgradePreview.quickSalePriceBand}</div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-white/70"><b className="text-white">回転価格帯</b><br />{result.sellCheckUpgradePreview.rotationPriceBand}</div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-white/70"><b className="text-white">標準価格帯</b><br />{result.sellCheckUpgradePreview.standardPriceBand}</div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-white/70"><b className="text-white">高値待ち</b><br />{result.sellCheckUpgradePreview.highWaitPriceBand}</div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-white/70"><b className="text-white">コレクター価格</b><br />{result.sellCheckUpgradePreview.collectorPriceBand}</div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4">
                  <div className="text-xs font-black text-rose-50/70">見送り条件</div>
                  <BulletList items={result.sellCheckUpgradePreview.passConditions} />
                </div>
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
                  <div className="text-xs font-black text-emerald-50/70">購入条件</div>
                  <BulletList items={result.sellCheckUpgradePreview.buyConditions} />
                </div>
              </div>
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}
