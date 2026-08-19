"use client";

/**
 * Browser-side push registration (Part 8.4).
 *
 * Every entry point returns a reason rather than throwing, because the ways this
 * fails are all ordinary rather than exceptional: an unsupported browser, a denied
 * permission, an insecure origin. Each needs a different sentence in the UI, and a
 * thrown error flattens them all into "something went wrong".
 */
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import type { Messaging } from "firebase/messaging";
import { getFirebaseApp } from "@/lib/firebase/client";

export type PushBlockReason =
  | "unsupported"
  | "insecure"
  | "denied"
  | "dismissed"
  | "no-vapid-key"
  | "failed";

export type RegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: PushBlockReason };

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

/**
 * Whether push can work here at all.
 *
 * Service workers and the Push API require a secure context. localhost counts as
 * secure, which is why development works without TLS, but a LAN address does not.
 */
export async function pushSupport(): Promise<{ ok: boolean; reason?: PushBlockReason }> {
  if (typeof window === "undefined") return { ok: false, reason: "unsupported" };
  if (!window.isSecureContext) return { ok: false, reason: "insecure" };
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  if (!VAPID_KEY) return { ok: false, reason: "no-vapid-key" };
  if (!(await isSupported())) return { ok: false, reason: "unsupported" };
  return { ok: true };
}

export function currentPermission(): NotificationPermission | null {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
  return Notification.permission;
}

let cached: Messaging | null = null;
function messaging(): Messaging {
  cached ??= getMessaging(getFirebaseApp());
  return cached;
}

/**
 * Asks permission, registers the service worker, and returns the FCM token.
 *
 * The worker is registered explicitly rather than relying on the SDK's default
 * lookup, because it is served by a route handler and the registration has to name
 * the root scope for the worker to control the whole origin.
 */
export async function registerForPush(): Promise<RegisterResult> {
  const support = await pushSupport();
  if (!support.ok) return { ok: false, reason: support.reason ?? "unsupported" };

  const permission = await Notification.requestPermission();
  if (permission === "denied") return { ok: false, reason: "denied" };
  // "default" means the prompt was dismissed without an answer. Distinct from a
  // refusal: it is worth asking again later, whereas "denied" needs browser settings.
  if (permission !== "granted") return { ok: false, reason: "dismissed" };

  try {
    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
      { scope: "/" },
    );
    await navigator.serviceWorker.ready;

    const token = await getToken(messaging(), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    return token ? { ok: true, token } : { ok: false, reason: "failed" };
  } catch (err) {
    console.error("[push] registration failed:", err);
    return { ok: false, reason: "failed" };
  }
}

/**
 * Foreground messages.
 *
 * FCM does not raise a system notification while the tab is focused, so without
 * this an alert arriving during use is silently dropped. The caller shows a toast:
 * a system notification for a page already on screen is noise.
 */
export function onForegroundMessage(
  handler: (title: string, body: string) => void,
): () => void {
  try {
    return onMessage(messaging(), (payload) => {
      handler(payload.notification?.title ?? "Viewly", payload.notification?.body ?? "");
    });
  } catch {
    return () => {};
  }
}
