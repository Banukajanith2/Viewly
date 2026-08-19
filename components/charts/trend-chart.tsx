"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCount, formatNumber } from "@/lib/utils/formatters";

/**
 * Single-series trend chart: area + line, with a crosshair and tooltip.
 *
 * Hand-rolled SVG rather than a charting library. The whole project is built to a
 * zero-cost, small-footprint constraint, and one series over time needs a path and
 * a scale, not 50KB of runtime.
 *
 * Design decisions worth not undoing:
 *  - ONE y-axis, always. Two measures of different scale get two charts, never a
 *    second axis, because a dual axis lets the author imply any correlation they
 *    like by choosing the scales.
 *  - No legend and no per-point labels for a single series: the title names it, and
 *    a number on every point is noise. Only the latest point is labelled.
 *  - The value axis starts at zero. A truncated baseline exaggerates change.
 *  - Grid and axis are recessive; the data is the only thing with colour.
 */

export interface TrendPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

/**
 * A format NAME, not a formatter function.
 *
 * These charts are rendered from Server Components, and a function cannot cross the
 * server/client boundary: React serialises props, and a closure has no serial form.
 * Passing a name and resolving it here keeps the call sites declarative and the
 * boundary intact.
 */
export type ValueFormat = "compact" | "number" | "minutes";

const FORMATTERS: Record<ValueFormat, (value: number) => string> = {
  compact: (v) => formatCount(v),
  number: (v) => formatNumber(v),
  minutes: (v) => `${formatCount(v)} min`,
};

interface TrendChartProps {
  data: TrendPoint[];
  /** Names the series, so no legend is needed. */
  label: string;
  format?: ValueFormat;
  height?: number;
}

const PAD = { top: 16, right: 16, bottom: 24, left: 44 };
const MARKER_R = 4;

export function TrendChart({
  data,
  label,
  format = "compact",
  height = 220,
}: TrendChartProps) {
  const formatValue = FORMATTERS[format];
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  // Real pixel width rather than a scaled viewBox: scaling a viewBox to fit would
  // stretch strokes and text along with the geometry.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = Math.max(0, height - PAD.top - PAD.bottom);

  // Zero-based, and never a flat zero-height scale when every value is 0.
  const maxValue = Math.max(1, ...data.map((d) => d.value));
  const niceMax = niceCeiling(maxValue);

  const x = useCallback(
    (i: number) => (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
    [data.length, innerW],
  );
  const y = useCallback(
    (v: number) => innerH - (v / niceMax) * innerH,
    [innerH, niceMax],
  );

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!data.length || innerW <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left - PAD.left;
    const ratio = Math.min(1, Math.max(0, px / innerW));
    setHover(Math.round(ratio * (data.length - 1)));
  };

  if (!data.length) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No data for this period yet.
      </p>
    );
  }

  const linePath = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join(" ");
  const areaPath = `${linePath} L${x(data.length - 1)},${innerH} L${x(0)},${innerH} Z`;

  const ticks = [0, niceMax / 2, niceMax];
  const active = hover !== null ? data[hover] : null;
  const last = data[data.length - 1];

  return (
    <div ref={wrapRef} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`${label}: ${formatValue(data.reduce((s, d) => s + d.value, 0))} total across ${data.length} days, from ${data[0].date} to ${last.date}.`}
          className="overflow-visible"
        >
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-series)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--viz-series)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {/* Recessive grid. Hairlines, never competing with the data. */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={0}
                  x2={innerW}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
                <text
                  x={-8}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {formatValue(t)}
                </text>
              </g>
            ))}

            <path d={areaPath} fill="url(#trend-fill)" />
            <path
              d={linePath}
              fill="none"
              stroke="var(--viz-series)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Only the latest point is labelled. A number on every point is noise. */}
            <circle
              cx={x(data.length - 1)}
              cy={y(last.value)}
              r={MARKER_R}
              fill="var(--viz-series)"
              stroke="var(--card)"
              strokeWidth={2}
            />

            {active && hover !== null && (
              <g>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={0}
                  y2={innerH}
                  stroke="var(--viz-series)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
                <circle
                  cx={x(hover)}
                  cy={y(active.value)}
                  r={MARKER_R + 1}
                  fill="var(--viz-series)"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              </g>
            )}

            {/* First and last date only: a tick per day collides at any width. */}
            <text
              x={0}
              y={innerH + 16}
              className="fill-muted-foreground text-[11px]"
              textAnchor="start"
            >
              {shortDate(data[0].date)}
            </text>
            <text
              x={innerW}
              y={innerH + 16}
              className="fill-muted-foreground text-[11px]"
              textAnchor="end"
            >
              {shortDate(last.date)}
            </text>
          </g>
        </svg>
      )}

      {active && hover !== null && width > 0 && (
        <div
          className="bg-popover text-popover-foreground pointer-events-none absolute z-10 rounded-md border px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: Math.min(Math.max(PAD.left + x(hover) - 60, 0), Math.max(0, width - 130)),
            top: 0,
          }}
        >
          <div className="text-muted-foreground">{longDate(active.date)}</div>
          <div className="font-medium tabular-nums">
            {formatValue(active.value)} {label.toLowerCase()}
          </div>
        </div>
      )}
    </div>
  );
}

/** Rounds an axis maximum up to a readable number so ticks are not arbitrary. */
function niceCeiling(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function longDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
