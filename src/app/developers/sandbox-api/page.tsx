/**
 * Sandbox API Dokumentationsseite — Server Component mit Auth-Check
 */

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SandboxApiDocs } from "@/components/developers/sandbox-api-docs";

export default async function SandboxApiPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-[#0C0A09]">
      <SandboxApiDocs />
    </div>
  );
}
