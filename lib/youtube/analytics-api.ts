import "server-only";

/**
 * YouTube Analytics API wrapper (Part 5).
 *
 * Unlike the Data API, these calls need the channel owner's OAuth token: this is
 * private performance data, readable only by the creator who granted consent.
 *
 * The Analytics API bills against its own quota, separate from the Data API's
 * ~10,000 units. Calls are still recorded through the tracker (at 0 Data API units)
 * because the per-user daily cap in the rate limiter counts them, which is what
 * stops a polling bug in the browser from hammering Google.
 */
import { google, type youtubeAnalytics_v2 } from "googleapis";
import { authorizedClient } from "@/lib/youtube/oauth";
import { recordCall } from "@/lib/quota/tracker";
import type { AnalyticsSummary, DateRange, RetentionCurve } from "@/types/youtube";

async function analyticsApi(userId: string): Promise<youtubeAnalytics_v2.Youtubeanalytics> {
  const auth = await authorizedClient(userId);
  return google.youtubeAnalytics({ version: "v2", auth });
}

/** Rows come back as a matrix plus a column header list, so index by header name. */
function columnIndex(
  headers: youtubeAnalytics_v2.Schema$ResultTableColumnHeader[] | undefined,
  name: string,
): number {
  return (headers ?? []).findIndex((h) => h.name === name);
}

function cell(row: unknown[], index: number): number {
  if (index < 0) return 0;
  const n = Number(row[index]);
  return Number.isFinite(n) ? n : 0;
}

export function defaultDateRange(days = 28, now: Date = new Date()): DateRange {
  const end = new Date(now);
  // YouTube Analytics lags by up to 2 days, so "yesterday" is often still empty.
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

/**
 * Channel-level performance over a date range, broken down by day.
 *
 * `ids: "channel==MINE"` scopes the query to the token holder's own channel, which
 * is the only channel this token can read. Totals are summed from the daily rows
 * rather than issued as a second query, saving a call.
 */
export async function getChannelAnalytics(
  userId: string,
  dateRange: DateRange = defaultDateRange(),
): Promise<AnalyticsSummary> {
  const api = await analyticsApi(userId);

  const res = await api.reports.query({
    ids: "channel==MINE",
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    metrics: [
      "views",
      "estimatedMinutesWatched",
      "averageViewDuration",
      "averageViewPercentage",
      "subscribersGained",
      "subscribersLost",
    ].join(","),
    dimensions: "day",
    sort: "day",
  });
  await recordCall("reports.query", userId);

  const headers = res.data.columnHeaders ?? undefined;
  const iDay = columnIndex(headers, "day");
  const iViews = columnIndex(headers, "views");
  const iWatch = columnIndex(headers, "estimatedMinutesWatched");
  const iAvgDur = columnIndex(headers, "averageViewDuration");
  const iAvgPct = columnIndex(headers, "averageViewPercentage");
  const iGained = columnIndex(headers, "subscribersGained");
  const iLost = columnIndex(headers, "subscribersLost");

  const rows = (res.data.rows ?? []) as unknown[][];

  const daily = rows.map((row) => ({
    date: String(row[iDay] ?? ""),
    views: cell(row, iViews),
    watchTimeMinutes: cell(row, iWatch),
  }));

  const views = rows.reduce((sum, r) => sum + cell(r, iViews), 0);
  const estimatedMinutesWatched = rows.reduce((sum, r) => sum + cell(r, iWatch), 0);

  // Averages must be weighted by that day's views, not averaged across days. An
  // unweighted mean lets a single quiet day distort the figure badly.
  const weighted = (index: number) => {
    const total = rows.reduce((sum, r) => sum + cell(r, iViews) * cell(r, index), 0);
    return views > 0 ? total / views : 0;
  };

  return {
    dateRange,
    views,
    estimatedMinutesWatched,
    averageViewDuration: weighted(iAvgDur),
    averageViewPercentage: weighted(iAvgPct),
    subscribersGained: rows.reduce((sum, r) => sum + cell(r, iGained), 0),
    subscribersLost: rows.reduce((sum, r) => sum + cell(r, iLost), 0),
    daily,
  };
}

/**
 * Audience retention curve for one video.
 *
 * Returns the raw curve, deliberately not a summary: Part 8.1's diagnostics layer
 * needs every point to find the steepest drop, and a pre-summarised value would
 * throw away exactly the information it exists to analyse.
 *
 * elapsedVideoTimeRatio arrives as 0.00, 0.01 ... 1.00, so roughly 101 points
 * regardless of video length.
 */
export async function getAudienceRetention(
  userId: string,
  videoId: string,
  durationSeconds = 0,
): Promise<RetentionCurve> {
  const api = await analyticsApi(userId);

  const res = await api.reports.query({
    ids: "channel==MINE",
    // A wide window: retention is cumulative over a video's life, and a short range
    // on an older upload returns almost nothing.
    startDate: "2005-02-14", // YouTube's founding date, the documented earliest bound
    endDate: new Date().toISOString().slice(0, 10),
    metrics: ["audienceWatchRatio", "relativeRetentionPerformance"].join(","),
    dimensions: "elapsedVideoTimeRatio",
    filters: `video==${videoId}`,
    sort: "elapsedVideoTimeRatio",
  });
  await recordCall("reports.query", userId);

  const headers = res.data.columnHeaders ?? undefined;
  const iRatio = columnIndex(headers, "elapsedVideoTimeRatio");
  const iWatch = columnIndex(headers, "audienceWatchRatio");
  const iRelative = columnIndex(headers, "relativeRetentionPerformance");

  const rows = (res.data.rows ?? []) as unknown[][];

  return {
    videoId,
    durationSeconds,
    points: rows.map((row) => ({
      elapsedVideoTimeRatio: cell(row, iRatio),
      audienceWatchRatio: cell(row, iWatch),
      relativeRetentionPerformance: cell(row, iRelative),
    })),
  };
}

/** Per-video totals for the sync snapshot, one call for the whole set. */
export async function getVideoPerformance(
  userId: string,
  videoIds: string[],
  dateRange: DateRange = defaultDateRange(),
): Promise<Map<string, { views: number; averageViewPercentage: number }>> {
  const out = new Map<string, { views: number; averageViewPercentage: number }>();
  if (videoIds.length === 0) return out;

  const api = await analyticsApi(userId);

  const res = await api.reports.query({
    ids: "channel==MINE",
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    metrics: ["views", "averageViewPercentage"].join(","),
    dimensions: "video",
    // The filters list caps at 500 entries; a snapshot never approaches that.
    filters: `video==${videoIds.slice(0, 200).join(",")}`,
  });
  await recordCall("reports.query", userId);

  const headers = res.data.columnHeaders ?? undefined;
  const iVideo = columnIndex(headers, "video");
  const iViews = columnIndex(headers, "views");
  const iPct = columnIndex(headers, "averageViewPercentage");

  for (const row of (res.data.rows ?? []) as unknown[][]) {
    const id = String(row[iVideo] ?? "");
    if (!id) continue;
    out.set(id, { views: cell(row, iViews), averageViewPercentage: cell(row, iPct) });
  }

  return out;
}
