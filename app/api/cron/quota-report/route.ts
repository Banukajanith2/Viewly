import { NextResponse } from "next/server";
import { db, paths, todayKey } from "@/lib/firebase/firestore";
import {
  DAILY_QUOTA_UNITS,
  SEARCH_SAFETY_MARGIN,
  getGlobalUsageToday,
  remainingUnits,
} from "@/lib/quota/tracker";
import { handleRouteError, isAuthorizedCron, jsonError } from "@/lib/utils/api";
import { daysAgo } from "@/lib/utils/formatters";

export const runtime = "nodejs";
// Never cached: a cached quota report is a lie about the current budget.
export const dynamic = "force-dynamic";

const HISTORY_DAYS = 30;

/**
 * GET /api/cron/quota-report (Part 4)
 *
 * Snapshots today's global quota ledger into quota_history/{date} and returns a
 * rolling 30 day view. This is the data source for the internal quota dashboard.
 *
 * Runs on Vercel Hobby cron: once a day, at some point within the scheduled hour.
 * It is scheduled late in the UTC day so the snapshot captures a nearly complete
 * day, and nothing here depends on the exact minute it fires.
 */
export async function GET(request: Request) {
  try {
    if (!isAuthorizedCron(request)) {
      return jsonError(401, "unauthorized", "Missing or invalid cron secret.");
    }

    const date = todayKey();
    const usage = await getGlobalUsageToday(date);
    const remaining = remainingUnits(usage);

    const snapshot = {
      ...usage,
      dailyQuotaUnits: DAILY_QUOTA_UNITS,
      remainingUnits: remaining,
      utilisation: DAILY_QUOTA_UNITS > 0 ? usage.totalUnits / DAILY_QUOTA_UNITS : 0,
      searchCeiling: Math.floor(DAILY_QUOTA_UNITS * SEARCH_SAFETY_MARGIN),
      recordedAt: new Date().toISOString(),
    };

    await db().doc(paths.quotaHistory(date)).set(snapshot);

    // Read back the window rather than accumulating one growing document, so the
    // history stays a set of small docs and old days can simply be dropped.
    const cutoff = daysAgo(HISTORY_DAYS);
    const historySnap = await db()
      .collection("quota_history")
      .where("date", ">=", cutoff)
      .orderBy("date", "desc")
      .limit(HISTORY_DAYS)
      .get();

    const history = historySnap.docs.map((d) => d.data());

    return NextResponse.json({ ok: true, today: snapshot, history });
  } catch (err) {
    return handleRouteError(err, "cron/quota-report");
  }
}
