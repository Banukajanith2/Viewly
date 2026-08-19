import { NextResponse } from "next/server";
import { listUsersWithLinkedChannel, todayKey } from "@/lib/firebase/firestore";
import { getGlobalUsageToday, remainingUnits } from "@/lib/quota/tracker";
import { cronRoute } from "@/lib/utils/api";
import { syncUser } from "@/lib/youtube/sync";
import { runBreakoutAlerts } from "@/lib/notifications/breakout-run";
import type { BreakoutRunResult } from "@/lib/notifications/breakout-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby caps a function at 60 seconds. A sync that outgrows this needs
// batching across days, not a longer timeout.
export const maxDuration = 60;

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
      await syncUser(user.uid, user.channelId, date);
      synced.push(user.uid);
    } catch (err) {
      // One user's expired token must not abort everyone else's sync.
      failed.push({
        userId: user.uid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Part 8.4 runs here rather than on its own schedule: Vercel Hobby allows only
  // two cron entries and both are taken. Ordering is better this way regardless,
  // because alerts read the snapshots written immediately above. It spends no
  // YouTube quota, and its own failure must not fail the sync that already
  // succeeded, so it is caught rather than thrown.
  let alerts: BreakoutRunResult | { error: string };
  try {
    alerts = await runBreakoutAlerts();
  } catch (err) {
    console.error("[cron/daily-sync] breakout alerts failed:", err);
    alerts = { error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({
    ok: true,
    date,
    totalUsers: users.length,
    syncedCount: synced.length,
    failedCount: failed.length,
    stoppedForBudget,
    failed,
    alerts,
  });
});
