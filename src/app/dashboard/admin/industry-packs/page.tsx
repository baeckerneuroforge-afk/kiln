import { auth } from "@clerk/nextjs/server";
import { PackageOpen, ShieldAlert } from "lucide-react";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

function metadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export default async function AdminIndustryPacksPage() {
  const { userId } = await auth();
  if (!isAdmin(userId)) {
    return (
      <div className="mx-auto max-w-4xl rounded-lg border border-amber-500/30 bg-amber-500/10 p-5 text-amber-200">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="h-4 w-4" />
          Admin access required
        </div>
      </div>
    );
  }

  const [packs, relationships] = await Promise.all([
    prisma.industryTemplate.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.orgRelationship.findMany({ where: { industry: { not: null } }, select: { industry: true } }),
  ]);
  const usage = new Map<string, number>();
  for (const relationship of relationships) {
    if (relationship.industry) {
      usage.set(relationship.industry, (usage.get(relationship.industry) ?? 0) + 1);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">Admin</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Industry Packs</h1>
          <p className="mt-2 text-muted-foreground">Manage seeded packs, metadata, and customer usage.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <PackageOpen className="h-4 w-4" />
          {packs.length} packs
        </div>
      </header>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Pack</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Departments</th>
              <th className="px-4 py-3">FAQs</th>
              <th className="px-4 py-3">Channels</th>
              <th className="px-4 py-3">Customers</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {packs.map((pack) => {
              const metadata = metadataRecord(pack.metadata);
              return (
                <tr key={pack.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{pack.displayNameDe ?? pack.displayName}</div>
                    <div className="text-xs text-muted-foreground">{pack.industry}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {typeof metadata.packVersion === "string" ? metadata.packVersion : "-"}
                  </td>
                  <td className="px-4 py-3">{Array.isArray(pack.departmentTemplates) ? pack.departmentTemplates.length : 0}</td>
                  <td className="px-4 py-3">{Array.isArray(pack.knowledgeBaseSeeds) ? pack.knowledgeBaseSeeds.length : 0}</td>
                  <td className="px-4 py-3">{Array.isArray(pack.recommendedChannels) ? pack.recommendedChannels.length : 0}</td>
                  <td className="px-4 py-3">{usage.get(pack.industry) ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {pack.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">DB edit workflow</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Update pack JSON through the seed script or Prisma Studio, then use customer refresh to pull non-destructive changes into existing sub-orgs.
        </p>
      </section>
    </div>
  );
}
