// /app/api/product-selector/analyze/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireUserFromAuthHeader, getAdminDb } from "@/app/api/_firebase/admin";
import { evaluateProductCandidate, type ProductSelectorInput } from "@/lib/productSelector/scoring";
import {
  buildProductSelectorSystemPrompt,
  buildProductSelectorUserPrompt,
  normalizeProductSelectorAiResult,
} from "@/lib/productSelector/aiTheory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function normalizeInput(raw: unknown): ProductSelectorInput {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    name: safeString(obj.name),
    sourceTypes: safeString(obj.sourceTypes),
    sourceText: safeString(obj.sourceText),
    visualNotes: safeString(obj.visualNotes),
    candidateHint: safeString(obj.candidateHint),
    budget: safeNumber(obj.budget),
    category: safeString(obj.category),
    keywords: safeString(obj.keywords),
    memo: safeString(obj.memo),
  };
}

function extractJsonObject(text: string): unknown {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("PRODUCT SELECTOR AI JSON parse failed.");
  }
}

export async function POST(req: Request) {
  let uid: string | null = null;

  try {
    const user = await requireUserFromAuthHeader(req);
    uid = user.uid;

    const body = (await req.json()) as { input?: unknown };
    const input = normalizeInput(body.input);

    const fallback = evaluateProductCandidate(input);

    const hasAnyInput = [
    input.name,
    input.sourceTypes,
    input.sourceText,
    input.visualNotes,
    input.candidateHint,
    input.category,
    input.keywords,
    input.memo,
   ].some((x) => (x ?? "").trim().length > 0);

    if (!hasAnyInput) {
      return NextResponse.json({
        ok: false,
        usedAi: false,
        result: fallback,
        error: "観測素材が未入力です。ニュース・SNS・画像メモ・記事などを入力してください。",
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        ok: true,
        usedAi: false,
        result: fallback,
        error: "OPENAI_API_KEY が未設定のため、固定ルール分析のみ返しました。",
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: process.env.PRODUCT_SELECTOR_OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content: buildProductSelectorSystemPrompt(),
        },
        {
          role: "user",
          content: buildProductSelectorUserPrompt(input),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const rawJson = extractJsonObject(content);
    const result = normalizeProductSelectorAiResult(rawJson, fallback);

    let savedLogId: string | undefined;

    try {
      const db = getAdminDb();
      const createdAt = new Date().toISOString();
      const ref = await db.collection("product_selector_logs").add({
        uid,
        input,
        result,
        usedAi: true,
        theoryVersion: result.theoryVersion,
        createdAt,
      });
      savedLogId = ref.id;

      // PRODUCT SELECTOR専用の観測データです。
      // SELL CHECKの売却済み学習データとは分けて保存し、
      // 「スクショから見えた市場の空気」「今見る候補」「理論メモ」を後から育てられる形にします。
      await db.collection("product_selector_market_observations").add({
        uid,
        sourceLogId: ref.id,
        input,
        observationFacts: result.observationFacts || [],
        buyCandidates: result.buyCandidates || [],
        learningSignals: result.learningSignals || [],
        searchKeywords: result.searchKeywords || [],
        createdAt,
      });

      await db.collection("product_selector_theory_notes").add({
        uid,
        sourceLogId: ref.id,
        theoryVersion: result.theoryVersion,
        observationSummary: result.observationSummary,
        whyNow: result.whyNow,
        notYetReason: result.notYetReason,
        evidence: result.evidence || [],
        aiWarnings: result.aiWarnings || [],
        createdAt,
      });
    } catch (logError) {
      console.warn("[PRODUCT_SELECTOR] log save failed", logError);
    }

    return NextResponse.json({
      ok: true,
      usedAi: true,
      result,
      savedLogId,
    });
  } catch (error) {
    console.error("[PRODUCT_SELECTOR_ANALYZE_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        usedAi: false,
        error:
          error instanceof Error
            ? error.message
            : "PRODUCT SELECTOR のAI分析に失敗しました。",
      },
      { status: 500 }
    );
  }
}
