import { NextResponse } from "next/server";
import { getLatestSnapshot, getUserProfile } from "@/lib/firebase/firestore";
import { getChannelStatsBatch } from "@/lib/youtube/data-api";
import { jsonError, protectedRoute } from "@/lib/utils/api";

export const runtime = "nodejs";

/**
 * GET /api/competitors/benchmark (Part 6)
 *
 * Compares the user's channel against the competitors they track.
 *
 * Cheap by construction: getChannelStatsBatch serves anything cached within 24 hours
 * for free and batches the rest at 1 unit per 50 channels, so a returning user's
 * benchmark page usually costs nothing. No discovery and no search.list happen here,
 * which is why this route declares no rate limit.
 */
export const GET = protectedRoute("competitors/benchmark", async ({ userId }) => {
  const profile = await getUserProfile(userId);

  if (!profile?.channelId) {
    return jsonError(409, "no_channel_linked", "Connect a YouTube channel in settings first.");
  }

  const tracked = profile.trackedCompetitorIds ?? [];
  if (tracked.length === 0) {
    return NextResponse.json({
      own: null,
      competitors: [],
      message: "You are not tracking any competitors yet. Run discovery to find some.",
    });
  }

  const snapshot = await getLatestSnapshot(userId);
  const [own] = await getChannelStatsBatch([profile.channelId], userId);
  const competitors = await getChannelStatsBatch(tracked, userId);

  const ownSubs = own?.subscriberCount ?? 0;

  return NextResponse.json({
    own: snapshot?.channel ?? own ?? null,
    syncedAt: snapshot?.syncedAt ?? null,
    competitors: competitors.map((c) => ({
      ...c,
      // Relative size, so the UI can say "2.1x your subscribers" without recomputing
      // it per row on the client.
      subscriberRatio: ownSubs > 0 ? c.subscriberCount / ownSubs : null,
      viewsPerVideo: c.videoCount > 0 ? c.viewCount / c.videoCount : 0,
    })),
  });
});
