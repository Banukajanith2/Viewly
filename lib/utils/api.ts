import "server-only";

/**
 * Shared route-handler responses.
 *
 * Part 4 and Part 7 both require that hitting a limit produces a typed 429 with a
 * retry hint, not a generic 500. Centralising the shapes here keeps every route
 * returning the same error contract, so the client only needs one error handler.
 */
import { NextResponse } from "next/server";
import { QuotaExceededError } from "@/lib/quota/rate-limiter";
import { UnauthorizedError } from "@/lib/auth/session";
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
