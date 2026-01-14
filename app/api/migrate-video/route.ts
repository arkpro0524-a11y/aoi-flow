import { NextResponse } from "next/server";
import crypto from "crypto";
import admin from "firebase-admin";

/**
 * ✅ 過去動画の“回収・正規化”API
 * - 旧prefixから見つかったmp4を
 *   users/{uid}/drafts/{draftId}/videos/{idemKey}.mp4
 *   にコピー（同名なら上書き）
 * - drafts.videoUrls を最大10で整備
 * - generations/{idemKey} を completed に寄せる
 *
 * ※ 旧ファイルの削除はしない（安全優先）
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
  if (!storageBucket) {
    throw new Error("Missing FIREBASE_STORAGE_BUCKET");
  }

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

function fixedDownloadToken(uid: string, draftId: string, idemKey: string) {
  const salt = process.env.VIDEO_TOKEN_SALT || "aoi-fixed-token";
  return sha256(`${salt}:${uid}:${draftId}:${idemKey}`);
}

function publicDownloadUrl(bucketName: string, objectPath: string, token: string) {
  const encPath = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encPath}?alt=media&token=${token}`;
}

async function ensureDraftOwnedOrThrow(uid: string, draftId: string) {
  initAdmin();
  const db = admin.firestore();
  const ref = db.collection("drafts").doc(draftId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Draft not found");

  const data = snap.data() as any;
  if (!data?.uid) throw new Error("Draft missing uid");
  if (data.uid !== uid) throw new Error("Forbidden (uid mismatch)");

  return { ref, data };
}

function trimTo10(urls: string[]) {
  if (urls.length <= 10) return urls;
  return urls.slice(urls.length - 10);
}

function inferIdemKeyFromObjectPath(p: string) {
  const base = p.split("/").pop() || "";
  return base.replace(/\.mp4$/i, "") || "legacy";
}

/** ✅ getMetadata() から取る token を「必ず string」に正規化（TSエラー対策） */
function normalizeToken(v: unknown): string | "" {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "";
  return "";
}

export async function POST(req: Request) {
  try {
    const uid = await requireUidFromAuthHeader(req);
    const body = (await req.json().catch(() => ({}))) as any;

    const draftId = String(body?.draftId || "");
    if (!draftId) {
      return NextResponse.json({ error: "Missing draftId" }, { status: 400 });
    }

    // ✅ 他人draft混入を最終遮断
    const { ref: draftRef, data: draftData } = await ensureDraftOwnedOrThrow(uid, draftId);

    initAdmin();
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const bucketName = bucket.name;

    // ✅ 探索する旧prefix（必要なら body.legacyPrefixes で上書き可）
    const legacyPrefixes: string[] = Array.isArray(body?.legacyPrefixes)
      ? body.legacyPrefixes.map(String)
      : [
          `users/${uid}/videos/`,
          `users/${uid}/drafts/${draftId}/videos/`,
          `users/${uid}/drafts/${draftId}/video/`,
        ];

    const found: string[] = [];
    for (const prefix of legacyPrefixes) {
      const [files] = await bucket.getFiles({ prefix });
      for (const f of files) {
        if (!f.name.toLowerCase().endsWith(".mp4")) continue;
        found.push(f.name);
      }
    }

    const unique = Array.from(new Set(found));

    const migrated: { from: string; to: string; videoUrl: string }[] = [];
    const prevUrls: string[] = Array.isArray(draftData?.videoUrls) ? draftData.videoUrls : [];
    let nextUrls = [...prevUrls.filter(Boolean)];

    for (const fromPath of unique) {
      const idemKey = inferIdemKeyFromObjectPath(fromPath);
      const toPath = `users/${uid}/drafts/${draftId}/videos/${idemKey}.mp4`;

      const fromFile = bucket.file(fromPath);
      const toFile = bucket.file(toPath);

      const token = fixedDownloadToken(uid, draftId, idemKey);

      let finalToken = token;

      // ✅ 既存tokenがあるならそれを優先（URL完全固定）
      try {
        const [meta] = await toFile.getMetadata();
        const raw = (meta as any)?.metadata?.firebaseStorageDownloadTokens;
        const existing = normalizeToken(raw);
        if (existing) finalToken = existing;
      } catch {
        // まだ無ければOK
      }

      // ✅ コピー（上書き）
      await fromFile.copy(toFile);

      // ✅ token付与（copyだとmetadataが引き継がれることがあるので確実に上書き）
      await toFile.setMetadata({
        contentType: "video/mp4",
        cacheControl: "public, max-age=31536000",
        metadata: {
          firebaseStorageDownloadTokens: String(finalToken),
          uid: String(uid),
          draftId: String(draftId),
          idemKey: String(idemKey),
        },
      });

      const videoUrl = publicDownloadUrl(bucketName, toPath, finalToken);

      if (!nextUrls.includes(videoUrl)) nextUrls.push(videoUrl);

      const genRef = db.collection("drafts").doc(draftId).collection("generations").doc(idemKey);
      await genRef.set(
        {
          status: "completed",
          uid,
          draftId,
          idemKey,
          videoUrl,
          storagePath: toPath,
          token: finalToken,
          migratedFrom: fromPath,
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      migrated.push({ from: fromPath, to: toPath, videoUrl });
    }

    nextUrls = trimTo10(nextUrls);
    const latest = nextUrls.length ? nextUrls[nextUrls.length - 1] : "";

    await draftRef.set(
      {
        videoUrl: latest || admin.firestore.FieldValue.delete(),
        videoUrls: nextUrls,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json(
      {
        ok: true,
        draftId,
        migratedCount: migrated.length,
        migrated,
        videoUrls: nextUrls,
      },
      { status: 200 }
    );
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}