// /app/flow/product-selector/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { auth } from "@/firebase";
import {
  evaluateProductCandidate,
  type ProductSelectorAxis,
  type ProductSelectorGenreCandidate,
  type ProductSelectorInput,
  type ProductSelectorResult,
} from "@/lib/productSelector/scoring";
import type { ProductSelectorAiResult, ProductSelectorAnalyzeResponse } from "@/lib/productSelector/aiTheory";

/**
 * PRODUCT SELECTOR
 *
 * この画面の役割
 * - 商品の値段を出す画面ではありません。
 * - ニュース、SNS、画像、記事、広告、店舗写真、スクショなどから、
 *   「今どんな文化・空気・時代感が再発生しているか」を整理します。
 * - 触るべきジャンル候補を抽出し、個別商品の価格判断はSELL CHECKへ渡します。
 *
 * 重要
 * - 自動購入AIではありません。
 * - 転売BOTではありません。
 * - 単純な相場検索ツールではありません。
 */

function formatYen(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "未設定";
  return `${Math.round(n).toLocaleString()}円`;
}

function scoreTone(score: number): string {
  if (score >= 76) return "border-emerald-300/35 bg-emerald-300/10 text-emerald-50";
  if (score >= 60) return "border-sky-300/35 bg-sky-300/10 text-sky-50";
  if (score >= 45) return "border-amber-300/35 bg-amber-300/10 text-amber-50";
  return "border-rose-300/35 bg-rose-300/10 text-rose-50";
}

function decisionTone(decision: ProductSelectorResult["decision"]): string {
  if (decision === "touch_now") return "border-emerald-300/40 bg-emerald-300/12 text-emerald-50";
  if (decision === "research_first") return "border-sky-300/40 bg-sky-300/12 text-sky-50";
  if (decision === "watch_only") return "border-amber-300/40 bg-amber-300/12 text-amber-50";
  return "border-rose-300/40 bg-rose-300/12 text-rose-50";
}


function uniqKeepOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of values) {
    const value = String(raw || "").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }

  return out;
}

function guessSellCheckCategory(text: string): string {
  const lower = text.toLowerCase();

  if (/(sony|casio|家電|ガジェット|カメラ|ラジオ|オーディオ|電子|電卓|walkman|ウォークマン)/i.test(lower)) {
    return "electronics";
  }

  if (/(服|バッグ|時計|靴|アクセサリー|fashion|ファッション)/i.test(lower)) {
    return "fashion";
  }

  if (/(椅子|机|収納|照明|インテリア|家具|雑貨|道具|工具)/i.test(lower)) {
    return "interior";
  }

  if (/(玩具|ホビー|ミニカー|ソフビ|フィギュア|ピンバッジ|缶バッジ|vhs|カセット|昭和|平成|アニメ|キャラクター)/i.test(lower)) {
    return "hobby";
  }

  return "other";
}

function buildSellCheckHref(args: {
  input: ProductSelectorInput;
  candidate?: ProductSelectorGenreCandidate;
  searchKeywords?: string[];
}): string {
  const { input, candidate, searchKeywords = [] } = args;

  const title = String(candidate?.name || input.candidateHint || input.name || "").trim();
  const keywords = uniqKeepOrder([
    ...(candidate?.searchWords || []),
    ...searchKeywords,
    input.keywords || "",
    input.name || "",
    input.candidateHint || "",
  ]).join(" ");

  const memoParts = [
    candidate?.reason ? `PRODUCT SELECTOR候補理由：${candidate.reason}` : "",
    input.sourceText ? `観測テキスト：${input.sourceText}` : "",
    input.visualNotes ? `視覚メモ：${input.visualNotes}` : "",
    input.memo ? `メモ：${input.memo}` : "",
  ].filter(Boolean);

  const combinedText = [title, keywords, input.sourceTypes, input.sourceText, input.visualNotes].join(" ");
  const params = new URLSearchParams();
  params.set("source", "product-selector");
  if (title) params.set("title", title);
  if (keywords) params.set("keywords", keywords);
  if (memoParts.length > 0) params.set("memo", memoParts.join("\n"));
  params.set("category", input.category || guessSellCheckCategory(combinedText));

  return `/flow/sell-check?${params.toString()}`;
}

function isAiResult(result: ProductSelectorResult): result is ProductSelectorAiResult {
  return "analysisMode" in result && result.analysisMode === "ai_theory";
}

function hasObservationInput(input: ProductSelectorInput): boolean {
  return [
    input.name,
    input.sourceTypes,
    input.sourceText,
    input.visualNotes,
    input.candidateHint,
    input.category,
    input.keywords,
    input.memo,
  ].some((value) => String(value || "").trim().length > 0) || Number(input.budget || 0) > 0;
}

function appendLine(current: string | undefined, addition: string | undefined): string {
  const base = String(current || "").trim();
  const next = String(addition || "").trim();

  if (!next) return base;
  if (!base) return next;
  if (base.includes(next)) return base;

  return `${base}
${next}`;
}

function mergeWords(current: string | undefined, additions: string[] | undefined): string {
  return uniqKeepOrder([
    ...String(current || "").split(/[\s,、]+/).filter(Boolean),
    ...(additions || []).map((word) => String(word || "").trim()).filter(Boolean),
  ]).join(" ");
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.startsWith("data:image/")) {
        reject(new Error("画像ファイルを読み込めませんでした。"));
        return;
      }
      resolve(result);
    };

    reader.onerror = () => reject(new Error("画像ファイルの読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

type ProductSelectorImageExtractResult = {
  observationTheme: string;
  sourceText: string;
  visualNotes: string;
  candidateHint: string;
  category: string;
  keywords: string[];
  memo: string;
};

type ProductSelectorImageExtractResponse = {
  ok: boolean;
  result?: ProductSelectorImageExtractResult;
  error?: string;
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-white/82">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs font-bold text-white/45">{hint}</span> : null}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-white/28 focus:border-cyan-200/45"
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 5,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold leading-7 text-white outline-none transition placeholder:text-white/28 focus:border-cyan-200/45"
    />
  );
}

function AxisBar({ axis }: { axis: ProductSelectorAxis }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-black text-white">{axis.label}</div>
        <div className={`rounded-full border px-3 py-1 text-xs font-black ${scoreTone(axis.score)}`}>
          {axis.score}/100
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-200/80 to-emerald-200/80"
          style={{ width: `${Math.max(4, Math.min(100, axis.score))}%` }}
        />
      </div>

      <p className="mt-3 text-xs font-bold leading-6 text-white/60">{axis.reason}</p>
    </div>
  );
}

function RadarLikeChart({ axes }: { axes: ProductSelectorAxis[] }) {
  const points = useMemo(() => {
    const cx = 110;
    const cy = 110;
    const maxR = 84;
    const count = Math.max(1, axes.length);

    return axes
      .map((axis, i) => {
        const angle = -Math.PI / 2 + (Math.PI * 2 * i) / count;
        const r = (axis.score / 100) * maxR;
        return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
      })
      .join(" ");
  }, [axes]);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-3 text-sm font-black text-white">文化・空気・市場文脈バランス</div>

      <div className="grid gap-4 md:grid-cols-[240px_1fr] md:items-center">
        <svg viewBox="0 0 220 220" className="mx-auto h-56 w-56">
          {[28, 56, 84].map((r) => (
            <circle
              key={r}
              cx="110"
              cy="110"
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.13)"
              strokeWidth="1"
            />
          ))}

          {axes.map((axis, i) => {
            const angle = -Math.PI / 2 + (Math.PI * 2 * i) / axes.length;
            const x = 110 + Math.cos(angle) * 96;
            const y = 110 + Math.sin(angle) * 96;
            const lineX = 110 + Math.cos(angle) * 84;
            const lineY = 110 + Math.sin(angle) * 84;

            return (
              <g key={axis.key}>
                <line
                  x1="110"
                  y1="110"
                  x2={lineX}
                  y2={lineY}
                  stroke="rgba(255,255,255,0.13)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(255,255,255,0.78)"
                  fontSize="8.5"
                  fontWeight="800"
                >
                  {axis.label.replace("市場兆候", "兆候").replace("小資本適性", "小資本")}
                </text>
              </g>
            );
          })}

          <polygon
            points={points}
            fill="rgba(125,255,220,0.18)"
            stroke="rgba(125,255,220,0.85)"
            strokeWidth="2"
          />
          <circle cx="110" cy="110" r="3" fill="rgba(255,255,255,0.72)" />
        </svg>

        <div className="grid gap-3 sm:grid-cols-2">
          {axes.map((axis) => (
            <div key={axis.key} className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-white/70">{axis.label}</span>
                <span className="text-xs font-black text-white">{axis.score}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-white/70"
                  style={{ width: `${Math.max(4, Math.min(100, axis.score))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GenreCandidateCard({
  candidate,
  input,
  searchKeywords,
}: {
  candidate: ProductSelectorGenreCandidate;
  input: ProductSelectorInput;
  searchKeywords: string[];
}) {
  return (
    <div className="rounded-3xl border border-cyan-200/15 bg-cyan-200/[0.06] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black text-cyan-50/55">触るべきジャンル候補</div>
          <h3 className="mt-2 text-lg font-black text-white">{candidate.name}</h3>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-black ${scoreTone(candidate.score)}`}>
          {candidate.score}
        </div>
      </div>

      <p className="mt-3 text-sm font-bold leading-7 text-white/68">{candidate.reason}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {candidate.searchWords.map((word) => (
          <span
            key={word}
            className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs font-black text-white/70"
          >
            {word}
          </span>
        ))}
      </div>

      <Link
        href={buildSellCheckHref({ input, candidate, searchKeywords })}
        className="mt-4 inline-flex rounded-full border border-cyan-200/25 bg-cyan-200/10 px-4 py-2 text-xs font-black text-cyan-50 no-underline transition hover:bg-cyan-200/15"
      >
        この候補をSELL CHECKへ渡す
      </Link>
    </div>
  );
}

function ResultPanel({ result, input, hasInput }: { result: ProductSelectorResult; input: ProductSelectorInput; hasInput: boolean }) {
  if (!hasInput) {
    return (
      <section className="space-y-5">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="text-xs font-black uppercase tracking-[0.28em] text-white/45">
            PRODUCT SELECTOR / EMPTY OBSERVATION
          </div>
          <h2 className="mt-3 text-2xl font-black text-white">観測素材を入力してください</h2>
          <p className="mt-3 text-sm font-bold leading-7 text-white/60">
            観測素材を入力すると、ここに文化・空気・時代感の分析結果が表示されます。
            デフォルトの候補やテンプレートは置かず、ユーザー自身の観測を起点にします。
          </p>
          <div className="mt-5 grid gap-3 text-sm font-bold text-white/58 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">ニュース・SNS・記事</div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">画像・スクショ・店舗写真</div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">気になった空気・質感・時代感</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className={`rounded-3xl border p-5 shadow-2xl ${decisionTone(result.decision)}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.28em] text-white/55">
              PRODUCT SELECTOR / CONTEXT OS
            </div>
            <h2 className="mt-2 text-2xl font-black text-white md:text-3xl">{result.decisionLabel}</h2>
            <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-white/70">
              {result.decisionSummary}
            </p>
          </div>

          <div className="rounded-3xl border border-white/15 bg-black/25 px-5 py-4 text-center">
            <div className="text-xs font-black text-white/50">文脈選定スコア</div>
            <div className="mt-1 text-4xl font-black text-white">{result.totalScore}</div>
            <div className="text-xs font-black text-white/50">/ 100</div>
          </div>
        </div>
      </div>

      {isAiResult(result) ? (
        <div className="rounded-3xl border border-cyan-200/20 bg-cyan-200/[0.06] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.25em] text-cyan-50/55">
                AI THEORY LAYER
              </div>
              <h3 className="mt-2 text-lg font-black text-white">AI抽出 + アプリ固定判定</h3>
              <p className="mt-2 text-sm font-bold leading-7 text-white/68">
                {result.observationSummary}
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs font-black text-white/60">
              {result.theoryVersion}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-black text-white/50">なぜ今見るのか</div>
              <p className="mt-2 text-sm font-bold leading-7 text-white/72">{result.whyNow}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-black text-white/50">まだ触らない理由</div>
              <p className="mt-2 text-sm font-bold leading-7 text-white/72">{result.notYetReason}</p>
            </div>
          </div>

          {result.evidence.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-black text-white/50">観測根拠</div>
              <div className="mt-3 grid gap-2">
                {result.evidence.map((item) => (
                  <div key={`${item.label}-${item.evidence}`} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-black text-white">{item.label}</span>
                      <span className="text-xs font-black text-white/45">信頼 {item.confidence}/100</span>
                    </div>
                    <p className="mt-2 text-xs font-bold leading-6 text-white/62">{item.evidence}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {result.aiWarnings.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-200/15 bg-amber-200/[0.06] p-4">
              <div className="text-xs font-black text-amber-50/70">AI注意</div>
              <ul className="mt-2 space-y-1 text-xs font-bold leading-6 text-white/68">
                {result.aiWarnings.map((warning) => (
                  <li key={warning}>・{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
          <div className="text-xs font-black text-white/50">需要層</div>
          <div className="mt-2 text-lg font-black text-white">{result.demandLayer}</div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
          <div className="text-xs font-black text-white/50">検知した空気</div>
          <div className="mt-2 text-lg font-black leading-7 text-white">{result.atmosphereSummary}</div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
          <div className="text-xs font-black text-white/50">現在予算</div>
          <div className="mt-2 text-lg font-black text-white">{formatYen(input.budget)}</div>
          <Link
            href={buildSellCheckHref({ input, searchKeywords: result.searchKeywords })}
            className="mt-3 inline-flex rounded-full border border-cyan-200/25 bg-cyan-200/10 px-4 py-2 text-xs font-black text-cyan-50 no-underline"
          >
            個別商品はSELL CHECKへ
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
        <h3 className="text-lg font-black text-white">今後触るべきジャンル候補</h3>
        <p className="mt-2 text-sm font-bold leading-7 text-white/55">
          ここは相場価格ではありません。ニュース・SNS・画像・記事から見える文化文脈をもとに、
          次に観測/仕入れ検討するジャンルを出しています。
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {result.genreCandidates.map((candidate) => (
            <GenreCandidateCard
              key={candidate.name}
              candidate={candidate}
              input={input}
              searchKeywords={result.searchKeywords}
            />
          ))}
        </div>
      </div>

      <RadarLikeChart axes={result.axes} />

      <div className="grid gap-4 md:grid-cols-2">
        {result.axes.map((axis) => (
          <AxisBar key={axis.key} axis={axis} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-emerald-200/15 bg-emerald-200/[0.06] p-5">
          <h3 className="text-lg font-black text-white">文脈上の強み</h3>
          <ul className="mt-4 space-y-2 text-sm font-bold leading-7 text-white/72">
            {result.strengths.map((x) => (
              <li key={x}>・{x}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-3xl border border-amber-200/15 bg-amber-200/[0.06] p-5">
          <h3 className="text-lg font-black text-white">観測リスク・確認点</h3>
          <ul className="mt-4 space-y-2 text-sm font-bold leading-7 text-white/72">
            {result.risks.map((x) => (
              <li key={x}>・{x}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
          <h3 className="text-lg font-black text-white">次にやること</h3>
          <ul className="mt-4 space-y-2 text-sm font-bold leading-7 text-white/72">
            {result.nextActions.map((x) => (
              <li key={x}>・{x}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
          <h3 className="text-lg font-black text-white">SELL CHECKへの接続</h3>
          <ul className="mt-4 space-y-2 text-sm font-bold leading-7 text-white/72">
            {result.sellCheckBridge.map((x) => (
              <li key={x}>・{x}</li>
            ))}
          </ul>
          <p className="mt-4 rounded-2xl border border-cyan-200/15 bg-cyan-200/[0.06] p-3 text-xs font-bold leading-6 text-cyan-50/72">
            ジャンル候補カードの「SELL CHECKへ渡す」を押すと、商品名・キーワード・観測メモを個別診断へ引き継ぎます。
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
        <h3 className="text-lg font-black text-white">観測・検索ワード</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {result.searchKeywords.map((x) => (
            <span
              key={x}
              className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs font-black text-white/75"
            >
              {x}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function ProductSelectorPage() {
  const [input, setInput] = useState<ProductSelectorInput>({
    // 初期値は空にします。
    // PRODUCT SELECTORは「観測内容を入力して分析するOS」なので、
    // 特定ジャンルの例が最初から入っていると判断が誘導されてしまいます。
    name: "",
    sourceTypes: "",
    sourceText: "",
    visualNotes: "",
    candidateHint: "",
    budget: 0,
    category: "",
    keywords: "",
    memo: "",
  });

  const ruleResult = useMemo(() => evaluateProductCandidate(input), [input]);
  const [aiResult, setAiResult] = useState<ProductSelectorResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [savedLogId, setSavedLogId] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageFileName, setImageFileName] = useState("");
  const [imageExtractLoading, setImageExtractLoading] = useState(false);
  const [imageExtractError, setImageExtractError] = useState("");

  const result = aiResult ?? ruleResult;
  const hasInput = hasObservationInput(input);

  function patch<K extends keyof ProductSelectorInput>(key: K, value: ProductSelectorInput[K]) {
    setAiResult(null);
    setAiError("");
    setSavedLogId("");
    setImageExtractError("");
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  async function handleImageFileChange(file: File | null) {
    setImageExtractError("");

    if (!file) {
      setImageDataUrl("");
      setImageFileName("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setImageExtractError("画像ファイルを選択してください。");
      return;
    }

    // Vercel/APIへ巨大画像を投げすぎないため、まずは10MBで止めます。
    // 既存機能には触れず、PRODUCT SELECTORの画像投入だけ安全に追加しています。
    if (file.size > 10 * 1024 * 1024) {
      setImageExtractError("画像サイズが大きすぎます。10MB以下のスクショ画像を使ってください。");
      return;
    }

    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setImageDataUrl(dataUrl);
      setImageFileName(file.name);
      setAiResult(null);
      setSavedLogId("");
    } catch (error) {
      setImageExtractError(error instanceof Error ? error.message : "画像の読み込みに失敗しました。");
    }
  }

  async function applyImageToInput() {
    if (!imageDataUrl) {
      setImageExtractError("先にスクショ画像を選択してください。");
      return;
    }

    setImageExtractLoading(true);
    setImageExtractError("");
    setAiResult(null);
    setSavedLogId("");

    try {
      const user = auth.currentUser;
      const token = await user?.getIdToken();

      if (!token) {
        setImageExtractError("ログイン情報を確認できませんでした。再ログインしてから実行してください。");
        return;
      }

      const res = await fetch("/api/product-selector/image-extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          imageDataUrl,
          imageFileName,
          input,
        }),
      });

      const data = (await res.json()) as ProductSelectorImageExtractResponse;

      if (!res.ok || !data.ok || !data.result) {
        setImageExtractError(data.error || "スクショ画像の読み取りに失敗しました。");
        return;
      }

      const extracted = data.result;

      setInput((prev) => ({
        ...prev,
        name: prev.name.trim() || extracted.observationTheme || prev.name,
        sourceTypes: mergeWords(prev.sourceTypes, ["スクショ画像", imageFileName]),
        sourceText: appendLine(prev.sourceText, extracted.sourceText),
        visualNotes: appendLine(prev.visualNotes, extracted.visualNotes),
        candidateHint: appendLine(prev.candidateHint, extracted.candidateHint),
        category: prev.category || extracted.category || prev.category,
        keywords: mergeWords(prev.keywords, extracted.keywords),
        memo: appendLine(prev.memo, extracted.memo),
      }));
    } catch (error) {
      setImageExtractError(error instanceof Error ? error.message : "スクショ画像の読み取りに失敗しました。");
    } finally {
      setImageExtractLoading(false);
    }
  }

  async function runAiAnalyze() {
    setAiLoading(true);
    setAiError("");
    setSavedLogId("");

    try {
      const user = auth.currentUser;
      const token = await user?.getIdToken();

      if (!token) {
        setAiError("ログイン情報を確認できませんでした。再ログインしてから実行してください。");
        return;
      }

      const res = await fetch("/api/product-selector/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ input }),
      });

      const data = (await res.json()) as ProductSelectorAnalyzeResponse;

      if (!res.ok || !data.ok) {
        setAiError(data.error || "PRODUCT SELECTORのAI分析に失敗しました。");
        if (data.result) setAiResult(data.result);
        return;
      }

      setAiResult(data.result);
      setSavedLogId(data.savedLogId || "");
      if (!data.usedAi && data.error) setAiError(data.error);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "PRODUCT SELECTORのAI分析に失敗しました。");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-3 py-6 md:px-6 md:py-10">
      <section className="rounded-[2rem] border border-white/10 bg-black/35 p-5 shadow-2xl backdrop-blur md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.32em] text-cyan-100/55">
              AOI FLOW / Vento
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-5xl">
              PRODUCT SELECTOR
            </h1>
            <p className="mt-4 max-w-4xl text-sm font-bold leading-7 text-white/66 md:text-base">
              商品を見るAIではなく、文化・空気・時代感を見るAIです。
              ニュース、SNS、画像、記事、広告、店舗写真、スクショなどから、
              「今どんな空気が市場で再発生しているか」を整理し、触るべきジャンル候補を出します。
            </p>
          </div>

          <Link
            href={buildSellCheckHref({ input, searchKeywords: result.searchKeywords })}
            className="rounded-full border border-cyan-200/25 bg-cyan-200/10 px-5 py-3 text-sm font-black text-cyan-50 no-underline transition hover:bg-cyan-200/15"
          >
            SELL CHECKへ
          </Link>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[430px_1fr]">
        <div className="space-y-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
            <h2 className="text-xl font-black text-white">1. 観測対象</h2>
            <p className="mt-2 text-sm font-bold leading-7 text-white/55">
              商品名が決まっていなくても使えます。ニュース・SNS・画像・記事・店舗写真などから、
              気になった空気や文脈を貼り付けてください。
            </p>

            <div className="mt-5 space-y-4">
              <Field label="観測テーマ / 空気 / 候補名">
                <TextInput
                  value={input.name}
                  onChange={(v) => patch("name", v)}
                  placeholder="例：昭和企業ノベルティ / VHS文化 / industrial空気"
                />
              </Field>

              <Field label="観測元" hint="メルカリ以外も対象です。SNS、ニュース、画像、雑誌、海外投稿などを入れてください">
                <TextInput
                  value={input.sourceTypes}
                  onChange={(v) => patch("sourceTypes", v)}
                  placeholder="例：X / Instagram / Pinterest / Yahooニュース / Google画像 / 店舗写真"
                />
              </Field>

              <div className="rounded-3xl border border-cyan-200/15 bg-cyan-200/[0.055] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-white/85">スクショ画像を投入</div>
                    <p className="mt-1 text-xs font-bold leading-6 text-white/50">
                      SNS・ニュース・メルカリ画面・Google画像などのスクショを入れて、文字と見た目のメモを自動で入力欄へ反映します。
                    </p>
                  </div>
                  {imageFileName ? (
                    <button
                      type="button"
                      onClick={() => {
                        setImageDataUrl("");
                        setImageFileName("");
                        setImageExtractError("");
                      }}
                      className="shrink-0 rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs font-black text-white/60 transition hover:bg-white/10"
                    >
                      画像クリア
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      void handleImageFileChange(e.target.files?.[0] || null);
                    }}
                    className="block w-full cursor-pointer rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white file:mr-4 file:rounded-full file:border-0 file:bg-cyan-200/15 file:px-4 file:py-2 file:text-xs file:font-black file:text-cyan-50 hover:file:bg-cyan-200/22"
                  />

                  {imageDataUrl ? (
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                      <img
                        src={imageDataUrl}
                        alt="PRODUCT SELECTORに投入したスクショ"
                        className="max-h-64 w-full object-contain"
                      />
                      <div className="border-t border-white/10 px-3 py-2 text-xs font-bold text-white/50">
                        {imageFileName || "選択した画像"}
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={applyImageToInput}
                    disabled={!imageDataUrl || imageExtractLoading}
                    className="rounded-2xl border border-cyan-200/25 bg-cyan-200/12 px-4 py-3 text-sm font-black text-cyan-50 transition hover:bg-cyan-200/18 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {imageExtractLoading ? "スクショ解析中..." : "スクショから入力欄へ反映"}
                  </button>

                  {imageExtractError ? (
                    <p className="text-xs font-bold leading-6 text-amber-100/80">{imageExtractError}</p>
                  ) : null}
                </div>
              </div>

              <Field label="記事・投稿・スクショ内テキスト" hint="見つけた投稿、記事、説明文、スクショ内の文字をそのまま貼れます">
                <TextArea
                  value={input.sourceText}
                  onChange={(v) => patch("sourceText", v)}
                  placeholder="例：海外コレクター投稿で日本製文具やVHS文化の投稿が増えている"
                  rows={6}
                />
              </Field>

              <Field label="画像から見えた視覚メモ" hint="色味、質感、素材、構図、古さ、UI、ノスタルジー感など">
                <TextArea
                  value={input.visualNotes}
                  onChange={(v) => patch("visualNotes", v)}
                  placeholder="例：退色したパッケージ、金属感、古いUI、無骨な質感、暗い背景で映える"
                  rows={5}
                />
              </Field>

              <Field label="候補ジャンル / 商品候補" hint="未確定でもOK。AIが候補ジャンルを補助します">
                <TextInput
                  value={input.candidateHint}
                  onChange={(v) => patch("candidateHint", v)}
                  placeholder="例：昭和企業ノベルティ / 日本製文具 / 古い工具 / VHS関連"
                />
              </Field>

              <Field label="現在の観測・仕入れ予算">
                <input
                  type="number"
                  min={0}
                  value={input.budget}
                  onChange={(e) => patch("budget", Math.max(0, Number(e.target.value || 0)))}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-white/28 focus:border-cyan-200/45"
                />
              </Field>

              <div className="rounded-3xl border border-cyan-200/15 bg-cyan-200/[0.06] p-4">
                <button
                  type="button"
                  onClick={runAiAnalyze}
                  disabled={aiLoading}
                  className="w-full rounded-2xl border border-cyan-200/25 bg-cyan-200/12 px-4 py-3 text-sm font-black text-cyan-50 transition hover:bg-cyan-200/18 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {aiLoading ? "AI理論分析中..." : "AI理論分析を実行"}
                </button>
                <p className="mt-3 text-xs font-bold leading-6 text-white/50">
                  AIは観測素材から文脈を抽出します。最終判断はアプリ側の固定スコアOSで補正し、価格判断はSELL CHECKへ渡します。
                </p>
                {savedLogId ? (
                  <p className="mt-2 text-xs font-black text-cyan-50/60">観測ログ保存済み</p>
                ) : null}
                {aiError ? (
                  <p className="mt-2 text-xs font-bold leading-6 text-amber-100/80">{aiError}</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <ResultPanel result={result} input={input} hasInput={hasInput} />
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/30 p-5">
        <h2 className="text-xl font-black text-white">PRODUCT SELECTORの位置づけ</h2>
        <div className="mt-4 grid gap-3 text-sm font-bold leading-7 text-white/65 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="font-black text-white">PRODUCT SELECTOR</div>
            <p className="mt-2">文化・空気・時代感を観測し、触るべきジャンル候補を出します。</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="font-black text-white">SELL CHECK</div>
            <p className="mt-2">個別商品をいくらで買い、いくらで売るかを判断します。</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="font-black text-white">AOI FLOW</div>
            <p className="mt-2">写真・背景・動画・キャプションで商品文脈を増幅します。</p>
          </div>
        </div>
      </section>
    </main>
  );
}
