// app/api/backgrounds/refine/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminDb } from "@/firebaseAdmin";

type BgScene = "studio" | "lifestyle" | "scale" | "detail";

type BgCandidate = {
  id: string;
  url: string;         // ✅ 追加（後工程で使う）
  keyword: string;
  scene: BgScene;
  bgPrompt: string;
  hardConstraints?: string[];
  why?: string;
};

function boolEnv(v: string | undefined, fallback = false) {
  if (v == null) return fallback;
  return String(v).toLowerCase() === "true";
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

async function loadBrand(uid: string, brandId: string) {
  const db = getAdminDb();
  const ref = db.doc(`users/${uid}/brands/${brandId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as any;
}

const USE_BG_REFINE = boolEnv(process.env.USE_BG_REFINE, false);

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const body = await req.json().catch(() => ({} as any));

    const brandId = String(body?.brandId || "vento").trim();
    const vision = String(body?.vision || "").trim();
    const keywords = Array.isArray(body?.keywords)
      ? body.keywords.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 16)
      : [];

    const candidate = (body?.candidate ?? null) as BgCandidate | null;
    const refineReq = body?.refine === true;

    if (!brandId) return bad("brandId is required");
    if (!vision) return bad("vision is required");
    if (!candidate?.bgPrompt) return bad("candidate.bgPrompt is required");
    if (!String(candidate?.url || "").trim()) return bad("candidate.url is required");

    const brand = await loadBrand(user.uid, brandId);
    if (!brand) return bad("brand not found", 400);

    const imagePolicy = brand?.imagePolicy ?? {};
    const styleText = String(imagePolicy?.styleText ?? "").trim();
    const rules = Array.isArray(imagePolicy?.rules) ? imagePolicy.rules.map(String) : [];

    const baseHardRules = [
      "No people/hands.",
      "No text/logo/watermark/signage.",
      "Avoid distinct props/objects; use only space/light/shadow/texture/blur/depth.",
      "Keep clear floor/table plane or grounding cues for compositing.",
      "Leave negative space for product placement (product width 0.42-0.52 of frame).",
    ];

    // OFFなら“壊さず返す”
    if (!(USE_BG_REFINE && refineReq)) {
      return NextResponse.json(
        {
          ok: true,
          refined: false,
          envEnabled: USE_BG_REFINE,
          requestEnabled: refineReq,
          candidate,
          refinedPrompt: String(candidate.bgPrompt || "").trim(),
          negative: [],
          hardRules: baseHardRules,
        },
        { status: 200 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return bad("OPENAI_API_KEY missing", 500);

    const system = [
      "You are a strict prompt engineer for background images used in product compositing.",
      "Rewrite the given background idea into ONE concrete prompt suitable for image generation.",
      "Background only (NO product/subject).",
      "Do NOT include people, hands, text, logos, watermarks, signage.",
      "Avoid distinct props/objects; express mood using light, shadow, texture, depth, blur.",
      "Must preserve a plausible ground plane / floor line for contact shadow.",
      "Output MUST be strict JSON only. No markdown.",
    ].join("\n");

    const userMsg = {
      brand: String(brand?.name ?? brandId),
      vision,
      keywords,
      styleText,
      brandRules: rules,
      candidate: {
        id: String(candidate.id || "").trim(),
        url: String(candidate.url || "").trim(),
        keyword: String(candidate.keyword || "").trim(),
        scene: String(candidate.scene || "").trim(),
        bgPrompt: String(candidate.bgPrompt || "").trim(),
        hardConstraints: Array.isArray(candidate.hardConstraints) ? candidate.hardConstraints.map(String) : [],
        why: String(candidate.why || "").trim(),
      },
      constraintsForCompositing: {
        camera: "35-50mm equivalent, eye-level or slightly above, stable perspective",
        light: "single main light direction; avoid extreme backlight",
        placement: "leave negative space; product width 0.42-0.52 of frame",
        ground: "clear floor/table plane; readable floor line",
      },
      requiredOutput: {
        refinedPrompt: "string (single prompt)",
        negative: ["strings"],
        hardRules: ["strings"],
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
        temperature: 0.35,
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

    const refinedPrompt = String(parsed?.refinedPrompt ?? "").trim();
    const negative = Array.isArray(parsed?.negative)
      ? parsed.negative.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 20)
      : [];

    const hardRules = Array.isArray(parsed?.hardRules)
      ? parsed.hardRules.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 20)
      : [];

    if (!refinedPrompt) {
      return NextResponse.json({ ok: false, error: "invalid ai output", raw: parsed }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        refined: true,
        envEnabled: USE_BG_REFINE,
        requestEnabled: refineReq,
        candidate,
        refinedPrompt,
        negative,
        hardRules: [...baseHardRules, ...(hardRules.length ? hardRules : [])].slice(0, 24),
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[backgrounds/refine]", e);
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}