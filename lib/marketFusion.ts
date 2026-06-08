// lib/marketFusion.ts
// AOI FLOW / Vento 市場研究OSの複数データ統合レイヤー。
// 既存のSELL CHECK / PRODUCT SELECTOR / AOI FLOW生成機能を置き換えず、
// その上に市場文脈を渡すための軽量ユーティリティです。

export type MarketFusionInput = {
  images?: string[];
  googleResults?: string[];
  ebayResults?: string[];
  redditResults?: string[];
  youtubeResults?: string[];
  articles?: string[];
  snsResults?: string[];
};

export type MarketFusionResult = {
  marketCandidates: string[];
  marketTheory: string;
  marketFormationScore: number;
  domesticDemand: string;
  overseasDemand: string;
  evidence: string[];
  missingEvidence: string[];
};

export type SellCheckMarketContext = {
  marketExistenceScore: number;
  marketFormationScore: number;
  designScore: number;
  supplyPotential: number;
  repeatSupply: number;
  deadStockPotential: number;
  contactValue: number;
  theoryJudgement: string;
  domesticDemand: string;
  overseasDemand: string;
};

export type AoiFlowMarketContext = {
  marketTheory: string;
  designGrammar: string;
  commonWorldviews: string[];
  commonStories: string[];
};

function arr(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 100);
}

function textFromInput(input: MarketFusionInput): string {
  return [
    ...arr(input.images),
    ...arr(input.googleResults),
    ...arr(input.ebayResults),
    ...arr(input.redditResults),
    ...arr(input.youtubeResults),
    ...arr(input.articles),
    ...arr(input.snsResults),
  ]
    .join('\n')
    .toLowerCase();
}

function has(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word.toLowerCase()));
}

function score(text: string, words: string[]): number {
  return words.reduce((sum, word) => sum + (text.includes(word.toLowerCase()) ? 1 : 0), 0);
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function fuseMarketSignals(input: MarketFusionInput): MarketFusionResult {
  const text = textFromInput(input);
  const sourceCount = [
    arr(input.images).length,
    arr(input.googleResults).length,
    arr(input.ebayResults).length,
    arr(input.redditResults).length,
    arr(input.youtubeResults).length,
    arr(input.articles).length,
    arr(input.snsResults).length,
  ].filter((count) => count > 0).length;

  const marketCandidates = uniq([
    has(text, ['shoemaker', 'ミニチュア', 'ハウス', '童話', '村']) ? 'ミニチュアハウス・世界観ディスプレイ市場' : '',
    has(text, ['婦人時計', 'レディース時計', 'citizen', 'poppy', '装飾時計']) ? '昭和婦人時計・アクセサリー市場' : '',
    has(text, ['企業', '非売品', 'ノベルティ', 'ロゴ', '記念']) ? '昭和企業ノベルティ市場' : '',
    has(text, ['casio', 'カシオ', '電卓', '日本製ガジェット']) ? '古い日本製ガジェット市場' : '',
    has(text, ['トミカ', 'ミニカー', 'diecast']) ? '日本製ミニカー市場' : '',
  ]);

  const formationRaw =
    sourceCount * 8 +
    score(text, ['sold', '売却', '落札', '販売済み']) * 8 +
    score(text, ['series', 'シリーズ', '複数作品']) * 8 +
    score(text, ['reddit', 'youtube', 'instagram', 'sns']) * 6 +
    score(text, ['ebay', 'vintage', 'japanese', '海外']) * 6;

  const marketFormationScore = clampScore(formationRaw);
  const domesticDemand = has(text, ['メルカリ', 'ヤフオク', '日本', '昭和', '国内'])
    ? '国内需要：観測あり。懐かしさ・昭和感・出品反応を確認してください。'
    : '国内需要：未確認。メルカリ売却済み・国内検索語で追加観測が必要です。';
  const overseasDemand = has(text, ['ebay', 'reddit', 'vintage', 'japanese', 'etsy', '海外'])
    ? '海外需要：観測あり。eBay SOLD・Reddit・英語検索語で検証してください。'
    : '海外需要：未確認。eBay SOLD・Google英語検索・Reddit観測が必要です。';

  return {
    marketCandidates: marketCandidates.length > 0 ? marketCandidates : ['仮説市場（要追加観測）'],
    marketTheory:
      marketFormationScore >= 70
        ? '複数データから市場形成の兆候があります。商品単体ではなく共通市場として追跡してください。'
        : marketFormationScore >= 40
          ? '市場仮説はありますが、売買履歴・コミュニティ・海外流通の追加観測が必要です。'
          : '現時点では市場形成根拠が不足しています。単画像判断は禁止し、複数データを追加してください。',
    marketFormationScore,
    domesticDemand,
    overseasDemand,
    evidence: uniq([
      sourceCount > 1 ? `複数データ種別 ${sourceCount}件を統合` : '',
      has(text, ['sold', '売却', '落札']) ? '売買履歴の手がかりあり' : '',
      has(text, ['reddit', 'youtube', 'instagram']) ? 'コミュニティ/SNS観測の手がかりあり' : '',
      has(text, ['ebay', 'vintage', 'japanese']) ? '海外流通/英語検索の手がかりあり' : '',
    ]),
    missingEvidence: uniq([
      !has(text, ['sold', '売却', '落札']) ? '売却済みデータ' : '',
      !has(text, ['reddit']) ? 'Reddit反応' : '',
      !has(text, ['youtube']) ? 'YouTube紹介文化' : '',
      !has(text, ['ebay']) ? 'eBay SOLD / 海外流通' : '',
      !has(text, ['instagram', 'sns']) ? 'SNS保存・表示価値' : '',
    ]),
  };
}

export function buildSellCheckMarketContext(input: Partial<SellCheckMarketContext>): SellCheckMarketContext {
  return {
    marketExistenceScore: clampScore(Number(input.marketExistenceScore ?? 0)),
    marketFormationScore: clampScore(Number(input.marketFormationScore ?? 0)),
    designScore: clampScore(Number(input.designScore ?? 0)),
    supplyPotential: clampScore(Number(input.supplyPotential ?? 0)),
    repeatSupply: clampScore(Number(input.repeatSupply ?? 0)),
    deadStockPotential: clampScore(Number(input.deadStockPotential ?? 0)),
    contactValue: clampScore(Number(input.contactValue ?? 0)),
    theoryJudgement: String(input.theoryJudgement ?? '未確認'),
    domesticDemand: String(input.domesticDemand ?? '未確認'),
    overseasDemand: String(input.overseasDemand ?? '未確認'),
  };
}

export function buildAoiFlowGenerationMarketContext(input: {
  marketTheory?: unknown;
  designGrammar?: unknown;
  commonWorldviews?: unknown;
  commonStories?: unknown;
}): AoiFlowMarketContext {
  return {
    marketTheory: String(input.marketTheory ?? '').trim(),
    designGrammar: String(input.designGrammar ?? '').trim(),
    commonWorldviews: arr(input.commonWorldviews),
    commonStories: arr(input.commonStories),
  };
}
