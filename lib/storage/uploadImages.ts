// lib/storage/uploadImages.ts
"use client";

import { auth } from "@/firebase";

export type UploadImagesResult = {
  urls: string[];          // アップロード完了URL（順序維持）
  baseUrl: string | null;  // 先頭
  materialUrls: string[];  // 2枚目以降
};

/**
 * 画像をJPEGに変換してBlobで返す
 * - HEIF/HEIC は createImageBitmap が落ちることがある → その場合はエラーにする（UIで案内）
 */
async function toJpegBlob(file: File, quality = 0.92): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    throw new Error("画像の読み込みに失敗しました（HEIF/HEIC未対応の可能性）");
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas error");
  ctx.drawImage(bitmap, 0, 0);

  const blob: Blob | null = await new Promise((res) => {
    canvas.toBlob((b) => res(b), "image/jpeg", quality);
  });

  if (!blob) throw new Error("JPEG変換に失敗しました");
  return blob;
}

/**
 * ✅ “確実に通す”ルート：API経由アップロード
 * - /api/upload/image が Admin SDK で保存して { url } を返す（※ signedUrlではない）
 */
export async function uploadImagesAsJpeg(args: {
  uid: string;
  draftId: string;
  files: File[];
}): Promise<UploadImagesResult> {
  const { uid, draftId } = args;
  const files = (args.files || []).filter(Boolean);

  if (!uid) throw new Error("uid is missing");
  if (!draftId) throw new Error("draftId is missing");
  if (files.length === 0) throw new Error("files is empty");

  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  if (user.uid !== uid) throw new Error("uid mismatch (auth.currentUser.uid !== uid)");

  // ✅ ID Token（なりすまし不可）
  const token = await user.getIdToken(true);

  const urls: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];

    // JPEGに変換（順序維持）
    const jpg = await toJpegBlob(f, 0.92);

    const fd = new FormData();
    fd.append("file", new File([jpg], `upload_${i}.jpg`, { type: "image/jpeg" }));
    fd.append("draftId", draftId);

    const res = await fetch("/api/upload/image", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: fd,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      throw new Error(json?.error ?? `upload failed (status ${res.status})`);
    }

    // ✅ FIX: signedUrl → url
    urls.push(String(json.url || "").trim());
  }

  const baseUrl = urls[0] ?? null;
  const materialUrls = urls.slice(1);

  return { urls, baseUrl, materialUrls };
}