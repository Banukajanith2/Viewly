import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A single headline number.
 *
 * A stat tile, not a one-bar chart: for a single current value the number IS the
 * visualisation, and drawing a bar around it adds ink without adding information.
 *
 * The value uses proportional figures because it stands alone. Tabular figures are
 * reserved for columns that must align vertically, such as table rows and axis ticks.
 */
export function StatTile({
  label,
  value,
  hint,
  delta,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Signed change. Direction is conveyed by an arrow and a word, never by colour alone. */
  delta?: { value: number; format?: (n: number) => string; goodWhenUp?: boolean };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card rounded-xl border p-4 transition-colors sm:p-5",
        className,
      )}
    >
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl leading-none font-semibold sm:text-3xl">{value}</p>

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
      className={cn(
        "mt-2 text-xs font-medium",
        good
          ? "text-[color:var(--viz-good,#006300)] dark:text-[color:#0ca30c]"
          : "text-muted-foreground",
      )}
    >
      {/* The arrow and the sign carry the direction, so the colour is reinforcement
          rather than the only signal. */}
      {up ? "↑" : "↓"} {format(Math.abs(value))}
    </p>
  );
}
