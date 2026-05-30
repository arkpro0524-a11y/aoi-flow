// app/api/cm-status/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import admin from "firebase-admin";
import RunwayML from "@runwayml/sdk";
import { requireUserFromAuthHeader, getAdminDb } from "@/app/api/_firebase/admin";

/**
 * AOI FLOW
 * ブランドCMステータス確認API
 *
 * 役割
 * - cmVideo.taskId または body.taskId を使って Runway の状態を確認する
 * - 完成したら cmVideo.url / cmVideo.urls に保存する
 * - 旧 cmApplied も最低限同期する
 */

type RunwayStatus = "queued" | "running" | "succeeded" | "failed";
type CmStatus = "idle" | "queued" | "running" | "done" | "error";

let runwayClient: any = null;

function safeText(v: unknown): string {
  return String(v ?? "").trim();
}

function getRunwayClient() {
  if (runwayClient) return runwayClient;

  const apiKey = process.env.RUNWAYML_API_SECRET || process.env.RUNWAY_API_KEY;

  if (!apiKey) {
    throw new Error("RUNWAYML_API_SECRET is missing");
  }

  runwayClient = new RunwayML({
    apiKey,
    runwayVersion: process.env.RUNWAY_VERSION || "2024-11-06",
    defaultHeaders: {
      "X-Runway-Version": process.env.RUNWAY_VERSION || "2024-11-06",
    },
  } as any);

  return runwayClient;
}

function normalizeRunwayStatus(raw: unknown): RunwayStatus {
  const s = safeText(raw).toLowerCase();

  if (s.includes("succeed")) return "succeeded";
  if (s.includes("complete")) return "succeeded";
  if (s.includes("done")) return "succeeded";
  if (s.includes("finish")) return "succeeded";

  if (s.includes("fail")) return "failed";
  if (s.includes("error")) return "failed";
  if (s.includes("cancel")) return "failed";

  if (s.includes("queue")) return "queued";
  if (s.includes("pend")) return "queued";
  if (s.includes("created")) return "queued";

  return "running";
}

function cmStatusFromRunway(status: RunwayStatus): CmStatus {
  if (status === "succeeded") return "done";
  if (status === "failed") return "error";
  if (status === "queued") return "queued";
  return "running";
}

function pickFirstString(x: any): string {
  if (typeof x === "string" && x.trim()) return x.trim();

  if (Array.isArray(x)) {
    for (const item of x) {
      const found = pickFirstString(item);
      if (found) return found;
    }
  }

  if (x && typeof x === "object") {
    const directKeys = [
      "url",
      "videoUrl",
      "video_url",
      "outputUrl",
      "output_url",
      "signedUrl",
      "signed_url",
      "downloadUrl",
      "download_url",
    ];

    for (const key of directKeys) {
      const found = pickFirstString(x[key]);
      if (found) return found;
    }

    const nestedKeys = [
      "output",
      "outputs",
      "result",
      "results",
      "data",
      "artifact",
      "artifacts",
      "asset",
      "assets",
    ];

    for (const key of nestedKeys) {
      const found = pickFirstString(x[key]);
      if (found) return found;
    }
  }

  return "";
}

function uniqPushFront(list: unknown, url: string): string[] {
  const u = safeText(url);
  const base = Array.isArray(list) ? list : [];

  const out: string[] = [];
  const seen = new Set<string>();

  if (u) {
    out.push(u);
    seen.add(u);
  }

  for (const item of base) {
    const s = safeText(item);
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 10) break;
  }

  return out.slice(0, 10);
}

async function pollRunway(taskId: string): Promise<{
  runwayStatus: RunwayStatus;
  videoUrl: string;
  rawStatus: string;
}> {
  const client = getRunwayClient();

  if (!client?.tasks?.retrieve) {
    throw new Error("Runway SDK tasks.retrieve is not available. @runwayml/sdk のバージョンを確認してください。");
  }

  const task = await client.tasks.retrieve(taskId);

  const rawStatus = safeText(
    task?.status ??
      task?.state ??
      task?.data?.status ??
      task?.data?.state ??
      task?.task?.status
  );

  const runwayStatus = normalizeRunwayStatus(rawStatus);
  const videoUrl = pickFirstString(task?.output) || pickFirstString(task);

  return {
    runwayStatus,
    videoUrl,
    rawStatus,
  };
}

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const body = (await req.json().catch(() => ({}))) as any;

    const draftId = safeText(body?.draftId);
    const bodyTaskId = safeText(body?.taskId);

    if (!draftId) {
      return NextResponse.json({ ok: false, error: "draftId required" }, { status: 400 });
    }

    const db = getAdminDb();
    const draftRef = db.collection("drafts").doc(draftId);
    const snap = await draftRef.get();

    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "draft not found" }, { status: 404 });
    }

    const current = snap.data() || {};

    if (String(current.userId || "") !== user.uid) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const currentCmVideo = current.cmVideo && typeof current.cmVideo === "object"
      ? current.cmVideo
      : {};

    const savedTaskId = safeText(currentCmVideo.taskId);
    const taskId = bodyTaskId || savedTaskId;

    if (!taskId) {
      return NextResponse.json({
        ok: true,
        draftId,
        taskId: null,
        status: "idle",
        videoUrl: null,
      });
    }

    const alreadyUrl = safeText(currentCmVideo.url);
    const alreadyStatus = safeText(currentCmVideo.status);

    if (alreadyUrl && alreadyStatus === "done") {
      return NextResponse.json({
        ok: true,
        draftId,
        taskId,
        status: "succeeded",
        cmStatus: "done",
        videoUrl: alreadyUrl,
        url: alreadyUrl,
      });
    }

    const polled = await pollRunway(taskId);
    const cmStatus = cmStatusFromRunway(polled.runwayStatus);

    if (polled.runwayStatus === "succeeded" && polled.videoUrl) {
      const nextUrls = uniqPushFront(currentCmVideo.urls, polled.videoUrl);

      const nextCmVideo = {
        provider: "runway",
        taskId,
        status: "done",
        url: polled.videoUrl,
        urls: nextUrls,
        persona: currentCmVideo.persona ?? null,
      };

      const nextCmApplied = {
        ...(current.cmApplied && typeof current.cmApplied === "object" ? current.cmApplied : {}),
        runwayTaskId: taskId,
        runwayStatus: "succeeded",
        runwayVideoUrl: polled.videoUrl,
        completedAt: Date.now(),
      };

      await draftRef.set(
        {
          cmVideo: nextCmVideo,
          cmApplied: nextCmApplied,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return NextResponse.json({
        ok: true,
        draftId,
        taskId,
        status: "succeeded",
        cmStatus: "done",
        videoUrl: polled.videoUrl,
        url: polled.videoUrl,
        outputUrl: polled.videoUrl,
      });
    }

    if (polled.runwayStatus === "failed") {
      const nextCmVideo = {
        provider: "runway",
        taskId,
        status: "error",
        url: safeText(currentCmVideo.url) || null,
        urls: Array.isArray(currentCmVideo.urls) ? currentCmVideo.urls : [],
        persona: currentCmVideo.persona ?? null,
      };

      const nextCmApplied = {
        ...(current.cmApplied && typeof current.cmApplied === "object" ? current.cmApplied : {}),
        runwayTaskId: taskId,
        runwayStatus: "failed",
        runwayVideoUrl: safeText(currentCmVideo.url) || null,
        failedAt: Date.now(),
      };

      await draftRef.set(
        {
          cmVideo: nextCmVideo,
          cmApplied: nextCmApplied,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return NextResponse.json({
        ok: true,
        draftId,
        taskId,
        status: "failed",
        cmStatus: "error",
        videoUrl: null,
      });
    }

    const nextCmVideo = {
      provider: "runway",
      taskId,
      status: cmStatus,
      url: safeText(currentCmVideo.url) || null,
      urls: Array.isArray(currentCmVideo.urls) ? currentCmVideo.urls : [],
      persona: currentCmVideo.persona ?? null,
    };

    const nextCmApplied = {
      ...(current.cmApplied && typeof current.cmApplied === "object" ? current.cmApplied : {}),
      runwayTaskId: taskId,
      runwayStatus: polled.runwayStatus,
      runwayVideoUrl: safeText(currentCmVideo.url) || null,
      checkedAt: Date.now(),
    };

    await draftRef.set(
      {
        cmVideo: nextCmVideo,
        cmApplied: nextCmApplied,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      draftId,
      taskId,
      status: polled.runwayStatus,
      cmStatus,
      videoUrl: null,
      rawStatus: polled.rawStatus,
    });
  } catch (e: any) {
    console.error("[cm-status] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "cm-status failed" },
      { status: 500 }
    );
  }
}