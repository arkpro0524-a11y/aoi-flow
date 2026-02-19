// /app/api/check-video-task/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { requireUserFromAuthHeader, getAdminDb } from "@/app/api/_firebase/admin";

// ===============================
// ✅ Runway task status 取得（最小・汎用）
// - SDKラッパーが手元で不確実なので、ここではHTTPで安全側に寄せる
// - 返却形式の揺れを吸収して status と url を取り出す
// ===============================
type RunwayPollResult =
  | { ok: true; status: "queued" | "running" | "succeeded"; videoUrl?: string }
  | { ok: false; status: "failed"; error: string };

function pickFirstString(x: any): string | null {
  if (typeof x === "string" && x.trim()) return x.trim();
  if (Array.isArray(x)) {
    for (const v of x) {
      const s = pickFirstString(v);
      if (s) return s;
    }
  }
  if (x && typeof x === "object") {
    // よくある候補
    const keys = ["url", "video_url", "videoUrl", "signed_url", "signedUrl", "download_url", "downloadUrl"];
    for (const k of keys) {
      const s = pickFirstString((x as any)[k]);
      if (s) return s;
    }
  }
  return null;
}

function normalizeRunwayStatus(raw: any): "queued" | "running" | "succeeded" | "failed" {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("succeed") || s === "completed" || s === "success") return "succeeded";
  if (s.includes("fail") || s === "error" || s === "canceled" || s === "cancelled") return "failed";
  if (s.includes("run") || s.includes("progress") || s === "processing") return "running";
  return "queued";
}

async function pollRunway(taskId: string): Promise<RunwayPollResult> {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) {
    return { ok: false, status: "failed", error: "RUNWAY_API_KEY is missing" };
  }

  // ✅ エンドポイントはRunway側の世代で揺れるため、まず “tasks” を想定
  // ※もし別URLならここだけ差し替えれば良い
  const url = `https://api.runwayml.com/v1/tasks/${encodeURIComponent(taskId)}`;

  const r = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const text = await r.text().catch(() => "");
  let j: any = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    j = null;
  }

  if (!r.ok) {
    const msg = j?.error?.message || j?.message || text || `runway poll failed (${r.status})`;
    return { ok: false, status: "failed", error: String(msg) };
  }

  const status = normalizeRunwayStatus(j?.status ?? j?.state ?? j?.task?.status);

  if (status === "succeeded") {
    // output の位置が揺れるので総当たりでURLを拾う
    const candidate =
      pickFirstString(j?.output) ||
      pickFirstString(j?.outputs) ||
      pickFirstString(j?.result) ||
      pickFirstString(j?.data?.output) ||
      pickFirstString(j?.data?.outputs);

    if (candidate) return { ok: true, status: "succeeded", videoUrl: candidate };

    // succeeded なのにURL無し → 仕様揺れ。ここは failed に落とさず running 扱いにして再試行余地を残す
    return { ok: true, status: "running" };
  }

  if (status === "failed") {
    const msg = j?.error?.message || j?.error || j?.message || "runway task failed";
    return { ok: false, status: "failed", error: String(msg) };
  }

  return { ok: true, status };
}

// ===============================
// ✅ 唯一のpoll
// - 入力：draftId
// - drafts から taskId を読み、Runway の状態を確認
// - drafts を “唯一の状態” として更新（UIは drafts だけ見れば良い）
// ===============================
export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);

    const body = (await req.json().catch(() => ({} as any))) as any;
    const draftId = String(body?.draftId ?? "").trim();
    if (!draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("drafts").doc(draftId);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "draft not found" }, { status: 404 });
    }

    const d = snap.data() as any;
    if (String(d?.userId ?? "") !== user.uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // ✅ すでに成功してURLあるなら即返す（課金・API叩きすぎ防止）
    const alreadyUrl = String(d?.videoUrl ?? "").trim();
    const alreadyStatus = String(d?.videoStatus ?? "").trim();
    if (alreadyUrl && (alreadyStatus === "succeeded" || alreadyStatus === "success")) {
      return NextResponse.json({
        ok: true,
        draftId,
        taskId: String(d?.videoTaskId ?? "").trim() || null,
        status: "succeeded",
        videoUrl: alreadyUrl,
      });
    }

    const taskId = String(d?.videoTaskId ?? "").trim();
    if (!taskId) {
      // task未開始
      return NextResponse.json({
        ok: true,
        draftId,
        taskId: null,
        status: "idle",
        videoUrl: null,
      });
    }

    const polled = await pollRunway(taskId);

    // ✅ draftsへ状態反映（唯一の真実）
    if (polled.ok) {
      if (polled.status === "queued" || polled.status === "running") {
        await ref.set(
          {
            videoSource: "runway",
            videoTaskId: taskId,
            videoStatus: polled.status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return NextResponse.json({
          ok: true,
          draftId,
          taskId,
          status: polled.status,
          videoUrl: null,
        });
      }

      // succeeded
      if (polled.status === "succeeded") {
        const url = String(polled.videoUrl ?? "").trim();
        if (!url) {
          // URL無しは“走行中扱い”で返す（復旧余地）
          await ref.set(
            {
              videoSource: "runway",
              videoTaskId: taskId,
              videoStatus: "running",
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          return NextResponse.json({
            ok: true,
            draftId,
            taskId,
            status: "running",
            videoUrl: null,
          });
        }

        await ref.set(
          {
            videoSource: "runway",
            videoTaskId: taskId,
            videoStatus: "succeeded",
            videoUrl: url,
            videoError: null,
            videoCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return NextResponse.json({
          ok: true,
          draftId,
          taskId,
          status: "succeeded",
          videoUrl: url,
        });
      }
    }

    // failed
    const err = String((polled as any)?.error ?? "runway task failed");
    await ref.set(
      {
        videoSource: "runway",
        videoTaskId: taskId,
        videoStatus: "failed",
        videoError: err,
        videoCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      draftId,
      taskId,
      status: "failed",
      videoUrl: null,
      error: err,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "check-video-task failed" }, { status: 500 });
  }
}