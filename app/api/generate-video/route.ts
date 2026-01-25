import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { getIdempotencyKey } from "@/lib/server/idempotency";
import { PRICING } from "@/lib/server/pricing";
import { startVideoTaskWithRunway, type RunwayVideoParams } from "@/lib/server/runway";
import { getAdminAuth, getAdminDb } from "@/firebaseAdmin";

export const runtime = "nodejs";

async function requireUser(req: Request) {
  const authz = req.headers.get("authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];
  if (!token) throw new Error("Missing Authorization Bearer token");

  const decoded = await getAdminAuth().verifyIdToken(token);
  if (!decoded?.uid) throw new Error("Invalid token");
  return { uid: decoded.uid };
}

function ratioFromSize(size: string) {
  if (size === "1024x1792" || size === "720x1280") return "720:1280";
  return "1280:720";
}

function buildPromptText(payload: any) {
  const vision = String(payload?.vision ?? "").trim();
  const templateId = String(payload?.templateId ?? "").trim();
  const kws = Array.isArray(payload?.keywords)
    ? payload.keywords.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 12)
    : [];

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

    const draftId = String(payload?.draftId || "");
    if (!draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    }

    const user = await requireUser(req);

    // ✅ draft ownership check
    const db = getAdminDb();
    const ref = db.collection("drafts").doc(draftId);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "draft not found" }, { status: 404 });
    }

    const data = snap.data() as any;
    if (String(data?.userId || "") !== user.uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // ✅ UI互換（referenceImageUrl → promptImage）
    const promptImage =
      String(payload?.promptImage || "").trim() ||
      String(payload?.referenceImageUrl || "").trim();

    if (!promptImage) {
      return NextResponse.json(
        { error: "promptImage/referenceImageUrl is required" },
        { status: 400 }
      );
    }

    const promptText =
      String(payload?.promptText || "").trim() || buildPromptText(payload);

    if (!promptText) {
      return NextResponse.json({ error: "promptText/vision is required" }, { status: 400 });
    }

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

    const started = await startVideoTaskWithRunway(params, { idempotencyKey });

    // ✅ taskId を draft に保存（UI語彙）
    await ref.set(
      {
        videoTaskId: started.taskId,
        videoStatus: "queued",
        videoModel: started.model,
        videoSeconds: started.seconds,
        videoRatio: started.ratio,
        videoQuality: started.quality,
        videoRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

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