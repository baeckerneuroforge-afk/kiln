/**
 * Sprint 19.7.3 — Sub-Org settings (read-only summary for now).
 *
 * Editing the sub-org's profile + branding already exists in the agency
 * UI (/dashboard/agency/sub-orgs/[id]). This page surfaces the current
 * values from the user's perspective; FULL_ACCESS callers get a link
 * back to the agency edit screen.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { Settings, Lock, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getSubOrgContext } from "@/lib/sub-org/get-sub-org-context";

export const dynamic = "force-dynamic";

interface PageProps { params: { subOrgId: string } }

export default async function SubOrgSettingsPage({ params }: PageProps) {
  const context = await getSubOrgContext(params.subOrgId);
  if (!context) notFound();

  // Settings page is visible to every member; edit access is gated on
  // memberships.manage (which lives in FULL_ACCESS).
  const canEdit = context.permissions.has("memberships.manage");
  const { subOrg } = context;

  const rows: Array<{ label: string; value: string }> = [
    { label: "Name", value: subOrg.subOrgName },
    { label: "Status", value: subOrg.subOrgStatus },
    { label: "Industry", value: subOrg.industry ?? "—" },
    { label: "Brand color", value: subOrg.brandColor ?? "—" },
    { label: "Logo URL", value: subOrg.logoUrl ?? "—" },
    { label: "Parent agency org id", value: subOrg.parentOrgId },
    { label: "Clerk org id", value: subOrg.childOrgId },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
            <Settings className="h-5 w-5 text-kiln-orange" />
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Profil + Branding für {subOrg.subOrgName}.
          </p>
        </div>
        {canEdit ? (
          <Link
            href={`/dashboard/agency/sub-orgs/${subOrg.id}`}
            className={buttonVariants({ variant: "outline" })}
            data-testid="sub-org-settings-edit-cta"
          >
            <ExternalLink className="mr-1 h-4 w-4" /> Im Agency-Backend bearbeiten
          </Link>
        ) : (
          <span
            data-testid="sub-org-settings-readonly-badge"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground"
          >
            <Lock className="h-3 w-3" /> Nur Lesen
          </span>
        )}
      </header>

      <dl className="rounded-xl border border-border bg-card" data-testid="sub-org-settings-list">
        {rows.map((row, idx) => (
          <div
            key={row.label}
            className={
              "grid grid-cols-3 gap-3 px-4 py-3 text-sm " +
              (idx < rows.length - 1 ? "border-b border-border" : "")
            }
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="col-span-2 truncate font-mono text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
