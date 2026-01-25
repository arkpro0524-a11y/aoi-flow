import { NextResponse } from "next/server";
import admin from "firebase-admin";
import crypto from "crypto";
import { checkVideoTaskWithRunway } from "@/lib/server/runway";
import { getAdminAuth, getAdminDb, getAdminBucket } from "@/firebaseAdmin";

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

function toUiStatus(runwayStatus: string): "queued" | "running" | "done" | "error" {
  if (runwayStatus === "queued") return "queued";
  if (runwayStatus === "running") return "running";
  if (runwayStatus === "succeeded") return "done";
  if (runwayStatus === "failed") return "error";
  return "running";
}

function pickVideoUrl(res: any): string | null {
  const cands: any[] = [
    res?.videoUrl,
    res?.url,
    res?.outputUrl,
    res?.output_url,
    res?.result?.url,
    res?.result?.videoUrl,
    res?.data?.url,
    res?.data?.videoUrl,
    ...(Array.isArray(res?.assets) ? res.assets.map((a: any) => a?.url) : []),
    ...(Array.isArray(res?.outputs) ? res.outputs.map((o: any) => o?.url) : []),
  ];

  for (const v of cands) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`failed to download video: ${res.status}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } finally {
    clearTimeout(timer);
  }
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

    const user = await requireUser(req);

    const db = getAdminDb();
    const ref = db.collection("drafts").doc(draftId);

    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "draft not found" }, { status: 404 });

    const data = snap.data() as any;
    if (String(data?.userId || "") !== user.uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const res = await checkVideoTaskWithRunway(taskId);
    const uiStatus = toUiStatus(String(res?.status || res?.rawStatus || ""));
    const runwayVideoUrl = pickVideoUrl(res);

    let finalUrl: string | null = null;

    // ✅ succeeded → Firebase Storageへ保存してURL確定
    if (uiStatus === "done" && runwayVideoUrl) {
      const already = String(data?.videoUrl || "");
      if (already.includes("firebasestorage.googleapis.com")) {
        finalUrl = already;
      } else {
        const bucket = getAdminBucket();
        const bucketName = String(bucket?.name || "").trim();
        if (!bucketName) throw new Error("Firebase Storage bucket is not configured (bucket name empty)");

        const filePath = `users/${user.uid}/drafts/${draftId}/videos/${Date.now()}_${taskId}.mp4`;
        const buf = await fetchAsBuffer(runwayVideoUrl);

        const token = crypto.randomUUID();
        const file = bucket.file(filePath);

        await file.save(buf, {
          contentType: "video/mp4",
          resumable: false,
          metadata: {
            metadata: { firebaseStorageDownloadTokens: token },
            cacheControl: "public,max-age=31536000",
          },
        });

        finalUrl = storageDownloadUrl(bucketName, filePath, token);
      }

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
        taskId: res?.taskId || taskId,
        status: "done",
        url: finalUrl,
        videoUrl: finalUrl,
        rawStatus: res?.rawStatus || null,
      });
    }

    // ✅ failed → error
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
        taskId: res?.taskId || taskId,
        status: "error",
        url: null,
        videoUrl: null,
        rawStatus: res?.rawStatus || null,
      });
    }

    // ✅ queued / running
    await ref.set(
      {
        videoTaskId: taskId,
        videoStatus: uiStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      taskId: res?.taskId || taskId,
      status: uiStatus,
      url: null,
      videoUrl: null,
      rawStatus: res?.rawStatus || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "check-video-task failed" }, { status: 500 });
  }
}