/**
 * Retention bottleneck diagnostics (Part 8.1).
 *
 * A retention curve plotted raw tells a creator almost nothing: everyone's curve
 * slopes down, so the shape alone never says whether this one is bad or where the
 * fixable moment is. This module turns the curve into statements a creator can act
 * on, which is the whole point of the feature.
 *
 * No "server-only", Firestore or googleapis imports, so it can be exercised
 * directly with node and is safe to import from a client component. Same rule as
 * lib/youtube/keywords.ts and lib/insights/creator.ts. Keep it that way.
 */
import type { RetentionCurve } from "@/types/youtube";

/* --------------------------------------------------------------- constants */

/**
 * The window used to look for a cliff, as a share of the video.
 *
 * A single 1% step is mostly noise: YouTube samples at roughly 101 points, and
 * adjacent points on a low-view video swing by several percent for no reason a
 * creator could act on. Five percent is wide enough to be a real moment in the
 * video and narrow enough to still be a "moment" rather than "the second half".
 */
const CLIFF_WINDOW_RATIO = 0.05;

/**
 * How far into a video the "hook" runs.
 *
 * 15 seconds is the figure creators are used to hearing and matches where the
 * decision to keep watching is actually made on long-form. Shorts are handled
 * separately below, because 15 seconds can be most of the video.
 */
const HOOK_SECONDS = 15;

/**
 * Under this duration a video is treated as a Short, and the hook is expressed as
 * a share of the video rather than in seconds.
 */
const SHORT_MAX_SECONDS = 60;

/** For a Short, the hook is the opening quarter rather than a fixed 15 seconds. */
const SHORT_HOOK_RATIO = 0.25;

/**
 * Thresholds for calling a hook loss a problem.
 *
 * Calibrated to be actionable rather than flattering. Losing a quarter of the
 * audience before the content starts is normal and not worth an alert; losing
 * two fifths is the difference between a video that spreads and one that does
 * not, and it is nearly always the opening that causes it. These are judgement
 * calls stated openly, not measurements: they decide when Viewly interrupts
 * someone, so they are written down here rather than buried in a component.
 */
const HOOK_LOSS_CRITICAL = 0.4;
const HOOK_LOSS_WARNING = 0.25;

/**
 * A fall of this many percentage points inside one window is a cliff worth naming.
 *
 * Below roughly 10 points the "steepest" drop on a healthy curve is just the
 * normal slope, and pointing at it would send a creator chasing a moment that is
 * not actually a problem.
 */
const CLIFF_MIN_DROP = 0.1;

/**
 * relativeRetentionPerformance is 1.0 when a video holds viewers exactly as well
 * as other videos of similar length. Below this it is genuinely behind its peers,
 * not merely below average by rounding.
 */
const RELATIVE_UNDERPERFORMING = 0.9;

/* ------------------------------------------------------------------- types */

export type FindingSeverity = "critical" | "warning" | "good" | "info";

export interface RetentionFinding {
  /** Stable key, so the UI can order or suppress findings without string matching. */
  id: string;
  severity: FindingSeverity;
  /** One sentence, plain language, safe to show as a headline. */
  headline: string;
  /** The supporting number or explanation. */
  detail: string;
  /** Where in the video this applies, when it applies somewhere specific. */
  atRatio?: number;
  atSeconds?: number;
}

export interface AveragedCurve {
  points: Array<{ elapsedVideoTimeRatio: number; audienceWatchRatio: number }>;
  /** How many videos actually contributed data. */
  videoCount: number;
  /** Mean duration of the contributing videos, for converting a ratio to seconds. */
  meanDurationSeconds: number;
  /**
   * True when the contributing videos are close enough in length that a shared
   * ratio maps onto a comparable number of seconds.
   */
  durationsComparable: boolean;
}

export interface CliffWindow {
  startRatio: number;
  endRatio: number;
  /** Fall in watch ratio across the window, as a fraction (0.18 == 18 points). */
  drop: number;
  startSeconds: number;
  endSeconds: number;
}

/* --------------------------------------------------------------- utilities */

/** A curve is only usable if YouTube actually returned samples for it. */
export function hasRetentionData(curve: RetentionCurve): boolean {
  return curve.points.length > 1;
}

/**
 * Watch ratio at an arbitrary point through the video, interpolated.
 *
 * Interpolated rather than nearest-sample because the hook boundary (15 seconds)
 * almost never lands exactly on one of YouTube's sample points, and rounding to
 * the nearest 1% of a 40 second video moves the answer by up to a fifth of a
 * second either way.
 */
export function retentionAt(
  points: Array<{ elapsedVideoTimeRatio: number; audienceWatchRatio: number }>,
  ratio: number,
): number | null {
  if (points.length === 0) return null;

  const sorted = [...points].sort((a, b) => a.elapsedVideoTimeRatio - b.elapsedVideoTimeRatio);
  const target = Math.min(1, Math.max(0, ratio));

  if (target <= sorted[0].elapsedVideoTimeRatio) return sorted[0].audienceWatchRatio;
  const last = sorted[sorted.length - 1];
  if (target >= last.elapsedVideoTimeRatio) return last.audienceWatchRatio;

  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (target > b.elapsedVideoTimeRatio) continue;

    const span = b.elapsedVideoTimeRatio - a.elapsedVideoTimeRatio;
    if (span <= 0) return b.audienceWatchRatio;
    const t = (target - a.elapsedVideoTimeRatio) / span;
    return a.audienceWatchRatio + t * (b.audienceWatchRatio - a.audienceWatchRatio);
  }

  return last.audienceWatchRatio;
}

/**
 * Rebases a curve so the start is 1.0, meaning "everyone who began the video".
 *
 * This is NOT cosmetic. audienceWatchRatio compares views of a segment to total
 * views of the video, so a segment watched more than once per view scores above
 * 1.0. Shorts loop by default, and the real data from a Shorts channel starts at
 * about 1.20, not 1.00.
 *
 * Read raw, every derived number is then wrong in the same direction: a curve
 * sitting at 0.66 after the opening looks like a 34% loss against an assumed
 * baseline of 1.0, when against the 1.20 the video actually started at it is a 45%
 * loss. Understating losses is the worst possible direction for a diagnostic whose
 * whole job is to say where the problem is, so the baseline is taken from the data
 * rather than assumed. YouTube's own retention UI does the same thing.
 *
 * Rebasing happens per curve BEFORE averaging: a single heavily looped video would
 * otherwise pull the mean up and flatten everyone else's shape.
 */
function rebaseToStart(
  points: Array<{ elapsedVideoTimeRatio: number; audienceWatchRatio: number }>,
): Array<{ elapsedVideoTimeRatio: number; audienceWatchRatio: number }> {
  const sorted = [...points].sort((a, b) => a.elapsedVideoTimeRatio - b.elapsedVideoTimeRatio);
  const base = sorted[0]?.audienceWatchRatio ?? 0;
  // A zero or absent baseline carries no scale, so the curve is left untouched
  // rather than divided into infinity.
  if (!(base > 0)) return sorted;
  return sorted.map((p) => ({
    elapsedVideoTimeRatio: p.elapsedVideoTimeRatio,
    audienceWatchRatio: p.audienceWatchRatio / base,
  }));
}

/**
 * Mean curve across several videos, sampled on a shared grid.
 *
 * Averaging by RATIO rather than by seconds is what makes videos of different
 * lengths comparable at all, but it also means a shared x position is a different
 * real moment in each video. That is fine for finding a shape ("people leave
 * early") and misleading for a claim in seconds ("people leave at 0:15"), so the
 * result carries durationsComparable and the caller must respect it.
 *
 * Curves with no samples are dropped rather than counted as zeros: a video below
 * YouTube's reporting threshold has no data, and treating that as "nobody watched"
 * would drag the average toward a floor that nothing measured.
 */
export function averageRetentionCurve(curves: RetentionCurve[]): AveragedCurve | null {
  const usable = curves.filter(hasRetentionData);
  if (usable.length === 0) return null;

  // Rebased first, so every video contributes its shape rather than its loop count.
  const rebased = usable.map((c) => rebaseToStart(c.points));

  // A fixed grid, so videos with slightly different sample counts still align.
  const STEPS = 101;
  const points = Array.from({ length: STEPS }, (_, i) => {
    const ratio = i / (STEPS - 1);
    const values = rebased
      .map((pts) => retentionAt(pts, ratio))
      .filter((v): v is number => v !== null);
    return {
      elapsedVideoTimeRatio: ratio,
      audienceWatchRatio: values.reduce((a, b) => a + b, 0) / values.length,
    };
  });

  const durations = usable.map((c) => c.durationSeconds).filter((d) => d > 0);
  const meanDuration = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  // "Comparable" means the longest is at most twice the shortest. Beyond that,
  // one ratio spans wildly different numbers of seconds and a claim in seconds
  // would be an average of things that never happened.
  const durationsComparable =
    durations.length > 0 && Math.max(...durations) <= 2 * Math.min(...durations);

  return {
    points,
    videoCount: usable.length,
    meanDurationSeconds: meanDuration,
    durationsComparable,
  };
}

/**
 * The steepest sustained fall in the curve.
 *
 * Scans a sliding window rather than looking at single steps, so the answer is a
 * moment a creator can rewatch, not a sampling artefact. The opening of the video
 * is excluded because every curve falls hardest at the very start: reporting that
 * as the steepest drop would be true, useless, and would hide the real cliff
 * further in. The opening is reported separately as hook loss.
 */
export function steepestDrop(
  points: Array<{ elapsedVideoTimeRatio: number; audienceWatchRatio: number }>,
  durationSeconds: number,
  skipOpeningRatio = 0.05,
): CliffWindow | null {
  if (points.length < 3) return null;

  const sorted = [...points].sort((a, b) => a.elapsedVideoTimeRatio - b.elapsedVideoTimeRatio);
  let best: CliffWindow | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    if (start.elapsedVideoTimeRatio < skipOpeningRatio) continue;

    const endRatio = start.elapsedVideoTimeRatio + CLIFF_WINDOW_RATIO;
    if (endRatio > 1) break;

    const endValue = retentionAt(sorted, endRatio);
    if (endValue === null) continue;

    const drop = start.audienceWatchRatio - endValue;
    if (!best || drop > best.drop) {
      best = {
        startRatio: start.elapsedVideoTimeRatio,
        endRatio,
        drop,
        startSeconds: start.elapsedVideoTimeRatio * durationSeconds,
        endSeconds: endRatio * durationSeconds,
      };
    }
  }

  return best && best.drop > 0 ? best : null;
}

/** mm:ss, for talking about a position inside a video. */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* -------------------------------------------------------------- the layer */

/**
 * Plain-language findings across a creator's recent uploads.
 *
 * Ordered most severe first, because a list of findings is read from the top and
 * the one that costs the most views should not be third.
 *
 * Every finding either names a moment or names a number. A finding that says only
 * "your retention could be better" is noise dressed as insight, so there is
 * deliberately no such branch.
 */
export function diagnoseRetention(
  curves: RetentionCurve[],
  relativePerformance?: number | null,
): { findings: RetentionFinding[]; averaged: AveragedCurve | null } {
  const averaged = averageRetentionCurve(curves);
  const findings: RetentionFinding[] = [];

  if (!averaged) {
    return {
      averaged: null,
      findings: [
        {
          id: "no-data",
          severity: "info",
          headline: "Not enough watch data yet",
          detail:
            "YouTube only reports retention once a video has enough views. Keep publishing and this fills in on its own.",
        },
      ],
    };
  }

  const { points, meanDurationSeconds, videoCount, durationsComparable } = averaged;
  const isShort = meanDurationSeconds > 0 && meanDurationSeconds <= SHORT_MAX_SECONDS;

  /* ---- the hook ---- */

  const hookRatio =
    isShort || meanDurationSeconds === 0
      ? SHORT_HOOK_RATIO
      : Math.min(1, HOOK_SECONDS / meanDurationSeconds);

  const heldAtHook = retentionAt(points, hookRatio);
  if (heldAtHook !== null) {
    const lost = Math.max(0, 1 - heldAtHook);
    const pct = Math.round(lost * 100);
    const across = `across your last ${videoCount} upload${videoCount === 1 ? "" : "s"}`;

    // Only claim seconds when a shared ratio really is a shared moment.
    const where =
      durationsComparable && meanDurationSeconds > 0
        ? `the first ${Math.round(hookRatio * meanDurationSeconds)} seconds`
        : `the first ${Math.round(hookRatio * 100)}% of the video`;

    const severity: FindingSeverity =
      lost >= HOOK_LOSS_CRITICAL ? "critical" : lost >= HOOK_LOSS_WARNING ? "warning" : "good";

    findings.push(
      severity === "good"
        ? {
            id: "hook",
            severity,
            headline: `Your opening holds ${Math.round(heldAtHook * 100)}% of viewers`,
            detail: `You keep most people through ${where} ${across}. That is a strong hook, so changes are better spent later in the video.`,
            atRatio: hookRatio,
            atSeconds: durationsComparable ? hookRatio * meanDurationSeconds : undefined,
          }
        : {
            id: "hook",
            severity,
            headline: `You lose about ${pct}% of viewers in ${where}`,
            detail: `Measured ${across}. The opening is the highest-leverage thing to change, because every viewer lost here never reaches the rest of the video.`,
            atRatio: hookRatio,
            atSeconds: durationsComparable ? hookRatio * meanDurationSeconds : undefined,
          },
    );
  }

  /* ---- the cliff ---- */

  const cliff = steepestDrop(points, meanDurationSeconds);
  if (cliff && cliff.drop >= CLIFF_MIN_DROP) {
    const pct = Math.round(cliff.drop * 100);
    const where =
      durationsComparable && meanDurationSeconds > 0
        ? `${formatTimestamp(cliff.startSeconds)} and ${formatTimestamp(cliff.endSeconds)}`
        : `${Math.round(cliff.startRatio * 100)}% and ${Math.round(cliff.endRatio * 100)}% through`;

    findings.push({
      id: "cliff",
      severity: cliff.drop >= 0.2 ? "warning" : "info",
      headline: `A further ${pct}% leave between ${where}`,
      detail:
        "This is the steepest fall after the opening. Rewatch that stretch: it is usually a slow section, a repeated point, or a promise the video has not paid off yet.",
      atRatio: cliff.startRatio,
      atSeconds: durationsComparable ? cliff.startSeconds : undefined,
    });
  }

  /* ---- how far the median viewer gets ---- */

  const half = retentionAt(points, 0.5);
  if (half !== null) {
    findings.push({
      id: "midpoint",
      severity: half < 0.3 ? "warning" : "info",
      headline: `${Math.round(half * 100)}% of viewers reach the halfway point`,
      detail:
        half < 0.3
          ? "Fewer than a third make it to the middle, which usually means the video is longer than its idea."
          : "A useful benchmark to watch over time: it moves slowly, so a change here is a real change.",
      atRatio: 0.5,
      atSeconds: durationsComparable ? 0.5 * meanDurationSeconds : undefined,
    });
  }

  /* ---- against videos of similar length ---- */

  if (typeof relativePerformance === "number" && relativePerformance > 0) {
    const behind = relativePerformance < RELATIVE_UNDERPERFORMING;
    findings.push({
      id: "relative",
      severity: behind ? "warning" : "good",
      headline: behind
        ? "Your videos hold attention worse than others of similar length"
        : "Your videos hold attention as well as others of similar length",
      detail: `YouTube scores you at ${relativePerformance.toFixed(2)} against a typical video of the same duration, where 1.00 is average. This compares you to all of YouTube, not to your own past.`,
    });
  }

  const order: Record<FindingSeverity, number> = { critical: 0, warning: 1, info: 2, good: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return { findings, averaged };
}
