import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DataExplorer } from "@/components/data-pipeline/data-explorer";

export default async function DataExplorerPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return (
    <div className="min-h-screen bg-[#0C0A09]">
      <DataExplorer />
    </div>
  );
}
