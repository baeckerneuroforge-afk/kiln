"use client";

/**
 * Organization Settings page.
 *
 * Renders Clerk's <OrganizationProfile /> which ships with built-in tabs for
 * Profile (name + logo + delete), Members (list, role change, remove), and
 * Invitations (send / cancel). For Phase 2.3a we lean on Clerk's UI rather
 * than rebuilding it — the appearance prop maps Clerk's color slots to the
 * dashboard's shadcn CSS variables, which resolve to light values inside
 * the .theme-light scope of the dashboard layout.
 *
 * The page is admin-gated: non-admin members see a "no permission" notice
 * instead of the profile editor. Listing/joining is fine for any member;
 * editing requires `org:admin`.
 */
import { OrganizationProfile, useOrganization } from "@clerk/nextjs";
import { Building2, ShieldAlert } from "lucide-react";
import Link from "next/link";

export default function OrganizationSettingsPage() {
  const { organization, membership, isLoaded } = useOrganization();

  if (!isLoaded) {
    return (
      <div className="mx-auto max-w-4xl animate-pulse">
        <div className="mb-8 h-8 w-64 rounded bg-muted" />
        <div className="h-96 rounded-xl bg-card" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <Building2 className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="font-serif text-2xl text-foreground">No organization selected</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick an organization from the switcher in the sidebar, or create a new one.
        </p>
        <Link
          href="/onboarding/create-organization"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-kiln-orange px-4 py-2 text-sm font-medium text-white hover:bg-kiln-orange/90"
        >
          Create organization
        </Link>
      </div>
    );
  }

  // Clerk role identifiers: org:admin (full access), org:member / basic_member.
  const isAdmin = membership?.role === "org:admin";

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
          <Building2 className="h-5 w-5 text-kiln-orange" />
          {organization.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage members, role assignments, and the organization profile.
        </p>
      </header>

      {!isAdmin && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-xs text-amber-200">
            <p className="font-medium">Read-only view</p>
            <p className="mt-0.5 text-amber-200/80">
              Only organization admins can edit profile details, manage
              members, or invite new people. Ask an admin to grant you the
              <code className="mx-1 rounded bg-amber-500/10 px-1 py-0.5">org:admin</code>
              role.
            </p>
          </div>
        </div>
      )}

      <OrganizationProfile
        routing="hash"
        appearance={{
          elements: {
            rootBox: "w-full",
            cardBox:
              "rounded-xl border border-border bg-card shadow-sm w-full max-w-none",
            scrollBox: "bg-card",
            navbar: "bg-card border-b border-border",
            navbarButton: "text-foreground hover:bg-muted",
            headerTitle: "text-foreground font-serif",
            headerSubtitle: "text-muted-foreground",
            formButtonPrimary:
              "bg-kiln-orange hover:bg-kiln-orange/90 text-white",
            formFieldInput:
              "bg-background border border-border text-foreground focus:border-kiln-orange/40",
            menuButton: "text-foreground hover:bg-muted",
            badge: "bg-muted text-foreground",
            avatarBox: "ring-1 ring-border",
          },
          variables: {
            colorPrimary: "#F97316",
            colorBackground: "hsl(var(--card))",
            colorText: "hsl(var(--foreground))",
            colorTextSecondary: "hsl(var(--muted-foreground))",
            colorInputBackground: "hsl(var(--background))",
            colorInputText: "hsl(var(--foreground))",
            borderRadius: "0.5rem",
          },
        }}
      />

      <div className="mt-6 rounded-lg border border-border bg-card/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Organization ID
        </p>
        <p className="mt-1 font-mono text-xs text-foreground">{organization.id}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Use this ID when configuring API integrations or referencing the
          organization in support requests.
        </p>
      </div>
    </div>
  );
}
