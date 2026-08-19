import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { OAUTH_STATE_COOKIE, requireUserId } from "@/lib/auth/session";
import { getAuthUrl } from "@/lib/youtube/oauth";
import { handleRouteError } from "@/lib/utils/api";

export const runtime = "nodejs";

/**
 * GET /api/auth/youtube-connect
 * Starts the YouTube consent flow and redirects to Google.
 *
 * The `state` value is random, stored httpOnly, and checked on the way back. Without
 * it, an attacker could hand a victim a crafted callback URL and bind their own
 * YouTube channel to the victim's Viewly account.
 */
export async function GET() {
  try {
    await requireUserId();

    const state = randomBytes(32).toString("hex");
    (await cookies()).set({
      name: OAUTH_STATE_COOKIE,
      value: state,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600, // consent should not take longer than 10 minutes
    });

    return NextResponse.redirect(getAuthUrl(state));
  } catch (err) {
    return handleRouteError(err, "auth/youtube-connect");
  }
}
