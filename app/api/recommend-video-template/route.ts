import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminAuth, getAdminDb } from "@/firebaseAdmin";

export const runtime = "nodejs";

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

async function loadBrand(uid: string, brandId: string) {
  const db = getAdminDb();
  const ref = db.doc(`users/${uid}/brands/${brandId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as any;
}

export async function POST(req: Request) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();

    const brandId = typeof body.brandId === "string" ? body.brandId : "vento";
    const vision = typeof body.vision === "string" ? body.vision : "";
    const keywords = Array.isArray(body.keywords) ? body.keywords.map(String).slice(0, 12) : [];

    if (!vision.trim()) return NextResponse.json({ error: "vision is required" }, { status: 400 });

    const brand = await loadBrand(uid, brandId);
    if (!brand) {
      return NextResponse.json(
        { error: "brand not found. /flow/brands で作成・保存してください" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");
    const client = new OpenAI({ apiKey });

    const sys = [
      "あなたは短尺商品動画のテンプレ選定アシスタント。",
      "ユーザーは迷いたくないので、結論は1つに絞る。",
      "出力は必ずJSONスキーマに一致させる。",
    ].join("\n");

    const userPrompt = [
      "テンプレ候補は以下のみ：",
      '["slowZoomFade","zoomIn","zoomOut","slideLeft","slideRight","fadeIn","fadeOut","static"]',
      "",
      `ブランド: ${String(brand.name ?? brandId)}`,
      `ビジョン: ${vision}`,
      keywords.length ? `キーワード: ${keywords.join(" / ")}` : "",
      "",
      "条件：",
      "- reason は日本語で短く。広告臭なし。",
      "- confidence は 0.0〜1.0 の小数。",
    ].join("\n");

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: sys },
        { role: "user", content: userPrompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "template_pick",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              templateId: {
                type: "string",
                enum: ["slowZoomFade", "zoomIn", "zoomOut", "slideLeft", "slideRight", "fadeIn", "fadeOut", "static"],
              },
              reason: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["templateId", "reason", "confidence"],
          },
        },
      },
    });

    const raw = resp.output_text || "{}";
    const out = JSON.parse(raw);

    const templateId = String(out.templateId ?? "slowZoomFade");
    const reason = String(out.reason ?? "");
    const confidenceNum = Number(out.confidence ?? 0);

    return NextResponse.json({
      templateId,
      reason,
      confidence: Number.isFinite(confidenceNum) ? Math.max(0, Math.min(1, confidenceNum)) : 0,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}