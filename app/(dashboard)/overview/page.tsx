import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  Clock,
  Eye,
  MessageSquare,
  Play,
  ThumbsUp,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/dashboard/stat-tile";
import { EmptyState } from "@/components/dashboard/empty-state";
import { TrendPanel } from "@/components/dashboard/trend-panel";
import { requireUser } from "@/lib/auth/session";
import { getLatestSnapshot, getUserProfile } from "@/lib/firebase/firestore";
import {
  formatCount,
  formatDuration,
  formatNumber,
  formatRelativeTime,
} from "@/lib/utils/formatters";

export const metadata: Metadata = { title: "Overview" };

/**
 * Overview (Part 5).
 *
 * Reads only the daily snapshot, which is served through the KV cache. A page load
 * therefore costs zero YouTube quota and, on a warm cache, zero Firestore reads.
 * That is the entire reason the sync cron exists, so nothing here may call the API.
 */
export default async function OverviewPage() {
  const user = await requireUser();
  const [profile, snapshot] = await Promise.all([
    getUserProfile(user.uid),
    getLatestSnapshot(user.uid),
  ]);

  if (!profile?.channelId) {
    return (
      <EmptyState
        title="Connect your YouTube channel"
        body="Viewly needs read-only access to your channel before it can show you anything. Nothing is ever posted or changed on your behalf."
        action={{ href: "/settings", label: "Connect YouTube" }}
      />
    );
  }

  if (!snapshot) {
    return (
      <EmptyState
        title="Your first sync has not run yet"
        body="Viewly collects your stats once a day. Your channel is connected, so data will appear after the next sync."
        action={{ href: "/settings", label: "Check connection" }}
      />
    );
  }

  const { channel, analytics, recentVideos, warnings } = snapshot;
  const netSubs = analytics ? analytics.subscribersGained - analytics.subscribersLost : 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <ChannelAvatar title={channel.title} src={channel.thumbnailUrl} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{channel.title}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Synced {formatRelativeTime(snapshot.syncedAt)}
              {analytics && (
                <>
                  {" · "}
                  {analytics.dateRange.startDate} to {analytics.dateRange.endDate}
                </>
              )}
            </p>
          </div>
        </div>
        {channel.country && <Badge variant="outline">{channel.country}</Badge>}
      </header>

      {warnings?.map((warning) => (
        <p
          key={warning}
          className="bg-muted text-muted-foreground rounded-lg border px-4 py-3 text-sm"
        >
          {warning}
        </p>
      ))}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Users}
          accent={1}
          label="Subscribers"
          value={
            channel.subscriberCountHidden ? "Hidden" : formatCount(channel.subscriberCount)
          }
          hint={
            channel.subscriberCountHidden
              ? "This channel hides its subscriber count"
              : formatNumber(channel.subscriberCount) + " total"
          }
          delta={
            analytics && !channel.subscriberCountHidden
              ? { value: netSubs, format: (n) => `${formatNumber(n)} in the last 28 days` }
              : undefined
          }
        />
        <StatTile
          icon={Eye}
          accent={3}
          label="Lifetime views"
          value={formatCount(channel.viewCount)}
          hint={formatNumber(channel.viewCount) + " total"}
        />
        <StatTile
          icon={TrendingUp}
          accent={2}
          label="Views (28 days)"
          value={formatCount(analytics?.views ?? 0)}
          hint={analytics ? formatNumber(analytics.views) + " in period" : "No analytics yet"}
        />
        <StatTile
          icon={Play}
          accent={5}
          label="Watch time"
          value={
            analytics ? formatCount(analytics.estimatedMinutesWatched) + " min" : "0 min"
          }
          hint={
            analytics && analytics.averageViewDuration > 0
              ? `${formatDuration(analytics.averageViewDuration)} average view`
              : "No watch time recorded yet"
          }
        />
      </section>

      {analytics && analytics.daily.length > 0 && (
        <TrendPanel
          title="Daily views"
          cached={analytics}
          metric="views"
          label="Views"
          format="compact"
          exportName="viewly-overview-views"
        />
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium">Recent uploads</h2>

        {recentVideos.length === 0 ? (
          <div className="bg-card text-muted-foreground rounded-xl border px-6 py-10 text-center text-sm">
            No uploads on this channel yet.
          </div>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border">
            {recentVideos.map((video) => (
              <li
                key={video.videoId}
                className="bg-card hover:bg-accent/40 flex items-center gap-4 p-3 transition-colors"
              >
                {video.thumbnailUrl ? (
                  <Image
                    src={video.thumbnailUrl}
                    alt=""
                    width={80}
                    height={48}
                    className="h-12 w-20 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="bg-muted h-12 w-20 shrink-0 rounded-md" />
                )}

                <div className="min-w-0 flex-1">
                  <Link
                    href={`https://www.youtube.com/watch?v=${video.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="line-clamp-1 text-sm font-medium hover:underline"
                  >
                    {video.title}
                  </Link>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {formatRelativeTime(video.publishedAt)}
                    {video.durationSeconds
                      ? ` · ${formatDuration(video.durationSeconds)}`
                      : ""}
                  </p>
                </div>

                <dl className="text-muted-foreground hidden shrink-0 gap-5 text-xs sm:flex">
                  <Metric icon={<Eye className="size-3.5" />} label="views">
                    {formatCount(video.viewCount ?? 0)}
                  </Metric>
                  <Metric icon={<ThumbsUp className="size-3.5" />} label="likes">
                    {formatCount(video.likeCount ?? 0)}
                  </Metric>
                  <Metric icon={<MessageSquare className="size-3.5" />} label="comments">
                    {formatCount(video.commentCount ?? 0)}
                  </Metric>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Clock className="size-3.5" />
        Everything here comes from the daily snapshot, so opening this page spends no
        YouTube quota.
      </p>
    </div>
  );
}

/**
 * The channel's YouTube avatar.
 *
 * Falls back to the initial rather than a broken image or a blank circle. The URL
 * comes from the daily snapshot, and a snapshot written before this field was
 * captured simply will not have one, so the absent case is ordinary rather than
 * exceptional and must look deliberate.
 *
 * Marked priority: it sits at the top of the page and is the one image above the
 * fold, so lazy-loading it would show the fallback and then swap.
 */
function ChannelAvatar({ title, src }: { title: string; src?: string }) {
  if (!src) {
    return (
      <div
        aria-hidden
        className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold"
      >
        {title.trim().charAt(0).toUpperCase() || "?"}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={48}
      height={48}
      priority
      className="size-12 shrink-0 rounded-full object-cover"
    />
  );
}

function Metric({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-right">
      <dt className="sr-only">{label}</dt>
      <dd className="flex items-center gap-1 tabular-nums">
        {icon}
        {children}
      </dd>
    </div>
  );
}
