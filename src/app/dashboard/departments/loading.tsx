import { SkeletonCard } from "@/components/ui/skeleton";

/** Navigations-Skeleton für die Departments-Übersicht. */
export default function DepartmentsLoading() {
  return (
    <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
