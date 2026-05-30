// /app/api/generate-static-variants/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminAuth } from "@/firebaseAdmin";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

type Purpose = "sales" | "branding" | "trust" | "story";
type StrategyType = "direct" | "branding" | "proof";

type Variant = {
  id: string; // "v1" | "v2" | "v3"
  strategyType: StrategyType;
  title: string;
  rationale: string;
  prompt: string;
  negativePrompt?: string;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function normalizePurpose(x: any): Purpose {
  const s = String(x ?? "").toLowerCase().trim();
  if (s === "sales" || s === "branding" || s === "trust" || s === "story") return s;
  return "sales";
}

function safeText(x: any, max = 2000) {
  const s = String(x ?? "").trim();
  return s.length > max ? s.slice(0, max) : s;
}

function fallback3(vision: string, keywords: string, purpose: Purpose) {
  const base = `ブランドの世界観: ${vision}\nキーワード: ${keywords}\n目的: ${purpose}\n`;

  const variants: Variant[] = [
    {
      id: "v1",
      strategyType: "direct",
      title: "直球：売れる訴求",
      rationale: "商品を主役にし、即座に価値が伝わる構図。",
      prompt:
        base +
        "背景はシンプル。スタジオ撮影風。商品中心構図。高級感。被写界深度は浅め。文字なし。",
      negativePrompt: "文字, ロゴ, 透かし, 人物, 手, 指",
    },
    {
      id: "v2",
      strategyType: "branding",
      title: "世界観：ブランド訴求",
      rationale: "コンセプトとムードを最優先。",
      prompt:
        base +
        "ブランド世界観に完全一致する背景。色と空気感で統一。ストーリー性あり。文字なし。",
      negativePrompt: "文字, ロゴ, 透かし, 人物, 手, 指",
    },
    {
      id: "v3",
      strategyType: "proof",
      title: "安心：信頼訴求",
      rationale: "清潔感と信頼感で不安を下げる。",
      prompt:
        base +
        "明るく清潔な環境。素材感が伝わる光。過度な演出なし。誠実な印象。文字なし。",
      negativePrompt: "文字, ロゴ, 透かし, 人物, 手, 指",
    },
  ];

  return { recommendation: "v1", variants };
}

export async function POST(req: NextRequest) {
  try {
    // =========================
    // ① Firebase Admin認証（既存仕様維持）
    // =========================
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return bad("Unauthorized", 401);
    }

    const token = authHeader.split("Bearer ")[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded?.uid) {
      return bad("Invalid token", 401);
    }

    // =========================
    // ② 入力取得
    // =========================
    const body = await req.json().catch(() => null);
    if (!body) return bad("Invalid JSON");

    const vision = safeText(body.vision, 1600);
    const keywords = safeText(body.keywords, 1600);
    const purpose = normalizePurpose(body.purpose);

    if (!vision) return bad("vision is required");
    if (!process.env.OPENAI_API_KEY) return bad("OPENAI_API_KEY missing", 500);

    // =========================
    // ③ OpenAI生成（3戦略固定）
    // =========================
    const system = `
You are a product marketing creative director.
Return STRICT JSON only.
Generate exactly 3 variants.
Each must use strategyType: direct, branding, proof.
Do NOT include brand names or copyrighted characters.
Do NOT include text overlays, watermarks, logos.
`;

    const user = {
      vision,
      keywords,
      purpose,
      output: {
        recommendation: "v1|v2|v3",
        variants: [
          {
            id: "v1|v2|v3",
            strategyType: "direct|branding|proof",
            title: "short title",
            rationale: "short reason",
            prompt: "image prompt",
            negativePrompt: "optional",
          },
        ],
      },
    };

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const resp = await openai.chat.completions.create({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) },
      ],
      response_format: { type: "json_object" } as any,
    });

    const raw = resp.choices?.[0]?.message?.content || "";

    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(fallback3(vision, keywords, purpose), { status: 200 });
    }

    const arr = Array.isArray(parsed?.variants) ? parsed.variants : [];
    const rec = String(parsed?.recommendation ?? "").trim();

    const normalized: Variant[] = arr
      .map((x: any, i: number) => {
        const id = String(x?.id ?? `v${i + 1}`).trim();
        const st = String(x?.strategyType ?? "").trim() as StrategyType;
        if (!["direct", "branding", "proof"].includes(st)) return null;

        return {
          id: id === "v1" || id === "v2" || id === "v3" ? id : `v${i + 1}`,
          strategyType: st,
          title: String(x?.title ?? "").trim() || st,
          rationale: String(x?.rationale ?? "").trim(),
          prompt: String(x?.prompt ?? "").trim(),
          negativePrompt: String(x?.negativePrompt ?? "").trim() || undefined,
        };
      })
      .filter(Boolean) as Variant[];

    if (normalized.length !== 3) {
      return NextResponse.json(fallback3(vision, keywords, purpose), { status: 200 });
    }

    const recommendation =
      rec === "v1" || rec === "v2" || rec === "v3"
        ? rec
        : normalized[0].id;

    return NextResponse.json(
      {
        recommendation,
        variants: normalized,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}