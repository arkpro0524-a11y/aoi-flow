// app/api/_firebase/admin.ts
// ✅ サーバー側で「uid」を確実に取る（なりすまし防止）
// ✅ Firebase Admin 初期化は /firebaseAdmin.ts に統一（ENV名の混乱を止める）

import { getAdminApp, getAdminAuth, getAdminDb } from "@/firebaseAdmin";

export { getAdminApp, getAdminAuth, getAdminDb };

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