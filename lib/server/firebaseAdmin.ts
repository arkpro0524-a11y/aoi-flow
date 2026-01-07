import admin from "firebase-admin";

function getAdmin() {
  if (admin.apps.length) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!projectId) throw new Error("Missing FIREBASE_PROJECT_ID");
  if (!serviceAccountJson) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY");

  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
    projectId,
  });

  return admin.app();
}

export function getDb() {
  return getAdmin().firestore();
}