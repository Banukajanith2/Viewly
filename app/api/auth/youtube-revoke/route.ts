import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { revokeAccess } from "@/lib/youtube/oauth";
import { handleRouteError } from "@/lib/utils/api";

export const runtime = "nodejs";

/**
 * POST /api/auth/youtube-revoke
 * Backs the Revoke Access button in settings (Part 3). Required for the Google API
 * compliance review in Part 9.4, so it must stay reachable from the UI.
 */
export async function POST() {
  try {
    const userId = await requireUserId();
    const { googleRevoked } = await revokeAccess(userId);

    return NextResponse.json({
      ok: true,
      googleRevoked,
      message: googleRevoked
        ? "YouTube access revoked and stored tokens deleted."
        : "Stored tokens deleted. Google's revocation endpoint did not confirm, so " +
          "check myaccount.google.com/permissions to be certain.",
    });
  } catch (err) {
    return handleRouteError(err, "auth/youtube-revoke");
  }
}
