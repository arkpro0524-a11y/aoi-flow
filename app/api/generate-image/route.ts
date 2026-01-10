// /app/api/generate-image/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getDb } from "@/lib/server/firebaseAdmin";
import { getIdempotencyKey } from "@/lib/server/idempotency";
import { PRICING } from "@/lib/server/pricing";
import { getAdminAuth } from "@/firebaseAdmin";

export const runtime = "nodejs";

type ReqBody = {
  brandId?: string;
  vision?: string;
  keywords?: unknown;
  tone?: string;

  // 互換入力（古い呼び出しも吸収）
  prompt?: string;

  requestId?: string;
  idempotencyKey?: string;

  imageSize?: "1024x1024" | "1024x1536" | "1536x1024";
  model?: string;
};

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

// data:image/png;base64,xxxx から b64 だけ抜く
function b64FromDataUrl(dataUrl: string) {
  const m = String(dataUrl || "").match(/^data:image\/png;base64,(.+)$/);
  return m?.[1] ?? "";
}

export async function POST(req: Request) {
  // ✅ 認証（本番必須：悪用・課金事故防止）
  let uid = "";
  try {
    uid = await requireUid(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as ReqBody;

  // ✅ 入力互換：brand/vision/keywords からも prompt からも作れる
  const directPrompt = String(body.prompt ?? "").trim();
  const vision = String(body.vision ?? "").trim();
  const brandId = String(body.brandId ?? "").trim();
  const keywords = Array.isArray(body.keywords) ? body.keywords.map(String).slice(0, 12) : [];

  const prompt =
    (directPrompt ||
      [
        "You are generating a clean, premium product photo background.",
        "No text. No watermark. No logos.",
        brandId ? `Brand: ${brandId}` : "",
        vision ? `Vision: ${vision}` : "",
        keywords.length ? `Keywords: ${keywords.join(" / ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"))
      .slice(0, PRICING.MAX_PROMPT_CHARS)
      .trim();

  if (!prompt) {
    return NextResponse.json({ ok: false, error: "prompt is required" }, { status: 400 });
  }

  // ✅ uid を必ず含めて idemKey を作る（ユーザー間衝突防止）
  const idemKey = getIdempotencyKey(req, { ...body, type: "image", uid, prompt });

  const db = getDb();
  const docRef = db.collection("generations").doc(idemKey);

  const reserved = await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (snap.exists) return { already: true, data: snap.data() as any };

    tx.set(docRef, {
      id: idemKey,
      type: "image",
      status: "running",
      uid,
      prompt,
      createdAt: Date.now(),
      costYen: PRICING.calcImageCostYen(),
    });
    return { already: false, data: null };
  });

  // ✅ reused のときも b64 を返す（フロント事故防止）
  if (reserved.already) {
    const gen = reserved.data || {};
    const dataUrl = String(gen.imageDataUrl ?? "");
    const b64 = b64FromDataUrl(dataUrl);
    return NextResponse.json({ ok: true, reused: true, b64: b64 || null, generation: gen });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    const client = new OpenAI({ apiKey });

    const size = body.imageSize ?? "1024x1024";
    const model = body.model ?? "gpt-image-1";

    const res = await client.images.generate({ model, prompt, size });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image generation failed (no b64_json)");

    const generation = {
      id: idemKey,
      type: "image",
      status: "succeeded",
      uid,
      prompt,
      imageDataUrl: `data:image/png;base64,${b64}`,
      costYen: PRICING.calcImageCostYen(),
      finishedAt: Date.now(),
    };

    await docRef.set(generation, { merge: true });

    // ✅ フロント互換：b64 をトップレベルでも返す
    return NextResponse.json({ ok: true, reused: false, b64, generation });
  } catch (e: any) {
    await docRef.set({ status: "failed", error: String(e?.message ?? e), finishedAt: Date.now() }, { merge: true });
    return NextResponse.json({ ok: false, error: String(e?.message ?? e), id: idemKey }, { status: 500 });
  }
}