// app/api/generate-captions/route.ts

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

function compactKeywords(keys: unknown): string {
  if (!Array.isArray(keys)) return "";
  return keys.map(String).slice(0, 12).join(" / ");
}

export async function POST(req: Request) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();

    const brandId = typeof body.brandId === "string" ? body.brandId : "vento";
    const vision = typeof body.vision === "string" ? body.vision : "";
    const keywords = compactKeywords(body.keywords);

    if (!vision.trim()) return NextResponse.json({ error: "vision is required" }, { status: 400 });

    const brand = await loadBrand(uid, brandId);
    if (!brand) {
      return NextResponse.json(
        { error: "brand not found. /flow/brands で作成・保存してください" },
        { status: 400 }
      );
    }

    const captionPolicy = brand.captionPolicy ?? {};
    const voiceText = String(captionPolicy.voiceText ?? "");
    const igGoal = String(captionPolicy.igGoal ?? "");
    const xGoal = String(captionPolicy.xGoal ?? "");
    const must = Array.isArray(captionPolicy.must) ? captionPolicy.must.map(String) : [];
    const ban = Array.isArray(captionPolicy.ban) ? captionPolicy.ban.map(String) : [];
    const toneDefault = String(captionPolicy.toneDefault ?? "");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    const client = new OpenAI({ apiKey });

    const sys = [
      "あなたはSNS投稿の文章作成者。",
      "広告臭を消し、誠実で読みやすい日本語にする。",
      "出力は必ずJSONスキーマに一致させる。",
    ].join("\n");

    const userPrompt = [
      "【ブランド設定】",
      `name: ${String(brand.name ?? brandId)}`,
      `voiceText: ${voiceText}`,
      `igGoal: ${igGoal}`,
      `xGoal: ${xGoal}`,
      `must: ${must.join(" / ")}`,
      `ban: ${ban.join(" / ")}`,
      `toneDefault: ${toneDefault}`,
      "",
      "【今回入力】",
      `vision: ${vision}`,
      `keywords: ${keywords}`,
      "",
      "【制約】",
      "- instagram は投稿できる本文（長すぎない）",
      "- x は短く、広告臭なし",
      "- ig3 は別案3つ（本文を上書きする用途ではない）",
    ].join("\n");

    // ✅ Responses API：text.format に json_schema を指定（旧 response_format を廃止）
    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: sys },
        { role: "user", content: userPrompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "caption_payload",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              instagram: { type: "string" },
              x: { type: "string" },
              ig3: {
                type: "array",
                items: { type: "string" },
                minItems: 3,
                maxItems: 3,
              },
            },
            required: ["instagram", "x", "ig3"],
          },
        },
      },
    });

    const raw = resp.output_text || "{}";
    const out = JSON.parse(raw);

    return NextResponse.json({
      instagram: String(out.instagram ?? ""),
      x: String(out.x ?? ""),
      ig3: Array.isArray(out.ig3) ? out.ig3.map(String).slice(0, 3) : ["", "", ""],
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}