// app/flow/market-research/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/firebase";
import type { MarketResearchResult, MarketResearchInput } from "@/lib/vento/marketResearch";

type TabKey = "radar" | "knowledge" | "selector" | "source" | "sell";

function yen(n: number) {
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
      title="市場調査 統合結果"
      subtitle="TREND RADAR / TREND KNOWLEDGE / PRODUCT SELECTOR / SOURCE CHECK を1回の入力でまとめて判定します。"
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-black text-white/45">INPUT CLASSIFIER</div>
          <div className="mt-2 text-2xl font-black text-white">{result.inputClass}</div>
          <div className="mt-2 text-xs leading-5 text-white/58">{result.inputClassReason}</div>
        </div>

        <div className={`rounded-2xl border p-4 ${judgementTone(top?.theoryJudgement || "弱い")}`}>
          <div className="text-xs font-black opacity-70">理論判定</div>
          <div className="mt-2 text-2xl font-black">{top?.theoryJudgement || "弱い"}</div>
          <div className="mt-2 text-xs leading-5 opacity-75">データが少なくても、理由がある市場仮説として評価します。</div>
        </div>

        <div className={`rounded-2xl border p-4 ${judgementTone(top?.dataJudgement || "弱い")}`}>
          <div className="text-xs font-black opacity-70">データ判定</div>
          <div className="mt-2 text-2xl font-black">{top?.dataJudgement || "弱い"}</div>
          <div className="mt-2 text-xs leading-5 opacity-75">売却履歴・出品数・類似データの強さです。</div>
        </div>

        <div className={`rounded-2xl border p-4 ${judgementTone(top?.integratedJudgement || "監視")}`}>
          <div className="text-xs font-black opacity-70">統合判定</div>
          <div className="mt-2 text-2xl font-black">{top?.integratedJudgement || "監視"}</div>
          <div className="mt-2 text-xs leading-5 opacity-75">理論とデータを分けたうえで、次の行動を決めます。</div>
        </div>
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
        setSavedMessage("市場調査ログとTREND KNOWLEDGEカードを保存しました。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "市場調査に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  const tabs: { key: TabKey; label: string; desc: string }[] = [
    { key: "radar", label: "TREND RADAR", desc: "市場候補を出す" },
    { key: "knowledge", label: "TREND KNOWLEDGE", desc: "理論DB化" },
    { key: "selector", label: "PRODUCT SELECTOR", desc: "商品候補を選ぶ" },
    { key: "source", label: "SOURCE CHECK", desc: "供給源を見る" },
    { key: "sell", label: "SELL CHECK接続", desc: "価格診断へ渡す" },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-white/12 bg-black/25 p-5 md:p-7">
        <div className="text-xs font-black tracking-[0.3em] text-cyan-100/60">AOI FLOW / VENTO</div>
        <h1 className="mt-3 text-2xl font-black tracking-[0.1em] text-white md:text-4xl">
          市場調査OS
        </h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-white/70">
          TREND RADARで市場候補を見つけ、TREND KNOWLEDGEで理論DB化し、
          PRODUCT SELECTORで実際の商品候補を選びます。価格・利益・回転はSELL CHECKへ渡します。
        </p>
      </section>

      <Section
        title="1. 市場調査に投入する素材"
        subtitle="スクレイピング前提ではありません。ニュース、URL、Reddit、X、YouTube、商品画像、ジモティー画像、eBay画像、検索結果スクショなどをユーザー投入で分析します。"
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-black text-white/75">観測テーマ / 気になる市場</label>
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="例：昭和企業ノベルティ、ミニチュアハウス、古いCASIO"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-white/75">記事・SNS・出品本文・URLメモ</label>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={5}
                placeholder="ニュース、Reddit、X、YouTube概要、メルカリ/ジモティー本文などを貼り付け"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-white/75">視覚メモ</label>
              <textarea
                value={visualNotes}
                onChange={(e) => setVisualNotes(e.target.value)}
                rows={3}
                placeholder="色合い、年代感、素材、ロゴ、非売品感、飾り映え、破損リスクなど"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-white/75">商品候補リスト</label>
              <textarea
                value={productCandidates}
                onChange={(e) => setProductCandidates(e.target.value)}
                rows={4}
                placeholder="画像内で気になる商品、ジモティー一覧内の商品、検索結果の商品名を1行ずつ"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-white/75">供給源メモ</label>
              <textarea
                value={sourceNotes}
                onChange={(e) => setSourceNotes(e.target.value)}
                rows={3}
                placeholder="例：倉庫整理、店舗在庫、未使用品多数、まとめ仕入れ可能、動作未確認"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex min-h-[230px] cursor-pointer items-center justify-center rounded-3xl border border-dashed border-white/20 bg-white/5 p-3 text-center text-sm text-white/60 hover:bg-white/10">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => setImages(Array.from(e.target.files ?? []).slice(0, 12))}
              />

              {previewUrls.length > 0 ? (
                <div className="w-full">
                  <div className="mb-3 text-left text-xs font-black text-white/55">投入画像：{previewUrls.length}枚</div>
                  <div className="grid grid-cols-2 gap-2">
                    {previewUrls.slice(0, 6).map((url, index) => (
                      <img key={url} src={url} alt={`市場調査画像 ${index + 1}`} className="h-24 w-full rounded-xl object-cover" />
                    ))}
                  </div>
                  {previewUrls.length > 6 ? <div className="mt-2 text-xs text-white/50">他 {previewUrls.length - 6} 枚</div> : null}
                </div>
              ) : (
                <span>
                  複数スクショ・商品画像を投入
                  <br />
                  画像名と視覚メモも市場仮説に使います
                </span>
              )}
            </label>

            <div>
              <label className="mb-1 block text-sm font-black text-white/75">現在予算</label>
              <input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                inputMode="numeric"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none"
              />
              <div className="mt-2 text-xs text-white/50">現在の市場観測予算：{yen(Number(budget) || 5000)}</div>
            </div>

            <button
              type="button"
              onClick={analyze}
              disabled={busy || !user}
              className="w-full rounded-2xl bg-white px-5 py-4 text-sm font-black tracking-[0.12em] text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "市場調査中..." : "市場調査を実行して理論DB化"}
            </button>

            {!user ? <div className="text-xs text-amber-100/80">ログイン確認中です。</div> : null}
            {error ? <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm text-rose-50">{error}</div> : null}
            {savedMessage ? <div className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm text-emerald-50">{savedMessage}</div> : null}
          </div>
        </div>
      </Section>

      {result ? <ResultHeader result={result} /> : null}

      <section className="rounded-3xl border border-white/10 bg-black/30 p-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                "rounded-2xl border px-3 py-3 text-left transition",
                tab === t.key
                  ? "border-cyan-200/50 bg-cyan-200/12 text-white"
                  : "border-white/10 bg-white/5 text-white/62 hover:bg-white/10",
              ].join(" ")}
            >
              <div className="text-sm font-black">{t.label}</div>
              <div className="mt-1 text-xs opacity-70">{t.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {!result ? (
        <Section title="2. 結果プレビュー">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm leading-7 text-white/62">
            まだ市場調査を実行していません。まずは記事・スクショ・商品候補を投入してください。
            結果は「市場候補」「理論DB」「商品候補」「供給源評価」「SELL CHECK接続」に分かれて表示されます。
          </div>
        </Section>
      ) : (
        <>
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.searchWords.map((w) => <Pill key={w}>{w}</Pill>)}
                    </div>
                    <BulletList items={m.risks} />
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {tab === "knowledge" ? (
            <Section title="TREND KNOWLEDGE" subtitle="分析結果を市場カード化し、理論・根拠・不足・次の調査を保存します。">
              <div className="space-y-3">
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      {c.nextResearch.map((w) => <Pill key={w}>{w}</Pill>)}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {tab === "selector" ? (
            <Section title="PRODUCT SELECTOR" subtitle="提出された商品画像・一覧スクショ・候補名の中から、次に調べるべき商品を選びます。">
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.sellCheckKeywords.map((w) => <Pill key={w}>{w}</Pill>)}
                    </div>
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
            <Section title="SOURCE CHECK" subtitle="商品だけでなく、出品者・供給源・倉庫整理・まとめ仕入れ可能性を見ます。">
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
                <div className="mt-4 rounded-2xl border border-cyan-200/20 bg-cyan-200/10 p-3 text-sm leading-6 text-cyan-50">
                  次の行動：{result.sourceCheck.nextAction}
                </div>
              </div>
            </Section>
          ) : null}

          {tab === "sell" ? (
            <Section title="SELL CHECK接続" subtitle="売れる診断は相場だけでなく、市場形成・シリーズ性・デザイン性も見る方向へ接続します。">
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
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}
