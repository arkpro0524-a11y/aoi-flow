// app/api/upload/image/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import sharp from "sharp";

import { getAdminAuth, getAdminBucket, getAdminDb } from "@/firebaseAdmin";

/**
 * AOI FLOW
 * 画像アップロードAPI
 *
 * このAPIの役割
 * - 画像を Storage に保存する
 * - 通常写真は JPEG に正規化する
 * - 切り抜き画像は PNG を維持する
 * - alpha のない cutout 画像も、可能な範囲で透明PNGへ救済する
 *
 * 重要
 * - 以前の uid="dev" 固定は廃止
 * - 原則として本人UIDで保存する
 * - Bearerトークンが無い場合でも、draftId の所有者から UID を逆引きして保存する
 *   （今のフロントhookが Authorization をまだ付けていないための互換対応）
 */

/* =========================
 * 認証 / UID 決定
 * ========================= */

function bearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/**
 * まず Bearer を優先し、無ければ draft の所有者から uid を取る
 * - これで既存 hook を壊さずに保存先を user 単位へ直せる
 */
async function resolveUid(req: Request, draftId: string): Promise<string> {
  const token = bearerToken(req);

  if (token) {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded?.uid) throw new Error("invalid token");
    return decoded.uid;
  }

  if (!draftId) {
    throw new Error("draftId is required when Authorization header is missing");
  }

  const db = getAdminDb();
  const snap = await db.collection("drafts").doc(draftId).get();
  if (!snap.exists) {
    throw new Error("draft not found");
  }

  const data = snap.data() || {};
  const uid = String(data.userId || "").trim();
  if (!uid) {
    throw new Error("draft owner not found");
  }

  return uid;
}

/* =========================
 * 小関数
 * ========================= */

function storageDownloadUrl(bucketName: string, filePath: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    filePath
  )}?alt=media&token=${token}`;
}

function ymd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

type Normalized = {
  out: Buffer;
  contentType: string;
  ext: "jpg" | "png";
};

/**
 * 通常の写真をJPEGに整える
 * - スマホ撮影画像などを重すぎない形に正規化する
 */
async function normalizePhotoToJpeg(buf: Buffer): Promise<Normalized> {
  const img = sharp(buf, { failOn: "none" }).rotate();
  const meta = await img.metadata();

  const base = meta.hasAlpha ? img.flatten({ background: "#ffffff" }) : img;

  const resized = base.resize({
    width: 2048,
    height: 2048,
    fit: "inside",
    withoutEnlargement: true,
  });

  const out = await resized
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 0.5, x1: 2, y2: 10, y3: 20 })
    .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();

  return {
    out,
    contentType: "image/jpeg",
    ext: "jpg",
  };
}

/**
 * alpha が無い cutout 画像を、なるべく透明PNGに救済する
 * - チェック柄が焼き付いた画像などを少しでも扱いやすくする
 */
async function removeBakedCheckerToAlpha(input: Buffer): Promise<Buffer> {
  const img = sharp(input, { failOn: "none" }).rotate().ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  const w = info.width;
  const h = info.height;

  const idx = (x: number, y: number) => (y * w + x) * 4;

  /**
   * 四隅の色を背景候補として拾う
   */
  const samples: Array<[number, number, number]> = [];
  const points = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w / 2), 0],
    [Math.floor(w / 2), h - 1],
  ] as const;

  for (const [x, y] of points) {
    const i = idx(x, y);
    samples.push([out[i], out[i + 1], out[i + 2]]);
  }

  const bgCandidates = samples.filter(([r, g, b]) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max - min;
    return max >= 170 && sat <= 18;
  });

  const bgColors =
    bgCandidates.length >= 2
      ? bgCandidates
      : ([
          [210, 210, 210],
          [245, 245, 245],
        ] as Array<[number, number, number]>);

  const dist = (r: number, g: number, b: number, c: [number, number, number]) => {
    const dr = r - c[0];
    const dg = g - c[1];
    const db = b - c[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const T0 = 18;
  const T1 = 34;

  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max - min;

    if (!(max >= 170 && sat <= 22)) {
      out[i + 3] = 255;
      continue;
    }

    const d = Math.min(...bgColors.map((c) => dist(r, g, b, c)));

    if (d <= T0) {
      out[i + 3] = 0;
    } else if (d <= T1) {
      const t = (d - T0) / (T1 - T0);
      out[i + 3] = Math.max(0, Math.min(255, Math.round(255 * t)));
    } else {
      out[i + 3] = 255;
    }
  }

  return await sharp(out, {
    raw: { width: w, height: h, channels: 4 },
  })
    .trim({ threshold: 8 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/**
 * 切り抜き画像を PNG に整える
 */
async function normalizeCutoutToPng(buf: Buffer): Promise<Normalized> {
  const base = sharp(buf, { failOn: "none" }).rotate().resize({
    width: 2048,
    height: 2048,
    fit: "inside",
    withoutEnlargement: true,
  });

  const meta = await base.metadata();

  if (meta.hasAlpha) {
    const out = await base
      .ensureAlpha()
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    return {
      out,
      contentType: "image/png",
      ext: "png",
    };
  }

  const resizedBuf = await base.png().toBuffer();
  const out = await removeBakedCheckerToAlpha(resizedBuf);

  return {
    out,
    contentType: "image/png",
    ext: "png",
  };
}

/* =========================
 * 本体
 * ========================= */

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const draftId = String(form.get("draftId") || "").trim();
    const fileValue = form.get("file");

    if (!draftId) {
      return NextResponse.json(
        { ok: false, error: "draftId required" },
        { status: 400 }
      );
    }

    if (!fileValue || !(fileValue instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: "file required" },
        { status: 400 }
      );
    }

    const file = fileValue as File;
    const fileName = String((file as any).name || "").toLowerCase();

    const raw = Buffer.from(await file.arrayBuffer());
    if (!raw.length) {
      return NextResponse.json(
        { ok: false, error: "empty file" },
        { status: 400 }
      );
    }

    /**
     * 保存先UIDを解決
     * - Bearer があれば本人
     * - 無ければ draft 所有者
     */
    const uid = await resolveUid(req, draftId);

    const meta = await sharp(raw, { failOn: "none" }).metadata();
    const hasAlpha = !!meta.hasAlpha;

    /**
     * cutout_ で始まるもの、または alpha を持つものは PNG 扱い
     */
    const isCutoutLike = fileName.startsWith("cutout_") || hasAlpha;

    const normalized = isCutoutLike
      ? await normalizeCutoutToPng(raw)
      : await normalizePhotoToJpeg(raw);

    const bucket = getAdminBucket();
    const bucketName = bucket.name;

    const token = crypto.randomUUID();
    const ts = Date.now();
    const rand = crypto.randomBytes(6).toString("hex");

    const filePath = `users/${uid}/drafts/${draftId}/images/${ymd()}/${ts}_${rand}.${normalized.ext}`;

    await bucket.file(filePath).save(normalized.out, {
      contentType: normalized.contentType,
      resumable: false,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
    });

    const url = storageDownloadUrl(bucketName, filePath, token);

    return NextResponse.json({
      ok: true,
      url,
      path: filePath,
      size: normalized.out.length,
      contentType: normalized.contentType,
      detected: {
        hasAlpha,
        isCutoutLike,
      },
    });
  } catch (e: any) {
    console.error("[upload/image] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "upload failed" },
      { status: 500 }
    );
  }
}