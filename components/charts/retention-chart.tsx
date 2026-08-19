"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Audience retention curve (Part 8.1).
 *
 * Hand-rolled SVG for the same reason as TrendChart: one series and a scale does
 * not need a charting runtime.
 *
 * What makes this chart different from a raw retention plot is the annotation. A
 * bare curve slopes down for everybody, so the shape alone never tells a creator
 * where to look. The hook boundary and the steepest drop are drawn ON the curve,
 * which is the point of the feature.
 *
 * The y axis is pinned to 0..100%, never scaled to the data. Retention is already
 * a percentage of a known whole, and letting the axis end at, say, 40% would make
 * a badly performing video look like a healthy one.
 */

export interface RetentionChartPoint {
  elapsedVideoTimeRatio: number;
  audienceWatchRatio: number;
}

interface RetentionChartProps {
  points: RetentionChartPoint[];
  /** Mean duration, for an x axis in mm:ss. Zero renders the axis as a percentage. */
  durationSeconds: number;
  /** Where the opening ends, drawn as a boundary. */
  hookRatio?: number;
  /** The steepest post-opening fall, drawn as a shaded band. */
  cliff?: { startRatio: number; endRatio: number } | null;
  height?: number;
}

const PAD = { top: 16, right: 16, bottom: 26, left: 44 };

function mmss(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function RetentionChart({
  points,
  durationSeconds,
  hookRatio,
  cliff,
  height = 240,
}: RetentionChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = Math.max(0, height - PAD.top - PAD.bottom);

  const x = useCallback((ratio: number) => ratio * innerW, [innerW]);

  /**
   * The axis always spans the full 0..100%, and only ever extends BEYOND it.
   *
   * Never scaling down is the rule from the note above: a truncated retention axis
   * makes a failing video look healthy. Extending is still necessary, because a
   * rebased curve can pass 100% where a mid-video segment is rewatched more than
   * the opening was, and clamping that would silently draw a flat line across the
   * top where the data actually has a peak.
   */
  const peak = points.reduce((m, p) => Math.max(m, p.audienceWatchRatio), 0);
  const yMax = Math.max(1, Math.ceil(peak * 4) / 4);
  const y = useCallback(
    (value: number) => innerH - (Math.max(0, value) / yMax) * innerH,
    [innerH, yMax],
  );

  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (innerW <= 0 || points.length === 0) return;
      const box = e.currentTarget.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - box.left - PAD.left) / innerW));
      let nearest = 0;
      let best = Infinity;
      for (let i = 0; i < points.length; i++) {
        const d = Math.abs(points[i].elapsedVideoTimeRatio - ratio);
        if (d < best) { best = d; nearest = i; }
      }
      setHover(nearest);
    },
    [innerW, points],
  );

  if (points.length === 0) return null;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.elapsedVideoTimeRatio)},${y(p.audienceWatchRatio)}`)
    .join(" ");
  const areaPath =
    `M${x(points[0].elapsedVideoTimeRatio)},${innerH} ` +
    points.map((p) => `L${x(p.elapsedVideoTimeRatio)},${y(p.audienceWatchRatio)}`).join(" ") +
    ` L${x(points[points.length - 1].elapsedVideoTimeRatio)},${innerH} Z`;

  const yTicks = Array.from({ length: Math.round(yMax / 0.25) + 1 }, (_, i) => i * 0.25);
  const xTicks = [0, 0.25, 0.5, 0.75, 1];
  const xLabel = (r: number) =>
    durationSeconds > 0 ? mmss(r * durationSeconds) : `${Math.round(r * 100)}%`;

  const active = hover !== null ? points[hover] : null;

  return (
    <div ref={wrapRef} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={
            `Audience retention. ${Math.round((points[0]?.audienceWatchRatio ?? 0) * 100)}% at the start, ` +
            `${Math.round((points[points.length - 1]?.audienceWatchRatio ?? 0) * 100)}% at the end.`
          }
          className="overflow-visible"
        >
          <defs>
            <linearGradient id="retention-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-series)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--viz-series)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={0} x2={innerW} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
                <text
                  x={-8}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {Math.round(t * 100)}%
                </text>
              </g>
            ))}

            {/* The steepest drop, shaded rather than outlined: it is a region of the
                video, not a boundary, and a fill says "this stretch" unambiguously. */}
            {cliff && (
              <rect
                x={x(cliff.startRatio)}
                y={0}
                width={Math.max(2, x(cliff.endRatio) - x(cliff.startRatio))}
                height={innerH}
                fill="var(--viz-warning)"
                opacity={0.14}
              />
            )}

            <path d={areaPath} fill="url(#retention-fill)" />
            <path
              d={linePath}
              fill="none"
              stroke="var(--viz-series)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Hook boundary. Dashed so it reads as an annotation, not a data series. */}
            {typeof hookRatio === "number" && hookRatio > 0 && hookRatio < 1 && (
              <g>
                <line
                  x1={x(hookRatio)}
                  x2={x(hookRatio)}
                  y1={0}
                  y2={innerH}
                  stroke="var(--viz-critical)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.75}
                />
                <text
                  x={x(hookRatio) + 4}
                  y={10}
                  className="fill-muted-foreground text-[10px]"
                >
                  hook
                </text>
              </g>
            )}

            {xTicks.map((t) => (
              <text
                key={t}
                x={x(t)}
                y={innerH + 16}
                textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {xLabel(t)}
              </text>
            ))}

            {active && hover !== null && (
              <g>
                <line
                  x1={x(active.elapsedVideoTimeRatio)}
                  x2={x(active.elapsedVideoTimeRatio)}
                  y1={0}
                  y2={innerH}
                  stroke="var(--viz-series)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
                <circle
                  cx={x(active.elapsedVideoTimeRatio)}
                  cy={y(active.audienceWatchRatio)}
                  r={4}
                  fill="var(--viz-series)"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              </g>
            )}
          </g>
        </svg>
      )}

      {active && (
        <div
          className="bg-popover text-popover-foreground pointer-events-none absolute top-0 rounded-md border px-2 py-1 text-xs shadow-sm"
          style={{
            left: Math.min(
              Math.max(0, PAD.left + x(active.elapsedVideoTimeRatio) - 50),
              Math.max(0, width - 110),
            ),
          }}
        >
          <span className="tabular-nums">{xLabel(active.elapsedVideoTimeRatio)}</span>
          <span className="text-muted-foreground"> · </span>
          <span className="font-medium tabular-nums">
            {Math.round(active.audienceWatchRatio * 100)}% watching
          </span>
        </div>
      )}
    </div>
  );
}
