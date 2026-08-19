/**
 * Cookie names, and nothing else.
 *
 * Deliberately dependency-free: no "server-only", no Firebase, no next/headers.
 *
 * `proxy.ts` needs SESSION_COOKIE, and middleware is NOT a React Server Component.
 * Importing it from lib/auth/session pulled that module's `import "server-only"`
 * and the whole Firebase Admin SDK into the middleware graph. A local build
 * tree-shook it away and looked fine; the deployed one did not, and every request
 * including static assets returned 500 because the failure happened before any
 * route code ran.
 *
 * Same lesson as OAUTH_STATE_COOKIE: a constant shared across a runtime boundary
 * belongs in a module with no imports, not in the file that happens to use it most.
 */

/** httpOnly session cookie, set after an ID token is traded for a session. */
export const SESSION_COOKIE = "viewly_session";

/** Short-lived CSRF state for the YouTube OAuth round trip. */
export const OAUTH_STATE_COOKIE = "viewly_oauth_state";
