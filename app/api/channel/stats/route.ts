import { NextResponse } from "next/server";
import { getUserProfile, getLatestSnapshot } from "@/lib/firebase/firestore";
import { getChannelStats } from "@/lib/youtube/data-api";
import { jsonError, protectedRoute } from "@/lib/utils/api";

export const runtime = "nodejs";

/**
 * GET /api/channel/stats
 *
 * Serves the signed-in user's channel stats. Prefers the daily snapshot, which is
 * read through the KV cache and costs nothing, and falls back to getChannelStats
 * (itself cached for 24 hours in channels/{channelId}) only when no snapshot exists
 * yet, such as on the first day after linking a channel.
 *
 * There is deliberately no way for a client to force a refresh. If there were, a
 * page with a polling bug could spend the app's shared budget one unit at a time.
 * No rate limit is declared because no path here can reach an uncapped API call.
 */
export const GET = protectedRoute("channel/stats", async ({ userId }) => {
  const profile = await getUserProfile(userId);

  if (!profile?.channelId) {
    return jsonError(409, "no_channel_linked", "Connect a YouTube channel in settings first.");
  }

  const snapshot = await getLatestSnapshot(userId);
  if (snapshot) {
    return NextResponse.json({
      source: "snapshot",
      syncedAt: snapshot.syncedAt,
      channel: snapshot.channel,
    });
  }

  const channel = await getChannelStats(profile.channelId, userId);
  return NextResponse.json({
    source: "cache",
    syncedAt: channel.lastUpdated,
    channel,
  });
});
