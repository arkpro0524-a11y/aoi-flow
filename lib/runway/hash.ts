// lib/runway/hash.ts

import crypto from "crypto";

export function runwayInputHash(input: {
  image: string;
  preset: string;
  motion: any;
  seconds: number;
  size: string;
  quality: string;
}) {
  const raw = JSON.stringify(input);
  return crypto.createHash("sha256").update(raw).digest("hex");
}