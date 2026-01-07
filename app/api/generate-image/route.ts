import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getDb } from "@/lib/server/firebaseAdmin";
import { getIdempotencyKey } from "@/lib/server/idempotency";
import { PRICING } from "@/lib/server/pricing";

export const runtime = "nodejs";

type ReqBody = {
  prompt: string;
  requestId?: string;
  idempotencyKey?: string;
  imageSize?: "1024x1024" | "1024x1536" | "1536x1024";
  model?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as ReqBody;

  const prompt = String(body.prompt ?? "")
    .slice(0, PRICING.MAX_PROMPT_CHARS)
    .trim();

  if (!prompt) {
    return NextResponse.json({ ok: false, error: "prompt is required" }, { status: 400 });
  }

  const idemKey = getIdempotencyKey(req, { ...body, type: "image" });
  const db = getDb();
  const docRef = db.collection("generations").doc(idemKey);

  const reserved = await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (snap.exists) return { already: true, data: snap.data() as any };

    tx.set(docRef, {
      type: "image",
      status: "running",
      prompt,
      createdAt: Date.now(),
      costYen: PRICING.calcImageCostYen(),
    });
    return { already: false, data: null };
  });

  if (reserved.already) {
    return NextResponse.json({ ok: true, reused: true, generation: reserved.data });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const size = body.imageSize ?? "1024x1024";
    const model = body.model ?? "gpt-image-1";

    const res = await client.images.generate({ model, prompt, size });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image generation failed (no b64_json)");

    const generation = {
      id: idemKey,
      type: "image",
      status: "succeeded",
      prompt,
      imageDataUrl: `data:image/png;base64,${b64}`,
      costYen: PRICING.calcImageCostYen(),
      finishedAt: Date.now(),
    };

    await docRef.set(generation, { merge: true });
    return NextResponse.json({ ok: true, reused: false, generation });
  } catch (e: any) {
    await docRef.set(
      { status: "failed", error: String(e?.message ?? e), finishedAt: Date.now() },
      { merge: true }
    );
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e), id: idemKey },
      { status: 500 }
    );
  }
}