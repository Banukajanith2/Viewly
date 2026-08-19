import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A single headline number.
 *
 * A stat tile, not a one-bar chart: for a single current value the number IS the
 * visualisation, and drawing a bar around it adds ink without information.
 *
 * On colour: the accent lives in the icon chip and a hairline at the top edge,
 * never in the value or the label. Text wears text tokens so it keeps its contrast
 * in both themes and stays readable for anyone who cannot separate the hues; the
 * coloured mark beside it is what carries identity. That is also why each metric
 * keeps ONE fixed accent everywhere it appears, rather than being coloured by
 * position in a grid: colour follows the thing, never its rank.
 */

/** Indexes the validated categorical slots in globals.css. */
export type Accent = 1 | 2 | 3 | 4 | 5 | 6;

const ACCENT_VAR: Record<Accent, string> = {
  1: "var(--viz-1)",
  2: "var(--viz-2)",
  3: "var(--viz-3)",
  4: "var(--viz-4)",
  5: "var(--viz-5)",
  6: "var(--viz-6)",
};

export function StatTile({
  label,
  value,
  hint,
  delta,
  icon: Icon,
  accent = 1,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: { value: number; format?: (n: number) => string; goodWhenUp?: boolean };
  icon?: LucideIcon;
  accent?: Accent;
  className?: string;
}) {
  const color = ACCENT_VAR[accent];

  return (
    <div
      className={cn(
        "group bg-card relative overflow-hidden rounded-xl border p-4 transition-all sm:p-5",
        "hover:border-foreground/15 hover:shadow-sm",
        className,
      )}
    >
      {/* Hairline of the metric's own colour. Enough to tell tiles apart at a
          glance without turning the grid into a paint chart. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 opacity-70 transition-opacity group-hover:opacity-100"
        style={{ backgroundColor: color }}
      />

      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </p>
        {Icon && (
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-lg"
            // Tinted from the accent itself, so the chip always belongs to its hue
            // in both themes rather than needing a hand-picked pair per mode.
            style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` }}
          >
            <Icon className="size-3.5" style={{ color }} />
          </span>
        )}
      </div>

      <p className="mt-2 text-2xl leading-none font-semibold tracking-tight sm:text-3xl">
        {value}
      </p>

      {delta !== undefined && <Delta {...delta} />}
      {hint && <p className="text-muted-foreground mt-2 text-xs">{hint}</p>}
    </div>
  );
}

function Delta({
  value,
  format = (n) => n.toLocaleString(),
  goodWhenUp = true,
}: {
  value: number;
  format?: (n: number) => string;
  goodWhenUp?: boolean;
}) {
  if (value === 0) {
    return <p className="text-muted-foreground mt-2 text-xs">No change</p>;
  }

  const up = value > 0;
  const good = up === goodWhenUp;

  return (
    <p
      className={cn("mt-2 flex items-center gap-1 text-xs font-medium")}
      style={good ? { color: "var(--viz-good)" } : undefined}
    >
      {/* The arrow and the sign carry the direction, so colour only reinforces it.
          A red/green pair alone would be invisible to a good share of readers. */}
      <span aria-hidden>{up ? "↑" : "↓"}</span>
      <span className={good ? undefined : "text-muted-foreground"}>
        {format(Math.abs(value))}
      </span>
    </p>
  );
}
