// app/flow/market-research/page.tsx
// 市場研究ラボ。
// 既存機能（1回投入、画像選択、分析API、8項目の分析結果、学習データ管理）は削除せず、
// 画面だけをPC向けの見やすいダッシュボード型UIへ整理します。
// 重要：存在しない画面や未接続機能をメニュー項目として追加しません。

"use client";

import React, { CSSProperties, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/firebase";
import UnifiedFlowSidebar from "@/components/UnifiedFlowSidebar";
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

type NavItem = {
  href: string;
  label: string;
  icon: string;
  active?: boolean;
};

type MetricCard = {
  icon: string;
  title: string;
  value: string;
  sub: string;
  tone: "blue" | "green" | "yellow" | "red" | "purple";
};

const INITIAL_INPUT: MarketInput = {
  theme: "",
  sourceText: "",
  visualNotes: "",
  productCandidates: "",
  sourceNotes: "",
  budget: 0,
  imageNames: [],
};

// 現在のAOI FLOWに実在する主要画面だけを表示します。
// 未接続の「AIツール」「テンプレート」「レポート専用」などは出しません。
const MAIN_NAV: NavItem[] = [
  { href: "/flow", label: "トップ", icon: "⌂" },
  { href: "/flow/market-research", label: "市場研究ラボ", icon: "⌘", active: true },
  { href: "/flow/sell-check", label: "売れる診断", icon: "◇" },
  { href: "/flow/drafts/new", label: "商品画像作成", icon: "▣" },
  { href: "/flow/library", label: "ライブラリ", icon: "▤" },
  { href: "/flow/brands", label: "設定", icon: "⚙" },
];

const TONE_STYLE: Record<MetricCard["tone"], { bg: string; glow: string; color: string }> = {
  blue: { bg: "rgba(44, 116, 255, 0.22)", glow: "rgba(44, 116, 255, 0.35)", color: "#93c5fd" },
  green: { bg: "rgba(16, 185, 129, 0.20)", glow: "rgba(16, 185, 129, 0.32)", color: "#86efac" },
  yellow: { bg: "rgba(245, 158, 11, 0.20)", glow: "rgba(245, 158, 11, 0.30)", color: "#fcd34d" },
  red: { bg: "rgba(244, 63, 94, 0.20)", glow: "rgba(244, 63, 94, 0.28)", color: "#fda4af" },
  purple: { bg: "rgba(139, 92, 246, 0.22)", glow: "rgba(139, 92, 246, 0.34)", color: "#c4b5fd" },
};

function joinList(values: unknown, fallback = "分析後に表示します。") {
  if (Array.isArray(values)) {
    const list = values.map((v) => String(v ?? "").trim()).filter(Boolean);
    return list.length > 0 ? list.join("、") : fallback;
  }

  const text = String(values ?? "").trim();
  return text || fallback;
}

function safeNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function glassStyle(extra?: CSSProperties): CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(180deg, rgba(13, 39, 59, 0.58), rgba(6, 21, 35, 0.48))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 40px rgba(0,0,0,0.20)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    ...extra,
  };
}

function inputStyle(extra?: CSSProperties): CSSProperties {
  return {
    width: "100%",
    border: "1px solid rgba(255,255,255,0.13)",
    borderRadius: 14,
    background: "rgba(4, 18, 31, 0.44)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
    padding: "12px 14px",
    fontSize: 13,
    fontWeight: 700,
    ...extra,
  };
}

function NavLink({ item }: { item: NavItem }) {
  const style: CSSProperties = item.active
    ? {
        background: "linear-gradient(135deg, rgba(45, 212, 191, 0.24), rgba(37, 99, 235, 0.20))",
        border: "1px solid rgba(94, 234, 212, 0.42)",
        boxShadow: "0 0 22px rgba(45, 212, 191, 0.18), inset 0 0 18px rgba(255,255,255,0.05)",
        color: "white",
      }
    : {
        border: "1px solid transparent",
        color: "rgba(255,255,255,0.82)",
      };

  return (
    <Link
      href={item.href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: 46,
        borderRadius: 12,
        padding: "0 14px",
        fontSize: 14,
        fontWeight: 850,
        letterSpacing: "0.02em",
        textDecoration: "none",
        ...style,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 24,
          height: 24,
          fontSize: 17,
          opacity: 0.92,
        }}
      >
        {item.icon}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

function Sidebar({ onLogout }: { onLogout: () => void }) {
  return (
    <aside
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        width: 244,
        padding: 16,
        borderRight: "1px solid rgba(255,255,255,0.10)",
        background: "linear-gradient(180deg, rgba(2, 12, 25, 0.88), rgba(3, 25, 41, 0.74))",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 22 }}>
        <img
          src="/logo-aoi-flow2.png"
          alt="AOI FLOW"
          style={{ width: 50, height: 50, borderRadius: 12, boxShadow: "0 0 22px rgba(37, 99, 235, 0.35)" }}
        />
        <div>
          <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "0.05em" }}>AOI FLOW</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.68)" }}>Caption Studio</div>
        </div>
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.09)", margin: "0 -16px 16px" }} />

      <nav style={{ display: "grid", gap: 7 }}>
        {MAIN_NAV.map((item) => <NavLink key={item.href} item={item} />)}
      </nav>

      <div style={{ marginTop: "auto", display: "grid", gap: 12 }}>
        <div style={glassStyle({ borderRadius: 14, padding: 16 })}>
          <div style={{ fontSize: 16, fontWeight: 950 }}>作業メニュー</div>
          <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.7, color: "rgba(255,255,255,0.66)" }}>
            現在は市場研究ラボです。市場入力、分析結果、学習データ管理をこの画面内で扱います。
          </p>
        </div>

        <button
          type="button"
          onClick={onLogout}
          style={{
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.88)",
            padding: "11px 12px",
            fontWeight: 850,
          }}
        >
          ログアウト
        </button>
      </div>
    </aside>
  );
}

function TopBar() {
  return (
    <header
      style={{
        display: "grid",
        gridTemplateColumns: "1fr minmax(320px, 520px) auto",
        gap: 24,
        alignItems: "center",
        minHeight: 84,
      }}
    >
      <div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)", fontWeight: 850 }}>市場研究ラボ</div>
        <h1 style={{ margin: "6px 0 0", fontSize: 28, lineHeight: 1.1, fontWeight: 950, letterSpacing: "0.04em" }}>市場研究ラボ</h1>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "rgba(255,255,255,0.70)" }}>市場観察・理論化・仕入れ判断の入口です</p>
      </div>

      <div style={{ position: "relative" }}>
        <input placeholder="市場名・キーワードを入力してください" style={inputStyle({ height: 48, paddingLeft: 22, paddingRight: 54, borderRadius: 999 })} />
        <span style={{ position: "absolute", right: 20, top: 12, fontSize: 21, color: "rgba(255,255,255,0.56)" }}>⌕</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <span style={{ fontSize: 22 }}>?</span>
        <div style={{ width: 40, height: 40, borderRadius: 999, background: "rgba(255,255,255,0.88)", color: "#123", display: "grid", placeItems: "center", fontWeight: 950 }}>A</div>
      </div>
    </header>
  );
}

function MetricCardView({ card }: { card: MetricCard }) {
  const tone = TONE_STYLE[card.tone];
  return (
    <div style={glassStyle({ borderRadius: 14, padding: 18, minHeight: 94 })}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            fontSize: 22,
            color: tone.color,
            background: tone.bg,
            boxShadow: `0 0 22px ${tone.glow}`,
          }}
        >
          {card.icon}
        </div>
        <div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", fontWeight: 850 }}>{card.title}</div>
          <div style={{ marginTop: 4, fontSize: 21, fontWeight: 950 }}>{card.value}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.58)" }}>{card.sub}</div>
        </div>
      </div>
    </div>
  );
}

function FieldCard(props: {
  icon: string;
  title: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "36px 1fr",
        gap: 12,
        alignItems: props.multiline ? "start" : "center",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        background: "rgba(4, 18, 31, 0.36)",
        padding: 10,
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          display: "grid",
          placeItems: "center",
          background: "rgba(37,99,235,0.32)",
          color: "#bfdbfe",
          fontSize: 18,
        }}
      >
        {props.icon}
      </span>
      <span style={{ display: "grid", gap: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 950 }}>{props.title}</span>
        {props.multiline ? (
          <textarea
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            placeholder={props.placeholder}
            style={inputStyle({ minHeight: 72, resize: "vertical", padding: 0, border: "none", background: "transparent" })}
          />
        ) : (
          <input
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            placeholder={props.placeholder}
            style={inputStyle({ padding: 0, border: "none", background: "transparent" })}
          />
        )}
      </span>
    </label>
  );
}

function EngineCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.035)" }}>
      <div style={{ fontSize: 14, fontWeight: 950 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.74)", lineHeight: 1.65 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.46)" }}>{sub}</div>
    </div>
  );
}

function ResultBlock(props: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section style={glassStyle({ borderRadius: 18, padding: 18 })}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 28,
            height: 28,
            display: "grid",
            placeItems: "center",
            borderRadius: 999,
            border: "1px solid rgba(125,211,252,0.36)",
            background: "rgba(14,165,233,0.14)",
            fontSize: 13,
            fontWeight: 950,
          }}
        >
          {props.number}
        </span>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 950 }}>{props.title}</h2>
      </div>
      <div style={{ marginTop: 12, color: "rgba(255,255,255,0.74)", fontSize: 13, lineHeight: 1.8 }}>{props.children}</div>
    </section>
  );
}

export default function MarketResearchPage() {
  const router = useRouter();
  const [input, setInput] = useState<MarketInput>(INITIAL_INPUT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MarketResearchResult | null>(null);
  const [marketPanel, setMarketPanel] = useState<"main" | "learning" | "results">("main");

  const firstCard = result?.trendKnowledge.cards?.[0];
  const firstCandidate = result?.trendRadar.marketCandidates?.[0];
  const marketScore = safeNumber(result?.marketTheoryEngine.marketFormationScore, 0);

  const imageNameSummary = useMemo(() => {
    if (input.imageNames.length === 0) return "未選択";
    return input.imageNames.join("、");
  }, [input.imageNames]);

  const metrics: MetricCard[] = useMemo(() => {
    const candidates = result?.trendRadar.marketCandidates?.length ?? 0;
    const picks = result?.productSelector.picks?.length ?? 0;
    const score = result?.marketTheoryEngine.marketFormationScore ?? "未判定";
    const existence = result?.marketTheoryEngine.marketExistenceLevel ?? "未判定";
    return [
      { icon: "▱", title: "市場候補", value: `${candidates}件`, sub: result ? "分析結果" : "分析前", tone: "blue" },
      { icon: "▣", title: "商品候補", value: `${picks}件`, sub: result ? "分析結果" : "分析前", tone: "green" },
      { icon: "◎", title: "市場形成", value: String(score), sub: "MARKET THEORY", tone: "yellow" },
      { icon: "◈", title: "市場存在性", value: String(existence), sub: "MARKET THEORY", tone: "purple" },
      { icon: "⇧", title: "投入画像", value: `${input.imageNames.length}件`, sub: "選択中", tone: "blue" },
      { icon: "¥", title: "観測予算", value: input.budget > 0 ? `¥${input.budget.toLocaleString("ja-JP")}` : "未入力", sub: "入力値", tone: "red" },
    ];
  }, [input.budget, input.imageNames.length, result]);

  function update<K extends keyof MarketInput>(key: K, value: MarketInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  async function logout() {
    if (auth) {
      await signOut(auth);
    }
    router.replace("/login");
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

  const engineCards = [
    {
      title: "TREND KNOWLEDGE",
      value: firstCard?.summary || firstCandidate?.reason || "市場候補、国内需要、海外需要を分析後に表示します。",
      sub: "既存：trendKnowledge / trendRadar",
    },
    {
      title: "DESIGN LEARNING",
      value: joinList(result?.designLearning.commonWorldviews, "見た目の共通点とデザイン文法を分析後に表示します。"),
      sub: "既存：designLearning",
    },
    {
      title: "MARKET THEORY",
      value: result?.marketTheoryEngine.marketTheory || result?.designLearning.marketTheory || "市場の仮説、市場形成、市場存在性を分析後に表示します。",
      sub: "既存：marketTheoryEngine",
    },
    {
      title: "SOURCE CHECK",
      value: result?.sourceCheck.sellerPotential || joinList(result?.sourceCheck.reasons, "仕入れ先評価を分析後に表示します。"),
      sub: "既存：sourceCheck",
    },
    {
      title: "PRODUCT SELECTOR",
      value: result?.productSelector.summary || "商品候補を分析後に表示します。",
      sub: "既存：productSelector",
    },
    {
      title: "MARKET FUSION",
      value: joinList(result?.sellCheckUpgradePreview.buyConditions, "売れる診断へ渡す条件を分析後に表示します。"),
      sub: "既存：sellCheckUpgradePreview / marketFusion相当",
    },
  ];

  return (
    <div style={{ minHeight: "100vh", color: "white", background: "#061523" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <img src="/flow-bg-tech1.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.82 }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(2,8,20,0.74), rgba(4,18,31,0.46), rgba(2,8,20,0.72))" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 74% 22%, rgba(45,212,191,0.16), transparent 34%)" }} />
      </div>

      <UnifiedFlowSidebar onLogout={() => void logout()} marketPanel={marketPanel} onSelectMarketPanel={setMarketPanel} />

      <main className="flowMainContent" style={{ position: "relative", zIndex: 1, marginLeft: 244, padding: "20px 28px 36px" }}>
        <TopBar />

        <section style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12, marginTop: 10 }}>
          {metrics.map((metric) => <MetricCardView key={metric.title} card={metric} />)}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1.12fr 1fr", gap: 14, marginTop: 16, alignItems: "stretch" }}>
          <div style={glassStyle({ borderRadius: 15, padding: 16 })}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>1回だけ投入する</h2>
            <p style={{ margin: "8px 0 14px", fontSize: 12, color: "rgba(255,255,255,0.66)", lineHeight: 1.6 }}>
              市場名、観測テキスト、商品候補、仕入れ先メモ、画像をまとめて投入します。
            </p>
            <div style={{ display: "grid", gap: 9 }}>
              <FieldCard icon="≋" title="市場名・観測テーマ" placeholder="例：昭和人形、ミニチュアハウス、金属ノベルティ" value={input.theme} onChange={(value) => update("theme", value)} />
              <FieldCard icon="¥" title="市場観測予算" placeholder="例：5000" value={input.budget > 0 ? String(input.budget) : ""} onChange={(value) => update("budget", Number(value || 0))} />
              <FieldCard icon="◎" title="市場調査テキスト" placeholder="記事、Reddit、YouTube概要、eBay説明、商品説明、自分のメモをまとめて貼り付け" value={input.sourceText} onChange={(value) => update("sourceText", value)} multiline />
              <FieldCard icon="▣" title="商品候補・仕入れ先メモ" placeholder="候補商品、購入品、ジモティー出品者、店舗在庫、倉庫整理、まとめ仕入れ可能性など" value={`${input.productCandidates}${input.productCandidates && input.sourceNotes ? "\n\n" : ""}${input.sourceNotes}`} onChange={(value) => { update("productCandidates", value); update("sourceNotes", value); }} multiline />
            </div>
            <button
              type="button"
              onClick={() => void analyze()}
              disabled={busy}
              style={{
                marginTop: 12,
                width: "100%",
                border: "1px solid rgba(96,165,250,0.50)",
                borderRadius: 12,
                background: busy ? "rgba(37,99,235,0.38)" : "linear-gradient(135deg,#2563eb,#1d4ed8)",
                color: "white",
                padding: "12px 16px",
                fontWeight: 950,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "分析中..." : "市場研究を保存・分析する　›"}
            </button>
            {error ? <div style={{ marginTop: 10, color: "#fecdd3", fontSize: 12, fontWeight: 850 }}>{error}</div> : null}
          </div>

          <div style={glassStyle({ borderRadius: 15, padding: 16 })}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>市場調査画像・商品画像</h2>
            <p style={{ margin: "8px 0 14px", fontSize: 12, color: "rgba(255,255,255,0.66)", lineHeight: 1.6 }}>
              画像名は分析入力に反映されます。Google画像検索 / Pinterest / eBay / メルカリ / ジモティー等の観察画像に使います。
            </p>
            <label
              style={{
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                minHeight: 176,
                borderRadius: 14,
                border: "1px dashed rgba(255,255,255,0.25)",
                background: "rgba(4,18,31,0.34)",
                cursor: "pointer",
              }}
            >
              <input
                type="file"
                multiple
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const names = Array.from(e.target.files || []).map((file) => file.name);
                  update("imageNames", names);
                  update("visualNotes", names.join("\n"));
                }}
              />
              <span style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 34 }}>♧</span>
                <span style={{ fontSize: 14, fontWeight: 900 }}>{imageNameSummary}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>クリックしてファイルを選択</span>
              </span>
            </label>
            <div style={{ marginTop: 12, border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.035)", fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.72)" }}>
              選択中の画像：{imageNameSummary}
            </div>
          </div>

        </section>

        {marketPanel !== "learning" ? (
        <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginTop: 14 }}>
          {engineCards.map((card) => <EngineCard key={card.title} title={card.title} value={card.value} sub={card.sub} />)}
        </section>
        ) : null}

        {marketPanel === "results" ? (
        <section style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          <ResultBlock number={1} title="この市場は何か">
            <p>{firstCard?.marketName || firstCandidate?.marketName || "分析後に市場候補と理由を表示します。"}</p>
            <p style={{ marginTop: 8, color: "rgba(255,255,255,0.58)" }}>{firstCard?.summary || firstCandidate?.reason || ""}</p>
          </ResultBlock>
          <ResultBlock number={2} title="国内では誰が買うか">{result?.domesticDemand || firstCard?.domesticDemand || "国内需要は分析後に表示します。"}</ResultBlock>
          <ResultBlock number={3} title="海外では誰が買うか">{result?.overseasDemand || firstCard?.overseasDemand || "海外需要は分析後に表示します。"}</ResultBlock>
          <ResultBlock number={4} title="見た目の共通点"><p>{joinList(result?.designLearning.commonWorldviews)}</p><p style={{ marginTop: 8 }}>{joinList(result?.designLearning.designGrammar)}</p></ResultBlock>
          <ResultBlock number={5} title="市場の仮説"><p>{result?.marketTheoryEngine.marketTheory || result?.designLearning.marketTheory || "市場仮説を表示します。"}</p><p style={{ marginTop: 8 }}>市場形成：{result?.marketTheoryEngine.marketFormationScore ?? "未判定"} / 市場存在性：{result?.marketTheoryEngine.marketExistenceLevel ?? "未判定"}</p></ResultBlock>
          <ResultBlock number={6} title="商品候補"><p>{result?.productSelector.summary || "商品候補は分析後に表示します。"}</p><ul style={{ marginTop: 8 }}>{(result?.productSelector.picks || []).slice(0, 5).map((pick, index) => <li key={`${pick.name}-${index}`}>{pick.name}：{pick.reason}</li>)}</ul></ResultBlock>
          <ResultBlock number={7} title="仕入れ先評価"><p>{result?.sourceCheck.sellerPotential || joinList(result?.sourceCheck.reasons, "仕入れ先評価を表示します。")}</p><p style={{ marginTop: 8 }}>供給源価値：{result?.sourceCheck.supplyPotential ?? "未判定"}</p></ResultBlock>
          <ResultBlock number={8} title="売れる診断へ送る内容"><p>{joinList(result?.sellCheckUpgradePreview.buyConditions, "市場形成、国内需要、海外需要、見た目の共通点、商品候補、仕入れ先評価を売れる診断へ渡します。")}</p><div style={{ marginTop: 12, display: "flex", gap: 10 }}><Link href="/flow/sell-check" style={{ borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)", padding: "9px 12px", fontWeight: 900, color: "white", textDecoration: "none" }}>売れる診断へ送る</Link><Link href="/flow/drafts/new" style={{ borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)", padding: "9px 12px", fontWeight: 900, color: "white", textDecoration: "none" }}>商品画像作成へ</Link></div></ResultBlock>
        </section>
        ) : null}

        {marketPanel === "learning" ? (
          <section style={glassStyle({ borderRadius: 16, padding: 16, marginTop: 16 })}>
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 950 }}>学習データ管理</h2>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "rgba(255,255,255,0.64)", lineHeight: 1.7 }}>
              既存機能は削除せず、市場研究ラボ内の収納式表示として残しています。
            </p>
            <SellCheckAdminPage />
          </section>
        ) : null}
      </main>
    </div>
  );
}
