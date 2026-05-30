//app/api/generate-video/route.ts

import { NextResponse } from "next/server";
import admin from "firebase-admin";

import { startVideoTaskWithRunway, type RunwayVideoParams } from "@/lib/server/runway";
import { getIdempotencyKey } from "@/lib/server/idempotency";
import { getAdminAuth, getAdminDb } from "@/firebaseAdmin";

export const runtime = "nodejs";

// ----------------------------
// auth
// ----------------------------
async function requireUser(req: Request) {
  const authz = req.headers.get("authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];
  if (!token) throw new Error("Missing Authorization Bearer token");

  const decoded = await getAdminAuth().verifyIdToken(token);
  if (!decoded?.uid) throw new Error("Invalid token");
  return { uid: decoded.uid };
}

// ----------------------------
// size normalize
// ----------------------------
function normalizeSize(raw: string): "720x1280" | "1280x720" | "960x960" {
  if (raw === "720x1280") return "720x1280";
  if (raw === "1280x720") return "1280x720";
  if (raw === "960x960") return "960x960";
  return "720x1280";
}

function ratioFromSize(size: string): "720:1280" | "1280:720" | "960:960" {
  if (size === "720x1280") return "720:1280";
  if (size === "960x960") return "960:960";
  return "1280:720";
}

// ----------------------------
// POST
// ----------------------------
export async function POST(req: Request) {
  try {
    const payload = await req.json();

    const draftId = String(payload?.draftId || "");
    if (!draftId) {
      return NextResponse.json({ error: "draftId required" }, { status: 400 });
    }

    const user = await requireUser(req);
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

    const referenceImageUrl = String(payload?.referenceImageUrl || "").trim();
    if (!referenceImageUrl) {
      return NextResponse.json({ error: "referenceImageUrl required" }, { status: 400 });
    }

    const vision = String(payload?.vision || "").trim();
    if (!vision) {
      return NextResponse.json({ error: "vision required" }, { status: 400 });
    }

    // ✅ secondsは必ず 5 or 10 にする（型安全）
    const seconds: 5 | 10 = payload?.seconds === 10 ? 10 : 5;

    const quality: "standard" | "high" =
      payload?.quality === "high" ? "high" : "standard";

    const size = normalizeSize(String(payload?.size || ""));
    const ratio = ratioFromSize(size);

    const model = "gen4_turbo";

    const params: RunwayVideoParams = {
      model,
      promptImage: referenceImageUrl,
      promptText: vision,
      seconds,
      ratio,
      quality,
    };

    const idempotencyKey = getIdempotencyKey(req, payload);

    // ✅ 正しい関数名＋2引数
    const started = await startVideoTaskWithRunway(params, {
      idempotencyKey,
    });

    await ref.set(
      {
        videoSource: "runway",
        videoTaskId: started.taskId,
        videoStatus: "queued",
        videoSeconds: seconds,
        videoRatio: ratio,
        videoQuality: quality,
        videoSize: size,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json(
      {
        ok: true,
        taskId: started.taskId,
      },
      { status: 202 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "generate-video failed" },
      { status: 500 }
    );
  }
}