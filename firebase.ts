// /firebase.ts（全張り替え）
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
} from "firebase/auth";
import {
  initializeFirestore,
  enableIndexedDbPersistence,
  CACHE_SIZE_UNLIMITED,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  cacheSizeBytes: CACHE_SIZE_UNLIMITED,
});

export const storage = getStorage(app);

// =========================
// ✅ ClientBootstrap 用：永続化（Vercel/SSR安全）
// =========================
export async function ensureAuthPersistence() {
  try {
    if (typeof window === "undefined") return;
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    // Safari/制限環境などはメモリに落とす
    try {
      await setPersistence(auth, inMemoryPersistence);
    } catch {
      // noop
    }
  }
}

export async function ensureFirestorePersistence() {
  try {
    if (typeof window === "undefined") return;
    await enableIndexedDbPersistence(db);
  } catch {
    // multi-tab / private mode 等で落ちるのは仕様、無視
  }
}