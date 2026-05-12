/**
 * Sprint 19.7.2 — sub-org dashboard (welcome + placeholders).
 *
 * Real data lands in Sprint 19.7.3; here we just confirm context
 * routing works end-to-end and give the user a recognisable surface
 * to land on when they switch into a sub-org.
 */
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Bot, MessageSquare, Activity } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUserSubOrgMembership } from "@/lib/permissions/sub-org-permissions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { subOrgId: string };
}

export default async function SubOrgDashboardPage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const membership = await getUserSubOrgMembership(userId, params.subOrgId);
  if (!membership) {
    notFound();
  }

  const subOrg = await prisma.orgRelationship.findUnique({
    where: { id: params.subOrgId },
    select: { id: true, subOrgName: true, brandColor: true },
  });
  if (!subOrg) {
    notFound();
  }

  const base = `/dashboard/sub-org/${subOrg.id}`;
  const placeholders = [
    { href: `${base}/agents`, icon: Bot, label: "Agents", hint: "Manage agents scoped to this sub-org." },
    { href: `${base}/conversations`, icon: MessageSquare, label: "Conversations", hint: "Inbox + chat history per channel." },
    { href: `${base}/analytics`, icon: Activity, label: "Analytics", hint: "Volume, deflection rate, revenue." },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card/60"
          style={subOrg.brandColor ? { borderColor: subOrg.brandColor } : undefined}
        >
          <Building2 className="h-5 w-5 text-kiln-orange" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-foreground">
            Willkommen bei {subOrg.subOrgName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Du bist im Sub-Org-Kontext. Was du hier baust ist auf{" "}
            <span className="font-medium text-foreground">{subOrg.subOrgName}</span> beschränkt
            — nichts davon leckt in andere Sub-Orgs deiner Agency.
          </p>
        </div>
      </header>

      <section className="rounded-xl border border-dashed border-border bg-card/30 p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent activity
        </p>
        <p className="text-sm text-muted-foreground">
          Echte Daten folgen in Sprint 19.7.3. Bis dahin lade dir den Kontext
          mit einem der Quick-Links unten:
        </p>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {placeholders.map(({ href, icon: Icon, label, hint }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-kiln-orange/40 hover:bg-card/80"
          >
            <Icon className="mb-3 h-5 w-5 text-kiln-orange" />
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
