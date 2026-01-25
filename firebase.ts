// /firebase.ts
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

// ✅ ここが重要：WebChannelが落ちる環境の回避
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export const storage = getStorage(app);

let authDone = false;
export async function ensureAuthPersistence() {
  if (authDone) return;
  await setPersistence(auth, browserLocalPersistence);
  authDone = true;
}

let firestoreDone = false;
export async function ensureFirestorePersistence() {
  if (firestoreDone) return;
  try {
    await enableIndexedDbPersistence(db);
    firestoreDone = true;
  } catch {
    // 失敗しても無視（複数タブ/ブラウザ制限など）
  }
}