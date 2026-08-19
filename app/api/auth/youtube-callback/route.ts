import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { google } from "googleapis";
import { OAUTH_STATE_COOKIE, requireUserId } from "@/lib/auth/session";
import { exchangeCodeForTokens, oauth2Client } from "@/lib/youtube/oauth";
import { saveYouTubeToken, setUserChannel } from "@/lib/firebase/firestore";
import { recordCall } from "@/lib/quota/tracker";
import { handleRouteError } from "@/lib/utils/api";
import { syncUser } from "@/lib/youtube/sync";

export const runtime = "nodejs";
// The first sync runs inside this request, so it needs more than the Hobby
// default. 60 is the Hobby ceiling; a sync measured about 6 seconds per channel.
export const maxDuration = 60;

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

    /**
     * First sync, immediately.
     *
     * Without this a creator connects their channel and lands on an empty
     * dashboard reading "your first sync has not run yet", with no way to do
     * anything about it until the next scheduled run. Waiting up to 24 hours to
     * see anything is not a reasonable first impression, and the cron exists to
     * keep data FRESH, not to decide when a user is allowed to have any.
     *
     * Awaited rather than left to run after the response: the redirect is what
     * takes the user to the dashboard, so the data needs to be there when they
     * arrive. It costs about 4 units and a few seconds, once per connection.
     *
     * Failure is caught and swallowed on purpose. The channel IS linked at this
     * point, and turning a slow or rate-limited sync into a failed connection
     * would be a far worse outcome than a dashboard that fills in on the next
     * run. The user is told which of the two happened.
     */
    try {
      await syncUser(userId, channel.id);
      return settingsRedirect(request, "connected");
    } catch (err) {
      console.error("[auth/youtube-callback] first sync failed:", err);
      return settingsRedirect(request, "connected_pending");
    }
  } catch (err) {
    return handleRouteError(err, "auth/youtube-callback");
  }
}
