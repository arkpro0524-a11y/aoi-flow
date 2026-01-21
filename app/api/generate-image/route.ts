// /app/api/generate-image/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import crypto from "crypto";
import { getStorage } from "firebase-admin/storage";
import { getIdempotencyKey } from "@/lib/server/idempotency";
import { PRICING } from "@/lib/server/pricing";
import { getAdminAuth, getAdminDb } from "@/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReqBody = {
  brandId?: string;
  vision?: string;
  keywords?: unknown;
  tone?: string;

  // 互換入力
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

function buildDownloadUrl(bucket: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;
}

function compactKeywords(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return keys.map(String).slice(0, 12);
}

export async function POST(req: Request) {
  // ✅ auth
  let uid = "";
  try {
    uid = await requireUid(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as ReqBody;

  // ✅ prompt を作る（既存互換）
  const directPrompt = String(body.prompt ?? "").trim();
  const vision = String(body.vision ?? "").trim();
  const brandId = String(body.brandId ?? "").trim();
  const keywords = compactKeywords(body.keywords);

  const prompt =
    (directPrompt ||
      [
        "You are generating a clean, premium product photo style image.",
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

  // ✅ uid含めて idemKey（ユーザー間衝突防止）
  const idemKey = getIdempotencyKey(req, { ...body, type: "image", uid, prompt });

  const db = getAdminDb();
  const docRef = db.collection("generations").doc(idemKey);

  // ✅ Storage 保存先（同一 idemKey ＝同一ファイル）
  const bucket = getStorage().bucket();
  const objectPath = `users/${uid}/generations/images/${idemKey}.png`;
  const fileRef = bucket.file(objectPath);

  // ✅ 既に Storage にあるなら「確実に再利用」
  {
    const [exists] = await fileRef.exists();
    if (exists) {
      const [meta] = await fileRef.getMetadata().catch(() => [null as any]);
      const existingToken =
        meta?.metadata?.firebaseStorageDownloadTokens ||
        meta?.metadata?.firebaseStorageDownloadToken ||
        "";

      const token =
        typeof existingToken === "string" && existingToken
          ? existingToken.split(",")[0].trim()
          : crypto.randomUUID();

      if (!existingToken) {
        await fileRef.setMetadata({
          metadata: { firebaseStorageDownloadTokens: token },
          contentType: meta?.contentType || "image/png",
        });
      }

      const url = buildDownloadUrl(bucket.name, objectPath, token);

      // Firestoreも最低限整合させる（無くてもOK）
      await docRef.set(
        {
          id: idemKey,
          type: "image",
          status: "succeeded",
          uid,
          prompt,
          imageUrl: url,
          costYen: PRICING.calcImageCostYen(),
          finishedAt: Date.now(),
        },
        { merge: true }
      );

      return NextResponse.json({ ok: true, reused: true, url, generation: { id: idemKey } });
    }
  }

  // ✅ Firestore が存在しても「成功してURLがある時だけ reused」
  // 失敗/途中の doc が残ってても再生成できるようにする
  const snap = await docRef.get().catch(() => null as any);
  if (snap?.exists) {
    const gen = snap.data() as any;
    const status = String(gen?.status ?? "");
    const imageUrl = String(gen?.imageUrl ?? "");

    if (status === "succeeded" && imageUrl) {
      return NextResponse.json({ ok: true, reused: true, url: imageUrl, generation: gen });
    }

    // running が直近なら「処理中」を返す（連打で課金事故防止）
    if (status === "running") {
      const createdAt = Number(gen?.createdAt ?? 0);
      if (createdAt && Date.now() - createdAt < 60_000) {
        return NextResponse.json(
          { ok: false, status: "running", error: "generation is running" },
          { status: 202 }
        );
      }
    }
    // failed / stale running は下で再実行
  }

  // ✅ 予約（running）
  await docRef.set(
    {
      id: idemKey,
      type: "image",
      status: "running",
      uid,
      prompt,
      createdAt: Date.now(),
      costYen: PRICING.calcImageCostYen(),
    },
    { merge: true }
  );

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    const client = new OpenAI({ apiKey });

    const size = body.imageSize ?? "1024x1024";
    const model = body.model ?? "gpt-image-1";

    const res = await client.images.generate({ model, prompt, size });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image generation failed (no b64_json)");

    const buf = Buffer.from(b64, "base64");

    // ✅ Storage保存（token付き）
    const token = crypto.randomUUID();
    await fileRef.save(buf, {
      contentType: "image/png",
      resumable: false,
      metadata: {
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const url = buildDownloadUrl(bucket.name, objectPath, token);

    const generation = {
      id: idemKey,
      type: "image",
      status: "succeeded",
      uid,
      prompt,
      imageUrl: url,
      costYen: PRICING.calcImageCostYen(),
      finishedAt: Date.now(),
    };

    await docRef.set(generation, { merge: true });

    // ✅ UI互換：url を返す（b64も欲しければ返せるが、まずURL安定を優先）
    return NextResponse.json({ ok: true, reused: false, url, generation });
  } catch (e: any) {
    await docRef.set(
      { status: "failed", error: String(e?.message ?? e), finishedAt: Date.now() },
      { merge: true }
    );
    return NextResponse.json({ ok: false, error: String(e?.message ?? e), id: idemKey }, { status: 500 });
  }
}