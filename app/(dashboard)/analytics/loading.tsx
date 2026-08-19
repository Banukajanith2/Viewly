import {
  SkeletonChart,
  SkeletonFindings,
  SkeletonHeader,
  SkeletonStatus,
  SkeletonTiles,
} from "@/components/layout/page-skeleton";

/** Matches Analytics: tiles, insight cards, then two separate charts. */
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden>
      <SkeletonHeader />
      <SkeletonTiles count={4} />
      <SkeletonFindings count={4} />
      <SkeletonChart />
      <SkeletonChart />
      <SkeletonStatus />
    </div>
  );
}
