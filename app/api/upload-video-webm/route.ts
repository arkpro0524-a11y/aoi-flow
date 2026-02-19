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

export async function POST(req: Request) {
  try {
    // ✅ 認証（idToken）
    const user = await requireUserFromAuthHeader(req);

    // ✅ multipart/form-data
    const fd = await req.formData();
    const draftId = String(fd.get("draftId") || "").trim();

    const file = fd.get("file");
    if (!draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    }
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "file is required (webm Blob)" }, { status: 400 });
    }

    // ✅ content-type を webm に寄せる（来たものが空なら補正）
    const contentType = (file.type && String(file.type)) || "video/webm";

    // ✅ Buffer化
    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    if (!buf.length) {
      return NextResponse.json({ error: "file is empty" }, { status: 400 });
    }

    // ✅ Storage保存（/firebaseAdmin.ts の bucket を使用）
    const bucket = getAdminBucket();
    const bucketName = String(bucket?.name || "").trim();
    if (!bucketName) {
      return NextResponse.json({ error: "storage bucket name is empty" }, { status: 500 });
    }

    const token = crypto.randomUUID();
    const ts = Date.now();
    const filePath = `users/${user.uid}/drafts/${draftId}/nonai/${ts}.webm`;

    const f = bucket.file(filePath);
    await f.save(buf, {
      contentType,
      resumable: false,
      metadata: {
        metadata: { firebaseStorageDownloadTokens: token },
        cacheControl: "public,max-age=31536000",
      },
    });

    // ✅ 返却URL（Firebase Download URL）
    const url = storageDownloadUrl(bucketName, filePath, token);

    return NextResponse.json({
      ok: true,
      url,
      videoUrl: url, // 互換
      contentType,
      size: buf.length,
      path: filePath,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "upload-video-webm failed" },
      { status: 500 }
    );
  }
}