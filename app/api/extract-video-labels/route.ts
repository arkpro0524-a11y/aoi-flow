// app/api/extract-video-labels/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import type { VideoLabels } from "@/lib/videoDecision/labels";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  await requireUserFromAuthHeader(req);
  const { vision, keywords } = await req.json();

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `
You output ONLY JSON.
Decide video intent labels.
`,
      },
      {
        role: "user",
        content: `
Vision: ${vision}
Keywords: ${keywords.join(", ")}

Return:
{
 motion: static|dynamic,
 emphasis: restrained|strong,
 focus: world|product,
 emotion: low|mid|high
}
`,
      },
    ],
  });

  const json = JSON.parse(res.choices[0].message.content || "{}");
  return NextResponse.json(json as VideoLabels);
}