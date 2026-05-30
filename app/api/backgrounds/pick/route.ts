// app/api/backgrounds/pick/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";

type BgScene = "studio" | "lifestyle" | "scale" | "detail";

type BgCandidate = {
  id: string;
  url: string; // 必須
  keyword?: string;
  scene?: BgScene;
  bgPrompt?: string;
  hardConstraints?: string[];
  why?: string;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function pickOutputText(j: any): string {
  if (typeof j?.output_text === "string" && j.output_text.trim()) return j.output_text.trim();

  if (Array.isArray(j?.output)) {
    const texts: string[] = [];
    for (const o of j.output) {
      const c = o?.content;
      if (!Array.isArray(c)) continue;
      for (const p of c) {
        if (p?.type === "output_text" && typeof p?.text === "string") texts.push(p.text);
        if (p?.type === "text" && typeof p?.text === "string") texts.push(p.text);
      }
    }
    const joined = texts.join("\n").trim();
    if (joined) return joined;
  }
  return "";
}

export async function POST(req: Request) {
  try {
    await requireUserFromAuthHeader(req);

    const body = await req.json().catch(() => ({} as any));

    const productImageUrl = String(body?.productImageUrl || "").trim();
    const purpose = String(body?.purpose || "sales").trim();

    const candidatesRaw = Array.isArray(body?.candidates) ? (body.candidates as any[]) : [];
    let candidates: BgCandidate[] = candidatesRaw
      .map((c) => ({
        id: String(c?.id || "").trim(),
        url: String(c?.url || "").trim(),
        keyword: typeof c?.keyword === "string" ? c.keyword : undefined,
        scene: typeof c?.scene === "string" ? (c.scene as BgScene) : undefined,
        bgPrompt: typeof c?.bgPrompt === "string" ? c.bgPrompt : undefined,
        hardConstraints: Array.isArray(c?.hardConstraints) ? c.hardConstraints.map(String) : undefined,
        why: typeof c?.why === "string" ? c.why : undefined,
      }))
      .filter((c) => c.id && c.url);

    if (!productImageUrl) return bad("productImageUrl required");
    if (candidates.length < 3) return bad("candidates must be >= 3");

    // サーバ側でも最大8に丸める
    if (candidates.length > 8) candidates = candidates.slice(0, 8);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return bad("OPENAI_API_KEY missing", 500);

    const judgePrompt = `
あなたは商品写真のクリエイティブディレクターです。
目的は「売れる・自然・商品形状を絶対に変えない」合成の背景選定です。

評価基準（重要）：
- 接地しやすい床/台が明確（床ラインが読める）
- 光源方向が自然（極端な逆光NG）
- 余白があり、商品を幅0.42〜0.52で置いても破綻しない
- 生活感は背景側でのみ（人物/手/文字/ロゴ/看板/過度な小物は禁止）
- 嘘っぽさが少ない（商品が浮かない）

出力は必ずJSONのみ：
{
  "pickedId": "...",
  "reason": "...",
  "ranked": [{"id":"...","score":0-100,"note":"..."}]
}
`.trim();

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini", // 画像入力対応モデル
        temperature: 0.2,
        max_output_tokens: 600,
        response_format: { type: "json_object" },
        input: [
          {
            role: "system",
            content: [{ type: "text", text: "You are a strict product marketing creative director." }],
          },
          {
            role: "user",
            content: [
              { type: "text", text: judgePrompt },
              { type: "text", text: `purpose=${purpose}` },

              { type: "text", text: "商品画像：" },
              { type: "input_image", image_url: productImageUrl },

              { type: "text", text: "背景候補（画像+メタ情報も参照して評価）：" },
              ...candidates.flatMap((c) => [
                {
                  type: "text",
                  text: `candidate meta: id=${c.id} scene=${c.scene ?? ""} keyword=${c.keyword ?? ""}\n` +
                    `bgPrompt=${(c.bgPrompt ?? "").slice(0, 240)}\n` +
                    `hardConstraints=${(c.hardConstraints ?? []).join(", ")}`,
                },
                { type: "input_image", image_url: c.url },
              ]),
            ],
          },
        ],
      }),
    });

    const j = await resp.json().catch(() => ({} as any));
    if (!resp.ok) {
      return bad(j?.error?.message || "openai error", 500);
    }

    const text = pickOutputText(j);
    if (!text) return bad("no output_text from responses", 500);

    let out: any = {};
    try {
      out = JSON.parse(text);
    } catch {
      return bad("failed to parse json output", 500);
    }

    const pickedId = String(out?.pickedId || "").trim();
    const reason = String(out?.reason || "").trim();
    const ranked = Array.isArray(out?.ranked) ? out.ranked : [];

    if (!pickedId) return bad("pickedId missing", 500);

    // pickedId が候補に無い場合は先頭へフォールバック（事故防止）
    const picked = candidates.find((c) => c.id === pickedId) ?? candidates[0];

    return NextResponse.json(
      {
        ok: true,
        purpose,
        pickedId: picked.id,
        picked,
        reason: reason || "最も商品を主役にでき、床/余白/光が合成に向くため。",
        ranked,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[backgrounds/pick]", e);
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}