// app/api/upload/image/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminBucket } from "@/firebaseAdmin";

function storageDownloadUrl(bucketName: string, filePath: string, token: string) {
  const encoded = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

function ymd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export async function POST(req: Request) {
  try {
    console.log("[upload/image] start (NO AUTH)");

    const fd = await req.formData();
    const draftId = String(fd.get("draftId") || "").trim();
    const file = fd.get("file");

    console.log("[upload/image] draftId:", draftId);
    console.log("[upload/image] file exists:", !!file);

    if (!draftId) {
      return NextResponse.json({ ok: false, error: "draftId required" }, { status: 400 });
    }

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf.length) {
      return NextResponse.json({ ok: false, error: "empty file" }, { status: 400 });
    }

    // ✅ いまは「自分だけ」想定なので固定UIDにする（後で戻せる）
    const uid = "dev";

    const bucket = getAdminBucket();
    const bucketName = bucket.name;

    console.log("[upload/image] bucket:", bucketName);
    console.log("[upload/image] size:", buf.length);

    const token = crypto.randomUUID();
    const ts = Date.now();
    const rand = crypto.randomBytes(6).toString("hex");

    // ✅ jpgで保存（中身がpngでもOK。必要なら後で拡張子分岐にする）
    const filePath = `users/${uid}/drafts/${draftId}/images/${ymd()}/${ts}_${rand}.jpg`;

    await bucket.file(filePath).save(buf, {
      contentType: "image/jpeg",
      resumable: false,
      metadata: {
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const url = storageDownloadUrl(bucketName, filePath, token);

    console.log("[upload/image] success:", filePath);

    return NextResponse.json({
      ok: true,
      url,
      path: filePath,
      size: buf.length,
    });
  } catch (e: any) {
    console.error("[upload/image] ERROR:", e);
    return NextResponse.json({ ok: false, error: e?.message || "upload failed" }, { status: 500 });
  }
}