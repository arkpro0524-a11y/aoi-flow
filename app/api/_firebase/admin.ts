// app/api/_firebase/admin.ts
// ✅ サーバー側で「uid」を確実に取る（なりすまし防止）
// ✅ 冪等化キー（uid + clientRequestId）をFirestoreに保存するために使う

import admin from "firebase-admin";

function getServiceAccount() {
  // Vercel/Cloud環境向け：JSONを文字列で持つ方式
  // FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON.");
  }
}

export function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_KEY. Set it in environment variables as JSON string."
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
}

export function getAdminAuth() {
  getAdminApp();
  return admin.auth();
}

export function getAdminDb() {
  getAdminApp();
  return admin.firestore();
}

// Authorization: Bearer <Firebase ID Token>
export async function requireUserFromAuthHeader(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    throw new Error("Missing Authorization Bearer token.");
  }

  const auth = getAdminAuth();
  const decoded = await auth.verifyIdToken(token);
  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    name: (decoded.name as string | undefined) ?? null,
  };
}