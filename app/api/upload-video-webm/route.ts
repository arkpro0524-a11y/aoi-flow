// app/api/upload-video-webm/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminBucket } from "@/firebaseAdmin";
import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";

function storageDownloadUrl(bucketName: string, filePath: string, token: string) {
  const encoded = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

function normalizeVideoExtension(contentType: string, fallbackName: string) {
  const lowerType = String(contentType || "").toLowerCase();
  const lowerName = String(fallbackName || "").toLowerCase();

  if (lowerType.includes("mp4") || lowerName.endsWith(".mp4")) return "mp4";
  if (lowerType.includes("quicktime") || lowerName.endsWith(".mov")) return "mov";
  if (lowerType.includes("webm") || lowerName.endsWith(".webm")) return "webm";

  return "webm";
}

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);

    const fd = await req.formData();

    const draftId = String(fd.get("draftId") || "").trim();
    const kind = String(fd.get("kind") || "generated").trim() === "source" ? "source" : "generated";

    const file = fd.get("file");

    if (!draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    }

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "file is required (video Blob)" }, { status: 400 });
    }

    const fileName =
      file instanceof File && file.name ? String(file.name) : `video_${Date.now()}.webm`;

    const contentType = (file.type && String(file.type)) || "video/webm";
    const ext = normalizeVideoExtension(contentType, fileName);

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);

    if (!buf.length) {
      return NextResponse.json({ error: "file is empty" }, { status: 400 });
    }

    const bucket = getAdminBucket();
    const bucketName = String(bucket?.name || "").trim();

    if (!bucketName) {
      return NextResponse.json({ error: "storage bucket name is empty" }, { status: 500 });
    }

    const token = crypto.randomUUID();
    const ts = Date.now();

    const folder = kind === "source" ? "source" : "nonai";
    const filePath = `users/${user.uid}/drafts/${draftId}/${folder}/${ts}.${ext}`;

    const f = bucket.file(filePath);

    await f.save(buf, {
      contentType,
      resumable: false,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
          kind,
          originalFileName: fileName,
        },
        cacheControl: "public,max-age=31536000",
      },
    });

    const url = storageDownloadUrl(bucketName, filePath, token);

    return NextResponse.json({
      ok: true,
      url,
      videoUrl: url,
      contentType,
      size: buf.length,
      path: filePath,
      kind,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "upload-video-webm failed" },
      { status: 500 }
    );
  }
}