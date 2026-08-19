import "server-only";

/**
 * YouTube OAuth 2.0 (Part 3).
 *
 * This is a SEPARATE consent flow from Firebase Auth's Google sign-in. Firebase Auth
 * answers "who is this user"; this flow answers "may we read their channel data".
 * Keeping them apart means a visitor can sign in and look around without granting
 * YouTube access, and can revoke YouTube access without losing their account.
 */
import { google } from "googleapis";
import {
  deleteYouTubeToken,
  getYouTubeToken,
  saveYouTubeToken,
} from "@/lib/firebase/firestore";
import type { YouTubeTokenDoc } from "@/types/youtube";

/**
 * firebase-admin pulls in google-gax, which ships its own nested copy of
 * google-auth-library. Importing OAuth2Client from the top-level package makes the
 * two structurally incompatible (they declare the same private field separately),
 * so the type is derived from the googleapis instance we actually construct.
 */
export type YouTubeOAuthClient = InstanceType<typeof google.auth.OAuth2>;

/**
 * Only what we actually use. Requesting more than this would make the eventual
 * quota-increase / compliance review (Part 9.4) harder to pass, for no benefit.
 */
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
] as const;

/** Refresh a token this far before it actually expires, to survive clock skew. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function oauth2Client(): YouTubeOAuthClient {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REDIRECT_URI.",
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * `access_type: offline` + `prompt: consent` is what actually returns a refresh
 * token. Google only sends one on the first consent otherwise, so a user who
 * re-links after revoking would silently end up without one.
 *
 * `include_granted_scopes` is deliberately NOT set. Incremental authorization
 * folds every scope the user previously granted anywhere in this Google Cloud
 * project into the returned token, which produced a 5-scope grant
 * (openid, userinfo.email, userinfo.profile, plus the two we asked for) instead
 * of the 2 the app is allowed to hold. Viewly gets identity from Firebase Auth,
 * so this grant needs nothing beyond YOUTUBE_SCOPES.
 */
export function getAuthUrl(state: string): string {
  return oauth2Client().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...YOUTUBE_SCOPES],
    state,
  });
}

export class MissingYouTubeAuthError extends Error {
  readonly code = "youtube_not_linked";
  constructor(message = "This account has not linked a YouTube channel yet.") {
    super(message);
    this.name = "MissingYouTubeAuthError";
  }
}

export async function exchangeCodeForTokens(code: string): Promise<YouTubeTokenDoc> {
  const client = oauth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "Google returned no refresh token. Revoke the app at " +
        "myaccount.google.com/permissions and link again.",
    );
  }

  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? "",
    expiresAt: tokens.expiry_date ?? Date.now() + 3600_000,
    scope: tokens.scope ?? YOUTUBE_SCOPES.join(" "),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Returns a usable access token, refreshing only when the cached one has under
 * 5 minutes left. Refreshes don't cost YouTube Data API quota, but they do cost a
 * round trip on every dashboard request if you skip the cache - hence the TTL check.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const stored = await getYouTubeToken(userId);
  if (!stored?.refreshToken) throw new MissingYouTubeAuthError();

  if (stored.accessToken && stored.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return stored.accessToken;
  }
  return refreshAccessToken(userId, stored.refreshToken);
}

export async function refreshAccessToken(
  userId: string,
  refreshToken: string,
): Promise<string> {
  const client = oauth2Client();
  client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await client.refreshAccessToken();
  if (!credentials.access_token) {
    throw new Error("Token refresh returned no access token.");
  }

  await saveYouTubeToken(userId, {
    accessToken: credentials.access_token,
    expiresAt: credentials.expiry_date ?? Date.now() + 3600_000,
    // Google usually omits refresh_token on refresh; keep the existing one if so.
    ...(credentials.refresh_token ? { refreshToken: credentials.refresh_token } : {}),
  });

  return credentials.access_token;
}

/** An OAuth2Client already primed with this user's token - what API wrappers take. */
export async function authorizedClient(userId: string): Promise<YouTubeOAuthClient> {
  const accessToken = await getValidAccessToken(userId);
  const client = oauth2Client();
  client.setCredentials({ access_token: accessToken });
  return client;
}

/**
 * Required for the Google API compliance review (Part 9.4): revocation must both
 * tell Google to drop the grant and delete our stored copy. The Firestore delete
 * runs even if Google's endpoint fails, so a user is never left with a token we
 * hold but they believe is gone.
 */
export async function revokeAccess(userId: string): Promise<{ googleRevoked: boolean }> {
  const stored = await getYouTubeToken(userId);
  let googleRevoked = false;

  if (stored?.refreshToken) {
    try {
      const res = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: stored.refreshToken }),
      });
      googleRevoked = res.ok;
    } catch {
      googleRevoked = false;
    }
  }

  await deleteYouTubeToken(userId);
  return { googleRevoked };
}
