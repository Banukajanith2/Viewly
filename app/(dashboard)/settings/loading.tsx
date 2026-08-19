import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonStatus } from "@/components/layout/page-skeleton";

/**
 * Matches Settings, which is a column of cards rather than tiles and charts.
 * Nothing else on the dashboard has this shape.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-hidden>
      <Skeleton className="h-7 w-32" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card space-y-4 rounded-xl border p-6">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-72" />
          </div>
          <Skeleton className="h-9 w-48" />
        </div>
      ))}
      <SkeletonStatus />
    </div>
  );
}
