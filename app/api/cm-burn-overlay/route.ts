//app/api/cm-burn-overlay/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import admin from "firebase-admin";
import crypto from "crypto";
import { requireUserFromAuthHeader, getAdminDb } from "@/app/api/_firebase/admin";

type OverlayPosition = "top" | "center" | "bottom" | "leftBottom" | "rightBottom";

type CmOverlayInput = {
  text?: string;
  logoUrl?: string;
  startSec?: number;
  endSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  position?: OverlayPosition;
  fontSize?: number;
  fontColor?: string;
  fontWeight?: "normal" | "bold";
  lineHeight?: number;
  boxEnabled?: boolean;
  boxColor?: string;
  boxOpacity?: number;
  logoEnabled?: boolean;
  logoPosition?: OverlayPosition;
  logoWidth?: number;
  logoOpacity?: number;
  size?: string;
  seconds?: number;
};

function safeText(v: unknown): string {
  return String(v ?? "").trim();
}

function safeNumber(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);

  if (!Number.isFinite(n)) return fallback;

  return Math.max(min, Math.min(max, n));
}

function safeColor(v: unknown, fallback: string): string {
  const s = safeText(v);

  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^[a-zA-Z]+$/.test(s)) return s;

  return fallback;
}

function normalizePosition(v: unknown, fallback: OverlayPosition): OverlayPosition {
  const s = safeText(v);

  if (s === "top") return "top";
  if (s === "center") return "center";
  if (s === "bottom") return "bottom";
  if (s === "leftBottom") return "leftBottom";
  if (s === "rightBottom") return "rightBottom";

  return fallback;
}

function getBurnApiBaseUrl(): string {
  const url = safeText(process.env.BURN_VIDEO_API_URL);

  if (!url) {
    throw new Error(
      "BURN_VIDEO_API_URL が未設定です。例: http://localhost:8088 または Cloud Run のURL"
    );
  }

  return url.replace(/\/+$/, "");
}

async function callCmBurnApi(body: {
  videoUrl: string;
  overlay: Required<CmOverlayInput>;
  seconds: number;
}) {
  const apiUrl = `${getBurnApiBaseUrl()}/cm-burn-overlay`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(`burn-api failed (${res.status}): ${message || "unknown"}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  if (!buffer.length) {
    throw new Error("burn-api returned empty video");
  }

  return buffer;
}

async function uploadMp4(params: {
  uid: string;
  draftId: string;
  buffer: Buffer;
}) {
  const bucket = admin.storage().bucket();
  const token = crypto.randomUUID();

  const storagePath = `users/${params.uid}/drafts/${params.draftId}/cm/overlays/cm-overlay-${Date.now()}.mp4`;

  await bucket.file(storagePath).save(params.buffer, {
    resumable: false,
    metadata: {
      contentType: "video/mp4",
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  const encoded = encodeURIComponent(storagePath);

  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;

  return {
    url,
    path: storagePath,
  };
}

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const body = (await req.json().catch(() => ({}))) as any;

    const draftId = safeText(body?.draftId);
    const videoUrl = safeText(body?.videoUrl);

    if (!draftId) {
      return NextResponse.json(
        { ok: false, error: "draftId is required" },
        { status: 400 }
      );
    }

    if (!videoUrl) {
      return NextResponse.json(
        { ok: false, error: "videoUrl is required" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const draftRef = db.collection("drafts").doc(draftId);
    const snap = await draftRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: "draft not found" },
        { status: 404 }
      );
    }

    const current = snap.data() || {};

    if (String(current.userId || "") !== user.uid) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

    const rawOverlay = (body?.overlay || {}) as CmOverlayInput;

    const startSec = safeNumber(rawOverlay.startSec, 0.3, 0, 60);
    const endSec = safeNumber(rawOverlay.endSec, 4.5, startSec + 0.2, 120);
    const seconds = safeNumber(body?.seconds || rawOverlay.seconds, 5, 1, 20);

    const overlay: Required<CmOverlayInput> = {
      text: safeText(rawOverlay.text),
      logoUrl: safeText(rawOverlay.logoUrl),

      startSec,
      endSec,
      fadeInSec: safeNumber(rawOverlay.fadeInSec, 0, 0, 10),
      fadeOutSec: safeNumber(rawOverlay.fadeOutSec, 0, 0, 10),

      position: normalizePosition(rawOverlay.position, "bottom"),

      fontSize: Math.round(safeNumber(rawOverlay.fontSize, 42, 12, 160)),
      fontColor: safeColor(rawOverlay.fontColor, "#FFFFFF"),
      fontWeight: rawOverlay.fontWeight === "normal" ? "normal" : "bold",
      lineHeight: safeNumber(rawOverlay.lineHeight, 1.25, 0.8, 2.5),

      boxEnabled: rawOverlay.boxEnabled !== false,
      boxColor: safeColor(rawOverlay.boxColor, "#000000"),
      boxOpacity: safeNumber(rawOverlay.boxOpacity, 0.45, 0, 1),

      logoEnabled: rawOverlay.logoEnabled === true,
      logoPosition: normalizePosition(rawOverlay.logoPosition, "top"),
      logoWidth: Math.round(safeNumber(rawOverlay.logoWidth, 140, 24, 600)),
      logoOpacity: safeNumber(rawOverlay.logoOpacity, 0.9, 0, 1),

      size: safeText(body?.size || rawOverlay.size || current.videoSize || "720x1280"),
      seconds,
    };

    if (!overlay.text && !overlay.logoEnabled) {
      return NextResponse.json(
        { ok: false, error: "文字またはロゴを設定してください" },
        { status: 400 }
      );
    }

    const burnedBuffer = await callCmBurnApi({
      videoUrl,
      overlay,
      seconds,
    });

    const uploaded = await uploadMp4({
      uid: user.uid,
      draftId,
      buffer: burnedBuffer,
    });

    const prevCmVideo =
      current.cmVideo && typeof current.cmVideo === "object"
        ? current.cmVideo
        : {};

    const prevOverlayUrls = Array.isArray(prevCmVideo.overlayUrls)
      ? prevCmVideo.overlayUrls
      : [];

    const overlayUrls = [
      uploaded.url,
      ...prevOverlayUrls.filter((x: any) => safeText(x) && safeText(x) !== uploaded.url),
    ].slice(0, 10);

    const nextCmVideo = {
      ...prevCmVideo,
      provider: "runway",
      overlayUrl: uploaded.url,
      overlayPath: uploaded.path,
      overlayUrls,
      overlay,
      updatedAt: Date.now(),
    };

    await draftRef.set(
      {
        cmVideo: nextCmVideo,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      videoUrl: uploaded.url,
      overlayUrl: uploaded.url,
      path: uploaded.path,
      cmVideo: nextCmVideo,
    });
  } catch (e: any) {
    console.error("[cm-burn-overlay] error:", e);

    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "cm-burn-overlay failed",
      },
      { status: 500 }
    );
  }
}