// app/api/extract-foreground/route.ts
import { NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import type { File as StorageFile } from "@google-cloud/storage";
import crypto from "crypto";
import sharp from "sharp";

import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminDb } from "@/firebaseAdmin";

export const runtime = "nodejs";

/**
 * AOI FLOW
 * 前景抽出API（商品を透過PNGにする）
 *
 * このAPIの役割
 * - 商品画像を受け取る
 * - 透過PNGっぽく見える画像でも「本当に切り抜き済みか」を追加判定する
 * - 切り抜き済みと断定できる時だけ OpenAI をスキップする
 * - それ以外は OpenAI images/edits を使って背景除去する
 * - 白マットや白四角が残った場合に、最後に保険処理をかける
 * - Storage に保存して公開URLを返す
 *
 * 今回の重要修正
 * - hasAlpha だけで「切り抜き成功」と判定しない
 * - 透明画素の割合を確認する
 * - 透明が少ない画像は OpenAI を通す
 * - 壊れた前景の再利用を避けるため、ハッシュの version を更新する
 * - さらに、保存前に trim して transparent border をそろえる
 *
 * 重要
 * - 商品そのものは変形しない
 * - 背景だけを除去する
 * - 同じ入力では同じ保存先を再利用する（冪等）
 */

/* =========================
 * 定数
 * ========================= */

/**
 * 既存の壊れた前景を再利用しないため、
 * 今回の修正版は version を 3 に上げる
 *
 * これを変えると保存先ハッシュが変わるので、
 * 過去に誤保存された前景PNGを引きずりにくくなる
 */
const EXTRACT_FOREGROUND_VERSION = "v3";

/**
 * 透明PNGの bypass 判定で使う閾値
 *
 * transparentRatio
 * - 画像全体のうち、かなり透明な画素の割合
 *
 * visibleRatio
 * - 逆に「見えている画素」の割合
 *
 * edgeTransparentRatio
 * - 外周部に透明がある割合
 *
 * 考え方
 * - 本当に切り抜き済み画像なら、どこかしら外周に透明が出やすい
 * - 背景付きPNGは hasAlpha=true でも外周透明がほぼ無いことが多い
 */
const TRANSPARENT_ALPHA_THRESHOLD = 8;
const MIN_TRANSPARENT_RATIO_FOR_BYPASS = 0.08;
const MAX_VISIBLE_RATIO_FOR_BYPASS = 0.92;
const MIN_EDGE_TRANSPARENT_RATIO_FOR_BYPASS = 0.12;

/* =========================
 * 型
 * ========================= */

type AlphaAnalysis = {
  hasAlpha: boolean;
  width: number;
  height: number;
  transparentRatio: number;
  visibleRatio: number;
  edgeTransparentRatio: number;
  canBypassOpenAI: boolean;
};

/* =========================
 * 小関数
 * ========================= */

/**
 * 安定したハッシュを作る
 * - 同じ条件なら同じファイルパスになる
 * - 二重課金・二重生成を減らす
 */
function stableHash(input: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Firebase Storage の公開ダウンロードURLを組み立てる
 */
function buildDownloadUrl(bucketName: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;
}

/**
 * ブランド設定を読む
 * - なくても処理は続ける
 */
async function loadBrand(uid: string, brandId: string) {
  const db = getAdminDb();
  const ref = db.doc(`users/${uid}/brands/${brandId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    return null;
  }

  return snap.data() as Record<string, unknown>;
}

/**
 * 画像の alpha を解析する
 *
 * ここが判定の中心
 * - hasAlpha だけでは判定しない
 * - 実際に RGBA 生データを読んで
 *   「透明が十分あるか」を見る
 * - 外周に透明があるかも見る
 */
async function analyzeAlpha(buf: Buffer): Promise<AlphaAnalysis> {
  const img = sharp(buf, { failOn: "none" });
  const meta = await img.metadata();

  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  const hasAlpha = !!meta.hasAlpha;

  if (!hasAlpha || width <= 0 || height <= 0) {
    return {
      hasAlpha: false,
      width,
      height,
      transparentRatio: 0,
      visibleRatio: 1,
      edgeTransparentRatio: 0,
      canBypassOpenAI: false,
    };
  }

  const { data, info } = await img
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = Number(info.channels || 4);
  const rawWidth = Number(info.width || width);
  const rawHeight = Number(info.height || height);

  if (channels < 4 || rawWidth <= 0 || rawHeight <= 0) {
    return {
      hasAlpha,
      width,
      height,
      transparentRatio: 0,
      visibleRatio: 1,
      edgeTransparentRatio: 0,
      canBypassOpenAI: false,
    };
  }

  const totalPixels = rawWidth * rawHeight;

  if (totalPixels <= 0) {
    return {
      hasAlpha,
      width,
      height,
      transparentRatio: 0,
      visibleRatio: 1,
      edgeTransparentRatio: 0,
      canBypassOpenAI: false,
    };
  }

  let transparentCount = 0;
  let edgeTransparentCount = 0;
  let edgePixelCount = 0;

  const edgeBand = Math.max(
    2,
    Math.min(24, Math.round(Math.min(rawWidth, rawHeight) * 0.04))
  );

  for (let y = 0; y < rawHeight; y++) {
    for (let x = 0; x < rawWidth; x++) {
      const index = (y * rawWidth + x) * channels;
      const alpha = data[index + 3] ?? 255;
      const isTransparent = alpha <= TRANSPARENT_ALPHA_THRESHOLD;

      if (isTransparent) {
        transparentCount += 1;
      }

      const isEdge =
        x < edgeBand ||
        x >= rawWidth - edgeBand ||
        y < edgeBand ||
        y >= rawHeight - edgeBand;

      if (isEdge) {
        edgePixelCount += 1;

        if (isTransparent) {
          edgeTransparentCount += 1;
        }
      }
    }
  }

  const transparentRatio = transparentCount / totalPixels;
  const visibleRatio = 1 - transparentRatio;
  const edgeTransparentRatio =
    edgePixelCount > 0 ? edgeTransparentCount / edgePixelCount : 0;

  const canBypassOpenAI =
    hasAlpha &&
    transparentRatio >= MIN_TRANSPARENT_RATIO_FOR_BYPASS &&
    visibleRatio <= MAX_VISIBLE_RATIO_FOR_BYPASS &&
    edgeTransparentRatio >= MIN_EDGE_TRANSPARENT_RATIO_FOR_BYPASS;

  return {
    hasAlpha,
    width: rawWidth,
    height: rawHeight,
    transparentRatio,
    visibleRatio,
    edgeTransparentRatio,
    canBypassOpenAI,
  };
}

/**
 * true 透明PNGに正規化する
 * - すでに alpha があるなら、そのままPNG化して返す
 * - alpha が無い場合は「白背景っぽい部分」を透明に変換する
 */
async function ensureTransparentPng(buf: Buffer): Promise<Buffer> {
  const img = sharp(buf, { failOn: "none" });
  const meta = await img.metadata();

  if (meta.hasAlpha) {
    return await img.png().toBuffer();
  }

  const bgMask = await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .greyscale()
    .threshold(240)
    .toBuffer();

  const fgMask = await sharp(bgMask)
    .negate()
    .blur(0.3)
    .png()
    .toBuffer();

  const out = await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .joinChannel(fgMask)
    .png()
    .toBuffer();

  return out;
}

/**
 * 今回の本命
 * 前景PNGを「preview基準」と「compose基準」で揃えるため、
 * 保存前に transparent border を trim する
 *
 * ポイント
 * - compose-product-stage 側では tuneForeground() 内で trim している
 * - preview 側でも同じ見え方に近づけるため、
 *   foregroundImageUrl 自体を trim 済みで保存する
 * - trim 後に 1px の透明余白だけ戻しておくと、
 *   端ギリギリで切れたように見えにくい
 */
async function normalizeForegroundForPreviewAndCompose(buf: Buffer): Promise<Buffer> {
  return await sharp(buf, { failOn: "none" })
    .ensureAlpha()
    .trim()
    .extend({
      top: 1,
      bottom: 1,
      left: 1,
      right: 1,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

/**
 * 既存ファイルに download token が無い時の補助
 */
async function ensureDownloadTokenOnExistingFile(fileRef: StorageFile) {
  const [meta] = await fileRef.getMetadata().catch(() => [null as any]);

  const existingToken =
    meta?.metadata?.firebaseStorageDownloadTokens ||
    meta?.metadata?.firebaseStorageDownloadToken ||
    "";

  const token =
    typeof existingToken === "string" && existingToken.trim()
      ? existingToken.split(",")[0].trim()
      : crypto.randomUUID();

  if (!existingToken) {
    await fileRef.setMetadata({
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
      contentType: meta?.contentType || "image/png",
    });
  }

  return token;
}

/* =========================
 * 本体
 * ========================= */

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const uid = user.uid;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const brandId =
      typeof body.brandId === "string" && body.brandId.trim()
        ? body.brandId.trim()
        : "vento";

    const referenceImageUrl =
      typeof body.referenceImageUrl === "string" && body.referenceImageUrl.trim()
        ? body.referenceImageUrl.trim()
        : typeof body.sourceImageUrl === "string" && body.sourceImageUrl.trim()
          ? body.sourceImageUrl.trim()
          : "";

    if (!referenceImageUrl) {
      return NextResponse.json(
        { ok: false, error: "referenceImageUrl is required" },
        { status: 400 }
      );
    }

    const brand = await loadBrand(uid, brandId);

    const prompt = [
      "Remove the background completely and return a transparent PNG with real alpha.",
      "Keep the main product unchanged and sharp.",
      "Do not change shape, silhouette, texture, or proportions of the product.",
      "Do not add text, logo, watermark, or extra objects.",
      "Do not leave any white matte, white halo, or rectangular background.",
      brand?.displayName ? `Brand: ${String(brand.displayName)}` : "",
      "Output only the cut-out product on transparent background.",
    ]
      .filter(Boolean)
      .join("\n");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY missing");
    }

    const hash = stableHash({
      uid,
      brandId,
      referenceImageUrl,
      prompt,
      type: "extract-foreground",
      size: "1024x1024",
      version: EXTRACT_FOREGROUND_VERSION,
    });

    const bucket = getStorage().bucket();
    const objectPath = `users/${uid}/drafts/_fg/${brandId}/${hash}.png`;
    const fileRef = bucket.file(objectPath);

    const [exists] = await fileRef.exists();
    if (exists) {
      const token = await ensureDownloadTokenOnExistingFile(fileRef);

      return NextResponse.json({
        ok: true,
        url: buildDownloadUrl(bucket.name, objectPath, token),
        reused: true,
        version: EXTRACT_FOREGROUND_VERSION,
      });
    }

    const srcRes = await fetch(referenceImageUrl, { cache: "no-store" as RequestCache });
    if (!srcRes.ok) {
      throw new Error("failed to fetch source image");
    }

    const srcContentType = srcRes.headers.get("content-type") || "image/png";
    const srcBuf = Buffer.from(await srcRes.arrayBuffer());

    const alphaAnalysis = await analyzeAlpha(srcBuf);

    if (alphaAnalysis.canBypassOpenAI) {
      const token = crypto.randomUUID();

      const normalizedTransparent = await sharp(srcBuf, { failOn: "none" })
        .png()
        .toBuffer();

      const trimmedForeground = await normalizeForegroundForPreviewAndCompose(
        normalizedTransparent
      );

      await fileRef.save(trimmedForeground, {
        contentType: "image/png",
        resumable: false,
        metadata: {
          metadata: {
            firebaseStorageDownloadTokens: token,
            extractForegroundVersion: EXTRACT_FOREGROUND_VERSION,
            bypassedOpenAI: "true",
            transparentRatio: String(alphaAnalysis.transparentRatio),
            edgeTransparentRatio: String(alphaAnalysis.edgeTransparentRatio),
          },
        },
      });

      return NextResponse.json({
        ok: true,
        url: buildDownloadUrl(bucket.name, objectPath, token),
        reused: false,
        bypassedOpenAI: true,
        version: EXTRACT_FOREGROUND_VERSION,
        alphaAnalysis,
      });
    }

    const imageFile = new File([srcBuf], "source.png", { type: srcContentType });

    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    form.append("size", "1024x1024");
    form.append("image", imageFile);

    const openaiRes = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    const openaiJson = await openaiRes.json().catch(() => ({} as any));
    if (!openaiRes.ok) {
      throw new Error(openaiJson?.error?.message || "openai image edit error");
    }

    const b64 = openaiJson?.data?.[0]?.b64_json;
    if (typeof b64 !== "string" || !b64) {
      throw new Error("no image returned");
    }

    const raw = Buffer.from(b64, "base64");
    const fixedTransparent = await ensureTransparentPng(raw);

    /**
     * ここが今回の修正本体
     * OpenAI 後の透過PNGを trim してから保存する
     */
    const trimmedForeground = await normalizeForegroundForPreviewAndCompose(
      fixedTransparent
    );

    const fixedAlphaAnalysis = await analyzeAlpha(trimmedForeground);

    const token = crypto.randomUUID();
    await fileRef.save(trimmedForeground, {
      contentType: "image/png",
      resumable: false,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
          extractForegroundVersion: EXTRACT_FOREGROUND_VERSION,
          bypassedOpenAI: "false",
          transparentRatio: String(fixedAlphaAnalysis.transparentRatio),
          edgeTransparentRatio: String(fixedAlphaAnalysis.edgeTransparentRatio),
        },
      },
    });

    return NextResponse.json({
      ok: true,
      url: buildDownloadUrl(bucket.name, objectPath, token),
      reused: false,
      bypassedOpenAI: false,
      version: EXTRACT_FOREGROUND_VERSION,
      alphaAnalysis: fixedAlphaAnalysis,
    });
  } catch (e: any) {
    console.error("[extract-foreground] error:", e);

    return NextResponse.json(
      { ok: false, error: e?.message || "extract foreground failed" },
      { status: 500 }
    );
  }
}