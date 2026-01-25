// /app/api/generate-video/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/firebaseAdmin";
import { getIdempotencyKey } from "@/lib/server/idempotency";
import { PRICING } from "@/lib/server/pricing";
import { startVideoTaskWithRunway, type RunwayVideoParams } from "@/lib/server/runway";
import admin from "firebase-admin";

async function requireUser(req: Request) {
  const authz = req.headers.get("authorization") || "";
  const m = authz.match(/^Bearer (.+)$/i);
  const token = m?.[1];
  if (!token) throw new Error("Missing Authorization Bearer token");
  const decoded = await admin.auth().verifyIdToken(token);
  return { uid: decoded.uid };
}

function ratioFromSize(size: string) {
  // UI: 1024x1792 / 720x1280 => 縦
  if (size === "1024x1792" || size === "720x1280") return "720:1280";
  return "1280:720";
}

function buildPromptText(payload: any) {
  // UIの vision / keywords / templateId を Runway用の promptText にまとめる
  const vision = String(payload?.vision ?? "").trim();
  const templateId = String(payload?.templateId ?? "").trim();
  const kws = Array.isArray(payload?.keywords)
    ? payload.keywords.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 12)
    : [];

  // 最低限の固定フォーマット（サーバ側の安定性重視）
  const lines = [
    vision ? `Vision: ${vision}` : "",
    kws.length ? `Keywords: ${kws.join(", ")}` : "",
    templateId ? `Motion: ${templateId}` : "",
    "Rules: keep product identity, do not distort shape, no text overlay, natural lighting.",
  ].filter(Boolean);

  return lines.join("\n");
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // ✅ 必須：draftId（どの下書きに紐づく動画か）
    const draftId = String(payload?.draftId || "");
    if (!draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    }

    // ✅ 課金事故防止：未認証は不可
    const user = await requireUser(req);

    // ✅ draft の所有者チェック
    const db = getDb();
    const ref = db.collection("drafts").doc(draftId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "draft not found" }, { status: 404 });
    }
    const data = snap.data() as any;
    if (String(data?.userId || "") !== user.uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // =========================
    // ✅ UI→API 互換吸収
    // =========================
    // UIは referenceImageUrl / bgImageUrl を持ってる
    // Runwayには promptImage (参考画像) + promptText が必要
    const promptImage =
      String(payload?.promptImage || "").trim() ||
      String(payload?.referenceImageUrl || "").trim(); // ✅ UI互換

    if (!promptImage) {
      return NextResponse.json({ error: "promptImage/referenceImageUrl is required" }, { status: 400 });
    }

    const promptText =
      String(payload?.promptText || "").trim() || buildPromptText(payload); // ✅ UI互換

    if (!promptText) {
      return NextResponse.json({ error: "promptText/vision is required" }, { status: 400 });
    }

    // ✅ 価格・正規化（UI由来）
    const seconds = PRICING.normalizeVideoSeconds(payload?.seconds);
    const quality = PRICING.normalizeVideoQuality(payload?.quality);

    const size = String(payload?.size || "").trim();
    const ratio = String(payload?.ratio || "").trim() || ratioFromSize(size || "1280x720");

    const model = String(payload?.model || "gen4_turbo").trim();

    const idempotencyKey = getIdempotencyKey(req, payload);

    const params: RunwayVideoParams = {
      model,
      promptImage,
      promptText,
      seconds,
      ratio,
      quality,
    };

    // ✅ 非同期開始（taskIdを返す）
    const started = await startVideoTaskWithRunway(params, { idempotencyKey });

    // ✅ task開始時点で draft に taskId を保存（UI語彙に合わせる）
    await ref.set(
      {
        videoTaskId: started.taskId,
        videoStatus: "queued", // ✅ UI語彙: queued/running/done/error/idle
        videoModel: started.model,
        videoSeconds: started.seconds,
        videoRatio: started.ratio,
        videoQuality: started.quality,
        videoRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // ✅ UIは status===202 または running:true を見て分岐できるので running:true を付ける
    return NextResponse.json(
      {
        ok: true,
        running: true,
        taskId: started.taskId,
        status: "queued",
        seconds: started.seconds,
        ratio: started.ratio,
        quality: started.quality,
        model: started.model,
      },
      { status: 202 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "generate-video failed" }, { status: 500 });
  }
}