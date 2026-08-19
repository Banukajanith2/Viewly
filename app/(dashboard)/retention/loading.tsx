import {
  SkeletonChart,
  SkeletonFindings,
  SkeletonHeader,
  SkeletonList,
  SkeletonStatus,
  SkeletonTiles,
} from "@/components/layout/page-skeleton";

/** Matches Retention: findings lead, then three tiles and the curve. */
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden>
      <SkeletonHeader />
      <SkeletonFindings count={3} />
      <SkeletonTiles count={3} />
      <SkeletonChart filter={false} />
      <SkeletonList rows={3} thumb={false} />
      <SkeletonStatus />
    </div>
  );
}
