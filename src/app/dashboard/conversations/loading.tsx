import { SkeletonRow } from "@/components/ui/skeleton";

/** Navigations-Skeleton für die Conversations-Liste. */
export default function ConversationsLoading() {
  return (
    <div className="space-y-3 p-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
