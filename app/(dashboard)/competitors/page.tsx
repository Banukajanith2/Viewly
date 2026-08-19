import type { Metadata } from "next";
import Link from "next/link";
import { Flame, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/dashboard/stat-tile";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DownloadButton } from "@/components/dashboard/download-button";
import { BarChart } from "@/components/charts/bar-chart";
import { DiscoverButton } from "@/components/competitors/discover-button";
import { requireUser } from "@/lib/auth/session";
import {
  getLatestSnapshot,
  getNicheCache,
  getUserProfile,
} from "@/lib/firebase/firestore";
import { extractKeywords, hashKeywords } from "@/lib/youtube/keywords";
import { channelAverages } from "@/lib/insights/creator";
import {
  formatCount,
  formatNumber,
  formatRelativeTime,
  isFuture,
} from "@/lib/utils/formatters";
import { DISCOVERY_COOLDOWN_DAYS } from "@/lib/quota/rate-limiter";

export const metadata: Metadata = { title: "Competitors" };

/**
 * Competitors (Part 6).
 *
 * Reads the shared niche cache directly rather than running discovery, so opening
 * the page never spends quota. Discovery only happens when the user asks for it.
 *
 * The keyword hash is recomputed here from the snapshot's videos, which is the same
 * derivation the engine does. That is deliberate: it means the page can find the
 * user's cached niche without a write, and it stays correct if their content shifts.
 */
export default async function CompetitorsPage() {
  const user = await requireUser();
  const [profile, snapshot] = await Promise.all([
    getUserProfile(user.uid),
    getLatestSnapshot(user.uid),
  ]);

  if (!profile?.channelId) {
    return (
      <EmptyState
        title="Connect your YouTube channel"
        body="Viewly works out who you compete with from your own uploads, so it needs your channel first."
        action={{ href: "/settings", label: "Connect YouTube" }}
      />
    );
  }

  if (!snapshot || snapshot.recentVideos.length === 0) {
    return (
      <EmptyState
        title="Publish a few videos first"
        body="Competitors are found by reading the topics of your best uploads. With no published videos there is nothing to match on yet."
        action={{ href: "/overview", label: "Back to overview" }}
      />
    );
  }

  const keywords = extractKeywords(snapshot.recentVideos);
  const cache = keywords.length ? await getNicheCache(hashKeywords(keywords)) : null;
  const candidates = cache?.results ?? [];

  const own = snapshot.channel;
  const ownAverages = channelAverages(snapshot.recentVideos);
  const breakouts = candidates.filter((c) => c.isBreakout);

  // Where the user sits among their peers on typical views per upload.
  const ranked = [...candidates].sort((a, b) => b.averageViews - a.averageViews);
  const ownRank = ranked.filter((c) => c.averageViews > ownAverages.meanViews).length + 1;

  const exportRows = candidates.map((c) => ({
    channel_id: c.channelId,
    title: c.title,
    subscribers: c.subscriberCount,
    total_views: c.viewCount,
    videos: c.videoCount,
    average_views_last_5: Math.round(c.averageViews),
    view_velocity_per_hour: c.viewVelocity.toFixed(2),
    is_breakout: c.isBreakout ? "yes" : "no",
    days_since_last_upload: c.daysSinceLastUpload,
    latest_video: c.latestVideo?.title ?? "",
  }));

  const cooldownUntil = profile.lastDiscoveryRunAt
    ? new Date(
        new Date(profile.lastDiscoveryRunAt).getTime() +
          DISCOVERY_COOLDOWN_DAYS * 86_400_000,
      )
    : null;
  const onCooldown = cooldownUntil ? isFuture(cooldownUntil) : false;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Competitors</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Channels your size in your niche, between 0.3x and 3.5x your subscribers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {candidates.length > 0 && (
            <DownloadButton rows={exportRows} filename="viewly-competitors" />
          )}
          <DiscoverButton hasResults={candidates.length > 0} />
        </div>
      </header>

      {/* Honest about where the data came from. A cached result shared with other
          creators is not the same claim as a live search, so it does not pretend. */}
      {cache && (
        <p className="text-muted-foreground bg-muted/50 rounded-lg border px-4 py-3 text-sm">
          Last updated {formatRelativeTime(cache.cachedAt)}, shared with other creators
          in your niche. Refreshes automatically after{" "}
          {formatRelativeTime(cache.expiresAt).replace("in ", "")}.
          {onCooldown && cooldownUntil && (
            <>
              {" "}
              You can run a new search {formatRelativeTime(cooldownUntil)}.
            </>
          )}
        </p>
      )}

      {candidates.length === 0 ? (
        <EmptyState
          title="No competitors found yet"
          body={
            keywords.length === 0
              ? "Your uploads do not have enough title or tag text yet for Viewly to identify a niche."
              : `Viewly reads your niche as ${keywords.slice(0, 6).join(", ")}. Run discovery to find channels competing for the same viewers.`
          }
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Tracked peers"
              value={formatNumber(candidates.length)}
              hint="Active channels in your subscriber band"
            />
            <StatTile
              label="Breakouts"
              value={formatNumber(breakouts.length)}
              hint="Latest upload beating their own average by 2.5x"
            />
            <StatTile
              label="Your rank"
              value={`#${ownRank} of ${candidates.length + 1}`}
              hint="By average views per upload"
            />
            <StatTile
              label="Peer median size"
              value={formatCount(medianOf(candidates.map((c) => c.subscriberCount)))}
              hint={`You have ${formatCount(own.subscriberCount)} subscribers`}
            />
          </section>

          {breakouts.length > 0 && (
            <section className="rounded-xl border p-4 sm:p-6">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-medium">
                <Flame className="size-4" style={{ color: "var(--viz-2)" }} />
                Breakout videos right now
              </h2>
              <p className="text-muted-foreground mb-4 text-xs">
                These channels have a recent upload running well past their own normal
                pace, which usually means the topic is working.
              </p>
              <ul className="space-y-3">
                {breakouts.map((c) => (
                  <li key={c.channelId} className="text-sm">
                    <span className="font-medium">{c.title}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {formatCount(c.latestVideo?.viewCount ?? 0)} views against a{" "}
                      {formatCount(Math.round(c.averageViews))} average
                    </span>
                    {c.latestVideo && (
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {c.latestVideo.title}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Emphasis, not categorical: the user's own bar is the point and the peers
              are context, so one accent and the rest recede. */}
          <section className="bg-card rounded-xl border p-4 sm:p-6">
            <h2 className="mb-1 text-sm font-medium">Average views per upload</h2>
            <p className="text-muted-foreground mb-4 text-xs">
              Your channel is highlighted; peers are shown for context.
            </p>
            <BarChart
              data={[
                {
                  label: `${own.title} (you)`,
                  value: Math.round(ownAverages.meanViews),
                  meta: `${ownAverages.videoCount} recent uploads`,
                },
                ...ranked.map((c) => ({
                  label: c.title,
                  value: Math.round(c.averageViews),
                  meta: `${formatCount(c.subscriberCount)} subscribers · last upload ${c.daysSinceLastUpload}d ago`,
                })),
              ]}
              emphasise={0}
              format="compact"
            />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium">All peers</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {ranked.map((c) => (
                <li key={c.channelId} className="bg-card rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`https://www.youtube.com/channel/${c.channelId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                    >
                      {c.title}
                    </Link>
                    {c.isBreakout && (
                      <Badge variant="secondary" className="shrink-0 gap-1">
                        <Flame className="size-3" />
                        Breakout
                      </Badge>
                    )}
                  </div>

                  <dl className="text-muted-foreground mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <Stat label="Subscribers">
                      <Users className="size-3" />
                      {formatCount(c.subscriberCount)}
                    </Stat>
                    <Stat label="Avg views">{formatCount(Math.round(c.averageViews))}</Stat>
                    <Stat label="Velocity">{c.viewVelocity.toFixed(1)}/hr</Stat>
                    <Stat label="Last upload">{c.daysSinceLastUpload}d ago</Stat>
                  </dl>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <p className="text-muted-foreground text-xs">
        <Badge variant="outline" className="mr-2">
          Shared cache
        </Badge>
        Discovery results are cached per niche and shared between creators, so one
        search serves everyone competing for the same viewers instead of each person
        spending 100 quota units.
      </p>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] tracking-wide uppercase opacity-70">{label}</dt>
      <dd className="flex items-center gap-1 tabular-nums">{children}</dd>
    </div>
  );
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
