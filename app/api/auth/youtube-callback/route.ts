import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { google } from "googleapis";
import { OAUTH_STATE_COOKIE, requireUserId } from "@/lib/auth/session";
import { exchangeCodeForTokens, oauth2Client } from "@/lib/youtube/oauth";
import { saveYouTubeToken, setUserChannel } from "@/lib/firebase/firestore";
import { recordCall } from "@/lib/quota/tracker";
import { handleRouteError } from "@/lib/utils/api";

export const runtime = "nodejs";

function settingsRedirect(request: Request, status: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("youtube", status);
  return NextResponse.redirect(url);
}

/**
 * GET /api/auth/youtube-callback
 * Google redirects here after the YouTube consent screen.
 *
 * Failures redirect back to settings with a status flag rather than rendering an
 * error page: the user is mid-flow in a browser, not calling an API.
 */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);

    const error = url.searchParams.get("error");
    if (error) return settingsRedirect(request, "denied");

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return settingsRedirect(request, "invalid");

    const jar = await cookies();
    const expectedState = jar.get(OAUTH_STATE_COOKIE)?.value;
    // Single use: clear it whether or not it matched.
    jar.delete(OAUTH_STATE_COOKIE);

    if (!expectedState || expectedState !== state) {
      return settingsRedirect(request, "state_mismatch");
    }

    const token = await exchangeCodeForTokens(code);
    await saveYouTubeToken(userId, token);

    // Resolve which channel was just linked. channels.list with mine=true costs
    // 1 unit and is recorded like every other YouTube call, no exceptions.
    const client = oauth2Client();
    client.setCredentials({ access_token: token.accessToken });

    const youtube = google.youtube({ version: "v3", auth: client });
    const res = await youtube.channels.list({ part: ["snippet"], mine: true });
    await recordCall("channels.list", userId);

    const channel = res.data.items?.[0];
    if (!channel?.id) return settingsRedirect(request, "no_channel");

    await setUserChannel(userId, channel.id, channel.snippet?.title ?? "Untitled channel");

    return settingsRedirect(request, "connected");
  } catch (err) {
    return handleRouteError(err, "auth/youtube-callback");
  }
}
