import { NextResponse } from "next/server";
import { getLatestSnapshot } from "@/lib/firebase/firestore";
import { defaultDateRange, getChannelAnalytics } from "@/lib/youtube/analytics-api";
import { assertCanUserCallAnalytics } from "@/lib/quota/rate-limiter";
import { protectedRoute } from "@/lib/utils/api";

export const runtime = "nodejs";

const MAX_DAYS = 365;

/**
 * GET /api/channel/analytics?days=28&live=1
 *
 * Default path serves the cached daily snapshot at zero API cost. `live=1` requests
 * a fresh Analytics call, and only that path can spend anything.
 *
 * The limiter is asserted inline rather than declared on the wrapper for exactly
 * that reason: a cached read should never be refused for exceeding a limit it does
 * not touch.
 */
export const GET = protectedRoute("channel/analytics", async ({ userId, request }) => {
  const url = new URL(request.url);

  const days = Math.min(
    Math.max(Number(url.searchParams.get("days") ?? 28) || 28, 1),
    MAX_DAYS,
  );
  const live = url.searchParams.get("live") === "1";

  if (!live) {
    const snapshot = await getLatestSnapshot(userId);
    if (snapshot?.analytics) {
      return NextResponse.json({
        source: "snapshot",
        syncedAt: snapshot.syncedAt,
        analytics: snapshot.analytics,
      });
    }
    // No snapshot yet, so fall through to a live call rather than returning nothing
    // on a freshly linked channel.
  }

  await assertCanUserCallAnalytics(userId);

  const analytics = await getChannelAnalytics(userId, defaultDateRange(days));
  return NextResponse.json({
    source: "live",
    syncedAt: new Date().toISOString(),
    analytics,
  });
});
