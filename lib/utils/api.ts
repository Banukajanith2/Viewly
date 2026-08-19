import "server-only";

/**
 * Shared route-handler responses.
 *
 * Part 4 and Part 7 both require that hitting a limit produces a typed 429 with a
 * retry hint, not a generic 500. Centralising the shapes here keeps every route
 * returning the same error contract, so the client only needs one error handler.
 */
import { NextResponse } from "next/server";
import {
  QuotaExceededError,
  assertCanUserCallAnalytics,
  assertCanUserSearch,
} from "@/lib/quota/rate-limiter";
import { UnauthorizedError, requireUserId } from "@/lib/auth/session";
import { MissingYouTubeAuthError } from "@/lib/youtube/oauth";

export interface ApiErrorBody {
  error: string;
  message: string;
  retryAfter?: number;
}

export function jsonError(
  status: number,
  error: string,
  message: string,
  extra?: Record<string, unknown>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error, message, ...extra }, { status });
}

export function quotaExceeded(err: QuotaExceededError): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: err.reason, message: err.message, retryAfter: err.retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
  );
}

/**
 * Maps the app's typed errors onto status codes. Anything unrecognised becomes a
 * 500 with a generic message: internal error text can leak channel IDs, quota
 * state or credential hints, so it is logged rather than returned.
 */
export function handleRouteError(err: unknown, context: string): NextResponse<ApiErrorBody> {
  if (err instanceof QuotaExceededError) return quotaExceeded(err);

  if (err instanceof UnauthorizedError) {
    return jsonError(401, err.code, err.message);
  }

  if (err instanceof MissingYouTubeAuthError) {
    return jsonError(403, err.code, err.message);
  }

  console.error(`[${context}]`, err);
  return jsonError(500, "internal_error", "Something went wrong. Please try again.");
}

/**
 * Vercel cron auth. Vercel sends `Authorization: Bearer <CRON_SECRET>` on scheduled
 * invocations. Without this, cron routes are public URLs that anyone can hammer,
 * and a cron route is exactly where the expensive quota spending lives.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

/* ------------------------------------------------------- route composition */

export interface RouteContext {
  userId: string;
  request: Request;
}

export type RouteHandler = (ctx: RouteContext) => Promise<Response>;

export interface ProtectedRouteOptions {
  /**
   * Rate limiter to apply before the handler runs. Omit only when the handler
   * spends nothing, or when it decides for itself whether an expensive path is
   * taken and asserts inline.
   */
  rateLimit?: "search" | "analytics";
}

/**
 * Wraps a route handler with the three guarantees Part 7 requires of anything that
 * can reach the YouTube API:
 *
 *   1. A valid session, resolved to a userId before the handler is entered.
 *   2. The relevant rate limiter checked BEFORE any external work.
 *   3. Failures mapped to typed responses, so a limit is a 429 with Retry-After
 *      rather than a generic 500.
 *
 * The point of a wrapper rather than a convention is that a new route cannot forget.
 * The handler simply cannot run without a userId, because it is a parameter.
 */
export function protectedRoute(
  name: string,
  handler: RouteHandler,
  { rateLimit }: ProtectedRouteOptions = {},
) {
  return async (request: Request): Promise<Response> => {
    try {
      const userId = await requireUserId();

      if (rateLimit === "search") await assertCanUserSearch(userId);
      if (rateLimit === "analytics") await assertCanUserCallAnalytics(userId);

      return await handler({ userId, request });
    } catch (err) {
      return handleRouteError(err, name);
    }
  };
}

/**
 * Same shape for cron routes, which authenticate with CRON_SECRET rather than a
 * session. Kept separate so a cron route can never accidentally be reached by a
 * signed-in browser, and a user route can never be reached with the cron secret.
 */
export function cronRoute(name: string, handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      if (!isAuthorizedCron(request)) {
        return jsonError(401, "unauthorized", "Missing or invalid cron secret.");
      }
      return await handler(request);
    } catch (err) {
      return handleRouteError(err, name);
    }
  };
}
