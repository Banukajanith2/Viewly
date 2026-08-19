import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CalendarDays,
  Clock3,
  Eye,
  Gauge,
  Repeat,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatTile, type Accent } from "@/components/dashboard/stat-tile";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DownloadButton } from "@/components/dashboard/download-button";
import { TrendPanel } from "@/components/dashboard/trend-panel";
import { BarChart } from "@/components/charts/bar-chart";
import { requireUser } from "@/lib/auth/session";
import { getLatestSnapshot, getUserProfile } from "@/lib/firebase/firestore";
import {
  bestPublishDay,
  channelAverages,
  engagementRate,
  momentum,
  subscriberConversion,
  uploadCadence,
  describeConsistency,
  videoPerformance,
} from "@/lib/insights/creator";
import {
  formatCount,
  formatDuration,
  formatNumber,
  formatPercent,
} from "@/lib/utils/formatters";

export const metadata: Metadata = { title: "Analytics" };

/**
 * Analytics (Part 5).
 *
 * Every number here is derived from the daily snapshot, so the page costs no quota.
 *
 * Two separate charts rather than one with two y-axes. A dual axis lets whoever
 * picks the scales imply any correlation they like between views and watch time,
 * and the reader has no way to tell. Two charts sharing an x-range say the same
 * thing honestly.
 */
export default async function AnalyticsPage() {
  const user = await requireUser();
  const [profile, snapshot] = await Promise.all([
    getUserProfile(user.uid),
    getLatestSnapshot(user.uid),
  ]);

  if (!profile?.channelId) {
    return (
      <EmptyState
        title="Connect your YouTube channel"
        body="Analytics needs read-only access to your channel data."
        action={{ href: "/settings", label: "Connect YouTube" }}
      />
    );
  }

  if (!snapshot?.analytics) {
    return (
      <EmptyState
        title="No analytics yet"
        body="Your channel is connected but the daily sync has not collected analytics for it yet. This is normal for a channel with no watch time so far."
        action={{ href: "/overview", label: "Back to overview" }}
      />
    );
  }

  const { analytics, recentVideos } = snapshot;

  const week = momentum(analytics.daily, 7);
  const averages = channelAverages(recentVideos);
  const cadence = uploadCadence(recentVideos);
  const bestDay = bestPublishDay(recentVideos);
  const conversion = subscriberConversion(analytics.subscribersGained, analytics.views);

  const topVideos = [...recentVideos]
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, 8);

  const exportRows = analytics.daily.map((d) => ({
    date: d.date,
    views: d.views,
    watch_time_minutes: d.watchTimeMinutes,
  }));

  const videoExportRows = recentVideos.map((v) => ({
    video_id: v.videoId,
    title: v.title,
    published_at: v.publishedAt,
    views: v.viewCount ?? 0,
    likes: v.likeCount ?? 0,
    comments: v.commentCount ?? 0,
    duration_seconds: v.durationSeconds ?? 0,
    engagement_rate: engagementRate(v)?.toFixed(4) ?? "",
    tags: (v.tags ?? []).join(" | "),
  }));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {analytics.dateRange.startDate} to {analytics.dateRange.endDate} ·{" "}
            {analytics.daily.length} days
          </p>
        </div>
        <DownloadButton rows={exportRows} filename="viewly-daily" label="Export daily" />
      </header>

      {/* Headline numbers. Stat tiles, not a bar chart: for single current values
          the number is the visualisation. */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Eye}
          accent={1}
          label="Views"
          value={formatCount(analytics.views)}
          hint={formatNumber(analytics.views) + " in period"}
          delta={
            week?.change !== null && week
              ? {
                  value: Math.round(week.change * 100),
                  format: (n) => `${n}% vs previous ${week.days} days`,
                }
              : undefined
          }
        />
        <StatTile
          icon={Clock3}
          accent={3}
          label="Watch time"
          value={formatCount(analytics.estimatedMinutesWatched) + " min"}
          hint={`${formatDuration(analytics.averageViewDuration)} average view`}
        />
        <StatTile
          icon={Gauge}
          accent={5}
          label="Average view"
          value={
            analytics.averageViewPercentage > 0
              ? formatPercent(analytics.averageViewPercentage / 100)
              : "-"
          }
          hint="Share of each video actually watched"
        />
        <StatTile
          icon={UserPlus}
          accent={2}
          label="Net subscribers"
          value={formatNumber(analytics.subscribersGained - analytics.subscribersLost)}
          hint={`+${formatNumber(analytics.subscribersGained)} gained, -${formatNumber(analytics.subscribersLost)} lost`}
          delta={{
            value: analytics.subscribersGained - analytics.subscribersLost,
            format: (n) => `${formatNumber(n)} net`,
          }}
        />
      </section>

      {/* Two one-axis charts, never one chart with two scales. Each filters
          independently, since a creator often wants a long view of watch time and a
          short view of views at the same time. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TrendPanel
          title="Daily views"
          cached={analytics}
          metric="views"
          label="Views"
          format="compact"
          exportName="viewly-views"
        />
        <TrendPanel
          title="Daily watch time"
          cached={analytics}
          metric="watchTimeMinutes"
          label="Minutes"
          format="minutes"
          exportName="viewly-watch-time"
        />
      </div>

      {/* Derived insights: the numbers a creator would otherwise work out by hand. */}
      <section>
        <h2 className="mb-3 text-sm font-medium">What the numbers say</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InsightCard
            icon={TrendingUp}
            accent={2}
            title="Momentum"
            value={
              week?.change !== null && week
                ? `${week.change > 0 ? "+" : ""}${Math.round(week.change * 100)}%`
                : "Not enough data"
            }
            body={
              week
                ? `${formatNumber(week.recent)} views in the last ${week.days} days against ${formatNumber(week.previous)} in the ${week.days} before.`
                : "Two full weeks of data are needed before a trend means anything."
            }
          />
          <InsightCard
            icon={Repeat}
            accent={3}
            title="Upload rhythm"
            value={cadence ? describeConsistency(cadence) : "Not enough uploads"}
            body={
              cadence
                ? `About one upload every ${cadence.averageDays.toFixed(1)} days, give or take ${cadence.consistencyDays.toFixed(1)}. Last upload was ${Math.round(cadence.daysSinceLast)} days ago.`
                : "Three uploads are needed before a schedule can be described."
            }
          />
          <InsightCard
            icon={UserPlus}
            accent={5}
            title="Subscriber conversion"
            value={conversion !== null ? conversion.toFixed(1) + " / 1k" : "No views yet"}
            body={
              conversion !== null
                ? `${formatNumber(analytics.subscribersGained)} subscribers from ${formatNumber(analytics.views)} views. This is independent of how big the channel already is.`
                : "Needs views in the period to calculate."
            }
          />
          <InsightCard
            icon={CalendarDays}
            accent={4}
            title="Best publishing day"
            value={bestDay ? bestDay.day : "Not enough of a pattern"}
            body={
              bestDay
                ? `Uploads on ${bestDay.day} average ${formatCount(Math.round(bestDay.averageViews))} views across ${bestDay.sampleSize} videos.`
                : "At least two uploads on the same weekday are needed before this is a pattern rather than one video."
            }
          />
          <InsightCard
            icon={Activity}
            accent={1}
            title="Typical video"
            value={formatCount(Math.round(averages.medianViews))}
            body={`Median views across your last ${averages.videoCount} uploads. The median is used rather than the mean so one breakout does not make everything else look like a failure. Mean is ${formatCount(Math.round(averages.meanViews))}.`}
          />
          <InsightCard
            icon={Gauge}
            accent={6}
            title="Retention"
            value={
              analytics.averageViewPercentage > 0
                ? formatPercent(analytics.averageViewPercentage / 100)
                : "No data"
            }
            body={`Viewers watch ${formatDuration(analytics.averageViewDuration)} of an average video. Per-video retention curves live on the Retention page.`}
          />
        </div>
      </section>

      {topVideos.length > 0 && (
        <section className="bg-card rounded-xl border p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">Top uploads by views</h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Bars share one scale, so lengths are directly comparable
              </p>
            </div>
            <DownloadButton
              rows={videoExportRows}
              filename="viewly-videos"
              label="Export videos"
            />
          </div>

          <BarChart
            data={topVideos.map((v) => {
              const performance = videoPerformance(v, averages.medianViews);
              const engagement = engagementRate(v);
              return {
                label: v.title,
                value: v.viewCount ?? 0,
                meta: [
                  performance
                    ? `${performance.ratio.toFixed(1)}x your median`
                    : null,
                  engagement !== null
                    ? `${formatPercent(engagement, 2)} engagement`
                    : null,
                  v.durationSeconds ? formatDuration(v.durationSeconds) : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              };
            })}
            format="compact"
          />
        </section>
      )}

      {/* A table view is the accessibility backstop: every value in the charts is
          readable here without relying on colour or hover. */}
      <details className="bg-card rounded-xl border">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium sm:px-6">
          View raw daily data ({analytics.daily.length} rows)
        </summary>
        <div className="max-h-96 overflow-auto border-t">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="text-muted-foreground text-left text-xs">
                <th className="px-4 py-2 font-medium sm:px-6">Date</th>
                <th className="px-4 py-2 text-right font-medium">Views</th>
                <th className="px-4 py-2 text-right font-medium sm:px-6">Watch minutes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {analytics.daily.map((d) => (
                <tr key={d.date}>
                  <td className="px-4 py-1.5 tabular-nums sm:px-6">{d.date}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">
                    {formatNumber(d.views)}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums sm:px-6">
                    {formatNumber(Math.round(d.watchTimeMinutes))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="text-muted-foreground text-xs">
        <Badge variant="outline" className="mr-2">
          0 quota
        </Badge>
        Derived entirely from the daily snapshot. Opening this page makes no YouTube
        API calls.
      </p>
    </div>
  );
}

/**
 * One derived insight. Same colour discipline as the stat tiles: the accent lives
 * in the icon chip and a left rule, never in the value or the explanation.
 */
function InsightCard({
  title,
  value,
  body,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  body: string;
  icon: LucideIcon;
  accent: Accent;
}) {
  const color = ACCENT_VARS[accent];

  return (
    <div className="group bg-card hover:border-foreground/15 relative overflow-hidden rounded-xl border p-4 transition-all hover:shadow-sm sm:p-5">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5 opacity-70 transition-opacity group-hover:opacity-100"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {title}
        </p>
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` }}
        >
          <Icon className="size-3.5" style={{ color }} />
        </span>
      </div>
      <p className="mt-1.5 text-lg font-semibold tracking-tight">{value}</p>
      <p className="text-muted-foreground mt-2 text-xs leading-relaxed text-pretty">
        {body}
      </p>
    </div>
  );
}

const ACCENT_VARS: Record<Accent, string> = {
  1: "var(--viz-1)",
  2: "var(--viz-2)",
  3: "var(--viz-3)",
  4: "var(--viz-4)",
  5: "var(--viz-5)",
  6: "var(--viz-6)",
};
