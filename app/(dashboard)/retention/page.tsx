import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  OctagonAlert,
  Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/dashboard/stat-tile";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DownloadButton } from "@/components/dashboard/download-button";
import { RetentionChart } from "@/components/charts/retention-chart";
import { DiagnoseButton } from "@/components/retention/diagnose-button";
import { requireUser } from "@/lib/auth/session";
import { getLatestSnapshot, getUserProfile } from "@/lib/firebase/firestore";
import { cacheKeys, get as cacheGet } from "@/lib/cache/kv";
import { steepestDrop, formatTimestamp, retentionAt } from "@/lib/insights/retention";
import type { FindingSeverity, RetentionFinding, AveragedCurve } from "@/lib/insights/retention";
import { formatRelativeTime } from "@/lib/utils/formatters";

export const metadata: Metadata = { title: "Retention" };

interface CachedDiagnosis {
  findings: RetentionFinding[];
  averaged: AveragedCurve | null;
  videos: Array<{ videoId: string; title: string; durationSeconds: number; hasData: boolean }>;
  computedAt: string;
}

/**
 * Retention (Part 8.1).
 *
 * Reads the cached diagnosis only. Computing it costs one analytics call per
 * upload, so a page load must never trigger it: the user asks for it with the
 * button, and the result is cached for a day. Same shape as competitor discovery,
 * for the same quota reason.
 */
export default async function RetentionPage() {
  const user = await requireUser();
  const [profile, snapshot, cached] = await Promise.all([
    getUserProfile(user.uid),
    getLatestSnapshot(user.uid),
    cacheGet<CachedDiagnosis>(cacheKeys.retention(user.uid)),
  ]);

  if (!profile?.channelId) {
    return (
      <EmptyState
        title="Connect your YouTube channel"
        body="Retention comes from your own watch data, so Viewly needs your channel first."
        action={{ href: "/settings", label: "Connect YouTube" }}
      />
    );
  }

  const uploads = snapshot?.recentVideos ?? [];
  if (uploads.length === 0) {
    return (
      <EmptyState
        title="No uploads to analyse yet"
        body="Retention diagnostics read your last few videos. Publish something and this fills in after the next sync."
        action={{ href: "/overview", label: "Back to overview" }}
      />
    );
  }

  const analysed = Math.min(5, uploads.length);
  const averaged = cached?.averaged ?? null;

  // Recomputed here rather than stored, so the annotation always matches the curve
  // being drawn even if the diagnostics change shape between deploys.
  const cliff = averaged ? steepestDrop(averaged.points, averaged.meanDurationSeconds) : null;
  const hookFinding = cached?.findings.find((f) => f.id === "hook");

  const exportRows = (averaged?.points ?? []).map((p) => ({
    elapsed_ratio: p.elapsedVideoTimeRatio.toFixed(2),
    elapsed_seconds: averaged?.durationsComparable
      ? Math.round(p.elapsedVideoTimeRatio * averaged.meanDurationSeconds)
      : "",
    audience_watch_ratio: p.audienceWatchRatio.toFixed(4),
    percent_watching: Math.round(p.audienceWatchRatio * 100),
  }));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Retention</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Where viewers leave, across your last {analysed} upload
            {analysed === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {exportRows.length > 0 && (
            <DownloadButton rows={exportRows} filename="viewly-retention" />
          )}
          <DiagnoseButton videoCount={analysed} hasResult={Boolean(cached)} />
        </div>
      </header>

      {!cached ? (
        <EmptyState
          title="Not analysed yet"
          body={`Viewly reads the retention curve for each of your last ${analysed} uploads and works out where you lose people. That costs ${analysed} of your daily analytics calls, so it only runs when you ask.`}
        />
      ) : (
        <>
          <p className="text-muted-foreground bg-muted/50 rounded-lg border px-4 py-3 text-sm">
            Analysed {formatRelativeTime(cached.computedAt)} across{" "}
            {cached.videos.filter((v) => v.hasData).length} upload
            {cached.videos.filter((v) => v.hasData).length === 1 ? "" : "s"} with watch
            data. Cached for a day, so opening this page again spends nothing.
          </p>

          {/* Findings first. The chart is evidence for them, not the other way round:
              a creator opening this page wants to know what to fix, and a curve does
              not answer that on its own. */}
          <section className="space-y-3">
            <h2 className="text-sm font-medium">What the data says</h2>
            {cached.findings.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </section>

          {averaged && averaged.points.length > 0 && (
            <>
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatTile
                  icon={Timer}
                  accent={1}
                  label="Held at the hook"
                  value={`${Math.round((retentionAt(averaged.points, hookFinding?.atRatio ?? 0.05) ?? 0) * 100)}%`}
                  hint={
                    hookFinding?.atSeconds
                      ? `Still watching at ${formatTimestamp(hookFinding.atSeconds)}`
                      : "Still watching at the end of the opening"
                  }
                />
                <StatTile
                  icon={Clock}
                  accent={2}
                  label="Reach halfway"
                  value={`${Math.round((retentionAt(averaged.points, 0.5) ?? 0) * 100)}%`}
                  hint="Share of viewers still there at the midpoint"
                />
                <StatTile
                  icon={AlertTriangle}
                  accent={4}
                  label="Steepest drop"
                  value={cliff ? `${Math.round(cliff.drop * 100)}%` : "None found"}
                  hint={
                    cliff && averaged.durationsComparable
                      ? `Between ${formatTimestamp(cliff.startSeconds)} and ${formatTimestamp(cliff.endSeconds)}`
                      : cliff
                        ? `Between ${Math.round(cliff.startRatio * 100)}% and ${Math.round(cliff.endRatio * 100)}% through`
                        : "No single cliff stands out"
                  }
                />
              </section>

              <section className="bg-card rounded-xl border p-4 sm:p-6">
                <h2 className="mb-1 text-sm font-medium">Average retention curve</h2>
                <p className="text-muted-foreground mb-4 text-xs">
                  Averaged across {averaged.videoCount} upload
                  {averaged.videoCount === 1 ? "" : "s"}.
                  {averaged.durationsComparable
                    ? " Your uploads are close enough in length that the timeline below is meaningful."
                    : " Your uploads vary a lot in length, so the axis is shown as a percentage of each video rather than a time."}
                </p>
                <RetentionChart
                  points={averaged.points}
                  durationSeconds={averaged.durationsComparable ? averaged.meanDurationSeconds : 0}
                  hookRatio={hookFinding?.atRatio}
                  cliff={cliff}
                />
              </section>
            </>
          )}

          <section>
            <h2 className="mb-3 text-sm font-medium">Uploads analysed</h2>
            <ul className="divide-y overflow-hidden rounded-xl border">
              {cached.videos.map((v) => (
                <li
                  key={v.videoId}
                  className="bg-card flex items-center justify-between gap-4 p-3 text-sm"
                >
                  <Link
                    href={`https://www.youtube.com/watch?v=${v.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {v.title}
                  </Link>
                  {/* States plainly why a video contributed nothing, rather than
                      letting it look like a zero. */}
                  <Badge variant={v.hasData ? "secondary" : "outline"} className="shrink-0">
                    {v.hasData ? "Included" : "Too few views"}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Clock className="size-3.5" />
        Retention is read on demand and cached for a day, so this page costs nothing
        to open.
      </p>
    </div>
  );
}

const SEVERITY: Record<
  FindingSeverity,
  { icon: typeof Info; color: string; label: string }
> = {
  critical: { icon: OctagonAlert, color: "var(--viz-critical)", label: "Fix first" },
  warning: { icon: AlertTriangle, color: "var(--viz-warning)", label: "Worth a look" },
  good: { icon: CheckCircle2, color: "var(--viz-good)", label: "Working" },
  info: { icon: Info, color: "var(--muted-foreground)", label: "Context" },
};

/**
 * One finding.
 *
 * The severity is carried by an icon and a word as well as the colour. Red and
 * green sit at oklab dE 0.09 under deuteranopia, which is not enough on its own,
 * and a diagnosis that a reader cannot rank is not a diagnosis.
 */
function FindingCard({ finding }: { finding: RetentionFinding }) {
  const { icon: Icon, color, label } = SEVERITY[finding.severity];

  return (
    <div className="bg-card relative overflow-hidden rounded-xl border p-4">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` }}
        >
          <Icon className="size-3.5" style={{ color }} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{finding.headline}</p>
            <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
              {label}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{finding.detail}</p>
        </div>
      </div>
    </div>
  );
}
