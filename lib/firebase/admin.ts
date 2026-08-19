import "server-only";

/**
 * Firebase Admin SDK - server only.
 * Guarded by "server-only": importing this from a client component is a build error,
 * which is the enforcement behind Part 7's "never expose admin credentials" rule.
 */
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const ADMIN_APP_NAME = "viewly-admin";

function buildCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Vercel env vars can't hold real newlines, so the key is stored with literal \n.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, " +
        "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY (see .env.local.example).",
    );
  }
  return { projectId, credential: cert({ projectId, clientEmail, privateKey }) };
}

export function getAdminApp(): App {
  const existing = getApps().find((a) => a.name === ADMIN_APP_NAME);
  return existing ?? initializeApp(buildCredential(), ADMIN_APP_NAME);
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}

let firestore: Firestore | undefined;

/**
 * Firestore with ignoreUndefinedProperties enabled.
 *
 * Without it, writing an object that has an optional field set to undefined throws
 * "Cannot use undefined as a Firestore value" at runtime. Our domain types are full
 * of genuinely optional fields (a channel with no country, a video with no
 * thumbnail), and undefined is the honest representation of absent. This setting
 * makes Firestore drop those keys instead of rejecting the whole document, which
 * reads back as undefined anyway.
 *
 * Memoised because settings() may only be called once, and only before the instance
 * has issued any operation. Calling it twice, or after a read, throws.
 */
export function adminDb(): Firestore {
  if (!firestore) {
    const instance = getFirestore(getAdminApp());
    try {
      instance.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Already configured earlier in this process, for example across a dev hot
      // reload that kept the module alive. The existing instance is fine.
    }
    firestore = instance;
  }
  return firestore;
}

export { getApp };
