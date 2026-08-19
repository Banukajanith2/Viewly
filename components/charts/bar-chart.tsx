"use client";

import { formatCount, formatNumber } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";

/**
 * Horizontal bar chart for ranked comparison.
 *
 * Horizontal, not vertical, because the labels here are video titles and channel
 * names: long text on a vertical axis has to be rotated or truncated, and neither
 * is readable. Horizontal bars give the label a full line.
 *
 * Comparing magnitude across items of one kind is a SEQUENTIAL job, so the default
 * is a single hue rather than a different colour per row. Colour is only allowed to
 * carry identity when the rows are genuinely different categories, which is what
 * `colorBy: "category"` is for. Painting every bar a different colour by default
 * would imply a distinction that does not exist.
 */

export interface BarDatum {
  label: string;
  value: number;
  /** Optional second line under the label. */
  meta?: string;
  /** 0-5, indexes the validated categorical slots. Only with colorBy="category". */
  categoryIndex?: number;
  href?: string;
}

const CATEGORY_VARS = [
  "var(--viz-1)",
  "var(--viz-2)",
  "var(--viz-3)",
  "var(--viz-4)",
  "var(--viz-5)",
  "var(--viz-6)",
] as const;

export function BarChart({
  data,
  colorBy = "single",
  format = "compact",
  emphasise,
  className,
}: {
  data: BarDatum[];
  colorBy?: "single" | "category";
  format?: "compact" | "number";
  /** Index of a row to highlight; every other row recedes to grey. */
  emphasise?: number;
  className?: string;
}) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">Nothing to compare yet.</p>
    );
  }

  const formatValue = format === "compact" ? formatCount : formatNumber;
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <ul className={cn("space-y-2.5", className)}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;

        // Emphasis: one row carries the accent, the rest recede. Used when a single
        // row is the point and the others are only context.
        const dimmed = emphasise !== undefined && emphasise !== i;
        const fill = dimmed
          ? "var(--muted-foreground)"
          : colorBy === "category"
            ? CATEGORY_VARS[(d.categoryIndex ?? i) % CATEGORY_VARS.length]
            : "var(--viz-series)";

        return (
          <li key={d.label + i}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-sm" title={d.label}>
                {d.label}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {formatValue(d.value)}
              </span>
            </div>

            {/* The track is the full scale, so a short bar reads as "small share of
                the max" rather than just a short line floating in space. */}
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max(pct, d.value > 0 ? 1.5 : 0)}%`,
                  backgroundColor: fill,
                  opacity: dimmed ? 0.45 : 1,
                }}
              />
            </div>

            {d.meta && <p className="text-muted-foreground mt-1 text-xs">{d.meta}</p>}
          </li>
        );
      })}
    </ul>
  );
}
