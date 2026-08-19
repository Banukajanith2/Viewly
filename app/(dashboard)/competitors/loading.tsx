import {
  SkeletonCards,
  SkeletonChart,
  SkeletonHeader,
  SkeletonStatus,
  SkeletonTiles,
} from "@/components/layout/page-skeleton";

/** Matches Competitors: tiles, the peer bar chart, then a grid of peer cards. */
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden>
      <SkeletonHeader />
      <SkeletonTiles count={4} />
      <SkeletonChart filter={false} />
      <SkeletonCards count={4} columns={2} />
      <SkeletonStatus />
    </div>
  );
}
