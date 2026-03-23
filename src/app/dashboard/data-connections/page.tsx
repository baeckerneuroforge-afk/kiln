import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DataConnections } from "@/components/data-pipeline/data-connections";

export default async function DataConnectionsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return (
    <div className="min-h-screen bg-[#1a1918]">
      <DataConnections />
    </div>
  );
}
