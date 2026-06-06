// app/flow/market-research/page.tsx
// Vento 市場発見OS。
// 目的：ユーザーが迷わないように「市場候補発見 → 市場観測 → 市場理論 → 市場DB」の4工程へ整理します。
// 既存のSELL CHECK、PRODUCT SELECTOR、AOI FLOW生成機能は削除せず、最後の導線として接続します。

"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/firebase";
import type { MarketResearchInput, MarketResearchResult } from "@/lib/vento/marketResearch";

type StepKey = "discover" | "observe" | "theory" | "database";

function yen(n: number) {
  if (!Number.isFinite(n)) return "5,000円";
  return `${Math.round(n).toLocaleString()}円`;
}

function tone(score: number) {
  if (score >= 75) return "border-emerald-300/40 bg-emerald-300/12 text-emerald-50";
  if (score >= 55) return "border-sky-300/40 bg-sky-300/12 text-sky-50";
  if (score >= 35) return "border-amber-300/40 bg-amber-300/12 text-amber-50";
  return "border-rose-300/40 bg-rose-300/12 text-rose-50";
}

function judgementTone(label: string) {
  if (label === "有望") return "border-emerald-300/40 bg-emerald-300/12 text-emerald-50";
  if (label === "検証優先") return "border-sky-300/40 bg-sky-300/12 text-sky-50";
  if (label === "監視") return "border-amber-300/40 bg-amber-300/12 text-amber-50";
  if (label === "見送り") return "border-rose-300/40 bg-rose-300/12 text-rose-50";
  return "border-white/15 bg-white/5 text-white/75";
}

function Section(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      <div className="mb-4">
        <h2 className="text-lg font-black tracking-[0.08em] text-white">{props.title}</h2>
        {props.subtitle ? <p className="mt-1 text-sm leading-6 text-white/58">{props.subtitle}</p> : null}
      </div>
      {props.children}
    </section>
  );
}

function Pill(props: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black ${props.className || "border-white/15 bg-white/5 text-white/70"}`}>
      {props.children}
    </span>
  );
}

function SimpleList(props: { items: string[]; empty?: string }) {
  const items = (props.items || []).filter(Boolean);
  if (items.length === 0) return <p className="text-sm leading-6 text-white/40">{props.empty || "まだありません"}</p>;
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

function StepButton(props: { active: boolean; number: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-2xl border p-4 text-left transition ${
        props.active ? "border-cyan-200/50 bg-cyan-200/15" : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
    >
      <div className="text-xs font-black tracking-[0.18em] text-cyan-100/60">{props.number}</div>
      <div className="mt-1 text-base font-black text-white">{props.title}</div>
      <div className="mt-1 text-xs leading-5 text-white/48">{props.desc}</div>
    </button>
  );
}

function ImagePicker(props: { images: File[]; setImages: React.Dispatch<React.SetStateAction<File[]>>; previewUrls: string[] }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <label className="mb-2 block text-sm font-black text-white/75">スクショ・画像</label>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => props.setImages(Array.from(e.target.files || []))}
        className="block w-full text-xs text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-xs file:font-black file:text-black"
      />
      {props.previewUrls.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {props.previewUrls.map((url) => (
            <img key={url} src={url} alt="投入スクショ" className="h-32 w-full rounded-2xl object-cover" />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-white/15 p-5 text-sm leading-6 text-white/45">
          商品スクショ、検索結果、eBay SOLD、Google画像、SNS画面などを入れてください。
        </div>
      )}
    </div>
  );
}

function EmptyResultGuide() {
  return (
    <Section title="使い方" subtitle="最初に必要なのは、文章入力欄とスクショだけです。細かい項目入力は不要です。">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-black text-cyan-100/60">① 市場候補発見</div>
          <div className="mt-2 text-sm leading-6 text-white/70">スクショを入れて、市場候補と検索ワードを出します。</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-black text-cyan-100/60">② 市場観測</div>
          <div className="mt-2 text-sm leading-6 text-white/70">指定された検索先で追加スクショを集めます。</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-black text-cyan-100/60">③ 市場理論</div>
          <div className="mt-2 text-sm leading-6 text-white/70">市場存在性とデザイン文法を理論化します。</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-black text-cyan-100/60">④ 市場DB</div>
          <div className="mt-2 text-sm leading-6 text-white/70">理論を保存し、あとで商品探索に使います。</div>
        </div>
      </div>
    </Section>
  );
}

export default function MarketResearchPage() {
  const [user, setUser] = useState<User | null>(null);
  const [step, setStep] = useState<StepKey>("discover");
  const [memo, setMemo] = useState("");
  const [observationMemo, setObservationMemo] = useState("");
  const [budget, setBudget] = useState("5000");
  const [images, setImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [savedMeta, setSavedMeta] = useState<{ logId?: string; marketCardIds: string[]; theoryId?: string }>({ marketCardIds: [] });
  const [result, setResult] = useState<MarketResearchResult | null>(null);
  const [selectedMarketName, setSelectedMarketName] = useState("");

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
      theme: selectedMarketName,
      sourceText: [memo, observationMemo].filter(Boolean).join("\n\n--- 追加観測 ---\n"),
      visualNotes: "",
      productCandidates: "",
      sourceNotes: "",
      budget: Number(budget) || 5000,
      imageNames: images.map((file) => file.name),
    }),
    [memo, observationMemo, budget, images, selectedMarketName]
  );

  async function analyze(nextStepAfterAnalyze: StepKey) {
    setBusy(true);
    setError("");
    setSavedMessage("");
    setSavedMeta({ marketCardIds: [] });

    try {
      if (!auth.currentUser) throw new Error("ログイン状態が確認できません。再ログインしてください。");

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
      if (!res.ok || !json.ok) throw new Error(json.error || "市場調査に失敗しました。");

      const nextResult = json.result as MarketResearchResult;
      setResult(nextResult);
      const firstMarket = nextResult.trendRadar.marketCandidates[0]?.marketName || nextResult.trendKnowledge.cards[0]?.marketName || "";
      if (!selectedMarketName && firstMarket) setSelectedMarketName(firstMarket);
      setSavedMeta({
        logId: json.savedLogId,
        marketCardIds: Array.isArray(json.savedMarketCardIds) ? json.savedMarketCardIds : [],
        theoryId: json.savedTheoryId,
      });
      if (json.savedLogId) {
        setSavedMessage("分析結果を市場ログ・市場カード・市場理論として保存しました。");
      }
      setStep(nextStepAfterAnalyze);
    } catch (e) {
      setError(e instanceof Error ? e.message : "市場調査に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-white/12 bg-black/25 p-5 md:p-7">
        <div className="text-xs font-black tracking-[0.3em] text-cyan-100/60">AOI FLOW / VENTO</div>
        <h1 className="mt-3 text-2xl font-black tracking-[0.1em] text-white md:text-4xl">市場発見OS</h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-white/70">
          この画面は、スクショから市場候補を出し、追加観測し、市場理論を作り、市場DBへ保存して商品探索へ進むための作業画面です。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/flow/trend-knowledge" className="rounded-full border border-cyan-200/25 bg-cyan-200/10 px-4 py-2 text-xs font-black text-cyan-50 hover:bg-cyan-200/15">
            市場DBを見る
          </Link>
          <Link href="/flow/product-selector" className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white hover:bg-white/15">
            商品探索へ
          </Link>
          <Link href="/flow/sell-check" className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white hover:bg-white/15">
            SELL CHECKへ
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <StepButton active={step === "discover"} number="01" title="市場候補発見" desc="スクショとメモから市場候補を出す" onClick={() => setStep("discover")} />
        <StepButton active={step === "observe"} number="02" title="市場観測" desc="次に集めるスクショと検索語を見る" onClick={() => setStep("observe")} />
        <StepButton active={step === "theory"} number="03" title="市場理論" desc="市場存在性とデザイン文法を見る" onClick={() => setStep("theory")} />
        <StepButton active={step === "database"} number="04" title="市場DB" desc="保存結果と次の商品探索を見る" onClick={() => setStep("database")} />
      </div>

      {error ? <div className="rounded-2xl border border-rose-300/30 bg-rose-400/10 p-4 text-sm font-bold text-rose-50">{error}</div> : null}
      {savedMessage ? <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-50">{savedMessage}</div> : null}

      {step === "discover" ? (
        <Section title="① 市場候補発見" subtitle="ここでは細かい項目は不要です。文章入力欄とスクショだけで、市場候補・調査先・検索ワードを出します。">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-black text-white/75">メモ・URL・出品本文</label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={8}
                  placeholder="例：eBayの商品説明、メルカリ本文、ジモティー本文、気になる点、URLメモなどをそのまま貼り付け"
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35"
                />
              </div>
              <ImagePicker images={images} setImages={setImages} previewUrls={previewUrls} />
            </div>

            <aside className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <label className="mb-2 block text-sm font-black text-white/75">想定予算</label>
                <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none" />
                <p className="mt-2 text-xs leading-5 text-white/48">最後にSELL CHECKへつなぐ時の前提値：{yen(Number(budget) || 5000)}</p>
              </div>
              <button
                type="button"
                disabled={busy || !user}
                onClick={() => analyze("observe")}
                className="w-full rounded-2xl bg-cyan-100 px-5 py-4 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "市場候補を分析中..." : "市場候補を出す"}
              </button>
              {!user ? <p className="text-xs text-amber-200">ログイン確認中です。</p> : null}
            </aside>
          </div>

          {result ? (
            <div className="mt-5 rounded-3xl border border-cyan-200/20 bg-cyan-200/10 p-4">
              <div className="text-sm font-black text-cyan-50">候補市場</div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                {result.trendRadar.marketCandidates.slice(0, 3).map((market) => (
                  <button
                    key={market.marketName}
                    type="button"
                    onClick={() => {
                      setSelectedMarketName(market.marketName);
                      setStep("observe");
                    }}
                    className="rounded-2xl border border-white/10 bg-black/25 p-4 text-left hover:bg-white/10"
                  >
                    <div className="text-base font-black text-white">{market.marketName}</div>
                    <div className="mt-2 flex flex-wrap gap-2"><Pill className={tone(market.score)}>市場候補 {market.score}/100</Pill><Pill>選択して観測へ</Pill></div>
                    <p className="mt-3 text-sm leading-6 text-white/65">{market.reason}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Section>
      ) : null}

      {step === "observe" ? (
        <Section title="② 市場観測" subtitle="候補市場を決めたら、アプリが出した検索ワードで追加スクショを集めます。ここで市場の材料を増やします。">
          {!result ? (
            <div className="rounded-2xl border border-amber-200/25 bg-amber-200/10 p-4 text-sm leading-6 text-amber-50">先に①市場候補発見で分析してください。</div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <label className="mb-2 block text-sm font-black text-white/75">観測する市場</label>
                <select value={selectedMarketName} onChange={(e) => setSelectedMarketName(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none">
                  {result.trendRadar.marketCandidates.map((market) => <option key={market.marketName} value={market.marketName}>{market.marketName}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {result.trendKnowledge.observationPlans.slice(0, 3).map((plan) => (
                  <div key={plan.sourceName} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-base font-black text-white">{plan.sourceName}</div>
                    <div className="mt-1 text-xs text-white/45">目安：{plan.targetCount}件スクショ</div>
                    <div className="mt-3 flex flex-wrap gap-2">{plan.searchWords.slice(0, 5).map((word) => <Pill key={word}>{word}</Pill>)}</div>
                    <div className="mt-4 text-xs font-black text-white/45">見る項目</div>
                    <SimpleList items={plan.observationItems.slice(0, 5)} />
                  </div>
                ))}
              </div>

              <div>
                <label className="mb-2 block text-sm font-black text-white/75">追加観測メモ</label>
                <textarea
                  value={observationMemo}
                  onChange={(e) => setObservationMemo(e.target.value)}
                  rows={7}
                  placeholder="追加で集めたスクショの内容、eBay SOLD件数、Google画像で見えた共通点、Reddit/YouTubeの反応などを貼り付け"
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35"
                />
              </div>
              <ImagePicker images={images} setImages={setImages} previewUrls={previewUrls} />
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" disabled={busy || !user} onClick={() => analyze("theory")} className="rounded-2xl bg-cyan-100 px-5 py-4 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
                  {busy ? "観測データを再分析中..." : "観測データから理論を作る"}
                </button>
                <button type="button" onClick={() => setStep("theory")} className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-sm font-black text-white hover:bg-white/15">
                  今の結果で理論を見る
                </button>
              </div>
            </div>
          )}
        </Section>
      ) : null}

      {step === "theory" ? (
        <Section title="③ 市場理論" subtitle="売却履歴が少なくても、シリーズ性・物語性・海外流通・収集文化などから市場存在性を判定します。">
          {!result ? (
            <div className="rounded-2xl border border-amber-200/25 bg-amber-200/10 p-4 text-sm leading-6 text-amber-50">先に①市場候補発見で分析してください。</div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className={`rounded-2xl border p-4 ${judgementTone(result.marketTheoryEngine.marketExistence)}`}>
                  <div className="text-xs font-black opacity-70">市場存在性</div>
                  <div className="mt-2 text-3xl font-black">{result.marketTheoryEngine.marketExistence}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">Market Formation</div>
                  <div className="mt-2 text-3xl font-black text-white">{result.marketTheoryEngine.marketFormationScore}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">信頼度</div>
                  <div className="mt-2 text-3xl font-black text-white">{result.marketTheoryEngine.confidence}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-200/20 bg-cyan-200/10 p-5">
                <div className="text-xs font-black tracking-[0.16em] text-cyan-100/60">MARKET THEORY</div>
                <p className="mt-3 text-lg font-black leading-8 text-white">{result.marketTheoryEngine.marketTheory}</p>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-black text-white">スコア理由</div>
                  <SimpleList items={result.marketTheoryEngine.scoreReasons} />
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-black text-white">不足情報 / 次に確認</div>
                  <SimpleList items={[...result.marketTheoryEngine.missingInformation, ...result.marketTheoryEngine.nextHypothesisTests]} />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-black text-white">デザイン文法</div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <div><div className="text-xs font-black text-white/45">色</div><p className="text-sm leading-6 text-white/72">{result.designLearning.colorPattern}</p></div>
                  <div><div className="text-xs font-black text-white/45">形</div><p className="text-sm leading-6 text-white/72">{result.designLearning.shapePattern}</p></div>
                  <div><div className="text-xs font-black text-white/45">素材感</div><p className="text-sm leading-6 text-white/72">{result.designLearning.materialTexture}</p></div>
                  <div><div className="text-xs font-black text-white/45">世界観</div><p className="text-sm leading-6 text-white/72">{result.designLearning.worldview}</p></div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => setStep("database")} className="rounded-2xl bg-cyan-100 px-5 py-4 text-sm font-black text-slate-950">
                  市場DBで保存結果を見る
                </button>
                <Link href="/flow/trend-knowledge" className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-center text-sm font-black text-white hover:bg-white/15">
                  市場カード管理へ
                </Link>
              </div>
            </div>
          )}
        </Section>
      ) : null}

      {step === "database" ? (
        <Section title="④ 市場DB / 次の行動" subtitle="保存した市場をあとで見返し、同じ市場の商品探索へ進みます。ここがVentoの学習蓄積場所です。">
          {!result ? (
            <div className="rounded-2xl border border-amber-200/25 bg-amber-200/10 p-4 text-sm leading-6 text-amber-50">先に①市場候補発見で分析してください。</div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">保存ログ</div>
                  <div className="mt-2 break-all text-sm leading-6 text-white/70">{savedMeta.logId || "未保存"}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">市場カード</div>
                  <div className="mt-2 text-2xl font-black text-white">{savedMeta.marketCardIds.length}件</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black text-white/45">市場理論</div>
                  <div className="mt-2 break-all text-sm leading-6 text-white/70">{savedMeta.theoryId || "未保存"}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-black text-white">保存された市場</div>
                  <div className="mt-3 space-y-3">
                    {result.trendKnowledge.cards.slice(0, 4).map((card) => (
                      <div key={card.marketId} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-white">{card.marketName}</span>
                          <Pill>{card.status}</Pill>
                          <Pill className={judgementTone(card.integratedJudgement)}>統合：{card.integratedJudgement}</Pill>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-white/65">{card.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-black text-white">次に探す商品</div>
                  <div className="mt-3 space-y-3">
                    {result.productSelector.picks.slice(0, 4).map((pick) => (
                      <div key={pick.name} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-white">{pick.name}</span>
                          <Pill className={tone(pick.score)}>{pick.score}/100</Pill>
                          <Pill>{pick.action}</Pill>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-white/65">{pick.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Link href="/flow/trend-knowledge" className="rounded-2xl bg-cyan-100 px-5 py-4 text-center text-sm font-black text-slate-950">
                  市場一覧を見る
                </Link>
                <Link href="/flow/product-selector" className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-center text-sm font-black text-white hover:bg-white/15">
                  この市場の商品を探す
                </Link>
                <Link href="/flow/sell-check" className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-center text-sm font-black text-white hover:bg-white/15">
                  最後にSELL CHECKへ
                </Link>
              </div>
            </div>
          )}
        </Section>
      ) : null}

      {!result ? <EmptyResultGuide /> : null}
    </div>
  );
}
