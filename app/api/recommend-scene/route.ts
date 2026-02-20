// /app/api/recommend-scene/route.ts
import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/firebaseAdmin";

export const runtime = "nodejs";

/* ========= auth ========= */
function bearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function requireUid(req: Request): Promise<string> {
  const token = bearerToken(req);
  if (!token) throw new Error("missing token");
  const decoded = await getAdminAuth().verifyIdToken(token);
  if (!decoded?.uid) throw new Error("invalid token");
  return decoded.uid;
}

/* ========= helpers ========= */
function compactKeywords(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return keys.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 12);
}

async function loadBrand(uid: string, brandId: string) {
  const db = getAdminDb();
  const ref = db.doc(`users/${uid}/brands/${brandId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as any;
}

/* ========= main ========= */
export async function POST(req: Request) {
  try {
    const uid = await requireUid(req);
    const body = await req.json().catch(() => ({} as any));

    const brandId = typeof body.brandId === "string" ? body.brandId : "vento";
    const vision = typeof body.vision === "string" ? body.vision.trim() : "";
    const keywordsArr = compactKeywords(body.keywords);
    const productImageUrl =
      typeof body.productImageUrl === "string" ? body.productImageUrl.trim() : "";

    if (!vision) return NextResponse.json({ error: "vision is required" }, { status: 400 });
    if (!productImageUrl) return NextResponse.json({ error: "productImageUrl is required" }, { status: 400 });

    const brand = await loadBrand(uid, brandId);
    if (!brand) {
      return NextResponse.json(
        { error: "brand not found. /flow/brands で作成・保存してください" },
        { status: 400 }
      );
    }

    const imagePolicy = brand.imagePolicy ?? {};
    const styleText = String(imagePolicy.styleText ?? "");
    const rules = Array.isArray(imagePolicy.rules) ? imagePolicy.rules.map(String) : [];

    // ✅ “売り方”をAIに決めさせる（JSON固定）
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    const system = [
      "You are a product marketing art director.",
      "Decide the best selling angle and the best scene for the background.",
      "Output MUST be strict JSON only. No markdown, no extra text.",
      "Do not propose adding hands/people/text/logos/watermarks.",
      "Avoid adding new objects; express lifestyle via space, light, wall texture, shadows, depth.",
    ].join("\n");

    const user = {
      brand: String(brand.name ?? brandId),
      vision,
      keywords: keywordsArr,
      styleText,
      rules,
      productImageUrl,
      requiredOutput: {
        angle: "string (selling angle in Japanese, short)",
        scene: "studio | lifestyle | scale | detail",
        bgPrompt: "string (VERY concrete scene definition, Japanese ok)",
        why: "string (short reason in Japanese)",
      },
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(user) },
        ],
      }),
    });

    const j = await r.json().catch(() => ({} as any));
    if (!r.ok) throw new Error(j?.error?.message || "openai error");

    const content = j?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("no content");

    const parsed = JSON.parse(content);

    const angle = String(parsed?.angle ?? "").trim();
    const scene = String(parsed?.scene ?? "").trim();
    const bgPrompt = String(parsed?.bgPrompt ?? "").trim();
    const why = String(parsed?.why ?? "").trim();

    const okScene = ["studio", "lifestyle", "scale", "detail"].includes(scene);

    if (!angle || !bgPrompt || !okScene) {
      return NextResponse.json(
        { error: "invalid ai output", raw: parsed },
        { status: 500 }
      );
    }

    return NextResponse.json({
      angle,
      scene,
      bgPrompt,
      why,
      brandId,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}