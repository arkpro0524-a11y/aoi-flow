// lib/storage/saveVideo.ts

import "server-only";
import { getAdminBucket } from "@/firebaseAdmin";

function extFromContentType(contentType: string) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("video/webm")) return "webm";
  if (ct.includes("video/mp4")) return "mp4";
  return "bin";
}

export async function saveVideoToStorage(
  buf: Buffer,
  opts: { contentType: string }
) {
  const bucket = getAdminBucket();

  const ext = extFromContentType(opts.contentType);
  const name = `users/shared/videos/${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}.${ext}`;

  const file = bucket.file(name);

  await file.save(buf, {
    contentType: opts.contentType,
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000",
    },
  });

  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${name}`;
}