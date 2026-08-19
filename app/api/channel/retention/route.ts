import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { getLatestSnapshot } from "@/lib/firebase/firestore";
import { getAudienceRetention } from "@/lib/youtube/analytics-api";
import { assertCanUserCallAnalytics } from "@/lib/quota/rate-limiter";
import { handleRouteError, jsonError } from "@/lib/utils/api";

export const runtime = "nodejs";

/**
 * GET /api/channel/retention?videoId=...
 *
 * Returns the raw retention curve for one of the user's own videos. Part 8.1 turns
 * this into plain-language findings; this route stays a thin passthrough so the
 * diagnostics layer can be changed without touching the API surface.
 *
 * The videoId is checked against the user's own recent uploads before the call.
 * The Analytics API would reject someone else's video anyway, but rejecting it here
 * costs nothing, whereas letting it through spends a call to learn the same thing.
 */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const videoId = new URL(request.url).searchParams.get("videoId");

    if (!videoId) {
      return jsonError(400, "missing_video_id", "A videoId query parameter is required.");
    }

    const snapshot = await getLatestSnapshot(userId);
    const video = snapshot?.recentVideos.find((v) => v.videoId === videoId);

    if (snapshot && !video) {
      return jsonError(
        403,
        "not_your_video",
        "Retention is only available for videos on your own channel.",
      );
    }

    await assertCanUserCallAnalytics(userId);

    const curve = await getAudienceRetention(userId, videoId, video?.durationSeconds ?? 0);
    return NextResponse.json({
      videoId,
      title: video?.title ?? null,
      curve,
    });
  } catch (err) {
    return handleRouteError(err, "channel/retention");
  }
}
