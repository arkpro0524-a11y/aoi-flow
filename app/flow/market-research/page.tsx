// app/flow/market-research/page.tsx
// 市場研究ラボ。
// 既存の TREND KNOWLEDGE / DESIGN LEARNING / MARKET THEORY / SOURCE CHECK / marketFusion は削除せず、
// 1回投入UIの結果表示として統合します。

"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { auth } from "@/firebase";
import SellCheckAdminPage from "../sell-check/admin/page";
import type { MarketResearchResult } from "@/lib/vento/marketResearch";

type AnalyzeResponse = {
  ok: boolean;
  result?: MarketResearchResult;
  error?: string;
};

type MarketInput = {
  theme: string;
  sourceText: string;
  visualNotes: string;
  productCandidates: string;
  sourceNotes: string;
  budget: number;
  imageNames: string[];
};

const INITIAL_INPUT: MarketInput = {
  theme: "",
  sourceText: "",
  visualNotes: "",
  productCandidates: "",
  sourceNotes: "",
  budget: 5000,
  imageNames: [],
};

function joinList(values: unknown, fallback = "分析後に表示します。") {
  if (Array.isArray(values)) {
    const list = values.map((v) => String(v ?? "").trim()).filter(Boolean);
    return list.length > 0 ? list.join("、") : fallback;
  }

  const text = String(values ?? "").trim();
  return text || fallback;
}

function ResultBlock(props: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/15 bg-black/20 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200/35 bg-cyan-200/10 text-sm font-black text-cyan-50">
          {props.number}
        </span>
        <h2 className="text-lg font-black tracking-[0.08em] text-white">{props.title}</h2>
      </div>
      <div className="mt-3 text-sm leading-7 text-white/72">{props.children}</div>
    </section>
  );
}

function EnginePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-black text-white/72">
      {children}
    </span>
  );
}

export default function MarketResearchPage() {
  const [input, setInput] = useState<MarketInput>(INITIAL_INPUT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MarketResearchResult | null>(null);
  const [showLearningManager, setShowLearningManager] = useState(false);

  const firstCard = result?.trendKnowledge.cards?.[0];
  const firstCandidate = result?.trendRadar.marketCandidates?.[0];

  const imageNameSummary = useMemo(() => {
    if (input.imageNames.length === 0) return "未選択";
    return input.imageNames.join("、");
  }, [input.imageNames]);

  function update<K extends keyof MarketInput>(key: K, value: MarketInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  async function analyze() {
    setBusy(true);
    setError("");

    try {
      const user = auth?.currentUser;
      const token = user ? await user.getIdToken() : "";

      const res = await fetch("/api/market-research/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          save: true,
          input,
        }),
      });

      const json = (await res.json()) as AnalyzeResponse;

      if (!res.ok || !json.ok || !json.result) {
        throw new Error(json.error || "市場研究の分析に失敗しました。");
      }

      setResult(json.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "市場研究の分析に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-white/15 bg-black/20 p-5 md:p-7">
        <div className="text-xs font-black tracking-[0.35em] text-white/55">
          AOI FLOW / MARKET RESEARCH LAB
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-[0.12em] text-white md:text-4xl">
          市場研究ラボ
        </h1>
        <p className="mt-4 max-w-5xl text-sm leading-7 text-white/70">
          Google画像検索、eBay、Pinterest、メルカリ、ジモティー、Reddit、YouTube、記事、自分のメモを
          1回だけ投入し、市場メモ・見た目の共通点・市場の仮説・仕入れ先チェック・商品候補・marketFusionを
          既存エンジンとして順番に動かします。
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <EnginePill>市場メモ</EnginePill>
          <EnginePill>見た目の共通点</EnginePill>
          <EnginePill>市場の仮説</EnginePill>
          <EnginePill>仕入れ先チェック</EnginePill>
          <EnginePill>商品候補</EnginePill>
          <EnginePill>marketFusion</EnginePill>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/15 bg-black/18 p-5 md:p-7">
        <h2 className="text-xl font-black tracking-[0.12em] text-white">
          1回だけ投入する
        </h2>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-black text-white/82">市場名・観測テーマ</span>
            <input
              value={input.theme}
              onChange={(e) => update("theme", e.target.value)}
              placeholder="例：昭和人形、ミニチュアハウス、金属ノベルティ"
              className="w-full rounded-2xl border border-white/12 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-black text-white/82">市場観測予算</span>
            <input
              value={input.budget}
              onChange={(e) => update("budget", Number(e.target.value || 0))}
              type="number"
              min={0}
              className="w-full rounded-2xl border border-white/12 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none"
            />
          </label>

          <div className="space-y-2">
            <span className="text-sm font-black text-white/82">選択中の画像</span>
            <div className="rounded-2xl border border-white/12 bg-black/20 px-4 py-3 text-sm text-white/70">
              {imageNameSummary}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-black text-white/82">市場調査テキスト</span>
            <textarea
              value={input.sourceText}
              onChange={(e) => update("sourceText", e.target.value)}
              placeholder="記事、Reddit、YouTube概要、eBay説明、商品説明、自分のメモをまとめて貼り付け"
              className="min-h-[180px] w-full rounded-2xl border border-white/12 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-black text-white/82">商品候補・仕入れ先メモ</span>
            <textarea
              value={`${input.productCandidates}${input.productCandidates && input.sourceNotes ? "\n\n" : ""}${input.sourceNotes}`}
              onChange={(e) => {
                const text = e.target.value;
                update("productCandidates", text);
                update("sourceNotes", text);
              }}
              placeholder="候補商品、購入品、ジモティー出品者、店舗在庫、倉庫整理、まとめ仕入れ可能性など"
              className="min-h-[180px] w-full rounded-2xl border border-white/12 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-black text-white/82">市場調査画像・商品画像</span>
            <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/25 bg-black/20 p-5 text-center text-sm text-white/70">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                  const names = Array.from(e.target.files || []).map((file) => file.name);
                  update("imageNames", names);
                  update("visualNotes", names.join("\n"));
                }}
                className="max-w-full text-xs text-white/72"
              />
              <p className="mt-4 leading-7">
                Google画像検索 / Pinterest / eBay / メルカリ / ジモティー / 商品一覧 / 購入商品 / 試作品
              </p>
            </div>
          </label>
        </div>

        <button
          type="button"
          onClick={() => void analyze()}
          disabled={busy}
          className="mt-5 w-full rounded-full border border-cyan-200/35 bg-cyan-200/15 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-200/22 disabled:opacity-50"
        >
          {busy ? "分析中..." : "市場研究を保存・分析する"}
        </button>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200/30 bg-rose-400/10 p-4 text-sm font-bold text-rose-50">
            {error}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="rounded-[2rem] border border-white/15 bg-black/18 p-5">
          <div className="text-xs font-black tracking-[0.28em] text-white/50">
            RESULT ORDER
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-[0.12em] text-white">
            分析結果
          </h2>
          <p className="mt-2 text-sm leading-7 text-white/62">
            Market Research DB、Learning DB、Theory DBを混在させず、結果だけを8項目で表示します。
          </p>
        </div>

        <ResultBlock number={1} title="この市場は何か">
          <p>{firstCard?.marketName || firstCandidate?.marketName || "分析後に市場候補と理由を表示します。"}</p>
          <p className="mt-2 text-white/55">{firstCard?.summary || firstCandidate?.reason || ""}</p>
        </ResultBlock>

        <ResultBlock number={2} title="国内では誰が買うか">
          {result?.domesticDemand || firstCard?.domesticDemand || "国内需要は分析後に表示します。"}
        </ResultBlock>

        <ResultBlock number={3} title="海外では誰が買うか">
          {result?.overseasDemand || firstCard?.overseasDemand || "海外需要は分析後に表示します。"}
        </ResultBlock>

        <ResultBlock number={4} title="見た目の共通点">
          <p>{joinList(result?.designLearning.commonWorldviews)}</p>
          <p className="mt-2">{joinList(result?.designLearning.designGrammar)}</p>
        </ResultBlock>

        <ResultBlock number={5} title="市場の仮説">
          <p>{result?.marketTheoryEngine.marketTheory || result?.designLearning.marketTheory || "市場仮説を表示します。"}</p>
          <p className="mt-2">
            市場形成：{result?.marketTheoryEngine.marketFormationScore ?? "未判定"} / 市場存在性：
            {result?.marketTheoryEngine.marketExistenceLevel ?? "未判定"}
          </p>
        </ResultBlock>

        <ResultBlock number={6} title="商品候補">
          <p>{result?.productSelector.summary || "商品候補は分析後に表示します。"}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {(result?.productSelector.picks || []).slice(0, 5).map((pick, index) => (
              <li key={`${pick.name}-${index}`}>
                {pick.name}：{pick.reason}
              </li>
            ))}
          </ul>
        </ResultBlock>

        <ResultBlock number={7} title="仕入れ先評価">
          <p>{result?.sourceCheck.sellerPotential || joinList(result?.sourceCheck.reasons, "仕入れ先評価を表示します。")}</p>
          <p className="mt-2">
            供給源価値：{result?.sourceCheck.supplyPotential ?? "未判定"}
          </p>
        </ResultBlock>

        <ResultBlock number={8} title="売れる診断へ送る内容">
          <p>
            {joinList(result?.sellCheckUpgradePreview.buyConditions, "市場形成、国内需要、海外需要、見た目の共通点、商品候補、仕入れ先評価を売れる診断へ渡します。")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/flow/sell-check" className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white no-underline">
              売れる診断へ送る
            </Link>
            <Link href="/flow/drafts/new" className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white no-underline">
              商品画像作成へ
            </Link>
          </div>
        </ResultBlock>
      </section>

      <section className="rounded-[2rem] border border-white/15 bg-black/18 p-5 md:p-7">
        <button
          type="button"
          onClick={() => setShowLearningManager((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-left text-sm font-black text-white"
        >
          <span>学習データ管理を市場研究ラボ内で表示</span>
          <span>{showLearningManager ? "閉じる" : "開く"}</span>
        </button>

        {showLearningManager ? (
          <div className="mt-4 rounded-2xl border border-white/12 bg-black/20 p-4">
            <SellCheckAdminPage />
          </div>
        ) : (
          <p className="mt-3 text-sm leading-7 text-white/55">
            学習データ管理は削除せず、売れる診断タブではなく市場研究ラボ内の収納式表示として扱います。
            旧URL /flow/sell-check/admin は維持しますが、表ナビには出しません。
          </p>
        )}
      </section>
    </div>
  );
}
