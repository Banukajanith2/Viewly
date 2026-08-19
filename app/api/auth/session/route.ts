import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { upsertUserProfile } from "@/lib/firebase/firestore";
import { createSessionCookie, sessionCookieOptions } from "@/lib/auth/session";
import { handleRouteError, jsonError } from "@/lib/utils/api";

export const runtime = "nodejs";

/**
 * POST /api/auth/session
 * Trades a Firebase ID token for an httpOnly session cookie, and creates the user
 * profile on first sign-in.
 *
 * The ID token is verified before anything is written, so a caller cannot seed an
 * arbitrary users/{uid} document by posting a made-up token.
 */
export async function POST(request: Request) {
  try {
    const { idToken } = (await request.json()) as { idToken?: string };
    if (!idToken) {
      return jsonError(400, "missing_id_token", "No ID token was supplied.");
    }

    const decoded = await adminAuth().verifyIdToken(idToken, true);

    await upsertUserProfile(decoded.uid, {
      email: decoded.email ?? "",
      displayName: (decoded.name as string | undefined) ?? null,
      photoURL: (decoded.picture as string | undefined) ?? null,
    });

    const cookie = await createSessionCookie(idToken);
    (await cookies()).set({ ...sessionCookieOptions(), value: cookie });

    return NextResponse.json({ ok: true, uid: decoded.uid });
  } catch (err) {
    return handleRouteError(err, "auth/session POST");
  }
}

/** DELETE /api/auth/session - sign out by dropping the cookie. */
export async function DELETE() {
  (await cookies()).set({ ...sessionCookieOptions(0), value: "" });
  return NextResponse.json({ ok: true });
}
