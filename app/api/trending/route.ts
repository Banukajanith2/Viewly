import { NextResponse } from "next/server";
import { getLatestSnapshot, getUserProfile } from "@/lib/firebase/firestore";
import { getTrendingVideos } from "@/lib/youtube/data-api";
import { resolveRegion, regionName } from "@/lib/youtube/regions";
import { assertDataApiBudget } from "@/lib/quota/rate-limiter";
import { TTL, cacheKeys, get as cacheGet, set as cacheSet } from "@/lib/cache/kv";
import { protectedRoute } from "@/lib/utils/api";
import type { TrendingVideo } from "@/types/youtube";

export const runtime = "nodejs";

interface TrendingResponse {
  region: string;
  regionName: string | null;
  videos: TrendingVideo[];
  fetchedAt: string;
  source: "cache" | "live";
}

/**
 * GET /api/trending
 *
 * The region's own most-popular chart (Part 8.2).
 *
 * Cached per REGION, not per user, and shared across everyone. Trending is public
 * data that is identical for every creator in the same country, so a per-user cache
 * would multiply an identical 1 unit call by the number of users for no benefit.
 * Same reasoning as the Part 6 niche cache.
 */
export const GET = protectedRoute("trending", async ({ userId }) => {
  const [profile, snapshot] = await Promise.all([
    getUserProfile(userId),
    getLatestSnapshot(userId),
  ]);

  // An explicit choice wins, then the channel's own country, then US. A creator in
  // Sri Lanka should not open this page and be shown the US chart.
  const region = resolveRegion(profile?.homeRegion, snapshot?.channel.country);
  const key = cacheKeys.trending(region);

  const hit = await cacheGet<Omit<TrendingResponse, "source">>(key);
  if (hit) return NextResponse.json({ ...hit, source: "cache" });

  await assertDataApiBudget();

  const videos = await getTrendingVideos(userId, region);
  const payload: Omit<TrendingResponse, "source"> = {
    region,
    regionName: regionName(region),
    videos,
    fetchedAt: new Date().toISOString(),
  };

  await cacheSet(key, payload, TTL.trending);
  return NextResponse.json({ ...payload, source: "live" });
});
