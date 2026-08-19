/**
 * Display formatters. Pure and client-safe, no server imports.
 */

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const FULL = new Intl.NumberFormat("en");

/** 1234567 -> "1.2M". Used wherever a subscriber or view count is shown. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return COMPACT.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return FULL.format(value);
}

export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** Seconds to "4:07" or "1:04:07". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  return hours > 0
    ? `${hours}:${mm}:${String(seconds).padStart(2, "0")}`
    : `${mm}:${String(seconds).padStart(2, "0")}`;
}

/**
 * "3 days ago". Powers the discovery cache copy, where telling the user how stale a
 * shared result is matters more than showing a timestamp.
 */
export function formatRelativeTime(iso: string | Date, now: Date = new Date()): string {
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const diffMs = now.getTime() - then.getTime();
  const abs = Math.abs(diffMs);

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 3600_000],
    ["month", 30 * 24 * 3600_000],
    ["day", 24 * 3600_000],
    ["hour", 3600_000],
    ["minute", 60_000],
    ["second", 1000],
  ];

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "second") {
      return rtf.format(-Math.round(diffMs / ms), unit);
    }
  }
  return "just now";
}

/** Seconds to a coarse "in about 6 days", for Retry-After hints. */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `in ${Math.ceil(seconds)} seconds`;
  if (seconds < 3600) return `in ${Math.ceil(seconds / 60)} minutes`;
  if (seconds < 86_400) return `in about ${Math.ceil(seconds / 3600)} hours`;
  return `in about ${Math.ceil(seconds / 86_400)} days`;
}

/** YYYY-MM-DD in UTC, matching how quota days are keyed. */
export function toDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function daysAgo(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - days);
  return toDateKey(d);
}
