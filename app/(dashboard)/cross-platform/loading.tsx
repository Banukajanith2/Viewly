import {
  SkeletonCards,
  SkeletonChart,
  SkeletonHeader,
  SkeletonList,
  SkeletonStatus,
  SkeletonTiles,
} from "@/components/layout/page-skeleton";

/** Matches Cross-platform: tiles, the averages chart, per-platform cards, log. */
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden>
      <SkeletonHeader />
      <SkeletonTiles count={4} />
      <SkeletonChart filter={false} />
      <SkeletonCards count={3} columns={3} />
      <SkeletonList rows={4} thumb={false} />
      <SkeletonStatus />
    </div>
  );
}
