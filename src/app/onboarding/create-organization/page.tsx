"use client";

/**
 * Onboarding: create organization.
 *
 * Reached when an authenticated user has zero org memberships — e.g. when
 * the Phase-2.1 user.created webhook didn't run (Clerk Organizations
 * disabled in dev) or the personal-org backfill failed for that user.
 * Renders Clerk's <CreateOrganization /> component which handles the
 * form, slug generation, and Clerk-side membership wiring.
 *
 * On success Clerk routes back to /dashboard via afterCreateOrganizationUrl.
 */
import { CreateOrganization } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Building2 } from "lucide-react";

export default function CreateOrganizationPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-kiln-orange to-kiln-ember shadow-lg shadow-kiln-orange/20">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <h1 className="font-serif text-2xl text-foreground">
            Create your workspace
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One workspace per team. You can invite members later from
            Organization Settings.
          </p>
        </div>

        <CreateOrganization
          afterCreateOrganizationUrl="/dashboard"
          skipInvitationScreen
          appearance={{
            baseTheme: dark,
            elements: {
              rootBox: "w-full",
              cardBox:
                "rounded-xl border border-border bg-card shadow-sm w-full",
              headerTitle: "text-foreground font-serif",
              headerSubtitle: "text-muted-foreground",
              formButtonPrimary:
                "bg-kiln-orange hover:bg-kiln-orange/90 text-white",
              formFieldInput:
                "bg-background border border-border text-foreground focus:border-kiln-orange/40",
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
      </div>
    </div>
  );
}
