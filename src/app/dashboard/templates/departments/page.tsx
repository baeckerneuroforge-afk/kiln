import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function DepartmentTemplatesPage() {
  const packs = await prisma.industryTemplate.findMany({
    orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
    select: {
      id: true,
      industry: true,
      displayNameDe: true,
      displayName: true,
      descriptionDe: true,
      isActive: true,
      departmentTemplates: true,
      knowledgeBaseSeeds: true,
      metadata: true,
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-normal text-foreground">Department Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Industry-Packs sind die Department-Master für neue Sub-Orgs.
          </p>
        </div>
        <Link
          href="/dashboard/admin/industry-packs"
          className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
        >
          Industry Packs verwalten
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {packs.map((pack) => {
          const departments = Array.isArray(pack.departmentTemplates) ? pack.departmentTemplates.length : 0;
          const faqs = Array.isArray(pack.knowledgeBaseSeeds) ? pack.knowledgeBaseSeeds.length : 0;
          const metadata = typeof pack.metadata === "object" && pack.metadata !== null && !Array.isArray(pack.metadata)
            ? (pack.metadata as Record<string, unknown>)
            : {};
          const packVersion = typeof metadata.packVersion === "string" ? metadata.packVersion : null;
          return (
            <div key={pack.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {pack.displayNameDe ?? pack.displayName}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {pack.descriptionDe ?? "Kein Beschreibungstext hinterlegt."}
                  </p>
                </div>
                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {pack.isActive ? "Active" : "Draft"}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <PackMetric label="Departments" value={departments} />
                <PackMetric label="FAQs" value={faqs} />
                <PackMetric label="Version" value={packVersion ?? "n/a"} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PackMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="text-base font-semibold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
    </div>
  );
}
