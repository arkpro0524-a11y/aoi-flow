// /app/api/start-video-task/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/firebaseAdmin";
import { startVideoTaskWithRunway, type RunwayVideoParams } from "@/lib/server/runway";
import admin from "firebase-admin";
import crypto from "crypto";

async function requireUser(req: Request) {
  const authz = req.headers.get("authorization") || "";
  const m = authz.match(/^Bearer (.+)$/i);
  const token = m?.[1];
  if (!token) throw new Error("Missing Authorization Bearer token");
  const decoded = await admin.auth().verifyIdToken(token);
  return { uid: decoded.uid };
}

function stableIdempotencyKey(input: any) {
  const json = JSON.stringify(input ?? {});
  return crypto.createHash("sha256").update(json).digest("hex");
}

function normalizeSeconds(v: any): 5 | 10 {
  // ✅ number でも string でも来るので吸収し、最終的に 5|10 のリテラル型に落とす
  const n = typeof v === "string" ? Number(v) : Number(v);
  return n === 5 ? 5 : 10;
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    const draftId = String(payload?.draftId || "");
    if (!draftId) return NextResponse.json({ error: "draftId is required" }, { status: 400 });

    // Runway params（UIから来る想定）
    const model = String(payload?.model || "gen4_turbo");
    const promptImage = String(payload?.promptImage || "");
    const promptText = String(payload?.promptText || "");
    const seconds: 5 | 10 = normalizeSeconds(payload?.seconds ?? 10);
    const ratio = String(payload?.ratio || "1280:720");
    const quality: "standard" | "high" =
      String(payload?.quality || "standard") === "high" ? "high" : "standard";

    if (!promptImage) return NextResponse.json({ error: "promptImage is required" }, { status: 400 });
    if (!promptText) return NextResponse.json({ error: "promptText is required" }, { status: 400 });

    // ✅ 未認証は不可
    const user = await requireUser(req);

    const db = getDb();
    const ref = db.collection("drafts").doc(draftId);

    // ✅ 所有者チェック
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    const data = snap.data() as any;
    if (String(data?.userId || "") !== user.uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // ✅ すでに動いてる task がある場合の扱い（本番事故防止）
    const currentStatus = String(data?.videoStatus || "");
    const currentTaskId = String(data?.videoTaskId || "");

    // ✅ RunwayVideoParams に“型で固定”して渡す（ここが今回のTSエラー潰し）
    const requestedParams: RunwayVideoParams = {
      model,
      promptImage,
      promptText,
      seconds, // ✅ 5|10
      ratio,
      quality,
    };

    const idempotencyKey = stableIdempotencyKey({
      draftId,
      uid: user.uid,
      ...requestedParams,
    });

    // ✅ queued/running で taskId があるなら再生成しない（多重生成防止）
    if ((currentStatus === "queued" || currentStatus === "running") && currentTaskId) {
      return NextResponse.json({
        ok: true,
        reused: true,
        taskId: currentTaskId,
        status: currentStatus,
      });
    }

    // ✅ Runway task 開始
    const started = await startVideoTaskWithRunway(requestedParams, { idempotencyKey });

    // ✅ Firestoreへ「開始直後に」確定保存
    await ref.set(
      {
        videoTaskId: started.taskId,
        videoStatus: "queued",
        videoUrl: null,
        videoRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        videoParams: {
          model,
          seconds,
          ratio,
          quality,
        },
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      reused: false,
      taskId: started.taskId,
      status: "queued",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "start-video-task failed" },
      { status: 500 }
    );
  }
}