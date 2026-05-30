// /lib/cmEngine.ts
import type { VideoEngine } from "@/lib/types/draft";

/* =========================
   型定義
========================= */

export type CMInput = {
  brandPhilosophy: string;   // ブランド思想
  keywords: string;          // キーワード
  emotion: string;           // 感情（例：静寂 / 高級 / 信頼）
  purpose: string;           // 目的（例：ブランディング / 認知）
};

export type CMWorldSpec = {
  concept: string;           // 世界観コンセプト
  composition: string;       // 構図
  motionStyle: string;       // 動きの強さ
  includeProduct: boolean;   // 商品を出すか
  runwayPrompt: string;      // Runway用プロンプト
};

/* =========================
   OpenAIに送るプロンプト生成
========================= */

export function buildCMSystemPrompt(): string {
  return `
あなたは一流ブランドCMディレクターです。

目的：
抽象的で高品質なブランドCMの世界観を設計する。

制約：
- 商品形状を変形させない
- 強い物体変形は禁止
- 過剰なストーリーは禁止
- 高級感・洗練・静寂を優先

出力形式：
JSONのみで返すこと。
`;
}

export function buildCMUserPrompt(input: CMInput): string {
  return `
ブランド思想:
${input.brandPhilosophy}

キーワード:
${input.keywords}

感情:
${input.emotion}

目的:
${input.purpose}

上記を基に、
- 世界観コンセプト
- 構図
- 動きの強さ
- 商品を出すか否か
- Runway用英語プロンプト

をJSONで出力してください。
`;
}

/* =========================
   CM生成（OpenAI → worldSpec）
========================= */

export async function generateCMWorldSpec(
  input: CMInput
): Promise<CMWorldSpec> {
  const res = await fetch("/api/openai/cm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: buildCMSystemPrompt(),
      user: buildCMUserPrompt(input),
    }),
  });

  if (!res.ok) {
    throw new Error("CM world generation failed");
  }

  const data = await res.json();

  return data as CMWorldSpec;
}

/* =========================
   Runway呼び出し
========================= */

export async function generateCMVideo(
  worldSpec: CMWorldSpec
) {
  const res = await fetch("/api/runway/cm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: worldSpec.runwayPrompt,
    }),
  });

  if (!res.ok) {
    throw new Error("Runway CM generation failed");
  }

  return await res.json();
}