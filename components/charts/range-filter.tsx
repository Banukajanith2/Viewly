"use client";

import { cn } from "@/lib/utils";

/**
 * Date-range control.
 *
 * Sits in one row above the chart it filters, per the usual dashboard convention,
 * and marks the active range rather than relying on colour alone.
 *
 * The ranges are split by what they cost. Anything inside the cached snapshot is
 * free and instant; anything longer needs a live Analytics call, so those options
 * say so up front instead of silently spending a user's daily allowance.
 */

export const RANGES = [
  { days: 7, label: "7D" },
  { days: 28, label: "28D" },
  { days: 90, label: "90D" },
  { days: 365, label: "1Y" },
  { days: 3650, label: "All" },
] as const;

export type RangeDays = (typeof RANGES)[number]["days"];

export function RangeFilter({
  value,
  onChange,
  cachedDays,
  disabled,
}: {
  value: RangeDays;
  onChange: (days: RangeDays) => void;
  /** Ranges up to this many days are served from cache at no cost. */
  cachedDays: number;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Date range"
      className="bg-muted/60 inline-flex items-center gap-0.5 rounded-lg p-0.5"
    >
      {RANGES.map((range) => {
        const active = value === range.days;
        const live = range.days > cachedDays;

        return (
          <button
            key={range.days}
            type="button"
            disabled={disabled}
            onClick={() => onChange(range.days)}
            aria-pressed={active}
            title={
              live
                ? `${range.label}: needs a live Analytics call, which counts against your daily limit`
                : `${range.label}: served from today's saved snapshot, no API call`
            }
            className={cn(
              "relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {range.label}
            {/* A dot marks the ranges that cost a call. Paired with the tooltip
                text above, so it is never colour alone. */}
            {live && (
              <span
                aria-hidden
                className="absolute top-0.5 right-0.5 size-1 rounded-full"
                style={{ backgroundColor: "var(--viz-4)" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
