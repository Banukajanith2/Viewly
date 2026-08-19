import {
  SkeletonHeader,
  SkeletonList,
  SkeletonStatus,
  SkeletonTiles,
  SkeletonChart,
} from "@/components/layout/page-skeleton";

/** Matches Overview: avatar header, four tiles, the daily views chart, uploads. */
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden>
      <SkeletonHeader avatar action={false} />
      <SkeletonTiles count={4} />
      <SkeletonChart />
      <SkeletonList rows={4} />
      <SkeletonStatus />
    </div>
  );
}
