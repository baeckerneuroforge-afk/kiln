import { SkeletonStat, SkeletonCard } from "@/components/ui/skeleton";

/**
 * Loading-Skeleton für die (server-gerenderte) Dashboard-Startseite.
 * Wird während des Segment-Renderings angezeigt, bevor die Daten da sind.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
