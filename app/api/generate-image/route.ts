// /app/api/generate-image/route.ts
import { NextResponse } from "next/server";
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

function compactKeywords(keys: unknown): string {
  if (!Array.isArray(keys)) return "";
  return keys.map(String).slice(0, 12).join(", ");
}

/**
 * voiceText は「長文」になりがちなので、画像用に軽く整形して短くする。
 * - 改行や余計な空白を潰す
 * - 文字数上限でカット（入れすぎると絵が崩れる）
 */
function compactVoiceText(v: unknown): string {
  const s = String(v ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!s) return "";
  const MAX = 220; // ← 入れすぎ防止（ここが重要）
  return s.length <= MAX ? s : s.slice(0, MAX) + "…";
}

export async function POST(req: Request) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();

    const brandId = typeof body.brandId === "string" ? body.brandId : "vento";
    const vision = typeof body.vision === "string" ? body.vision : "";
    const keywords = compactKeywords(body.keywords);

    if (!vision.trim()) {
      return NextResponse.json({ error: "vision is required" }, { status: 400 });
    }

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

    // ✅ ここが追加：ブランド思想を画像にも寄せる
    const captionPolicy = brand.captionPolicy ?? {};
    const voiceTextRaw = captionPolicy.voiceText ?? "";
    const voiceText = compactVoiceText(voiceTextRaw);

    const prompt = [
      "Create a square image.",
      `Brand: ${String(brand.name ?? brandId)}`,
      `Vision: ${vision}`,
      keywords ? `Keywords: ${keywords}` : "",
      voiceText ? `Brand Voice (short): ${voiceText}` : "",
      styleText ? `Style: ${styleText}` : "",
      rules.length ? `Rules: ${rules.join(" / ")}` : "",
      "No text in the image.",
      "No logos and no watermark.",
    ]
      .filter(Boolean)
      .join("\n");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    // Images API（b64で返す）
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    });

    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "openai image error");

    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image returned");

    return NextResponse.json({ b64: String(b64) });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}