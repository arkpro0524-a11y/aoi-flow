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

// Firebase の設定値です。
// Next.js のブラウザ側では process.env["KEY"] のような動的アクセスが壊れやすいため、
// 必ず process.env.NEXT_PUBLIC_XXX の形で直接参照します。
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

// 本番環境で Firebase 設定が欠けている場合だけ、分かりやすいエラーを出します。
// ここも動的アクセス禁止。直接チェックします。
const missingFirebaseEnv: string[] = [];

if (!firebaseConfig.apiKey) {
  missingFirebaseEnv.push("NEXT_PUBLIC_FIREBASE_API_KEY");
}

if (!firebaseConfig.authDomain) {
  missingFirebaseEnv.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
}

if (!firebaseConfig.projectId) {
  missingFirebaseEnv.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
}

if (!firebaseConfig.storageBucket) {
  missingFirebaseEnv.push("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
}

if (!firebaseConfig.messagingSenderId) {
  missingFirebaseEnv.push("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID");
}

if (!firebaseConfig.appId) {
  missingFirebaseEnv.push("NEXT_PUBLIC_FIREBASE_APP_ID");
}

if (
  typeof window !== "undefined" &&
  process.env.NODE_ENV === "production" &&
  missingFirebaseEnv.length > 0
) {
  throw new Error(
    `Firebase environment variables are missing in production: ${missingFirebaseEnv.join(", ")}`
  );
}

// Firebase App は二重初期化するとエラーになるため、既存があれば再利用します。
const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  cacheSizeBytes: CACHE_SIZE_UNLIMITED,
});

export const storage = getStorage(app);

// ログイン状態をブラウザに保存します。
// Safari やプライベートブラウズで失敗する場合はメモリ保存に落とします。
export async function ensureAuthPersistence() {
  try {
    if (typeof window === "undefined") return;
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    try {
      await setPersistence(auth, inMemoryPersistence);
    } catch {
      // ここで落とすとアプリ全体が止まるため何もしません。
    }
  }
}

// Firestore のオフライン永続化です。
// 複数タブやSafari制限では失敗することがあるため、失敗しても無視します。
export async function ensureFirestorePersistence() {
  try {
    if (typeof window === "undefined") return;
    await enableIndexedDbPersistence(db);
  } catch {
    // multi-tab / private mode 等では失敗することがあるため無視します。
  }
}