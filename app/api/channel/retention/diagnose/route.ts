import { NextResponse } from "next/server";
import { getLatestSnapshot } from "@/lib/firebase/firestore";
import { getAudienceRetention } from "@/lib/youtube/analytics-api";
import {
  assertCanUserCallAnalytics,
  remainingAnalyticsCalls,
} from "@/lib/quota/rate-limiter";
import { TTL, cacheKeys, get as cacheGet, set as cacheSet } from "@/lib/cache/kv";
import { diagnoseRetention } from "@/lib/insights/retention";
import { jsonError, protectedRoute } from "@/lib/utils/api";
import type { RetentionCurve } from "@/types/youtube";

export const runtime = "nodejs";

/** The brief's window: the diagnosis is about a pattern, not a single upload. */
const MAX_VIDEOS = 5;

export interface RetentionDiagnosisResponse {
  findings: ReturnType<typeof diagnoseRetention>["findings"];
  averaged: ReturnType<typeof diagnoseRetention>["averaged"];
  /** Which uploads contributed, so the UI can name them. */
  videos: Array<{ videoId: string; title: string; durationSeconds: number; hasData: boolean }>;
  computedAt: string;
  source: "cache" | "live";
}

/**
 * GET /api/channel/retention/diagnose
 *
 * Runs the Part 8.1 diagnostics over the user's last few uploads.
 *
 * Deliberately NOT part of the daily sync. One retention curve costs one analytics
 * call, so folding this into the cron would spend five calls per user per day
 * whether or not anyone ever opened the page. It is on demand, capped, and cached
 * for a day, which is the same shape as competitor discovery for the same reason.
 *
 * ?refresh=1 forces a recompute, and is the only path that spends quota.
 */
export const GET = protectedRoute("channel/retention/diagnose", async ({ userId, request }) => {
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const key = cacheKeys.retention(userId);

  if (!refresh) {
    const hit = await cacheGet<RetentionDiagnosisResponse>(key);
    if (hit) return NextResponse.json({ ...hit, source: "cache" });
  }

  const snapshot = await getLatestSnapshot(userId);
  if (!snapshot) {
    return jsonError(
      409,
      "no_snapshot",
      "Your channel has not been synced yet, so there is nothing to diagnose.",
    );
  }

  const recent = snapshot.recentVideos.slice(0, MAX_VIDEOS);
  if (recent.length === 0) {
    return jsonError(
      409,
      "no_uploads",
      "Retention needs published videos. This channel does not have any yet.",
    );
  }

  // Fails closed with a typed 429 when there is no headroom at all.
  await assertCanUserCallAnalytics(userId);

  // Size the batch to what today's budget can actually cover, rather than
  // starting five calls and running out on the fourth.
  const affordable = Math.min(recent.length, await remainingAnalyticsCalls(userId));
  const targets = recent.slice(0, affordable);

  // Fetched in parallel: sequentially this took 99 seconds for five uploads, which
  // is far too long for something a user clicked. Concurrency cannot overshoot the
  // cap because the batch was already sized to the affordable headroom above, and
  // recordCall uses blind increments that do not contend.
  const curves: RetentionCurve[] = await Promise.all(
    targets.map((video) =>
      getAudienceRetention(userId, video.videoId, video.durationSeconds ?? 0),
    ),
  );

  // relativeRetentionPerformance is reported per sample; the mean over the curve
  // is the video's standing against others of its length. Averaged across the
  // batch, weighting every contributing video equally.
  const relatives = curves
    .filter((c) => c.points.length > 0)
    .map(
      (c) =>
        c.points.reduce((a, p) => a + p.relativeRetentionPerformance, 0) / c.points.length,
    )
    .filter((v) => v > 0);
  const relative = relatives.length
    ? relatives.reduce((a, b) => a + b, 0) / relatives.length
    : null;

  const { findings, averaged } = diagnoseRetention(curves, relative);

  const payload: RetentionDiagnosisResponse = {
    findings,
    averaged,
    videos: targets.map((v, i) => ({
      videoId: v.videoId,
      title: v.title,
      durationSeconds: v.durationSeconds ?? 0,
      hasData: (curves[i]?.points.length ?? 0) > 1,
    })),
    computedAt: new Date().toISOString(),
    source: "live",
  };

  await cacheSet(key, payload, TTL.retention);
  return NextResponse.json(payload);
});
