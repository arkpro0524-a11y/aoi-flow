//app/api/template-backgrounds/recommend/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminDb } from "@/firebaseAdmin";

/**
 * AOI FLOW
 * テンプレ背景 おすすめAPI
 *
 * 今回の本質修正
 * - フロント期待値に合わせて返却形式を統一する
 *
 * 返却の正式形
 * {
 *   ok: true,
 *   topReason: string,
 *   recommended: [
 *     { url, reason, score, ... }
 *   ]
 * }
 *
 * ただし互換性のために
 * - picked
 * - imageUrl
 * も残す
 */

type TemplateBgCategory = "light" | "white" | "dark" | "wood" | "studio";
type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType = "floor" | "table" | "hanging" | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";

type RecommendRequestBody = {
  draftId?: unknown;
  productCategory?: unknown;
  productSize?: unknown;
  groundingType?: unknown;
  sellDirection?: unknown;
  templateBgUrls?: unknown;
};

type TemplateRecommendItem = {
  id: string;
  url: string;
  imageUrl: string;
  category: TemplateBgCategory;
  score: number;
  reason: string;
  reasons: string[];
  tags: string[];
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeStringArray(input: unknown, limit = 50): string[] {
  if (!Array.isArray(input)) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (typeof item !== "string") continue;

    const s = item.trim();
    if (!s) continue;
    if (seen.has(s)) continue;

    seen.add(s);
    out.push(s);

    if (out.length >= limit) break;
  }

  return out;
}

function uniqKeepOrder(input: string[], limit = 50): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    const s = String(item ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;

    seen.add(s);
    out.push(s);

    if (out.length >= limit) break;
  }

  return out;
}

function normalizeProductCategory(v: unknown): ProductCategory {
  const s = String(v ?? "").trim();
  if (s === "furniture") return "furniture";
  if (s === "goods") return "goods";
  if (s === "apparel") return "apparel";
  if (s === "small") return "small";
  return "other";
}

function normalizeProductSize(v: unknown): ProductSize {
  const s = String(v ?? "").trim();
  if (s === "large") return "large";
  if (s === "small") return "small";
  return "medium";
}

function normalizeGroundingType(v: unknown): GroundingType {
  const s = String(v ?? "").trim();
  if (s === "table") return "table";
  if (s === "hanging") return "hanging";
  if (s === "wall") return "wall";
  return "floor";
}

function normalizeSellDirection(v: unknown): SellDirection {
  const s = String(v ?? "").trim();
  if (s === "branding") return "branding";
  if (s === "trust") return "trust";
  if (s === "story") return "story";
  return "sales";
}

/**
 * URLからカテゴリを推定
 */
function inferTemplateCategoryFromUrl(url: string): TemplateBgCategory {
  const s = String(url ?? "").toLowerCase();

  if (s.includes("/white_") || s.includes("white_")) return "white";
  if (s.includes("/light_") || s.includes("light_")) return "light";
  if (s.includes("/dark_") || s.includes("dark_")) return "dark";
  if (s.includes("/wood_") || s.includes("wood_")) return "wood";
  return "studio";
}

function buildTags(args: {
  category: TemplateBgCategory;
  productCategory: ProductCategory;
  groundingType: GroundingType;
  sellDirection: SellDirection;
}) {
  const { category, productCategory, groundingType, sellDirection } = args;

  return uniqKeepOrder(
    [
      category,
      productCategory,
      groundingType,
      sellDirection,
      "template-background",
      "recommend",
      "ec",
    ],
    12
  );
}

function scoreTemplateCategoryFit(args: {
  category: TemplateBgCategory;
  productCategory: ProductCategory;
  sellDirection: SellDirection;
}) {
  const { category, productCategory, sellDirection } = args;

  let score = 0;
  const reasons: string[] = [];

  if (productCategory === "furniture") {
    if (category === "wood") {
      score += 28;
      reasons.push("家具カテゴリと木床系テンプレの相性が高い");
    }
    if (category === "light") {
      score += 18;
      reasons.push("家具を自然に見せやすい明るめ背景");
    }
    if (category === "dark" && sellDirection === "branding") {
      score += 16;
      reasons.push("家具×世界観重視に暗め高級背景が合う");
    }
  }

  if (productCategory === "goods") {
    if (category === "white") {
      score += 24;
      reasons.push("雑貨をシンプルに見せやすい白系背景");
    }
    if (category === "light") {
      score += 18;
      reasons.push("雑貨販売向けの明るいEC背景");
    }
    if (category === "wood") {
      score += 16;
      reasons.push("雑貨の質感訴求に木天板系が合う");
    }
  }

  if (productCategory === "apparel") {
    if (category === "white") {
      score += 26;
      reasons.push("アパレルは白系背景で清潔感を出しやすい");
    }
    if (category === "light") {
      score += 18;
      reasons.push("アパレル販売向けの明るい背景");
    }
    if (category === "studio") {
      score += 14;
      reasons.push("アパレル向けに無難で安定したスタジオ背景");
    }
  }

  if (productCategory === "small") {
    if (category === "white") {
      score += 28;
      reasons.push("小型商品は白背景で輪郭が見やすい");
    }
    if (category === "studio") {
      score += 22;
      reasons.push("小型商品の販売画像にスタジオ背景が安定");
    }
    if (category === "light") {
      score += 14;
      reasons.push("小型商品に明るい背景が使いやすい");
    }
  }

  if (productCategory === "other") {
    if (category === "studio") {
      score += 20;
      reasons.push("その他カテゴリに最も無難なスタジオ背景");
    }
    if (category === "light") {
      score += 16;
      reasons.push("その他カテゴリに使いやすい明るめ背景");
    }
  }

  if (sellDirection === "trust") {
    if (category === "white") {
      score += 14;
      reasons.push("信頼重視に白系背景が合う");
    }
    if (category === "studio") {
      score += 10;
      reasons.push("信頼重視にスタジオ背景が安定");
    }
  }

  if (sellDirection === "branding") {
    if (category === "dark") {
      score += 14;
      reasons.push("世界観重視に暗め背景が合う");
    }
    if (category === "wood") {
      score += 10;
      reasons.push("世界観重視に木質系背景が合う");
    }
  }

  if (sellDirection === "sales") {
    if (category === "white") {
      score += 10;
      reasons.push("売上重視に白背景が強い");
    }
    if (category === "light") {
      score += 10;
      reasons.push("売上重視に明るい背景が強い");
    }
  }

  return { score, reasons };
}

function scoreGroundingFit(args: {
  category: TemplateBgCategory;
  groundingType: GroundingType;
}) {
  const { category, groundingType } = args;

  let score = 0;
  const reasons: string[] = [];

  if (groundingType === "floor") {
    if (category === "wood") {
      score += 18;
      reasons.push("床置きに木床系テンプレが合う");
    }
    if (category === "light") {
      score += 14;
      reasons.push("床置きに明るい壁＋床背景が合う");
    }
    if (category === "studio") {
      score += 12;
      reasons.push("床置きに安定したスタジオ背景が使いやすい");
    }
  }

  if (groundingType === "table") {
    if (category === "wood") {
      score += 20;
      reasons.push("卓上に木天板系テンプレが合う");
    }
    if (category === "white") {
      score += 16;
      reasons.push("卓上に白系テンプレが使いやすい");
    }
    if (category === "studio") {
      score += 10;
      reasons.push("卓上にスタジオ背景が安定");
    }
  }

  if (groundingType === "wall") {
    if (category === "white") {
      score += 18;
      reasons.push("壁寄せに白系背景が合う");
    }
    if (category === "light") {
      score += 14;
      reasons.push("壁寄せに明るい壁背景が合う");
    }
    if (category === "dark") {
      score += 10;
      reasons.push("壁寄せに暗め背景も選択肢になる");
    }
  }

  if (groundingType === "hanging") {
    if (category === "white") {
      score += 18;
      reasons.push("吊り下げに白系背景が使いやすい");
    }
    if (category === "studio") {
      score += 14;
      reasons.push("吊り下げにスタジオ背景が安定");
    }
    if (category === "light") {
      score += 10;
      reasons.push("吊り下げに明るい背景が合う");
    }
  }

  return { score, reasons };
}

function scoreSizeFit(args: {
  category: TemplateBgCategory;
  productSize: ProductSize;
}) {
  const { category, productSize } = args;

  let score = 0;
  const reasons: string[] = [];

  if (productSize === "large") {
    if (category === "wood") {
      score += 12;
      reasons.push("大サイズ商品に木床系の広がりが合う");
    }
    if (category === "light") {
      score += 10;
      reasons.push("大サイズ商品に明るい広め背景が合う");
    }
  }

  if (productSize === "small") {
    if (category === "white") {
      score += 12;
      reasons.push("小サイズ商品に白背景が見やすい");
    }
    if (category === "studio") {
      score += 10;
      reasons.push("小サイズ商品にスタジオ背景が安定");
    }
  }

  if (productSize === "medium") {
    if (category === "light" || category === "white" || category === "studio") {
      score += 8;
      reasons.push("中サイズ商品にバランス良く使える背景");
    }
  }

  return { score, reasons };
}

function scoreReuseBoost(args: {
  url: string;
  currentTemplateBgUrl?: string;
  currentTemplateBgUrls?: string[];
}) {
  const { url, currentTemplateBgUrl, currentTemplateBgUrls } = args;

  let score = 0;
  const reasons: string[] = [];

  if (currentTemplateBgUrl && currentTemplateBgUrl === url) {
    score += 12;
    reasons.push("現在選択中のテンプレ背景なので再利用しやすい");
  }

  if (Array.isArray(currentTemplateBgUrls) && currentTemplateBgUrls.includes(url)) {
    score += 6;
    reasons.push("この下書きで既に生成済みのテンプレ背景");
  }

  return { score, reasons };
}

function buildRecommendReason(reasons: string[]) {
  const trimmed = reasons.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return "商品条件に対して最も無難で使いやすいテンプレ背景です。";
  }
  return trimmed.slice(0, 3).join(" / ");
}

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const uid = user.uid;

    const body = (await req.json().catch(() => ({}))) as RecommendRequestBody;

    const draftId = asTrimmedString(body.draftId);
    if (!draftId) {
      return bad("draftId is required");
    }

    const db = getAdminDb();
    const draftRef = db.collection("drafts").doc(draftId);
    const draftSnap = await draftRef.get();

    if (!draftSnap.exists) {
      return bad("draft not found", 404);
    }

    const draftData = draftSnap.data() || {};
    if (String(draftData.userId || "") !== uid) {
      return bad("forbidden", 403);
    }

    const productCategory = normalizeProductCategory(
      body.productCategory ?? draftData.productCategory
    );
    const productSize = normalizeProductSize(
      body.productSize ?? draftData.productSize
    );
    const groundingType = normalizeGroundingType(
      body.groundingType ?? draftData.groundingType
    );
    const sellDirection = normalizeSellDirection(
      body.sellDirection ?? draftData.sellDirection
    );

    const templateBgUrls = uniqKeepOrder(
      [
        ...normalizeStringArray(body.templateBgUrls, 50),
        ...normalizeStringArray(draftData.templateBgUrls, 50),
      ],
      50
    );

    if (templateBgUrls.length === 0) {
      return bad("templateBgUrls not found. 先にテンプレ背景を生成してください。", 400);
    }

    const currentTemplateBgUrl = asTrimmedString(draftData.templateBgUrl);

    const scored: TemplateRecommendItem[] = templateBgUrls.map((url, index) => {
      const category = inferTemplateCategoryFromUrl(url);

      const a = scoreTemplateCategoryFit({
        category,
        productCategory,
        sellDirection,
      });

      const b = scoreGroundingFit({
        category,
        groundingType,
      });

      const c = scoreSizeFit({
        category,
        productSize,
      });

      const d = scoreReuseBoost({
        url,
        currentTemplateBgUrl,
        currentTemplateBgUrls: templateBgUrls,
      });

      const rawScore = a.score + b.score + c.score + d.score;

      const reasons = [
        ...a.reasons,
        ...b.reasons,
        ...c.reasons,
        ...d.reasons,
      ];

      const score = Math.max(1, Math.min(100, rawScore));

      return {
        id: `template-${index + 1}`,
        url,
        imageUrl: url,
        category,
        score,
        reason: buildRecommendReason(reasons),
        reasons: uniqKeepOrder(reasons, 8),
        tags: buildTags({
          category,
          productCategory,
          groundingType,
          sellDirection,
        }),
      };
    });

    const ranked = scored
      .slice()
      .sort((x, y) => {
        if (y.score !== x.score) return y.score - x.score;
        return x.url.localeCompare(y.url);
      });

    const recommended = ranked.slice(0, 3);
    const top = recommended[0] ?? null;
    const topReason = top?.reason ?? "";

    return NextResponse.json({
      ok: true,
      draftId,
      input: {
        productCategory,
        productSize,
        groundingType,
        sellDirection,
      },

      /**
       * 新フロント正式返却
       */
      topReason,
      recommended,

      /**
       * 旧互換
       */
      picked: top,

      count: ranked.length,
      all: ranked,
    });
  } catch (e: any) {
    console.error("[template-backgrounds/recommend] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "template background recommend failed" },
      { status: 500 }
    );
  }
}