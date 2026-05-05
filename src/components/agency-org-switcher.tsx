"use client";

/**
 * AgencyOrgSwitcher — custom replacement for Clerk's <OrganizationSwitcher />.
 *
 * Same job (let the user switch active org) but renders the membership
 * tree from /api/agency/memberships in three sections so an agency
 * with 25 sub-orgs doesn't have a flat 26-item dropdown:
 *
 *   - Personal Workspace        (single row)
 *   - Each agency the user owns (header row + indented sub-org list)
 *   - Other Workspaces          (sub-orgs the user was invited to as a
 *                                member without being in the parent agency)
 *
 * "Create Organization" stays in the footer for non-agency tiers.
 *
 * Decision logic is split into a pure function `decideSwitcherSections`
 * (exported) so the bucket assignment can be tested without rendering.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useClerk, useOrganization } from "@clerk/nextjs";
import { Building2, ChevronDown, Plus, User } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  type AgencyEntry,
  type Membership,
  type SubOrgEntry,
  type SwitcherData,
  MEMBERSHIPS_ENDPOINT_PATH,
} from "./agency-org-switcher-types";

const MEMBERSHIPS_ENDPOINT = MEMBERSHIPS_ENDPOINT_PATH;

// Re-export for callers that imported these from the .tsx in earlier commits.
export type { AgencyEntry, Membership, SubOrgEntry, SwitcherData };
export { MEMBERSHIPS_ENDPOINT_PATH };
export { decideSwitcherSections } from "./agency-org-switcher-types";

interface AgencyOrgSwitcherProps {
  collapsed?: boolean;
}

export function AgencyOrgSwitcher({ collapsed = false }: AgencyOrgSwitcherProps) {
  const router = useRouter();
  const { isLoaded: authLoaded, orgId: activeOrgId } = useAuth();
  const { organization } = useOrganization();
  const { setActive } = useClerk();

  const [data, setData] = useState<SwitcherData | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch the bucketed membership tree once when the component first
  // sees an authenticated session. We re-fetch on org-switch via
  // router.refresh() in the handler below — Server Components in the
  // dashboard tree can pick up the new org context that way.
  useEffect(() => {
    if (!authLoaded) return;
    let cancelled = false;
    fetch(MEMBERSHIPS_ENDPOINT)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((body) => {
        if (!cancelled) setData(body as SwitcherData);
      })
      .catch(() => {
        // Endpoint may 401 during early hydration — silent. The user
        // sees the trigger label "Loading…" until next attempt.
      });
    return () => {
      cancelled = true;
    };
  }, [authLoaded, activeOrgId]);

  // Outside-click close.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const switchTo = useCallback(
    async (targetOrgId: string | null) => {
      if (!setActive) return;
      setSwitching(targetOrgId ?? "personal");
      try {
        await setActive({
          organization: targetOrgId === null ? undefined : targetOrgId,
        });
        setOpen(false);
        router.refresh();
      } catch (err) {
        console.warn("[AgencyOrgSwitcher] setActive failed:", err);
      } finally {
        setSwitching(null);
      }
    },
    [setActive, router]
  );

  const triggerLabel = organization?.name ?? data?.personal?.name ?? "Loading…";
  const triggerImage = organization?.imageUrl ?? data?.personal?.imageUrl ?? null;

  return (
    <div ref={popoverRef} className={cn("relative px-2", collapsed && "lg:flex lg:justify-center")}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-border bg-sidebar px-2.5 py-2 text-[13px] text-foreground hover:bg-white/[0.03] focus:outline-none focus-visible:ring-1 focus-visible:ring-kiln-orange/40",
          collapsed && "lg:justify-center lg:px-0"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {triggerImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={triggerImage}
            alt={triggerLabel}
            className="h-5 w-5 shrink-0 rounded ring-1 ring-border"
          />
        ) : (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold">
            {triggerLabel.charAt(0).toUpperCase()}
          </div>
        )}
        <span className={cn("flex-1 truncate text-left", collapsed && "lg:hidden")}>
          {triggerLabel}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
            collapsed && "lg:hidden"
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
          {!data ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              Loading workspaces…
            </div>
          ) : (
            <>
              {data.personal && (
                <Section title="Personal">
                  <Row
                    name={data.personal.name}
                    imageUrl={data.personal.imageUrl}
                    icon={<User className="h-3.5 w-3.5" />}
                    active={activeOrgId === data.personal.orgId}
                    onClick={() =>
                      data.personal && switchTo(data.personal.orgId)
                    }
                    busy={switching === data.personal.orgId}
                  />
                </Section>
              )}

              {data.agencies.map((agency) => (
                <Section key={agency.orgId} title={agency.name}>
                  <Row
                    name={agency.name}
                    imageUrl={agency.imageUrl}
                    icon={<Building2 className="h-3.5 w-3.5" />}
                    active={activeOrgId === agency.orgId}
                    onClick={() => switchTo(agency.orgId)}
                    busy={switching === agency.orgId}
                  />
                  {agency.subOrgs.map((s) => (
                    <Row
                      key={s.orgId}
                      name={s.name}
                      imageUrl={s.imageUrl}
                      indent
                      active={activeOrgId === s.orgId}
                      onClick={() => switchTo(s.orgId)}
                      busy={switching === s.orgId}
                    />
                  ))}
                </Section>
              ))}

              {data.other.length > 0 && (
                <Section title="Other workspaces">
                  {data.other.map((m) => (
                    <Row
                      key={m.orgId}
                      name={m.name}
                      imageUrl={m.imageUrl}
                      active={activeOrgId === m.orgId}
                      onClick={() => switchTo(m.orgId)}
                      busy={switching === m.orgId}
                    />
                  ))}
                </Section>
              )}

              <div className="border-t border-border p-2">
                <Link
                  href="/onboarding/create-organization"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setOpen(false)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create organization
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="pb-1.5">{children}</div>
    </div>
  );
}

function Row({
  name,
  imageUrl,
  icon,
  active,
  indent,
  busy,
  onClick,
}: {
  name: string;
  imageUrl?: string | null;
  icon?: React.ReactNode;
  active?: boolean;
  indent?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-xs transition-colors",
        indent && "pl-7",
        active
          ? "bg-kiln-orange/10 text-kiln-orange"
          : "text-foreground hover:bg-muted",
        busy && "opacity-60"
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={name}
          className="h-4 w-4 shrink-0 rounded ring-1 ring-border"
        />
      ) : icon ? (
        icon
      ) : (
        <div className="h-4 w-4 shrink-0 rounded bg-muted text-[9px] font-semibold flex items-center justify-center">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="flex-1 truncate">{name}</span>
    </button>
  );
}

// decideSwitcherSections + MEMBERSHIPS_ENDPOINT_PATH live in
// ./agency-org-switcher-types.ts and are re-exported above.
