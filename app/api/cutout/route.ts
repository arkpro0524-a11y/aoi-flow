// /app/api/cutout/route.ts
import { NextResponse } from "next/server";
import sharp from "sharp";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/app/api/_firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CutoutProvider = "docker" | "photoroom" | "auto";

type QualityBreakdown = {
  outline: number;
  missing: number;
  holes: number;
  transparent: number;
  edge: number;
  noise: number;
  foreground: number;
  subject: number;
};

type QualityReport = QualityBreakdown & {
  score: number;
  transparentRatio: number;
  opaqueRatio: number;
  semiTransparentRatio: number;
};

type CutoutResult = {
  buffer: Buffer;
  engine: string;
  provider: "docker" | "photoroom";
  quality: QualityReport;
  elapsed: number;
};

type CutoutInput = {
  raw: Buffer;
  safeBaseName: string;
};

type UsageUser = {
  uid: string;
  email: string | null;
};

const DEFAULT_DOCKER_CUTOUT_URL = "http://localhost:8080/cutout";
const DEFAULT_DOCKER_HEALTH_URL = "http://localhost:8080/health";
const QUALITY_THRESHOLD = numberEnv("CUTOUT_AUTO_QUALITY_THRESHOLD", 95);
const MIN_ACCEPT_QUALITY = numberEnv("CUTOUT_MIN_ACCEPT_QUALITY", 35);

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function boolEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function getProvider(): CutoutProvider {
  const raw = String(process.env.CUTOUT_PROVIDER || "auto").toLowerCase();
  if (raw === "docker" || raw === "photoroom" || raw === "auto") return raw;
  return "auto";
}

function getDockerCutoutUrl() {
  return String(process.env.CUTOUT_DOCKER_URL || process.env.CUTOUT_API_URL || DEFAULT_DOCKER_CUTOUT_URL).trim();
}

function getDockerHealthUrl() {
  return String(process.env.CUTOUT_DOCKER_HEALTH_URL || DEFAULT_DOCKER_HEALTH_URL).trim();
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function wantsJson(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  if (format === "json") return true;
  return (req.headers.get("accept") || "").toLowerCase().includes("application/json");
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function readInputImage(req: Request): Promise<CutoutInput> {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => null);
    const imageUrl = String(json?.imageUrl || json?.url || "").trim();
    if (!imageUrl) throw new Error("imageUrlなし");
    return await readRemoteImage(imageUrl);
  }

  const form = await req.formData();
  const imageUrl = String(form.get("imageUrl") || form.get("url") || "").trim();
  if (imageUrl) return await readRemoteImage(imageUrl);

  const file = form.get("file") || form.get("image");
  if (!file || !(file instanceof File)) throw new Error("fileなし");

  const raw = Buffer.from(await file.arrayBuffer());
  if (!raw.length) throw new Error("empty file");

  return {
    raw,
    safeBaseName: String(file.name || "upload").replace(/\.[^.]+$/, "").trim() || "upload",
  };
}

async function readRemoteImage(imageUrl: string): Promise<CutoutInput> {
  const res = await fetch(imageUrl, { method: "GET", cache: "no-store" });
  if (!res.ok) throw new Error(`画像URLの取得に失敗しました (${res.status})`);
  const raw = Buffer.from(await res.arrayBuffer());
  if (!raw.length) throw new Error("画像URLから空データが返りました");
  return { raw, safeBaseName: `image_url_${Date.now()}` };
}

async function normalizeInputForCutout(input: Buffer) {
  return await sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function waitForDockerReady() {
  const deadline = Date.now() + numberEnv("CUTOUT_DOCKER_READY_TIMEOUT_MS", 120000);
  const healthUrl = getDockerHealthUrl();
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl, { method: "GET", cache: "no-store" });
      const json = await res.json().catch(() => null);
      const validV3 =
        res.ok &&
        json?.ready === true &&
        json?.provider === "docker" &&
        json?.version === "v3";

      if (validV3) return json;

      lastError = `health ${res.status}: ${JSON.stringify(json).slice(0, 240)}`;
    } catch (error) {
      lastError = safeError(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  throw new Error(`Docker cutout engine is not ready: ${lastError || "timeout"}`);
}

async function postMultipart(url: string, normalizedInput: Buffer, safeBaseName: string) {
  const upstreamFile = new File([new Uint8Array(normalizedInput)], `${safeBaseName || "upload"}.png`, {
    type: "image/png",
  });
  const body = new FormData();
  body.append("file", upstreamFile);
  body.append("image", upstreamFile);

  const res = await fetch(url, { method: "POST", body, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text.slice(0, 500)}`.trim());
  }
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    engine: res.headers.get("X-Cutout-Engine") || "unknown",
    provider: res.headers.get("X-Cutout-Provider") || "",
  };
}

async function runDockerCutout(normalizedInput: Buffer, safeBaseName: string): Promise<CutoutResult> {
  const started = Date.now();
  await waitForDockerReady();
  const out = await postMultipart(getDockerCutoutUrl(), normalizedInput, safeBaseName);
  const quality = await scoreCutout(normalizedInput, out.buffer);
  return {
    buffer: out.buffer,
    engine: out.engine || "BiRefNet",
    provider: "docker",
    quality,
    elapsed: Date.now() - started,
  };
}

async function runPhotoroomCutout(normalizedInput: Buffer, safeBaseName: string): Promise<CutoutResult> {
  const apiKey = String(process.env.PHOTOROOM_API_KEY || "").trim();
  const url = String(process.env.PHOTOROOM_API_URL || "https://sdk.photoroom.com/v1/segment").trim();
  if (!apiKey) throw new Error("PHOTOROOM_API_KEY missing");

  const started = Date.now();
  const file = new File([new Uint8Array(normalizedInput)], `${safeBaseName || "upload"}.png`, { type: "image/png" });
  const body = new FormData();
  body.append("image_file", file);
  body.append("format", "png");

  const res = await fetch(url, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Photoroom failed: ${res.status} ${text.slice(0, 500)}`.trim());
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const quality = await scoreCutout(normalizedInput, buffer);
  return {
    buffer,
    engine: "Photoroom",
    provider: "photoroom",
    quality,
    elapsed: Date.now() - started,
  };
}

async function scoreCutout(_input: Buffer, output: Buffer): Promise<QualityReport> {
  const image = sharp(output, { failOn: "none" }).ensureAlpha().resize({ width: 512, height: 512, fit: "inside" });
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const total = Math.max(1, width * height);
  let transparent = 0;
  let opaque = 0;
  let semi = 0;
  let edgeTransitions = 0;
  let tinyNoise = 0;

  for (let i = 0; i < total; i += 1) {
    const a = data[i * 4 + 3] ?? 255;
    if (a <= 8) transparent += 1;
    else if (a >= 247) opaque += 1;
    else semi += 1;
    const x = i % width;
    const y = Math.floor(i / width);
    if (x < width - 1) {
      const b = data[(i + 1) * 4 + 3] ?? 255;
      if (Math.abs(a - b) > 96) edgeTransitions += 1;
    }
    if (y < height - 1) {
      const b = data[(i + width) * 4 + 3] ?? 255;
      if (Math.abs(a - b) > 96) edgeTransitions += 1;
    }
    if (a > 0 && a < 50) tinyNoise += 1;
  }

  const transparentRatio = transparent / total;
  const opaqueRatio = opaque / total;
  const semiTransparentRatio = semi / total;
  const edgeDensity = edgeTransitions / total;
  const noiseRatio = tinyNoise / total;
  const foregroundRatio = (opaque + semi) / total;

  const transparentScore = transparentRatio >= 0.01 && transparentRatio <= 0.96 ? 100 : transparentRatio < 0.01 ? 20 : 35;
  const missing = opaqueRatio >= 0.03 && opaqueRatio <= 0.98 ? 100 : 45;
  const holes = semiTransparentRatio <= 0.33 ? 100 : Math.max(35, 100 - Math.round((semiTransparentRatio - 0.33) * 160));
  const outline = edgeDensity > 0.002 && edgeDensity < 0.24 ? 100 : edgeDensity <= 0.002 ? 45 : 70;
  const edge = semiTransparentRatio > 0.002 && semiTransparentRatio < 0.22 ? 100 : 82;
  const noise = Math.max(40, 100 - Math.round(noiseRatio * 500));
  const foreground = foregroundRatio >= 0.03 && foregroundRatio <= 0.94 ? 100 : foregroundRatio < 0.03 ? 30 : 55;
  const subject = transparentRatio >= 0.01 && foregroundRatio >= 0.03 && edgeDensity > 0.002 ? 100 : 35;
  const base = Math.round(
    outline * 0.16 +
      missing * 0.14 +
      holes * 0.12 +
      transparentScore * 0.14 +
      edge * 0.14 +
      noise * 0.1 +
      foreground * 0.1 +
      subject * 0.1
  );

  return {
    score: Math.max(0, Math.min(100, base)),
    outline,
    missing,
    holes,
    transparent: transparentScore,
    edge,
    noise,
    foreground,
    subject,
    transparentRatio,
    opaqueRatio,
    semiTransparentRatio,
  };
}

async function getUsageUser(req: Request): Promise<UsageUser | null> {
  const authHeader = req.headers.get("authorization") || "";
  const [type, token] = authHeader.split(" ");
  if (type !== "Bearer" || !token) return null;
  const decoded = await getAdminAuth().verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email ?? null };
}

async function reserveUsage(req: Request) {
  const enforce = boolEnv("CUTOUT_USAGE_ENFORCE_AUTH", false);
  const defaultLimit = numberEnv("CUTOUT_MONTHLY_LIMIT", 100);
  let user: UsageUser | null = null;

  try {
    user = await getUsageUser(req);
  } catch (error) {
    if (enforce) throw error;
  }

  if (!user) {
    if (enforce) throw new Error("ログインが必要です");
    return { allowed: true, uid: null, month: monthKey(), count: 0, limit: defaultLimit };
  }

  const db = getAdminDb();
  const month = monthKey();
  const ref = db.collection("users").doc(user.uid).collection("usage").doc(month);
  const usage = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() || {} : {};
    const limit = Number(current.limit ?? defaultLimit);
    const count = Number(current.count ?? 0);
    if (count >= limit) return { allowed: false, uid: user.uid, month, count, limit };
    tx.set(
      ref,
      {
        month,
        count: FieldValue.increment(1),
        limit,
        updatedAt: FieldValue.serverTimestamp(),
        lastUsedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(
      db.collection("users").doc(user.uid),
      { usage: { month, count: count + 1, limit }, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return { allowed: true, uid: user.uid, month, count: count + 1, limit };
  });
  return usage;
}

async function logCutoutResult(req: Request, result: CutoutResult, usage: Awaited<ReturnType<typeof reserveUsage>>) {
  try {
    const db = getAdminDb();
    await db.collection("cutoutUsage").add({
      uid: usage.uid,
      month: usage.month,
      provider: result.provider,
      engine: result.engine,
      quality: result.quality,
      elapsed: result.elapsed,
      path: new URL(req.url).pathname,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.warn("[cutout] usage log skipped:", safeError(error));
  }
}

function jsonPayload(result: CutoutResult) {
  return {
    engine: result.engine,
    provider: result.provider,
    quality: result.quality.score,
    qualityDetail: result.quality,
    elapsed: result.elapsed,
    image: `data:image/png;base64,${result.buffer.toString("base64")}`,
  };
}

function pngResponse(result: CutoutResult) {
  return new Response(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Cutout-Verified": "true",
      "X-Cutout-Engine": result.engine,
      "X-Cutout-Provider": result.provider,
      "X-Cutout-Quality": String(result.quality.score),
      "X-Cutout-Elapsed": String(result.elapsed),
      "X-Cutout-Meta": JSON.stringify({
        engine: result.engine,
        provider: result.provider,
        quality: result.quality,
        elapsed: result.elapsed,
      }),
    },
  });
}

async function runProvider(provider: CutoutProvider, normalizedInput: Buffer, safeBaseName: string) {
  let result: CutoutResult;
  if (provider === "docker") result = await runDockerCutout(normalizedInput, safeBaseName);
  else if (provider === "photoroom") result = await runPhotoroomCutout(normalizedInput, safeBaseName);
  else {
    const docker = await runDockerCutout(normalizedInput, safeBaseName);
    result = docker.quality.score >= QUALITY_THRESHOLD ? docker : await runPhotoroomCutout(normalizedInput, safeBaseName);
  }

  if (result.quality.score < MIN_ACCEPT_QUALITY) {
    throw new Error(`切り抜き品質が低いため停止しました (${result.quality.score})`);
  }
  return result;
}

export async function POST(req: Request) {
  const started = Date.now();
  try {
    const usage = await reserveUsage(req);
    if (!usage.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "月間利用枚数の上限に達しました",
          usage: { month: usage.month, count: usage.count, limit: usage.limit },
          billingRequired: true,
        },
        { status: 402 }
      );
    }

    let input: CutoutInput;
    try {
      input = await readInputImage(req);
    } catch (error) {
      return NextResponse.json({ error: safeError(error) || "入力画像がありません" }, { status: 400 });
    }

    const normalizedInput = await normalizeInputForCutout(input.raw);
    const provider = getProvider();
    const result = await runProvider(provider, normalizedInput, input.safeBaseName);

    result.elapsed = Date.now() - started;
    await logCutoutResult(req, result, usage);

    if (wantsJson(req)) return NextResponse.json(jsonPayload(result), { headers: { "Cache-Control": "no-store" } });
    return pngResponse(result);
  } catch (error) {
    console.error("[cutout] fatal:", error);
    return NextResponse.json({ error: safeError(error) || "cutout失敗" }, { status: 500 });
  }
}
