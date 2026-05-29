import { SkeletonRow } from "@/components/ui/skeleton";

/** Navigations-Skeleton für die Workflows-/Teams-Liste. */
export default function TeamsLoading() {
  return (
    <div className="space-y-3 p-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
