"use client";

/**
 * OrganizationSwitcher — KILN-themed wrapper around Clerk's switcher.
 *
 * Renders Clerk's `<OrganizationSwitcher />` with appearance overrides
 * matching the dark+orange theme. The collapsed prop trims the trigger
 * to the org avatar only, for the collapsed sidebar layout.
 *
 * Cache invalidation on org change is handled separately by
 * `<OrgChangeRefresh />` in the same module — drop both into the
 * sidebar so org switches refresh server data as well as session JWTs.
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { OrganizationSwitcher, useOrganization } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { cn } from "@/lib/utils";

interface OrgSwitcherProps {
  collapsed?: boolean;
}

export function OrgSwitcher({ collapsed = false }: OrgSwitcherProps) {
  return (
    <div
      className={cn(
        "px-2",
        collapsed && "lg:flex lg:justify-center"
      )}
      data-testid="org-switcher"
    >
      <OrganizationSwitcher
        hidePersonal={false}
        afterCreateOrganizationUrl="/dashboard"
        afterSelectOrganizationUrl="/dashboard"
        afterLeaveOrganizationUrl="/dashboard"
        appearance={{
          baseTheme: dark,
          elements: {
            // Trigger button styling — matches the rest of the sidebar.
            organizationSwitcherTrigger: cn(
              "w-full justify-start gap-2 rounded-md px-2.5 py-2 text-[13px] text-foreground",
              "border border-border bg-sidebar hover:bg-sidebar-accent/60",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-kiln-orange/40",
              collapsed && "lg:justify-center lg:px-0"
            ),
            organizationSwitcherTriggerIcon: cn(collapsed && "lg:hidden"),
            organizationPreviewMainIdentifier: "text-foreground font-medium truncate",
            organizationPreviewSecondaryIdentifier: "text-muted-foreground text-[10px]",
            // Popover dropdown.
            organizationSwitcherPopoverCard:
              "rounded-xl border border-border bg-card shadow-xl",
            organizationSwitcherPopoverActionButton:
              "text-foreground hover:bg-muted",
            organizationSwitcherPopoverActionButtonText: "text-foreground",
            organizationSwitcherPopoverActionButtonIcon: "text-kiln-orange",
            organizationSwitcherPopoverFooter: "border-t border-border",
            avatarBox: "h-7 w-7 ring-1 ring-border",
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
  );
}

/**
 * Listens for the active organization changing and triggers a Next.js
 * server-data refresh (`router.refresh()`). Server Components, route
 * handlers, and any data fetched at the request boundary will re-run
 * with the new org context. Place once anywhere inside the dashboard
 * tree (typically the layout or sidebar).
 */
export function OrgChangeRefresh() {
  const router = useRouter();
  const { organization, isLoaded } = useOrganization();
  const lastOrgIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    const currentOrgId = organization?.id ?? null;
    if (lastOrgIdRef.current === undefined) {
      // First render after load — record the baseline, don't refresh.
      lastOrgIdRef.current = currentOrgId;
      return;
    }
    if (lastOrgIdRef.current !== currentOrgId) {
      lastOrgIdRef.current = currentOrgId;
      // Refresh the current Server Component tree so data fetched with
      // the previous orgId is replaced. Cheaper than a full reload —
      // client state (form drafts, scroll, modals) is preserved.
      router.refresh();
    }
  }, [organization?.id, isLoaded, router]);

  return null;
}
