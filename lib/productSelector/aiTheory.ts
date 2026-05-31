// /lib/productSelector/aiTheory.ts

/**
 * PRODUCT SELECTOR AI理論層
 *
 * 目的：
 * - ChatGPTに「自由に相談する」のではなく、AOI FLOW / Vento 固有の理論で
 *   観測素材を JSON に変換する。
 * - AIは抽出と整理を担当し、アプリ側の固定スコアOSが最終判断を補正する。
 *
 * 重要：
 * - 自動購入AIではありません。
 * - 転売BOTではありません。
 * - 価格・利益の最終判断は SELL CHECK が担当します。
 */

import type {
  ProductSelectorAxis,
  ProductSelectorDecision,
  ProductSelectorGenreCandidate,
  ProductSelectorBuyCandidate,
  ProductSelectorObservationFact,
  ProductSelectorInput,
  ProductSelectorResult,
} from "@/lib/productSelector/scoring";

export type ProductSelectorAiFinding = {
  label: string;
  evidence: string;
  confidence: number;
};

export type ProductSelectorAiResult = ProductSelectorResult & {
  analysisMode: "ai_theory";
  theoryVersion: string;
  observationSummary: string;
  whyNow: string;
  notYetReason: string;
  evidence: ProductSelectorAiFinding[];
  aiWarnings: string[];
};

export type ProductSelectorAnalyzeResponse = {
  ok: boolean;
  usedAi: boolean;
  result: ProductSelectorAiResult | ProductSelectorResult;
  savedLogId?: string;
  error?: string;
};

export function buildProductSelectorSystemPrompt(): string {
  return `
あなたは AOI FLOW / Vento の PRODUCT SELECTOR です。

あなたの役割：
市場文脈・空気・文化トレンドを分析し、
「今どのジャンルを観測・検証する価値があるか」を整理する。

あなたは以下ではありません：
- 自動購入AI
- 転売BOT
- 単純せどりAI
- 相場価格検索AI
- 利益確定AI

最重要思想：
PRODUCT SELECTOR は「商品を見るAI」ではなく、
「文化・空気・時代感を見るAI」です。

判断対象：
ニュース、SNS、画像、記事、スクショ、海外投稿、店舗写真、倉庫写真、広告画像、商品画像、テキストなど。

必ず分けること：
1. 観測根拠
2. 推論
3. スクショ内に見える商品群の分解
4. 今この場で見るべき候補ランキング
5. まだ触らない理由
6. 次に集めるべきデータ
7. SELL CHECKに渡すべき個別商品条件

禁止：
- 実在しないデータを見たふりをしない
- 価格上昇を断定しない
- 「未来に必ず上がる」と言わない
- 非売品・配布品を一律で低評価しない
- メルカリ警告や市場中央値を絶対視しない
- 個別商品の購入判断を確定しない

正しい考え方：
- 未来予言ではなく「兆候検知」をする
- 既に一部で再評価されているが、まだ仕入れ市場に完全反映されていない文脈を探す
- Ventoの世界観に乗るかを重視する
- 小資本フェーズでは、小型・軽量・壊れにくい・投稿価値が高いものを優先する
- スクショに複数の商品群がある場合は、必ず複数候補へ分解する
- 「レトロアパレル」など大分類1つにまとめすぎない
- 画像内に文具・シール・メモ帳・キャラ雑貨・ぬいぐるみ・家電・スニーカー等が混在する場合、それぞれ別候補として扱う
- 高額スニーカーやブランド衣類は、小資本フェーズではリスク候補として分ける
- 価格判断と仕入れ上限は SELL CHECK へ渡す

出力は必ず JSON のみ。
説明文やMarkdownを外側に書かない。
`.trim();
}

export function buildProductSelectorUserPrompt(input: ProductSelectorInput): string {
  return `
以下の観測素材を AOI FLOW / Vento の PRODUCT SELECTOR として分析してください。

【観測テーマ】
${input.name || "未入力"}

【観測元】
${input.sourceTypes || "未入力"}

【記事・投稿・スクショ内テキスト】
${input.sourceText || "未入力"}

【画像から見えた視覚メモ】
${input.visualNotes || "未入力"}

【候補ジャンル / 商品候補】
${input.candidateHint || "未入力"}

【現在の観測・仕入れ予算】
${Number.isFinite(input.budget) ? input.budget : 0}円

【旧互換項目】
category: ${input.category || ""}
keywords: ${input.keywords || ""}
memo: ${input.memo || ""}

次の JSON 形式で返してください。
数値は 0〜100 の整数にしてください。
decision は touch_now / research_first / watch_only / avoid_now のいずれかにしてください。

{
  "totalScore": 0,
  "decision": "watch_only",
  "decisionLabel": "観測継続",
  "decisionSummary": "",
  "demandLayer": "",
  "atmosphereSummary": "",
  "observationSummary": "",
  "whyNow": "",
  "notYetReason": "",
  "axes": [
    { "key": "context", "label": "文脈強度", "score": 0, "reason": "" },
    { "key": "visual", "label": "視覚素材性", "score": 0, "reason": "" },
    { "key": "atmosphere", "label": "空気検知", "score": 0, "reason": "" },
    { "key": "marketSignal", "label": "市場兆候", "score": 0, "reason": "" },
    { "key": "future", "label": "未来文脈", "score": 0, "reason": "" },
    { "key": "vento", "label": "Vento相性", "score": 0, "reason": "" },
    { "key": "smallCapital", "label": "小資本適性", "score": 0, "reason": "" }
  ],
  "genreCandidates": [
    { "name": "", "score": 0, "reason": "", "searchWords": [] }
  ],
  "strengths": [],
  "risks": [],
  "nextActions": [],
  "sellCheckBridge": [],
  "searchKeywords": [],
  "buyCandidates": [
    {
      "name": "平成レトロ文具・メモ帳/シール",
      "score": 0,
      "action": "research_first",
      "reason": "スクショ内の商品群を分解し、今見る候補として返す。最終購入判断ではない。",
      "evidence": ["画像内で見えた商品特徴", "小型軽量か", "価格帯/状態/送料リスク"],
      "sellCheckKeywords": ["SELL CHECKへ渡す検索語"]
    }
  ],
  "observationFacts": [
    { "label": "", "value": "", "confidence": 0 }
  ],
  "learningSignals": [],
  "evidence": [
    { "label": "", "evidence": "", "confidence": 0 }
  ],
  "aiWarnings": []
}
`.trim();
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => safeString(x)).filter(Boolean).slice(0, 12);
}

function normalizeDecision(v: unknown): ProductSelectorDecision {
  const s = safeString(v);
  if (s === "touch_now" || s === "research_first" || s === "watch_only" || s === "avoid_now") {
    return s;
  }
  return "watch_only";
}

const axisKeys = [
  "context",
  "visual",
  "atmosphere",
  "marketSignal",
  "future",
  "vento",
  "smallCapital",
] as const;

function normalizeAxes(v: unknown, fallback: ProductSelectorAxis[]): ProductSelectorAxis[] {
  const rows = Array.isArray(v) ? v : [];
  const normalized = axisKeys.map((key) => {
    const row = rows.find((x) => x && typeof x === "object" && (x as { key?: unknown }).key === key) as
      | { label?: unknown; score?: unknown; reason?: unknown }
      | undefined;

    const fb = fallback.find((x) => x.key === key);

    return {
      key,
      label: safeString(row?.label) || fb?.label || key,
      score: safeNumber(row?.score, fb?.score ?? 0),
      reason: safeString(row?.reason) || fb?.reason || "AI分析の根拠が不足しています",
    };
  });

  return normalized;
}

function normalizeCandidates(v: unknown, fallback: ProductSelectorGenreCandidate[]): ProductSelectorGenreCandidate[] {
  const rows = Array.isArray(v) ? v : [];

  const out = rows
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const row = x as { name?: unknown; score?: unknown; reason?: unknown; searchWords?: unknown };
      const name = safeString(row.name);
      if (!name) return null;

      return {
        name,
        score: safeNumber(row.score, 40),
        reason: safeString(row.reason) || "観測素材から候補として抽出しました",
        searchWords: safeStringArray(row.searchWords),
      };
    })
    .filter((x): x is ProductSelectorGenreCandidate => Boolean(x))
    .slice(0, 5);

  return out.length > 0 ? out : fallback;
}

function normalizeBuyCandidates(v: unknown, fallback: ProductSelectorBuyCandidate[]): ProductSelectorBuyCandidate[] {
  const rows = Array.isArray(v) ? v : [];

  const out = rows
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const row = x as {
        name?: unknown;
        score?: unknown;
        action?: unknown;
        reason?: unknown;
        evidence?: unknown;
        sellCheckKeywords?: unknown;
      };

      const name = safeString(row.name);
      if (!name) return null;

      const actionText = safeString(row.action);
      const action: ProductSelectorBuyCandidate["action"] =
        actionText === "buy_candidate" || actionText === "research_first" || actionText === "watch_only"
          ? actionText
          : "research_first";

      return {
        name,
        score: safeNumber(row.score, 45),
        action,
        reason: safeString(row.reason) || "スクショ/観測情報から候補として抽出しました。",
        evidence: safeStringArray(row.evidence),
        sellCheckKeywords: safeStringArray(row.sellCheckKeywords),
      };
    })
    .filter((x): x is ProductSelectorBuyCandidate => Boolean(x))
    .slice(0, 6);

  // AIが「レトロアパレル」など1候補に寄りすぎた場合でも、
  // 固定ルール側で分解した候補を消さずに合流します。
  const seen = new Set<string>();
  const merged: ProductSelectorBuyCandidate[] = [];

  for (const candidate of [...out, ...fallback].sort((a, b) => b.score - a.score)) {
    const key = candidate.name.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }

  return merged.length > 0 ? merged.slice(0, 6) : fallback;
}

function normalizeObservationFacts(v: unknown, fallback: ProductSelectorObservationFact[]): ProductSelectorObservationFact[] {
  const rows = Array.isArray(v) ? v : [];

  const out = rows
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const row = x as { label?: unknown; value?: unknown; confidence?: unknown };
      const label = safeString(row.label);
      const value = safeString(row.value);
      if (!label && !value) return null;

      return {
        label: label || "観測情報",
        value: value || "未確定",
        confidence: safeNumber(row.confidence, 50),
      };
    })
    .filter((x): x is ProductSelectorObservationFact => Boolean(x))
    .slice(0, 8);

  return out.length > 0 ? out : fallback;
}

function normalizeEvidence(v: unknown): ProductSelectorAiFinding[] {
  if (!Array.isArray(v)) return [];

  return v
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const row = x as { label?: unknown; evidence?: unknown; confidence?: unknown };
      const label = safeString(row.label);
      const evidence = safeString(row.evidence);
      if (!label && !evidence) return null;

      return {
        label: label || "観測根拠",
        evidence: evidence || "根拠文が不足しています",
        confidence: safeNumber(row.confidence, 50),
      };
    })
    .filter((x): x is ProductSelectorAiFinding => Boolean(x))
    .slice(0, 8);
}

export function normalizeProductSelectorAiResult(
  raw: unknown,
  fallback: ProductSelectorResult
): ProductSelectorAiResult {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    ...fallback,
    analysisMode: "ai_theory",
    theoryVersion: "product-selector-context-os-2026-05",
    totalScore: safeNumber(obj.totalScore, fallback.totalScore),
    decision: normalizeDecision(obj.decision),
    decisionLabel: safeString(obj.decisionLabel) || fallback.decisionLabel,
    decisionSummary: safeString(obj.decisionSummary) || fallback.decisionSummary,
    demandLayer: safeString(obj.demandLayer) || fallback.demandLayer,
    atmosphereSummary: safeString(obj.atmosphereSummary) || fallback.atmosphereSummary,
    observationSummary:
      safeString(obj.observationSummary) ||
      "観測素材から文化・空気・市場文脈を整理しました。",
    whyNow:
      safeString(obj.whyNow) ||
      "今触る理由は未確定です。追加観測で根拠を強めてください。",
    notYetReason:
      safeString(obj.notYetReason) ||
      "個別商品の価格・回転・仕入れ上限はSELL CHECKで確認してください。",
    axes: normalizeAxes(obj.axes, fallback.axes),
    genreCandidates: normalizeCandidates(obj.genreCandidates, fallback.genreCandidates),
    strengths: safeStringArray(obj.strengths).length > 0 ? safeStringArray(obj.strengths) : fallback.strengths,
    risks: safeStringArray(obj.risks).length > 0 ? safeStringArray(obj.risks) : fallback.risks,
    nextActions:
      safeStringArray(obj.nextActions).length > 0 ? safeStringArray(obj.nextActions) : fallback.nextActions,
    sellCheckBridge:
      safeStringArray(obj.sellCheckBridge).length > 0
        ? safeStringArray(obj.sellCheckBridge)
        : fallback.sellCheckBridge,
    searchKeywords:
      safeStringArray(obj.searchKeywords).length > 0
        ? safeStringArray(obj.searchKeywords)
        : fallback.searchKeywords,
    buyCandidates: normalizeBuyCandidates(obj.buyCandidates, fallback.buyCandidates),
    observationFacts: normalizeObservationFacts(obj.observationFacts, fallback.observationFacts),
    learningSignals:
      safeStringArray(obj.learningSignals).length > 0
        ? safeStringArray(obj.learningSignals)
        : fallback.learningSignals,
    evidence: normalizeEvidence(obj.evidence),
    aiWarnings: safeStringArray(obj.aiWarnings),
  };
}
