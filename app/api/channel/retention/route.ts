import { NextResponse } from "next/server";
import { getLatestSnapshot } from "@/lib/firebase/firestore";
import { getAudienceRetention } from "@/lib/youtube/analytics-api";
import { assertCanUserCallAnalytics } from "@/lib/quota/rate-limiter";
import { jsonError, protectedRoute } from "@/lib/utils/api";

export const runtime = "nodejs";

/**
 * GET /api/channel/retention?videoId=...
 *
 * Returns the raw retention curve for one of the user's own videos. Part 8.1 turns
 * this into plain-language findings; this route stays a thin passthrough so the
 * diagnostics layer can change without touching the API surface.
 *
 * Ownership is checked before the limiter on purpose. Both rejections are correct,
 * but "that is not your video" is the more useful answer, and it costs nothing to
 * determine from the cached snapshot.
 */
export const GET = protectedRoute("channel/retention", async ({ userId, request }) => {
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
});
