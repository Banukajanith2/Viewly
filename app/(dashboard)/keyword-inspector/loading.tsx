import {
  SkeletonBadges,
  SkeletonHeader,
  SkeletonList,
  SkeletonStatus,
  SkeletonTiles,
} from "@/components/layout/page-skeleton";

/** Matches Keywords: tiles, the keyword pills, the suggest panel, trending. */
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden>
      <SkeletonHeader />
      <SkeletonTiles count={4} />
      <SkeletonBadges />
      <SkeletonList rows={5} thumb={false} />
      <SkeletonStatus />
    </div>
  );
}
