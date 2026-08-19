"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { TrendChart, type TrendPoint, type ValueFormat } from "@/components/charts/trend-chart";
import { RangeFilter, type RangeDays } from "@/components/charts/range-filter";
import { DownloadButton } from "@/components/dashboard/download-button";
import { fetchJson } from "@/lib/utils/fetch-json";
import type { AnalyticsSummary } from "@/types/youtube";

/**
 * A filterable chart.
 *
 * The range control is split by cost, which is the whole design:
 *
 *  - Ranges inside the cached snapshot are sliced client-side. Instant, and free.
 *  - Longer ranges need a live Analytics call, so they are fetched on demand and
 *    counted against the user's daily cap by the route.
 *
 * Fetching every range up front would spend the allowance on data nobody asked to
 * see. Fetched ranges are kept for the session, so flipping back and forth between
 * two ranges costs one call each, not one per click.
 */

type Metric = "views" | "watchTimeMinutes";

export function TrendPanel({
  title,
  subtitle,
  cached,
  metric,
  label,
  format,
  exportName,
}: {
  title: string;
  subtitle?: string;
  /** The snapshot's analytics, already on the page. */
  cached: AnalyticsSummary;
  metric: Metric;
  label: string;
  format: ValueFormat;
  exportName: string;
}) {
  const cachedDays = cached.daily.length;

  const [range, setRange] = useState<RangeDays>(cachedDays >= 28 ? 28 : 7);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState<Record<number, AnalyticsSummary>>({});

  const active = range <= cachedDays ? cached : fetched[range];

  async function choose(days: RangeDays) {
    setRange(days);
    if (days <= cachedDays || fetched[days]) return;

    setLoading(true);
    try {
      const body = await fetchJson<{ analytics: AnalyticsSummary }>(
        `/api/channel/analytics?days=${days}&live=1`,
      );
      setFetched((prev) => ({ ...prev, [days]: body.analytics }));
    } catch {
      // fetchJson raised the toast, including a 429 with its wait time. Fall back
      // to the cached window rather than leaving the chart blank.
      setRange(cachedDays >= 28 ? 28 : 7);
    } finally {
      setLoading(false);
    }
  }

  // Slicing from the end keeps the most recent days, which is what a shorter range
  // means to a creator.
  const rows = active ? active.daily.slice(-range) : [];
  const points: TrendPoint[] = rows.map((d) => ({
    date: d.date,
    value: metric === "views" ? d.views : Math.round(d.watchTimeMinutes),
  }));

  const total = points.reduce((sum, p) => sum + p.value, 0);

  return (
    <section className="bg-card rounded-xl border p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {loading
              ? "Loading a longer range..."
              : `${points.length} days · ${total.toLocaleString()} ${label.toLowerCase()}`}
            {subtitle ? ` · ${subtitle}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <RangeFilter
            value={range}
            onChange={choose}
            cachedDays={cachedDays}
            disabled={loading}
          />
          <DownloadButton
            rows={points.map((p) => ({ date: p.date, [metric]: p.value }))}
            filename={exportName}
            label="CSV"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground flex h-[220px] items-center justify-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Fetching {range >= 3650 ? "all time" : `${range} days`} from YouTube
        </div>
      ) : points.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          No data for this range.
        </p>
      ) : (
        <TrendChart data={points} label={label} format={format} />
      )}
    </section>
  );
}
