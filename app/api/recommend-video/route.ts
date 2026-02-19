// /app/api/recommend-video/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { videoButtons, normalizeVideoButtonId } from "@/lib/videoButtons";
import type { MotionCharacter, VideoEngine } from "@/lib/types/draft";

export const runtime = "nodejs";

/* ========================= */

type Input = {
  brand?: {
    vision?: string;
    voice?: string;
    ban?: string;
    must?: string;
  };
  context?: {
    purpose?: string;
    platform?: string;
    keywords?: string[];
  };
};

type Pick = {
  id: string;
  engine: VideoEngine;
  motionCharacter: MotionCharacter;
  reason: string;
};

/* ========================= */

function enforceRules(raw: Pick[]): Pick[] {
  const byId = new Map(videoButtons.map((b) => [b.id, b]));

  const normalized = raw
    .map((p) => ({
      ...p,
      id: normalizeVideoButtonId(p.id) ?? "",
    }))
    .filter((p) => byId.has(p.id));

  const fixed = normalized.map((p) => {
    const b = byId.get(p.id)!;
    return {
      ...p,
      engine: b.engine,
    };
  });

  const nonAi = fixed.filter((p) => p.engine === "nonai");
  const runway = fixed.filter((p) => p.engine === "runway").slice(0, 2);

  const merged = [...nonAi, ...runway];

  const exist = new Set(merged.map((m) => m.id));
  const nonAiPool = videoButtons.filter((b) => b.engine === "nonai");

  for (const b of nonAiPool) {
    if (merged.length >= 3) break;
    if (exist.has(b.id)) continue;

    merged.push({
      id: b.id,
      engine: b.engine,
      motionCharacter: b.defaultMotion,
      reason: "静かで破綻しにくい基本表現",
    });

    exist.add(b.id);
  }

  return merged.slice(0, 5);
}

function safeDefault(): Pick[] {
  return videoButtons
    .filter((b) => b.engine === "nonai")
    .slice(0, 3)
    .map((b) => ({
      id: b.id,
      engine: b.engine,
      motionCharacter: b.defaultMotion,
      reason: "情報不足のため安全側を選択",
    }));
}

/* ========================= */

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Input;

    const vision = String(body?.brand?.vision ?? "").trim();
    const purpose = String(body?.context?.purpose ?? "").trim();
    const keywords = Array.isArray(body?.context?.keywords)
      ? body.context!.keywords!.map(String).slice(0, 10)
      : [];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ recommendedVideos: safeDefault() });
    }

    const client = new OpenAI({ apiKey });

    const defs = videoButtons.map((b) => ({
      id: b.id,
      engine: b.engine,
      description: b.description,
      motionRange: b.motionRange,
      defaultMotion: b.defaultMotion,
    }));

    const system = `
あなたはAOI FLOWの動画推薦エンジン。
説明文生成は禁止。
選択と理由のみ返す。
`;

    const user = `
Vision: ${vision}
Purpose: ${purpose}
Keywords: ${keywords.join(",")}

VideoButtons:
${JSON.stringify(defs)}

JSONのみ返す。
`;

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const parsed = JSON.parse(resp.output_text || "{}");

    const picks = enforceRules(
      Array.isArray(parsed?.recommendedVideos)
        ? parsed.recommendedVideos
        : []
    );

    return NextResponse.json({ recommendedVideos: picks });
  } catch {
    return NextResponse.json({ recommendedVideos: safeDefault() });
  }
}