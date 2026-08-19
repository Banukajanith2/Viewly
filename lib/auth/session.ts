import "server-only";

/**
 * Server-side session handling.
 *
 * Firebase ID tokens live in the browser and expire hourly, which is awkward for
 * route handlers and server components. We trade the ID token once for a Firebase
 * session cookie (httpOnly, verifiable by the Admin SDK) so every server route can
 * answer "who is calling" without a round trip to the client.
 *
 * Part 7 requires that every route under /api touching the YouTube API is behind a
 * valid session. requireUserId() is the single choke point for that.
 */
import { cookies } from "next/headers";
// Re-exported so callers keep one import site, while the names themselves live
// in a module with no dependencies that proxy.ts can safely import.
export { SESSION_COOKIE, OAUTH_STATE_COOKIE } from "@/lib/auth/cookie-names";
import { SESSION_COOKIE } from "@/lib/auth/cookie-names";
import { adminAuth } from "@/lib/firebase/admin";



/** Firebase caps session cookies at 14 days. */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * CSRF state for the YouTube OAuth handshake. Lives here rather than in a route
 * file because Next validates the exports of route.ts and only recognises route
 * handlers and segment config, so sharing a constant from one is fragile.
 */


export class UnauthorizedError extends Error {
  readonly code = "unauthorized";
  constructor(message = "Sign in to continue.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface SessionUser {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

export async function createSessionCookie(idToken: string): Promise<string> {
  return adminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
}

/**
 * Returns the signed-in user, or null. Never throws on a bad cookie: an expired or
 * tampered cookie is indistinguishable from being signed out as far as callers care.
 *
 * checkRevoked is true so that revoking a user server-side actually logs them out
 * rather than leaving a valid-looking cookie alive for up to 14 days.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: (decoded.name as string | undefined) ?? null,
      picture: (decoded.picture as string | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireUserId(): Promise<string> {
  return (await requireUser()).uid;
}

export function sessionCookieOptions(maxAgeMs = SESSION_MAX_AGE_MS) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}
