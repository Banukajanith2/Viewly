import { Skeleton } from "@/components/ui/skeleton";

/**
 * Building blocks for per-route loading states.
 *
 * Composable rather than one shared skeleton, because a placeholder is only worth
 * showing if it matches the page that replaces it. A single generic skeleton makes
 * every route flash a layout it does not have and then reflow when the real content
 * lands, which is more jarring than showing nothing at all.
 *
 * Nothing here invents data. The frame is drawn; the numbers are not guessed at.
 */

/** Page title and subtitle, with an optional avatar and a right-hand control. */
export function SkeletonHeader({
  avatar = false,
  action = true,
}: {
  avatar?: boolean;
  action?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {avatar && <Skeleton className="size-12 shrink-0 rounded-full" />}
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      {action && <Skeleton className="h-8 w-32" />}
    </div>
  );
}

/** A row of stat tiles. */
export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div
      className={
        count === 3
          ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      }
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card space-y-3 rounded-xl border p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="size-7 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

/** A chart panel, optionally with the range-filter control. */
export function SkeletonChart({ filter = true }: { filter?: boolean }) {
  return (
    <div className="bg-card space-y-4 rounded-xl border p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
        {filter && <Skeleton className="h-8 w-56" />}
      </div>
      <Skeleton className="h-52 w-full" />
    </div>
  );
}

/** A list of rows with a leading thumbnail. */
export function SkeletonList({ rows = 3, thumb = true }: { rows?: number; thumb?: boolean }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-32" />
      <div className="divide-y overflow-hidden rounded-xl border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="bg-card flex items-center gap-4 p-3">
            {thumb && <Skeleton className="h-12 w-20 shrink-0 rounded-md" />}
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-12 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A grid of cards, as used for peers and per-platform summaries. */
export function SkeletonCards({ count = 4, columns = 2 }: { count?: number; columns?: 2 | 3 }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-32" />
      <div className={columns === 3 ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "grid gap-3 sm:grid-cols-2"}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-card space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-3 w-20" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Stacked finding cards, as used by the retention diagnostics. */
export function SkeletonFindings({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-36" />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card flex items-start gap-3 rounded-xl border p-4">
          <Skeleton className="size-7 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full max-w-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A wrapped run of pills, as used for keywords. */
export function SkeletonBadges({ count = 18 }: { count?: number }) {
  // Varied widths, so it reads as words rather than as a progress bar.
  const widths = ["w-16", "w-24", "w-20", "w-14", "w-28", "w-18"];
  return (
    <div className="bg-card space-y-4 rounded-xl border p-4 sm:p-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-72" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className={`h-6 rounded-full ${widths[i % widths.length]}`} />
        ))}
      </div>
    </div>
  );
}

/** Announces the wait once per page, rather than once per skeleton block. */
export function SkeletonStatus() {
  return (
    <span className="sr-only" role="status">
      Loading
    </span>
  );
}
