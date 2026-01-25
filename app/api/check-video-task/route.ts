// /app/api/check-video-task/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/firebaseAdmin";
import { checkVideoTaskWithRunway } from "@/lib/server/runway";
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

function toUiStatus(runwayStatus: string): "queued" | "running" | "done" | "error" {
  // runway: queued/running/succeeded/failed/...
  if (runwayStatus === "queued") return "queued";
  if (runwayStatus === "running") return "running";
  if (runwayStatus === "succeeded") return "done";
  if (runwayStatus === "failed") return "error";
  // 予期しない値は running 扱い（課金事故防止：勝手に失敗扱いしない）
  return "running";
}

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to download video: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function storageDownloadUrl(bucketName: string, filePath: string, token: string) {
  const encoded = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    const draftId = String(payload?.draftId || "");
    const taskId = String(payload?.taskId || "");

    if (!draftId) return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

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

    // ✅ task確認
    const res = await checkVideoTaskWithRunway(taskId);
    const uiStatus = toUiStatus(String(res.status || ""));

    // ✅ 返すURL（UIが拾うキーは url / videoUrl / outputUrl を吸収するが、UI側は url が最も確実）
    let finalUrl: string | null = null;

    // =========================
    // ✅ succeeded → Firebase Storage に mp4 を保存してURLを確定
    // =========================
    if (uiStatus === "done" && res.videoUrl) {
      // すでに Storage URL が入っているなら再アップロードしない（無限増殖防止）
      const already = String(data?.videoUrl || "");
      if (already.includes("firebasestorage.googleapis.com")) {
        finalUrl = already;
      } else {
        const bucketName =
          String((admin.app().options as any)?.storageBucket || "").trim();
        if (!bucketName) throw new Error("storageBucket is not configured in firebase admin");

        const filePath = `users/${user.uid}/drafts/${draftId}/videos/${Date.now()}_${taskId}.mp4`;
        const buf = await fetchAsBuffer(res.videoUrl);

        const token = crypto.randomUUID();
        const bucket = admin.storage().bucket(bucketName);
        const file = bucket.file(filePath);

        // ✅ token をメタに入れると「downloadURL形式」で配れる
        await file.save(buf, {
          contentType: "video/mp4",
          resumable: false,
          metadata: {
            metadata: {
              firebaseStorageDownloadTokens: token,
            },
            cacheControl: "public,max-age=31536000",
          },
        });

        finalUrl = storageDownloadUrl(bucketName, filePath, token);
      }

      // ✅ Firestoreへ確定保存（UI語彙に統一）
      // videoUrls 履歴も更新（最大10）
      const prev: string[] = Array.isArray(data?.videoUrls)
        ? data.videoUrls.filter((x: any) => typeof x === "string")
        : [];

      const nextUrls = finalUrl
        ? [finalUrl, ...prev.filter((x) => x !== finalUrl)].slice(0, 10)
        : prev.slice(0, 10);

      await ref.set(
        {
          videoTaskId: taskId,
          videoUrl: finalUrl,
          videoUrls: nextUrls,
          videoStatus: "done",
          videoCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return NextResponse.json({
        ok: true,
        taskId: res.taskId,
        status: "done",
        url: finalUrl,          // ✅ UIが最も確実に拾う
        videoUrl: finalUrl,     // 互換
        rawStatus: res.rawStatus || null,
      });
    }

    // =========================
    // ✅ failed → error
    // =========================
    if (uiStatus === "error") {
      await ref.set(
        {
          videoTaskId: taskId,
          videoStatus: "error",
          videoFailedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return NextResponse.json({
        ok: true,
        taskId: res.taskId,
        status: "error",
        url: null,
        videoUrl: null,
        rawStatus: res.rawStatus || null,
      });
    }

    // =========================
    // ✅ queued/running
    // =========================
    await ref.set(
      {
        videoTaskId: taskId,
        videoStatus: uiStatus, // queued or running
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      taskId: res.taskId,
      status: uiStatus, // queued | running
      url: null,
      videoUrl: null,
      rawStatus: res.rawStatus || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "check-video-task failed" }, { status: 500 });
  }
}