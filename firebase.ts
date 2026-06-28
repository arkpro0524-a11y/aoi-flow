// /firebase.ts
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

const fallbackProjectId = "aoi-flow-local-build";

type FirebaseConfigKey =
  | "NEXT_PUBLIC_FIREBASE_API_KEY"
  | "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
  | "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
  | "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
  | "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
  | "NEXT_PUBLIC_FIREBASE_APP_ID";

const requiredFirebaseEnv: FirebaseConfigKey[] = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

const missingFirebaseEnv = requiredFirebaseEnv.filter((key) => !process.env[key]);
const usingBuildFallback = missingFirebaseEnv.length > 0;

if (usingBuildFallback && typeof window !== "undefined" && process.env.NODE_ENV === "production") {
  throw new Error(
    `Firebase environment variables are missing in production: ${missingFirebaseEnv.join(", ")}`
  );
}

const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyDUMMY_LOCAL_BUILD_KEY_DO_NOT_USE",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    `${fallbackProjectId}.firebaseapp.com`,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || fallbackProjectId,
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${fallbackProjectId}.appspot.com`,
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:000000000000:web:0000000000000000000000",
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
