// app/api/cm-worldspec/route.ts
// 全張り替え

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { requireUserFromAuthHeader, getAdminDb } from "@/app/api/_firebase/admin";

type BrandId = "vento" | "riva";

type CMWorldSpec = {
  concept: string;
  heroSubject: string;
  visualScene: string;
  composition: string;
  motionStyle: string;
  brandMessage: string;
  includeProduct: boolean;
  runwayPrompt: string;
  negativePrompt: string;
};

function safeText(v: unknown): string {
  return String(v ?? "").trim();
}

function safeBrandId(v: unknown): BrandId {
  return safeText(v) === "riva" ? "riva" : "vento";
}

function pickJsonObject(raw: string): any {
  const text = safeText(raw);
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const matched = text.match(/\{[\s\S]*\}/);
    if (!matched) return null;

    try {
      return JSON.parse(matched[0]);
    } catch {
      return null;
    }
  }
}

function limitText(text: string, max: number): string {
  const s = safeText(text).replace(/\s+/g, " ");
  return s.length > max ? s.slice(0, max) : s;
}

function defaultHeroSubject(brandId: BrandId): string {
  if (brandId === "riva") {
    return "stationary classic car detail, chrome parts, leather interior, analog gauges, polished body reflections";
  }

  return "stationary curated vintage objects, aged wood, metal details, leather texture, glass reflections, patina";
}

function defaultVisualScene(brandId: BrandId): string {
  if (brandId === "riva") {
    return "quiet garage studio, soft side light, classic automotive details, refined dark navy atmosphere";
  }

  return "quiet minimal interior, soft natural window light, refined workspace, curated vintage display";
}

function defaultBrandMessage(brandId: BrandId): string {
  if (brandId === "riva") {
    return "heritage, craftsmanship, mechanical beauty, quiet confidence";
  }

  return "time, memory, material honesty, quiet beauty, recomposition";
}

function normalizeWorldSpec(
  raw: any,
  fallback: {
    brandId: BrandId;
    philosophy: string;
    keywords: string;
    emotion: string;
    purpose: string;
    heroSubject: string;
    visualDirection: string;
    brandMessage: string;
  }
): CMWorldSpec {
  const heroSubject =
    safeText(raw?.heroSubject) ||
    fallback.heroSubject ||
    defaultHeroSubject(fallback.brandId);

  const visualScene =
    safeText(raw?.visualScene) ||
    fallback.visualDirection ||
    defaultVisualScene(fallback.brandId);

  const brandMessage =
    safeText(raw?.brandMessage) ||
    fallback.brandMessage ||
    defaultBrandMessage(fallback.brandId);

  const concept =
    safeText(raw?.concept) ||
    `${fallback.brandId.toUpperCase()} brand commercial with visible stationary objects, material texture, and quiet premium atmosphere`;

  const composition =
    safeText(raw?.composition) ||
    "single fixed angle, close-up material details, stationary hero object, shallow depth of field, minimal interior depth";

  const motionStyle =
    safeText(raw?.motionStyle) ||
    "locked-off tripod shot or very subtle push-in only, gentle focus shift, no object movement, no orbit";

  const runwayPrompt =
    safeText(raw?.runwayPrompt) ||
    [
      `Premium brand commercial for ${fallback.brandId.toUpperCase()}.`,
      `Visible stationary hero object: ${heroSubject}.`,
      `Scene: ${visualScene}.`,
      `Composition: ${composition}.`,
      `Motion: ${motionStyle}.`,
      `Mood: ${fallback.emotion || "calm, nostalgic, refined"}.`,
      `Brand idea: ${brandMessage}.`,
      "Single fixed angle shot. The hero object remains still and faces the same direction for the entire video.",
      "Only a tiny camera push-in and gentle focus shift are allowed.",
      "Preserve the same object identity, shape, orientation, material, proportions, and position throughout the video.",
      "Show real physical objects, tactile material textures, soft natural light, refined shadows.",
      "No readable text in the video, no logo, no people, no hands.",
    ].join(" ");

  const negativePrompt =
    safeText(raw?.negativePrompt) ||
    [
      "no readable text",
      "no subtitles",
      "no logo",
      "no watermark",
      "no people",
      "no hands",
      "no fingers",
      "no object movement",
      "no object morphing",
      "no object rotation",
      "no orbit camera",
      "no side-to-back transition",
      "no front-back reversal",
      "no rear becoming front",
      "no distorted product",
      "no deformed objects",
      "no posters",
      "no signs",
      "no labels",
      "no random letters",
      "no fake typography",
      "no messy clutter",
    ].join(", ");

  return {
    concept: limitText(concept, 180),
    heroSubject: limitText(heroSubject, 180),
    visualScene: limitText(visualScene, 180),
    composition: limitText(composition, 180),
    motionStyle: limitText(motionStyle, 160),
    brandMessage: limitText(brandMessage, 160),
    includeProduct: true,
    runwayPrompt: limitText(runwayPrompt, 780),
    negativePrompt: limitText(negativePrompt, 220),
  };
}

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const body = (await req.json().catch(() => ({}))) as any;

    const draftId = safeText(body?.draftId);
    const brandId = safeBrandId(body?.brandId);

    const philosophy =
      safeText(body?.philosophy) ||
      safeText(body?.brandPhilosophy) ||
      safeText(body?.brandThought);

    const keywords = safeText(body?.keywords);
    const emotion = safeText(body?.emotion);
    const purpose = safeText(body?.purpose);
    const heroSubject = safeText(body?.heroSubject);
    const visualDirection = safeText(body?.visualDirection);
    const brandMessage = safeText(body?.brandMessage);

    if (!draftId) return NextResponse.json({ ok: false, error: "draftId is required" }, { status: 400 });
    if (!philosophy) return NextResponse.json({ ok: false, error: "philosophy is required" }, { status: 400 });

    const db = getAdminDb();
    const draftRef = db.collection("drafts").doc(draftId);
    const snap = await draftRef.get();

    if (!snap.exists) return NextResponse.json({ ok: false, error: "draft not found" }, { status: 404 });

    const current = snap.data() || {};

    if (String(current.userId || "") !== user.uid) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY is missing" }, { status: 500 });
    }

    const systemPrompt = `
あなたは一流ブランドCMディレクターです。
長い日本語ブランド仕様書を読み取り、Runway text-to-video用の短い英語CM仕様に変換します。

重要:
- JSONのみ返す
- 動画内に読める文字・ロゴ・字幕・看板・ラベル・本の文字・パッケージ文字を出さない
- 商品や物体をゼロにしない
- 主役物体は必ず静止させる
- 単一アングル固定で設計する
- カメラは固定またはごく弱い押し込みのみ
- 回り込み、横から後ろへの移動、360度移動は禁止
- 主役物体の形・向き・比率・素材・位置を動画全体で維持する
- 物体の変形、反転、回転、走行、通過、前後入れ替わりを禁止する
- 人物・手・指は出さない
- 抽象的すぎる空気動画にしない
- 必ず「見える主役の物体」と「素材の質感」を指定する
- brandIdがventoなら、ヴィンテージ素材、木、金属、革、ガラス、経年の質感を主役にする
- brandIdがrivaなら、クラシックカーの部品、クローム、革内装、計器、車体反射を主役にする
- runwayPromptは英語、780文字以内
- negativePromptは英語、220文字以内
`.trim();

    const userPrompt = `
brandId:
${brandId}

ブランド仕様書・思想:
${limitText(philosophy, 6000)}

キーワード:
${keywords || "なし"}

感情:
${emotion || "静謐・信頼・郷愁"}

目的:
${purpose || "ブランド認知・世界観提示"}

CMで映したい主役:
${heroSubject || "未指定。仕様書から適切に抽出"}

映像の方向性:
${visualDirection || "未指定。仕様書から適切に抽出"}

伝えたい一文:
${brandMessage || "未指定。仕様書から適切に抽出"}

JSONで返してください。
`.trim();

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const openaiJson = await openaiRes.json().catch(() => ({} as any));

    if (!openaiRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            openaiJson?.error?.message ||
            openaiJson?.message ||
            `OpenAI worldSpec failed (${openaiRes.status})`,
        },
        { status: 500 }
      );
    }

    const parsed = pickJsonObject(safeText(openaiJson?.choices?.[0]?.message?.content));

    const worldSpec = normalizeWorldSpec(parsed, {
      brandId,
      philosophy,
      keywords,
      emotion,
      purpose,
      heroSubject,
      visualDirection,
      brandMessage,
    });

    const worldSpecText = JSON.stringify(worldSpec, null, 2);

    await draftRef.set(
      {
        cmApplied: {
          ...(current.cmApplied && typeof current.cmApplied === "object" ? current.cmApplied : {}),
          worldSpec,
          worldSpecText,
          philosophy,
          keywords,
          emotion,
          purpose,
          heroSubject,
          visualDirection,
          brandMessage,
          brandId,
          designedAt: Date.now(),
          runwayPrompt: worldSpec.runwayPrompt,
          negativePrompt: worldSpec.negativePrompt,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      worldSpec,
      worldSpecText,
      text: worldSpecText,
      spec: worldSpecText,
    });
  } catch (e: any) {
    console.error("[cm-worldspec] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "cm-worldspec failed" },
      { status: 500 }
    );
  }
}