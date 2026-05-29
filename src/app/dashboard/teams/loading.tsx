import { SkeletonCard } from "@/components/ui/skeleton";

/**
 * Navigations-Skeleton für die Workflows-/Teams-Liste. Nutzt SkeletonCard im
 * Grid, passend zum internen Loading-State der Teams-Seite (vermeidet einen
 * sichtbaren Row→Card-Sprung beim Übergang).
 */
export default function TeamsLoading() {
  return (
    <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
