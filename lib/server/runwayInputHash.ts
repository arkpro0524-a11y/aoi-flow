// lib/server/runwayInputHash.ts

import crypto from "crypto";

export function runwayInputHash(input: {
  primaryImageUrl: string;
  preset: string;
  motion: any;
  seconds: number;
  size: string;
  quality: string;
}) {
  const raw = JSON.stringify({
    image: input.primaryImageUrl,
    preset: input.preset,
    motion: input.motion,
    seconds: input.seconds,
    size: input.size,
    quality: input.quality,
  });

  return crypto.createHash("sha256").update(raw).digest("hex");
}