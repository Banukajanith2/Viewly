import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Edge-of-app request filter (Part 7).
 *
 * Named `proxy` rather than `middleware`: Next.js 16 renamed the convention, and the
 * runtime here is always nodejs and cannot be configured.
 *
 * This is defence in depth, NOT the actual authorisation check. It only looks at
 * whether a session cookie is present, never whether it is valid, because verifying
 * a Firebase session cookie means an Admin SDK round trip and doing that on every
 * request would cost more than it saves. Real verification stays in
 * `protectedRoute`, which resolves the cookie to a real userId or refuses.
 *
 * What it buys: unauthenticated traffic to the API is turned away before it can
 * touch Firestore, the quota tracker, or a YouTube call. Under a burst of anonymous
 * requests that is the difference between spending the free tier and spending
 * nothing.
 */

/** Routes under /api that must stay reachable without a session cookie. */
const PUBLIC_API_ROUTES = [
  // How a session is obtained in the first place, so it cannot require one.
  "/api/auth/session",
  // Authenticated by CRON_SECRET in an Authorization header, not by a cookie.
  "/api/cron/",
];

function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route),
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && !isPublicApiRoute(pathname)) {
    if (!request.cookies.get(SESSION_COOKIE)) {
      // Same shape every other route returns, so one client error handler covers it.
      return NextResponse.json(
        { error: "unauthorized", message: "Sign in to continue." },
        { status: 401 },
      );
    }
  }

  const response = NextResponse.next();

  // Conservative headers. No CSP here: it needs per-route nonces to avoid breaking
  // Next's inline runtime scripts, which is a separate piece of work.
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  return response;
}

export const config = {
  // Skip static assets and image optimisation: they cannot reach an API route and
  // running this on every asset request is pure overhead.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
