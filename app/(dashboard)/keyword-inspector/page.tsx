import type { Metadata } from "next";
import Link from "next/link";
import { Flame, Globe2, Hash, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/dashboard/stat-tile";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DownloadButton } from "@/components/dashboard/download-button";
import { TrendingPanel } from "@/components/keywords/trending-panel";
import { requireUser } from "@/lib/auth/session";
import { getLatestSnapshot, getUserProfile } from "@/lib/firebase/firestore";
import { cacheKeys, get as cacheGet } from "@/lib/cache/kv";
import { extractKeywords, rankVideoKeywords } from "@/lib/youtube/keywords";
import { resolveRegion, regionName } from "@/lib/youtube/regions";
import { formatCount, formatRelativeTime } from "@/lib/utils/formatters";
import type { TrendingVideo } from "@/types/youtube";

export const metadata: Metadata = { title: "Keywords" };

interface CachedTrending {
  region: string;
  regionName: string | null;
  videos: TrendingVideo[];
  fetchedAt: string;
}

/**
 * Keyword inspector (Parts 8.2 and 8.3).
 *
 * Reads the user's own niche keywords from the snapshot, which costs nothing, and
 * shows the region's trending chart from the shared cache. Fetching trending is an
 * explicit action, because it is the only thing on this page that can spend a unit.
 */
export default async function KeywordInspectorPage() {
  const user = await requireUser();
  const [profile, snapshot] = await Promise.all([
    getUserProfile(user.uid),
    getLatestSnapshot(user.uid),
  ]);

  if (!profile?.channelId) {
    return (
      <EmptyState
        title="Connect your YouTube channel"
        body="Viewly reads your niche from your own uploads, so it needs your channel first."
        action={{ href: "/settings", label: "Connect YouTube" }}
      />
    );
  }

  const region = resolveRegion(profile.homeRegion, snapshot?.channel.country);
  const trending = await cacheGet<CachedTrending>(cacheKeys.trending(region));

  const videos = snapshot?.recentVideos ?? [];
  const keywords = extractKeywords(videos);
  const ranked = rankVideoKeywords(videos);

  // Which of the creator's own terms show up in what is trending near them. This
  // is the actual question the page exists to answer.
  const trendingText = (trending?.videos ?? [])
    .map((v) => `${v.title} ${(v.tags ?? []).join(" ")}`)
    .join(" ")
    .toLowerCase();
  const overlap = ranked.filter((k) => trendingText.includes(k.keyword.toLowerCase()));

  const exportRows = ranked.map((k) => ({
    keyword: k.keyword,
    uses_across_your_uploads: k.count,
    appears_in_regional_trending: trendingText.includes(k.keyword.toLowerCase())
      ? "yes"
      : "no",
  }));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Keywords</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The terms your channel is built on, against what is trending in{" "}
            {regionName(region) ?? region}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ranked.length > 0 && (
            <DownloadButton rows={exportRows} filename="viewly-keywords" />
          )}
          <TrendingPanel
            region={region}
            regionLabel={regionName(region) ?? region}
            hasCache={Boolean(trending)}
          />
        </div>
      </header>

      {keywords.length === 0 ? (
        <EmptyState
          title="Not enough text to read a niche yet"
          body="Viewly works out your keywords from the titles and tags of your uploads. Add a few more, or give your videos fuller tags, and this fills in."
          action={{ href: "/overview", label: "Back to overview" }}
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={Hash}
              accent={1}
              label="Keywords found"
              value={String(keywords.length)}
              hint="Extracted from your titles and tags"
            />
            <StatTile
              icon={TrendingUp}
              accent={2}
              label="Top term"
              value={ranked[0]?.keyword ?? "None"}
              hint={
                ranked[0]
                  ? `Used in ${ranked[0].count} of your uploads`
                  : "No repeated terms yet"
              }
            />
            <StatTile
              icon={Globe2}
              accent={3}
              label="Your region"
              value={region}
              hint={regionName(region) ?? "Set in Settings"}
            />
            <StatTile
              icon={Flame}
              accent={4}
              label="Terms trending near you"
              value={String(overlap.length)}
              hint={
                trending
                  ? "Your keywords appearing in the regional chart"
                  : "Load trending to compare"
              }
            />
          </section>

          <section className="bg-card rounded-xl border p-4 sm:p-6">
            <h2 className="mb-1 text-sm font-medium">Your keywords by frequency</h2>
            <p className="text-muted-foreground mb-4 text-xs">
              Ranked by how often each term appears across your uploads, which is what
              actually identifies a niche. Alphabetical order would just be the
              alphabet.
            </p>
            <ul className="flex flex-wrap gap-2">
              {ranked.slice(0, 40).map((k) => {
                const inTrending = trendingText.includes(k.keyword.toLowerCase());
                return (
                  <li key={k.keyword}>
                    <Badge
                      variant={inTrending ? "default" : "secondary"}
                      className="gap-1.5"
                      title={
                        inTrending
                          ? `Appears in ${regionName(region) ?? region} trending`
                          : `Used in ${k.count} of your uploads`
                      }
                    >
                      {inTrending && <Flame className="size-3" />}
                      {k.keyword}
                      <span className="opacity-60 tabular-nums">{k.count}</span>
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </section>

          {trending && trending.videos.length > 0 && (
            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-medium">
                  Trending in {trending.regionName ?? trending.region}
                </h2>
                <p className="text-muted-foreground text-xs">
                  Fetched {formatRelativeTime(trending.fetchedAt)}, shared with every
                  creator in this region.
                </p>
              </div>
              <ul className="divide-y overflow-hidden rounded-xl border">
                {trending.videos.slice(0, 15).map((v) => (
                  <li
                    key={v.videoId}
                    className="bg-card hover:bg-accent/40 flex items-center gap-4 p-3 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`https://www.youtube.com/watch?v=${v.videoId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="line-clamp-1 text-sm font-medium hover:underline"
                      >
                        {v.title}
                      </Link>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {v.channelTitle}
                      </p>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {formatCount(v.viewCount ?? 0)} views
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="text-muted-foreground text-xs">
        <Badge variant="outline" className="mr-2">
          Regional
        </Badge>
        Trending is requested with your region code rather than the API default, so
        this is what is popular where you are, not in the United States. Change it in{" "}
        <Link href="/settings" className="underline underline-offset-4">
          Settings
        </Link>
        .
      </p>
    </div>
  );
}
