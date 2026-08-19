import "server-only";

/**
 * The breakout alert pass (Part 8.4).
 *
 * Extracted from the route so daily-sync can call it directly. Vercel Hobby allows
 * only TWO cron entries and both are already used (daily-sync, quota-report), so a
 * third schedule is not available. Running it at the end of daily-sync is better
 * ordering regardless: alerts read the snapshot that job has just written, so a
 * separate schedule could race it and alert on yesterday's data.
 *
 * The route at /api/cron/breakout-alerts still exists for manual triggering and
 * testing. Route handlers cost nothing; only vercel.json entries are limited.
 */
import {
  getLatestSnapshot,
  getNicheCache,
  listUsersTrackingCompetitors,
} from "@/lib/firebase/firestore";
import { extractKeywords, hashKeywords } from "@/lib/youtube/keywords";
import { claimAlertSlot, sendBreakoutAlert } from "@/lib/notifications/push";

export interface BreakoutRunResult {
  usersChecked: number;
  notified: number;
  skippedDebounce: number;
  usersWithoutDevices: number;
  errors: number;
}

/**
 * Spends ZERO YouTube quota.
 *
 * Reads the shared niche cache written by Part 6 discovery rather than re-checking
 * each competitor through the API. Polling would cost one call per competitor per
 * user per day, which scales with the user count against a budget that does not.
 *
 * The honest consequence: an alert is only as fresh as the last discovery run in
 * that niche. Niche caches are shared, so any creator in the niche running
 * discovery refreshes it for everyone, but this is not a real-time alert and must
 * not be described as one.
 */
export async function runBreakoutAlerts(): Promise<BreakoutRunResult> {
  const users = await listUsersTrackingCompetitors();

  let notified = 0;
  let skippedDebounce = 0;
  let usersWithoutDevices = 0;
  let errors = 0;

  for (const user of users) {
    const tracked = new Set(user.trackedCompetitorIds ?? []);
    if (tracked.size === 0) continue;

    try {
      const snapshot = await getLatestSnapshot(user.uid);
      if (!snapshot) continue;

      // Derived exactly as the competitors page derives it, so the job and the
      // page agree on which cache entry belongs to this user.
      const keywords = extractKeywords(snapshot.recentVideos);
      if (keywords.length === 0) continue;

      const cache = await getNicheCache(hashKeywords(keywords));
      if (!cache) continue;

      const breakouts = cache.results.filter(
        (c) => c.isBreakout && tracked.has(c.channelId) && c.latestVideo,
      );

      for (const candidate of breakouts) {
        const latest = candidate.latestVideo;
        if (!latest) continue;

        // Claimed before sending. A breakout stays flagged for days, so without
        // this the same video would push on every run until they upload again.
        if (!(await claimAlertSlot(user.uid, candidate.channelId))) {
          skippedDebounce++;
          continue;
        }

        const result = await sendBreakoutAlert(user.uid, {
          channelId: candidate.channelId,
          channelTitle: candidate.title,
          videoId: latest.videoId,
          videoTitle: latest.title,
          views: latest.viewCount ?? 0,
          averageViews: candidate.averageViews,
        });

        if (result.sent > 0) notified += result.sent;
        else usersWithoutDevices++;
      }
    } catch (err) {
      // One user's failure must not abort the run for everyone else.
      console.error("[breakout-alerts] user %s failed:", user.uid, err);
      errors++;
    }
  }

  return { usersChecked: users.length, notified, skippedDebounce, usersWithoutDevices, errors };
}
