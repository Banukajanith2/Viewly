/**
 * Creator insights: the derived numbers a dashboard should state outright rather
 * than leaving the reader to compute from a table.
 *
 * Everything here is pure and derived from data already in the daily snapshot, so
 * none of it costs a single YouTube API unit. That constraint is the point: an
 * insight worth showing every day cannot be one that spends quota every day.
 *
 * No "server-only" or Firestore imports, so this module can be exercised directly
 * with node and is safe to import from client components.
 */
import type { AnalyticsSummary, VideoSummary } from "@/types/youtube";

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------- engagement */

/**
 * Likes plus comments as a share of views.
 *
 * Deliberately not likes alone: a comment is a much stronger signal of interest, and
 * counting only likes flatters videos that are pleasant but forgettable. Returns
 * null rather than 0 when there are no views, because "no data" and "nobody engaged"
 * are different claims and a 0% badge on a brand-new upload is simply wrong.
 */
export function engagementRate(video: VideoSummary): number | null {
  const views = video.viewCount ?? 0;
  if (views <= 0) return null;
  return ((video.likeCount ?? 0) + (video.commentCount ?? 0)) / views;
}

/* --------------------------------------------------------------- averages */

export interface ChannelAverages {
  meanViews: number;
  /** Median is the honest centre: one viral upload drags the mean far above typical. */
  medianViews: number;
  totalViews: number;
  videoCount: number;
}

export function channelAverages(videos: VideoSummary[]): ChannelAverages {
  const views = videos.map((v) => v.viewCount ?? 0).sort((a, b) => a - b);
  if (views.length === 0) {
    return { meanViews: 0, medianViews: 0, totalViews: 0, videoCount: 0 };
  }

  const total = views.reduce((a, b) => a + b, 0);
  const mid = Math.floor(views.length / 2);
  const median =
    views.length % 2 === 0 ? (views[mid - 1] + views[mid]) / 2 : views[mid];

  return {
    meanViews: total / views.length,
    medianViews: median,
    totalViews: total,
    videoCount: views.length,
  };
}

export type PerformanceBand = "over" | "typical" | "under";

export interface VideoPerformance {
  videoId: string;
  ratio: number;
  band: PerformanceBand;
}

/**
 * How a video did against the channel's own median.
 *
 * Measured against the median rather than the mean so a single breakout upload does
 * not make every other video look like a failure.
 */
export function videoPerformance(
  video: VideoSummary,
  medianViews: number,
): VideoPerformance | null {
  if (medianViews <= 0) return null;

  const ratio = (video.viewCount ?? 0) / medianViews;
  const band: PerformanceBand = ratio >= 1.5 ? "over" : ratio <= 0.5 ? "under" : "typical";
  return { videoId: video.videoId, ratio, band };
}

/* ----------------------------------------------------------------- cadence */

export interface UploadCadence {
  /** Mean days between consecutive uploads. */
  averageDays: number;
  /** Days since the most recent upload. */
  daysSinceLast: number;
  /**
   * Standard deviation of the gaps. Low means a predictable schedule, which is what
   * actually builds a returning audience.
   */
  consistencyDays: number;
  sampleSize: number;
}

export function uploadCadence(
  videos: VideoSummary[],
  now: Date = new Date(),
): UploadCadence | null {
  // Two uploads give exactly one gap, which has no meaningful spread. Three is the
  // minimum for the consistency figure to say anything.
  if (videos.length < 3) return null;

  const times = videos
    .map((v) => new Date(v.publishedAt).getTime())
    .sort((a, b) => b - a);

  const gaps: number[] = [];
  for (let i = 0; i < times.length - 1; i++) {
    gaps.push((times[i] - times[i + 1]) / DAY_MS);
  }

  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((sum, g) => sum + (g - mean) ** 2, 0) / gaps.length;

  return {
    averageDays: mean,
    daysSinceLast: Math.max(0, (now.getTime() - times[0]) / DAY_MS),
    consistencyDays: Math.sqrt(variance),
    sampleSize: gaps.length,
  };
}

/* ---------------------------------------------------------------- momentum */

export interface Momentum {
  recent: number;
  previous: number;
  /** Fractional change. 0.25 means up a quarter. Null when there is no baseline. */
  change: number | null;
  days: number;
}

/**
 * The most recent N days against the N before them.
 *
 * A creator cares whether things are moving, and a 28 day total cannot answer that.
 * Returns null change when the previous window is empty, because any percentage
 * against a zero baseline is infinite and meaningless.
 */
export function momentum(daily: AnalyticsSummary["daily"], days = 7): Momentum | null {
  if (daily.length < days * 2) return null;

  const sum = (rows: AnalyticsSummary["daily"]) =>
    rows.reduce((total, row) => total + row.views, 0);

  const recent = sum(daily.slice(-days));
  const previous = sum(daily.slice(-days * 2, -days));

  return {
    recent,
    previous,
    change: previous > 0 ? (recent - previous) / previous : null,
    days,
  };
}

/* ------------------------------------------------------------ publish day */

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

export interface PublishDayInsight {
  day: string;
  averageViews: number;
  sampleSize: number;
}

/**
 * Which weekday this creator's uploads have done best on.
 *
 * Requires at least two uploads on the winning day. With a single sample this is
 * not a pattern, it is one video, and presenting it as advice would be misleading.
 */
export function bestPublishDay(videos: VideoSummary[]): PublishDayInsight | null {
  const byDay = new Map<number, number[]>();

  for (const video of videos) {
    const day = new Date(video.publishedAt).getUTCDay();
    const list = byDay.get(day) ?? [];
    list.push(video.viewCount ?? 0);
    byDay.set(day, list);
  }

  let best: PublishDayInsight | null = null;

  for (const [day, views] of byDay) {
    if (views.length < 2) continue;
    const average = views.reduce((a, b) => a + b, 0) / views.length;
    if (!best || average > best.averageViews) {
      best = { day: WEEKDAYS[day], averageViews: average, sampleSize: views.length };
    }
  }

  return best;
}

/* ------------------------------------------------------------- conversion */

/**
 * Subscribers gained per 1,000 views: how well the content converts a viewer into a
 * follower, independent of how big the channel already is.
 */
export function subscriberConversion(
  subscribersGained: number,
  views: number,
): number | null {
  if (views <= 0) return null;
  return (subscribersGained / views) * 1000;
}

/* ------------------------------------------------------------ consistency */

/**
 * Plain-language reading of the cadence spread, for a creator not a statistician.
 *
 * Thresholds are on the coefficient of variation (spread divided by mean gap), so
 * they mean the same thing for a daily poster and a monthly one.
 *
 * Calibrated against real shapes rather than picked by feel: gaps of 1, 92 and 119
 * days give a CV of 0.71, which any creator would call irregular, so the upper
 * boundary sits below that. A weekly schedule that slips by a couple of days each
 * way lands near 0.12 to 0.23 and should still read as very consistent.
 */
export function describeConsistency(cadence: UploadCadence): string {
  const ratio = cadence.averageDays > 0 ? cadence.consistencyDays / cadence.averageDays : 0;
  if (ratio < 0.25) return "Very consistent";
  if (ratio < 0.5) return "Fairly consistent";
  return "Irregular";
}
