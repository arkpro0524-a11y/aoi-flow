// app/api/backgrounds/candidates/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminDb } from "@/firebaseAdmin";

function compactKeywords(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return keys.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 16);
}

async function loadBrand(uid: string, brandId: string) {
  const db = getAdminDb();
  const ref = db.doc(`users/${uid}/brands/${brandId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as any;
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export type BgScene = "studio" | "lifestyle" | "scale" | "detail";

export type BgCandidate = {
  id: string; // "bg1".."bgN"
  keyword: string; // 日本語の短いキーワード
  scene: BgScene;
  bgPrompt: string; // 背景定義（日本語OK）
  hardConstraints: string[]; // 追加制約（短文）
  why: string; // 1行理由
};

export async function POST(req: Request) {
  try {
    // ✅ uid確定（なりすまし防止）
    const user = await requireUserFromAuthHeader(req);
    const body = await req.json().catch(() => ({} as any));

    const brandId = String(body?.brandId || "vento").trim();
    const vision = String(body?.vision || "").trim();
    const keywords = compactKeywords(body?.keywords);
    const purpose = String(body?.purpose || "sales").trim(); // 任意（参考）
    const n = Math.max(4, Math.min(12, Number(body?.n ?? 8))); // 4〜12

    if (!vision) return bad("vision is required");
    if (!brandId) return bad("brandId is required");

    const brand = await loadBrand(user.uid, brandId);
    if (!brand) {
      return bad("brand not found. /flow/brands で作成・保存してください", 400);
    }

    const imagePolicy = brand?.imagePolicy ?? {};
    const styleText = String(imagePolicy?.styleText ?? "").trim();
    const rules = Array.isArray(imagePolicy?.rules) ? imagePolicy.rules.map(String) : [];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return bad("OPENAI_API_KEY missing", 500);

    // ✅ “背景だけ”の候補を複数出す（JSON固定）
    const system = [
      "You are a product marketing art director.",
      "You propose background ideas only (NO product subject in the image).",
      "Output MUST be strict JSON only. No markdown.",
      "Do NOT include people, hands, text, logos, watermarks, signage.",
      "Avoid adding distinct props/objects; express mood with light, shadow, texture, blur, depth.",
      "Return candidates that are diverse but still sell-friendly.",
    ].join("\n");

    const userMsg = {
      brand: String(brand?.name ?? brandId),
      vision,
      keywords,
      purpose,
      styleText,
      brandRules: rules,
      requiredOutput: {
        candidates: Array.from({ length: n }).map((_, i) => ({
          id: `bg${i + 1}`,
          keyword: "Japanese short keyword",
          scene: "studio|lifestyle|scale|detail",
          bgPrompt: "concrete background definition (Japanese ok)",
          hardConstraints: ["short constraints"],
          why: "short reason in Japanese",
        })),
      },
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.55,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(userMsg) },
        ],
      }),
    });

    const j = await r.json().catch(() => ({} as any));
    if (!r.ok) throw new Error(j?.error?.message || "openai error");

    const content = j?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("no content");

    const parsed = JSON.parse(content);
    const arr = Array.isArray(parsed?.candidates) ? parsed.candidates : [];

    const norm: BgCandidate[] = arr
      .map((x: any, idx: number) => {
        const id = String(x?.id ?? `bg${idx + 1}`).trim();
        const keyword = String(x?.keyword ?? "").trim();
        const scene = String(x?.scene ?? "").trim() as BgScene;
        const bgPrompt = String(x?.bgPrompt ?? "").trim();
        const why = String(x?.why ?? "").trim();

        const hardConstraints = Array.isArray(x?.hardConstraints)
          ? x.hardConstraints.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 20)
          : [];

        const okScene = ["studio", "lifestyle", "scale", "detail"].includes(scene);

        if (!keyword || !bgPrompt || !why || !okScene) return null;

        return {
          id: /^bg\d+$/.test(id) ? id : `bg${idx + 1}`,
          keyword: keyword.slice(0, 40),
          scene,
          bgPrompt: bgPrompt.slice(0, 900),
          hardConstraints,
          why: why.slice(0, 200),
        };
      })
      .filter(Boolean) as BgCandidate[];

    if (norm.length < 3) {
      return NextResponse.json(
        { ok: false, error: "invalid ai output", raw: parsed },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        brandId,
        count: norm.length,
        candidates: norm,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[backgrounds/candidates]", e);
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}