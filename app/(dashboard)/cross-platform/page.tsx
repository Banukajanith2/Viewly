import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Heart, Layers, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/dashboard/stat-tile";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DownloadButton } from "@/components/dashboard/download-button";
import { BarChart } from "@/components/charts/bar-chart";
import { PostForm } from "@/components/cross-platform/post-form";
import { PostRowActions } from "@/components/cross-platform/post-row-actions";
import { requireUser } from "@/lib/auth/session";
import { getLatestSnapshot, listCrossPlatformPosts } from "@/lib/firebase/firestore";
import { PLATFORM_LABELS, summariseByPlatform } from "@/lib/insights/cross-platform";
import type { Platform } from "@/lib/insights/cross-platform";
import { channelAverages } from "@/lib/insights/creator";
import { formatCount, formatNumber } from "@/lib/utils/formatters";

export const metadata: Metadata = { title: "Cross-platform" };

/**
 * Cross-platform performance (Part 8.5).
 *
 * Manual entry, no external APIs. Nothing on this page costs quota, which is why
 * it reads Firestore directly rather than going through the KV cache: the data is
 * small, per user, and changes the moment the creator types something in.
 */
export default async function CrossPlatformPage() {
  const user = await requireUser();
  const [posts, snapshot] = await Promise.all([
    listCrossPlatformPosts(user.uid),
    getLatestSnapshot(user.uid),
  ]);

  const summaries = summariseByPlatform(posts);
  const totals = {
    views: posts.reduce((a, p) => a + p.views, 0),
    likes: posts.reduce((a, p) => a + p.likes, 0),
    comments: posts.reduce((a, p) => a + p.comments, 0),
  };

  // YouTube is shown alongside, from the snapshot that already exists. Comparing
  // averages rather than totals: a creator with 40 TikToks and 3 YouTube uploads
  // will always have a bigger TikTok total, and reading that as "TikTok wins" is
  // the wrong conclusion. Average views per post is the comparable number.
  const yt = snapshot ? channelAverages(snapshot.recentVideos) : null;

  const comparison = [
    ...(yt && yt.videoCount > 0
      ? [
          {
            label: "YouTube",
            value: Math.round(yt.meanViews),
            meta: `${yt.videoCount} recent uploads`,
          },
        ]
      : []),
    ...summaries.map((s) => ({
      label: PLATFORM_LABELS[s.platform],
      value: Math.round(s.averageViews),
      meta: `${s.posts} post${s.posts === 1 ? "" : "s"}`,
    })),
  ].sort((a, b) => b.value - a.value);

  const exportRows = posts.map((p) => ({
    platform: p.platform,
    posted_at: p.postedAt.slice(0, 10),
    title: p.title ?? "",
    url: p.url ?? "",
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    engagement_rate:
      p.views > 0 ? (((p.likes + p.comments) / p.views) * 100).toFixed(2) + "%" : "",
  }));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cross-platform</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Log what you post elsewhere and see it beside your YouTube numbers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {posts.length > 0 && (
            <DownloadButton rows={exportRows} filename="viewly-cross-platform" />
          )}
          <PostForm />
        </div>
      </header>

      {posts.length === 0 ? (
        <EmptyState
          title="Nothing logged yet"
          body="Viewly does not connect to TikTok or Instagram, so these numbers are entered by hand. Add a post and it appears here next to your YouTube performance."
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={Layers}
              accent={1}
              label="Posts logged"
              value={formatNumber(posts.length)}
              hint={`Across ${summaries.length} platform${summaries.length === 1 ? "" : "s"}`}
            />
            <StatTile
              icon={BarChart3}
              accent={2}
              label="Off-YouTube views"
              value={formatCount(totals.views)}
              hint={formatNumber(totals.views) + " total"}
            />
            <StatTile
              icon={Heart}
              accent={3}
              label="Likes"
              value={formatCount(totals.likes)}
              hint={
                totals.views > 0
                  ? `${((totals.likes / totals.views) * 100).toFixed(1)}% of views`
                  : "No views logged yet"
              }
            />
            <StatTile
              icon={MessageSquare}
              accent={4}
              label="Comments"
              value={formatCount(totals.comments)}
              hint={
                totals.views > 0
                  ? `${((totals.comments / totals.views) * 100).toFixed(2)}% of views`
                  : "No views logged yet"
              }
            />
          </section>

          {comparison.length > 1 && (
            <section className="bg-card rounded-xl border p-4 sm:p-6">
              <h2 className="mb-1 text-sm font-medium">Average views per post</h2>
              <p className="text-muted-foreground mb-4 text-xs">
                Averages, not totals: whichever platform you post to most would always
                win on totals, which says nothing about which one is working.
              </p>
              <BarChart data={comparison} format="compact" />
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-medium">By platform</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {summaries.map((s) => (
                <li key={s.platform} className="bg-card rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {PLATFORM_LABELS[s.platform as Platform]}
                    </span>
                    <Badge variant="secondary">
                      {s.posts} post{s.posts === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <dl className="text-muted-foreground mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <Stat label="Avg views">{formatCount(Math.round(s.averageViews))}</Stat>
                    <Stat label="Total views">{formatCount(s.views)}</Stat>
                    <Stat label="Likes">{formatCount(s.likes)}</Stat>
                    <Stat label="Engagement">
                      {s.engagementRate === null
                        ? "n/a"
                        : `${(s.engagementRate * 100).toFixed(1)}%`}
                    </Stat>
                  </dl>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium">All logged posts</h2>
            <ul className="divide-y overflow-hidden rounded-xl border">
              {posts.map((p) => (
                <li
                  key={p.postId}
                  className="bg-card flex items-center gap-4 p-3 text-sm"
                >
                  <Badge variant="outline" className="shrink-0">
                    {PLATFORM_LABELS[p.platform as Platform]}
                  </Badge>

                  <div className="min-w-0 flex-1">
                    {p.url ? (
                      <Link
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="line-clamp-1 font-medium hover:underline"
                      >
                        {p.title || "Untitled post"}
                      </Link>
                    ) : (
                      <span className="line-clamp-1 font-medium">
                        {p.title || "Untitled post"}
                      </span>
                    )}
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {p.postedAt.slice(0, 10)}
                    </p>
                  </div>

                  <dl className="text-muted-foreground hidden shrink-0 gap-5 text-xs sm:flex">
                    <Stat label="views">{formatCount(p.views)}</Stat>
                    <Stat label="likes">{formatCount(p.likes)}</Stat>
                    <Stat label="comments">{formatCount(p.comments)}</Stat>
                  </dl>

                  <PostRowActions postId={p.postId} label={p.title || "this post"} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <p className="text-muted-foreground text-xs">
        <Badge variant="outline" className="mr-2">
          Manual entry
        </Badge>
        Viewly does not connect to TikTok, Instagram or X. These numbers are the ones
        you type in, stored only on your own account.
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
