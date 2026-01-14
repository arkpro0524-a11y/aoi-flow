import { NextResponse } from "next/server";
import crypto from "crypto";
import admin from "firebase-admin";

/**
 * ✅ このAPIの役割（サーバが正本）
 * - uid検証（他人draftId混入を最終遮断）
 * - stableHash（=idemKey）で「実行中/完了」を管理（再実行しない）
 * - Storage保存 token固定（同条件ならURLも固定＝増殖停止）
 * - drafts/{draftId} を正本として videoUrl/videoUrls を強制更新（最大10）
 *
 * 保存先:
 * users/{uid}/drafts/{draftId}/videos/{idemKey}.mp4
 */

function initAdmin() {
  if (admin.apps.length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin env. Need FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }
  if (!storageBucket) throw new Error("Missing FIREBASE_STORAGE_BUCKET");

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    storageBucket,
  });
}

async function requireUidFromAuthHeader(req: Request): Promise<string> {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw new Error("Missing Authorization Bearer token");

  initAdmin();
  const decoded = await admin.auth().verifyIdToken(m[1]);
  if (!decoded?.uid) throw new Error("Invalid token");
  return decoded.uid;
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** ✅ サーバ側で stableHash (= idemKey) を生成（同条件なら同じキー） */
function stableHashFromInputs(input: {
  uid: string;
  draftId: string;
  bgImageUrl: string;
  referenceImageUrl: string;
  prompt: string;
  templateId: string;
  seconds: number;
  quality: string;
  size: string;
}) {
  const payload = [
    input.uid,
    input.draftId,
    input.bgImageUrl,
    input.referenceImageUrl,
    input.prompt,
    input.templateId,
    String(input.seconds),
    input.quality,
    input.size,
  ].join("|");
  return sha256(payload).slice(0, 32);
}

// ✅ token を「同じuid+draftId+idemKeyなら固定」にしてURL増殖を止める
function fixedDownloadToken(uid: string, draftId: string, idemKey: string) {
  const salt = process.env.VIDEO_TOKEN_SALT || "aoi-fixed-token";
  return sha256(`${salt}:${uid}:${draftId}:${idemKey}`);
}

function publicDownloadUrl(bucketName: string, objectPath: string, token: string) {
  const encPath = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encPath}?alt=media&token=${token}`;
}

/**
 * ✅ 動画生成本体（外部エンドポイント想定）
 * env: VIDEO_GENERATOR_URL
 * 期待レスポンス: { mp4Base64: "..." }
 */
async function generateMp4BufferOrThrow(input: {
  bgImageUrl: string;
  prompt: string;
  referenceImageUrl: string;
  templateId: string;
  seconds: number;
  quality: string;
  size: string;
}) {
  const generatorUrl = process.env.VIDEO_GENERATOR_URL;
  if (!generatorUrl) throw new Error("VIDEO_GENERATOR_URL is missing.");

  // ★ここが「本当に何を投げたか」の最終ログ
  console.log("[generate-video] payload =>", {
    templateId: input.templateId,
    seconds: input.seconds,
    quality: input.quality,
    size: input.size,
  });

  const res = await fetch(generatorUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      // ※外部側仕様に合わせている命名（ここは現状維持）
      referenceImageUrl: input.bgImageUrl,
      originalReferenceImageUrl: input.referenceImageUrl,
      prompt: input.prompt,
      templateId: input.templateId,
      seconds: input.seconds,
      quality: input.quality,
      size: input.size,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Video generator failed: ${res.status} ${t}`);
  }

  const json = (await res.json()) as { mp4Base64?: string };
  if (!json.mp4Base64) throw new Error("Video generator response missing mp4Base64");

  return Buffer.from(json.mp4Base64, "base64");
}

async function ensureDraftOwnedOrThrow(uid: string, draftId: string) {
  initAdmin();
  const db = admin.firestore();
  const ref = db.collection("drafts").doc(draftId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Draft not found");

  const data = snap.data() as any;
  if (!data?.uid && !data?.userId) throw new Error("Draft missing uid/userId");

  const owner = String(data.uid ?? data.userId ?? "");
  if (owner !== uid) throw new Error("Forbidden (uid mismatch)");

  return { ref, data };
}

function trimTo10(urls: string[]) {
  if (urls.length <= 10) return urls;
  return urls.slice(urls.length - 10);
}

/** ✅ getMetadata() から取る token を「必ず string」に正規化 */
function normalizeToken(v: unknown): string | "" {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "";
  return "";
}

/** ✅ サーバが許可するテンプレ一覧（外部側の未対応テンプレ事故を止める） */
const ALLOWED_TEMPLATES = [
  "slowZoomFade",
  "zoomIn",
  "zoomOut",
  "slideLeft",
  "slideRight",
  "fadeIn",
  "fadeOut",
  "static",
] as const;

type TemplateId = (typeof ALLOWED_TEMPLATES)[number];

function isAllowedTemplateId(v: string): v is TemplateId {
  return (ALLOWED_TEMPLATES as readonly string[]).includes(v);
}

export async function POST(req: Request) {
  try {
    const uid = await requireUidFromAuthHeader(req);
    const body = (await req.json().catch(() => ({}))) as any;

    const draftId = String(body?.draftId || "");
    const bgImageUrl = String(body?.bgImageUrl || "");
    const referenceImageUrl = String(body?.referenceImageUrl || "");
    const prompt = String(body?.prompt || "");

    const templateIdRaw = String(body?.templateId || "");
    const seconds = Number(body?.seconds || 0);
    const quality = String(body?.quality || "");
    const size = String(body?.size || "");

    if (!draftId || !bgImageUrl || !referenceImageUrl || !prompt) {
      return NextResponse.json(
        { error: "Missing required: draftId, bgImageUrl, referenceImageUrl, prompt" },
        { status: 400 }
      );
    }
    if (!templateIdRaw || !seconds || !quality || !size) {
      return NextResponse.json(
        { error: "Missing required: templateId, seconds, quality, size" },
        { status: 400 }
      );
    }

    // ✅ templateId をサーバで厳格チェック（黙ってdefaultに落ちる事故を潰す）
    if (!isAllowedTemplateId(templateIdRaw)) {
      return NextResponse.json(
        { error: `Invalid templateId: ${templateIdRaw}`, allowed: ALLOWED_TEMPLATES },
        { status: 400 }
      );
    }
    const templateId: TemplateId = templateIdRaw;

    // ✅ 他人draft混入を最終遮断
    const { ref: draftRef, data: draftData } = await ensureDraftOwnedOrThrow(uid, draftId);

    initAdmin();
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const bucketName = bucket.name;

    // ✅ サーバが stableHash (= idemKey) を生成（フロントは送らない）
    const idemKey = stableHashFromInputs({
      uid,
      draftId,
      bgImageUrl,
      referenceImageUrl,
      prompt,
      templateId,
      seconds,
      quality,
      size,
    });

    const objectPath = `users/${uid}/drafts/${draftId}/videos/${idemKey}.mp4`;
    const genRef = db.collection("drafts").doc(draftId).collection("generations").doc(idemKey);

    // ✅ idemKey単位で再実行防止
    const genSnap = await genRef.get();
    if (genSnap.exists) {
      const g = genSnap.data() as any;

      if (g?.status === "completed" && typeof g?.videoUrl === "string" && g.videoUrl) {
        return NextResponse.json(
          {
            status: "completed",
            videoUrl: g.videoUrl,
            draftId,
            idemKey,
            usedTemplateId: g?.templateId ?? templateId,
          },
          { status: 200 }
        );
      }

      if (g?.status === "running") {
        return NextResponse.json(
          { status: "running", draftId, idemKey, usedTemplateId: g?.templateId ?? templateId },
          { status: 202 }
        );
      }
      // failed は再試行OK
    }

    // ✅ running登録（先に立てる）
    await genRef.set(
      {
        status: "running",
        uid,
        draftId,
        idemKey,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        prompt,
        bgImageUrl,
        referenceImageUrl,
        templateId,
        seconds,
        quality,
        size,
      },
      { merge: true }
    );

    // ✅ 動画生成
    const mp4Buffer = await generateMp4BufferOrThrow({
      bgImageUrl,
      prompt,
      referenceImageUrl,
      templateId,
      seconds,
      quality,
      size,
    });

    // ✅ token固定
    const token = fixedDownloadToken(uid, draftId, idemKey);
    const file = bucket.file(objectPath);

    let finalToken = token;

    // ✅ 既存tokenがあるならそれを優先（URL完全固定）
    try {
      const [meta] = await file.getMetadata();
      const raw = (meta as any)?.metadata?.firebaseStorageDownloadTokens;
      const existing = normalizeToken(raw);
      if (existing) finalToken = existing;
    } catch {
      // まだ無ければOK
    }

    await file.save(mp4Buffer, {
      contentType: "video/mp4",
      resumable: false,
      metadata: {
        cacheControl: "public, max-age=31536000",
        metadata: {
          firebaseStorageDownloadTokens: String(finalToken),
          uid: String(uid),
          draftId: String(draftId),
          idemKey: String(idemKey),
          templateId: String(templateId),
        },
      },
    });

    const videoUrl = publicDownloadUrl(bucketName, objectPath, finalToken);

    // ✅ drafts を正本化（最大10）
    const prevUrls: string[] = Array.isArray(draftData?.videoUrls) ? draftData.videoUrls : [];
    const nextUrls = trimTo10([...prevUrls.filter(Boolean), videoUrl]);

    await draftRef.set(
      {
        videoUrl,
        videoUrls: nextUrls,
        // ★最後に使ったテンプレを記録（UIのズレ確認に効く）
        lastVideoTemplateId: templateId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await genRef.set(
      {
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        videoUrl,
        storagePath: objectPath,
        token: finalToken,
        templateId,
      },
      { merge: true }
    );

    return NextResponse.json(
      { status: "completed", videoUrl, draftId, idemKey, usedTemplateId: templateId },
      { status: 200 }
    );
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}