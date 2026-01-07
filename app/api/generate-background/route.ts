// /app/api/generate-background/route.ts
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

function compactVoiceText(v: unknown): string {
  const s = String(v ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const MAX = 220;
  return s.length <= MAX ? s : s.slice(0, MAX) + "…";
}

async function fetchAsImageFile(url: string): Promise<{ file: File; mime: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("failed to fetch source image");
  const ct = r.headers.get("content-type") || "image/png";
  const ab = await r.arrayBuffer();
  const blob = new Blob([ab], { type: ct });
  const file = new File([blob], "source.png", { type: ct });
  return { file, mime: ct };
}

export async function POST(req: Request) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();

    const brandId = typeof body.brandId === "string" ? body.brandId : "vento";
    const vision = typeof body.vision === "string" ? body.vision : "";
    const keywords = compactKeywords(body.keywords);
    const sourceImageUrl = typeof body.sourceImageUrl === "string" ? body.sourceImageUrl : "";

    if (!vision.trim()) {
      return NextResponse.json({ error: "vision is required" }, { status: 400 });
    }
    if (!sourceImageUrl) {
      return NextResponse.json({ error: "sourceImageUrl is required" }, { status: 400 });
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

    const captionPolicy = brand.captionPolicy ?? {};
    const voiceText = compactVoiceText(captionPolicy.voiceText ?? "");

    const prompt = [
      "You will receive a product photo.",
      "Goal: Create a clean, attractive square background that matches the brand style.",
      "IMPORTANT: Keep the main subject (product) unchanged and sharp. Do NOT distort the product.",
      "If needed, extend / improve background, lighting, and composition.",
      `Brand: ${String(brand.name ?? brandId)}`,
      `Vision: ${vision}`,
      keywords ? `Keywords: ${keywords}` : "",
      voiceText ? `Brand Voice (short): ${voiceText}` : "",
      styleText ? `Style: ${styleText}` : "",
      rules.length ? `Rules: ${rules.join(" / ")}` : "",
      "No text. No logos. No watermark.",
      "Return a square image (1024x1024).",
    ]
      .filter(Boolean)
      .join("\n");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    const { file } = await fetchAsImageFile(sourceImageUrl);

    const fd = new FormData();
    fd.append("model", "gpt-image-1"); // edits対応モデル（環境でgpt-image-1.5があるなら差し替え可）
    fd.append("prompt", prompt);
    fd.append("size", "1024x1024");
    fd.append("image", file);

    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });

    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "openai image edit error");

    const b64 = j?.data?.[0]?.b64_json;
    if (typeof b64 === "string" && b64) return NextResponse.json({ b64 });

    throw new Error("no image returned");
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}