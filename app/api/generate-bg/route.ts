// /app/api/generate-bg/route.ts

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/firebaseAdmin";
import { getStorage } from "firebase-admin/storage";
import crypto from "crypto";

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
function stableHash(input: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
}

function buildDownloadUrl(bucket: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;
}

async function fetchAsImage(url: string): Promise<File> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("failed to fetch source image");
  const ct = r.headers.get("content-type") || "image/png";
  const ab = await r.arrayBuffer();
  return new File([ab], "source.png", { type: ct });
}

function compactKeywords(keys: unknown): string {
  if (!Array.isArray(keys)) return "";
  return keys.map(String).slice(0, 12).join(", ");
}

/* ========= main ========= */
export async function POST(req: Request) {
  try {
    const uid = await requireUid(req);
    const body = await req.json().catch(() => ({} as any));

    const draftId = String(body.draftId || "").trim();
    if (!draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    }

    const brandId = String(body.brandId || "vento");
    const vision = String(body.vision || "").trim();
    const keywords = compactKeywords(body.keywords);
    const referenceImageUrl = String(body.referenceImageUrl || body.sourceImageUrl || "").trim();

    const scene = String(body.scene || "studio");
    const sceneHint = String(body.sceneHint || "");

    if (!vision) {
      return NextResponse.json({ error: "vision is required" }, { status: 400 });
    }
    if (!referenceImageUrl) {
      return NextResponse.json({ error: "referenceImageUrl is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const brandSnap = await db.doc(`users/${uid}/brands/${brandId}`).get();
    if (!brandSnap.exists) {
      return NextResponse.json({ error: "brand not found" }, { status: 400 });
    }

    const brand = brandSnap.data() || {};
    const styleText = String(brand?.imagePolicy?.styleText || "");
    const rules = Array.isArray(brand?.imagePolicy?.rules)
      ? brand.imagePolicy.rules.map(String)
      : [];

    const OUTPUT_SIZE = "1024x1024";

    /* =========================
       ✅ Scene + 崩壊防止ルール強化
    ========================== */

    const hardRules = [
      "The product must remain 100% unchanged.",
      "Do NOT modify shape, structure, handles, wood grain, edges, or logo.",
      "Do NOT add hands, people, fingers, arms, or new objects.",
      "Do NOT place decorative props.",
      "Background must create atmosphere using light, shadow, blur only.",
      "No text. No watermark. No logo.",
    ];

    const prompt = [
      "You will receive a product photo.",
      "Your task: Replace or enhance ONLY the background.",
      "",
      `SCENE TYPE: ${scene}`,
      sceneHint ? `SCENE DESCRIPTION: ${sceneHint}` : "",
      "",
      `Brand: ${brand.name || brandId}`,
      `Vision: ${vision}`,
      keywords ? `Keywords: ${keywords}` : "",
      styleText ? `Style: ${styleText}` : "",
      rules.length ? `Brand Rules: ${rules.join(" / ")}` : "",
      "",
      "STRICT RULES:",
      ...hardRules.map((r) => `- ${r}`),
      "",
      `Return a square image (${OUTPUT_SIZE}).`,
    ]
      .filter(Boolean)
      .join("\n");

    const key = stableHash({
      uid,
      draftId,
      brandId,
      vision,
      keywords,
      referenceImageUrl,
      scene,
      styleText,
      rules,
    });

    const bucket = getStorage().bucket();
    const objectPath = `users/${uid}/drafts/${draftId}/bg/${key}.png`;
    const fileRef = bucket.file(objectPath);

    const [exists] = await fileRef.exists();
    if (exists) {
      const [meta] = await fileRef.getMetadata().catch(() => [null as any]);
      const token =
        meta?.metadata?.firebaseStorageDownloadTokens?.split(",")[0] ||
        crypto.randomUUID();

      return NextResponse.json({
        url: buildDownloadUrl(bucket.name, objectPath, token),
        reused: true,
        draftId,
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    const image = await fetchAsImage(referenceImageUrl);

    const fd = new FormData();
    fd.append("model", "gpt-image-1");
    fd.append("prompt", prompt);
    fd.append("size", OUTPUT_SIZE);
    fd.append("image", image);

    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });

    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "openai image edit error");

    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image returned");

    const buf = Buffer.from(b64, "base64");
    const token = crypto.randomUUID();

    await fileRef.save(buf, {
      contentType: "image/png",
      resumable: false,
      metadata: {
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    return NextResponse.json({
      url: buildDownloadUrl(bucket.name, objectPath, token),
      reused: false,
      draftId,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}