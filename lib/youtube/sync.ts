import "server-only";

/**
 * Builds and stores one user's daily snapshot.
 *
 * Extracted from the cron so the OAuth callback can run it too. A creator who has
 * just connected their channel would otherwise land on an empty dashboard and wait
 * until the next scheduled run to see anything, with nothing on screen explaining
 * why. The cron keeps it fresh from then on; this is what makes the first view
 * work.
 *
 * ONE implementation on purpose. Two code paths writing snapshots would drift, and
 * the "first" snapshot silently differing in shape from every later one is exactly
 * the kind of bug that surfaces weeks later on a page that assumes a field exists.
 */
import { getChannelStats, getRecentUploads } from "@/lib/youtube/data-api";
import {
  defaultDateRange,
  getChannelAnalytics,
  getVideoPerformance,
} from "@/lib/youtube/analytics-api";
import { saveSnapshot, todayKey } from "@/lib/firebase/firestore";
import type { DailySnapshot } from "@/types/youtube";

/** How many recent uploads each snapshot carries. */
export const VIDEOS_PER_USER = 10;

/**
 * Roughly the cost of one call to this, in Data API units:
 * channels.list 1, playlistItems.list 1, videos.list 1 per 50 videos, and
 * reports.query at 0 Data API units. Useful when deciding whether to run it
 * outside the cron.
 */
export const SYNC_UNIT_COST = 4;

export async function syncUser(
  userId: string,
  channelId: string,
  date: string = todayKey(),
): Promise<DailySnapshot> {
  const warnings: string[] = [];

  // force: true refreshes the 24 hour channel cache. Correct for the cron and for
  // a first connection, where a cached entry from someone else's earlier lookup
  // would otherwise be handed back as this user's "live" figures.
  const channel = await getChannelStats(channelId, userId, { force: true });

  // channels.list already told us the upload count. Asking for the uploads of a
  // channel with none would spend 2 units to learn what we already know, and would
  // 404 anyway since an empty channel has no uploads playlist.
  const recentVideos =
    channel.videoCount > 0
      ? await getRecentUploads(channelId, VIDEOS_PER_USER, userId)
      : [];

  if (channel.videoCount === 0) {
    warnings.push("This channel has no uploads yet, so there is nothing to analyse.");
  }

  // Analytics is best-effort. A revoked or expired token should still leave the
  // user with public stats rather than no snapshot at all.
  let analytics: DailySnapshot["analytics"] = null;
  try {
    const range = defaultDateRange(28);
    analytics = await getChannelAnalytics(userId, range);

    const perVideo = await getVideoPerformance(
      userId,
      recentVideos.map((v) => v.videoId),
      range,
    );
    for (const video of recentVideos) {
      const perf = perVideo.get(video.videoId);
      if (perf) video.viewCount = perf.views || video.viewCount;
    }
  } catch (err) {
    warnings.push(
      "Analytics unavailable: " + (err instanceof Error ? err.message : String(err)),
    );
  }

  const snapshot: DailySnapshot = {
    date,
    channelId,
    channel,
    recentVideos,
    analytics,
    syncedAt: new Date().toISOString(),
    ...(warnings.length ? { warnings } : {}),
  };

  await saveSnapshot(userId, snapshot);
  return snapshot;
}
