//app/api/cm-worldspec/route.ts

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { brandId, brandThought, keywords, emotion, purpose } = body ?? {};

    // TODO: ここで OpenAI を呼び出して worldSpec を生成
    // いまは仮で返す（STEP2 UI確認優先）
    const worldSpec = {
      brandId: String(brandId ?? ""),
      brandThought: String(brandThought ?? ""),
      keywords: String(keywords ?? ""),
      emotion: String(emotion ?? ""),
      purpose: String(purpose ?? ""),
      // "固定しない"思想なので、テンプレは持たない
      createdAt: Date.now(),
    };

    return NextResponse.json({ worldSpec });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}