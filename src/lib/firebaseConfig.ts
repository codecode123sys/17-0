// No Firebase SDK imports here on purpose — this file is safe to import
// eagerly (e.g. from Title.tsx, to decide whether to show the
// Head-to-head button at all) without pulling the SDK into the main
// bundle. The actual SDK usage lives in firebase.ts, reached only through
// the lazy-loaded head-to-head screen.
export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function firebaseConfigured(): boolean {
  return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
}
