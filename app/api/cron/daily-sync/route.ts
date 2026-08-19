import { NextResponse } from "next/server";
import { getChannelStats, getRecentUploads } from "@/lib/youtube/data-api";
import {
  defaultDateRange,
  getChannelAnalytics,
  getVideoPerformance,
} from "@/lib/youtube/analytics-api";
import { listUsersWithLinkedChannel, saveSnapshot, todayKey } from "@/lib/firebase/firestore";
import { getGlobalUsageToday, remainingUnits } from "@/lib/quota/tracker";
import { cronRoute } from "@/lib/utils/api";
import type { DailySnapshot } from "@/types/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby caps a function at 60 seconds. A sync that outgrows this needs
// batching across days, not a longer timeout.
export const maxDuration = 60;

/** Uploads snapshotted per user. Enough for Part 8.1's "last 5 uploads" analysis. */
const VIDEOS_PER_USER = 10;

/**
 * Data API units one user costs: channels.list (1) + playlistItems.list (1)
 * + videos.list (1). Analytics calls bill separately and cost 0 here.
 */
const UNITS_PER_USER = 3;

/**
 * Stop syncing while this much budget is still unspent, so an interactive request
 * later in the day is never starved by the cron.
 */
const RESERVE_UNITS = 2_000;

/**
 * GET /api/cron/daily-sync (Part 5)
 *
 * Once a day, snapshot every linked channel into users/{uid}/snapshots/{date}.
 * Dashboards read that document, so a page load costs zero YouTube quota.
 *
 * Vercel Hobby cron fires once daily somewhere inside the scheduled hour, so
 * nothing here assumes a precise time. The snapshot is keyed by UTC date and is
 * idempotent: running twice in one day overwrites rather than duplicates.
 */
export const GET = cronRoute("cron/daily-sync", async () => {
  const date = todayKey();
  const users = await listUsersWithLinkedChannel();

  const synced: string[] = [];
  const failed: Array<{ userId: string; error: string }> = [];
  let stoppedForBudget = false;

  for (const user of users) {
    if (!user.channelId) continue;

    // Re-read the ledger each iteration: the loop is what is spending it.
    const usage = await getGlobalUsageToday(date);
    if (remainingUnits(usage) - UNITS_PER_USER < RESERVE_UNITS) {
      stoppedForBudget = true;
      break;
    }

    try {
      synced.push(await syncUser(user.uid, user.channelId, date));
    } catch (err) {
      // One user's expired token must not abort everyone else's sync.
      failed.push({
        userId: user.uid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
  ok: true,
  date,
  totalUsers: users.length,
  syncedCount: synced.length,
  failedCount: failed.length,
  stoppedForBudget,
  failed,
  });
});

async function syncUser(userId: string, channelId: string, date: string): Promise<string> {
  const warnings: string[] = [];

  // force: true is correct here and nowhere else. The cron is the one caller
  // allowed to spend a unit refreshing the 24 hour channel cache.
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
  return userId;
}
