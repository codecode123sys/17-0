// Firebase (Firestore + anonymous auth) — only for live head-to-head
// matches. This module is only ever reached through the head-to-head
// screens, which are lazy-loaded (see App.tsx) — so the SDK is code-split
// into its own chunk and never touches the main bundle for the vast
// majority of visits that never touch this mode. No-ops everywhere if the
// project isn't configured (see .env.example).
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { FIREBASE_CONFIG, firebaseConfigured } from "./firebaseConfig";

export { firebaseConfigured };

let app: ReturnType<typeof initializeApp> | null = null;
function getApp() {
  if (!firebaseConfigured()) throw new Error("Firebase is not configured");
  if (!app) app = initializeApp(FIREBASE_CONFIG);
  return app;
}

export function getDb() {
  return getFirestore(getApp());
}

let uidPromise: Promise<string> | null = null;

/** An anonymous, per-browser uid — stable for the session, good enough to
 *  tell the two players in a match apart. No profile, no email, nothing
 *  the user has to set up or sign into. */
export function getUid(): Promise<string> {
  if (!uidPromise) {
    uidPromise = signInAnonymously(getAuth(getApp())).then((cred) => cred.user.uid);
  }
  return uidPromise;
}
