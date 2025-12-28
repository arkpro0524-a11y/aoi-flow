// /firebaseAdmin.ts
import "server-only";
import admin from "firebase-admin";

function getServiceAccount() {
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON missing");

  const json = JSON.parse(raw);

  // private_key の改行が \n のまま入っている前提（よくある）
  if (typeof json.private_key === "string") {
    json.private_key = json.private_key.replace(/\\n/g, "\n");
  }
  return json;
}

export function getAdminApp() {
  if (admin.apps.length > 0) return admin.app();
  const sa = getServiceAccount();
  return admin.initializeApp({
    credential: admin.credential.cert(sa),
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