"use client";

/**
 * Sprint 19.7.4.1 — SingleContextSwitcher.
 *
 * One hierarchical dropdown at the top of the sidebar that replaces
 * the old pair (AgencyOrgSwitcher + the 19.7.2 ContextSwitcher). It
 * combines two switches in one click:
 *   1. setActive() on Clerk so the session points at the right org
 *   2. router.push() so the URL lands on the right KILN view
 *
 * Layout per spec:
 *   ── <Agency name> ──
 *      ✓ Agency Overview         → /dashboard, setActive(agencyOrgId)
 *      • Sub-Org A               → /dashboard/sub-org/<id>, setActive(sub Clerk id)
 *      • Sub-Org B
 *   ── <Other Agency> ──         (only if user is member of multiple)
 *      ...
 *   ── Other workspaces ──       (Personal + sub-orgs the user joined
 *                                 without their parent agency)
 *   ── Actions ──
 *   + Add Sub-Org
 *   + Create Organization
 *
 * The export name stays `ContextSwitcher` so the sidebar import line
 * doesn't churn.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, useClerk } from "@clerk/nextjs";
import { Building2, ChevronDown, Check, Plus, LayoutDashboard, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserOrgHierarchy } from "@/lib/org/get-user-org-hierarchy";

const HIERARCHY_ENDPOINT = "/api/orgs/hierarchy";

const SUB_ORG_PATH_REGEX = /^\/dashboard\/sub-org\/([^/]+)/;

function extractCurrentSubOrgId(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const m = SUB_ORG_PATH_REGEX.exec(pathname);
  return m?.[1] ?? null;
}

export function ContextSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { orgId: activeClerkOrgId, isLoaded: authLoaded } = useAuth();
  const { setActive } = useClerk();

  const [data, setData] = useState<UserOrgHierarchy | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoaded) return;
    let cancelled = false;
    fetch(HIERARCHY_ENDPOINT, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<UserOrgHierarchy>) : null))
      .then((body) => {
        if (cancelled || !body) return;
        setData(body);
      })
      .catch(() => {
        /* 401 during early hydration is OK */
      });
    return () => {
      cancelled = true;
    };
  }, [authLoaded, activeClerkOrgId]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const currentSubOrgId = extractCurrentSubOrgId(pathname);

  const goTo = useCallback(
    async (args: { clerkOrgId: string; href: string; busyKey: string }) => {
      setSwitching(args.busyKey);
      try {
        if (setActive && activeClerkOrgId !== args.clerkOrgId) {
          await setActive({ organization: args.clerkOrgId });
        }
        router.push(args.href);
        setOpen(false);
      } catch (err) {
        console.warn("[SingleContextSwitcher] navigation failed:", err);
      } finally {
        setSwitching(null);
      }
    },
    [setActive, activeClerkOrgId, router],
  );

  // Trigger label resolution: sub-org URL wins, then active agency,
  // then standalone / personal. Fall back to "Loading…" while the
  // hierarchy fetch is in flight.
  const triggerLabel = (() => {
    if (currentSubOrgId && data) {
      for (const a of data.agencies) {
        const hit = a.subOrgs.find((s) => s.subOrgId === currentSubOrgId);
        if (hit) return hit.name;
      }
    }
    if (data && activeClerkOrgId) {
      const agencyHit = data.agencies.find((a) => a.clerkOrgId === activeClerkOrgId);
      if (agencyHit) return `${agencyHit.name} · Agency`;
      const stand = data.standaloneOrgs.find((s) => s.clerkOrgId === activeClerkOrgId);
      if (stand) return stand.name;
      if (data.personal?.clerkOrgId === activeClerkOrgId) return data.personal.name;
    }
    return "Loading…";
  })();

  const TriggerIcon = currentSubOrgId ? Building2 : LayoutDashboard;

  return (
    <div
      ref={popoverRef}
      className={cn("relative px-2 pt-2", collapsed && "lg:flex lg:justify-center")}
      data-testid="single-context-switcher"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-border bg-card/40 px-2.5 py-2 text-left text-[12px] font-medium transition-colors hover:bg-card/70",
          collapsed && "lg:justify-center lg:px-0",
          currentSubOrgId ? "text-kiln-orange" : "text-foreground",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <TriggerIcon className={cn("h-3.5 w-3.5 shrink-0", currentSubOrgId ? "text-kiln-orange" : "text-muted-foreground")} />
        <span className={cn("min-w-0 flex-1 truncate", collapsed && "lg:hidden")}>{triggerLabel}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
            collapsed && "lg:hidden",
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-2 right-2 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-md border border-white/[0.08] bg-popover shadow-xl"
        >
          {!data ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Loading workspaces…</div>
          ) : (
            <>
              {data.agencies.length === 0 && data.standaloneOrgs.length === 0 && !data.personal && (
                <div className="px-3 py-3 text-xs text-muted-foreground">No workspaces yet.</div>
              )}

              {data.agencies.map((agency) => (
                <SectionGroup key={agency.clerkOrgId} title={agency.name}>
                  <MenuRow
                    icon={<LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />}
                    label="Agency Overview"
                    active={!currentSubOrgId && activeClerkOrgId === agency.clerkOrgId}
                    busy={switching === `agency:${agency.clerkOrgId}`}
                    onClick={() =>
                      goTo({
                        clerkOrgId: agency.clerkOrgId,
                        href: "/dashboard",
                        busyKey: `agency:${agency.clerkOrgId}`,
                      })
                    }
                    testId={`switcher-agency-${agency.clerkOrgId}`}
                  />
                  {agency.subOrgs.map((s) => (
                    <MenuRow
                      key={s.subOrgId}
                      icon={<Building2 className="h-3.5 w-3.5 text-muted-foreground" />}
                      label={s.name}
                      indent
                      active={currentSubOrgId === s.subOrgId}
                      busy={switching === `sub:${s.subOrgId}`}
                      onClick={() =>
                        goTo({
                          clerkOrgId: s.clerkOrgId,
                          href: `/dashboard/sub-org/${s.subOrgId}`,
                          busyKey: `sub:${s.subOrgId}`,
                        })
                      }
                      testId={`switcher-sub-org-${s.subOrgId}`}
                    />
                  ))}
                </SectionGroup>
              ))}

              {(data.personal || data.standaloneOrgs.length > 0) && (
                <SectionGroup title="Other workspaces">
                  {data.personal && (
                    <MenuRow
                      icon={<User className="h-3.5 w-3.5 text-muted-foreground" />}
                      label={data.personal.name}
                      active={!currentSubOrgId && activeClerkOrgId === data.personal.clerkOrgId}
                      busy={switching === `personal:${data.personal.clerkOrgId}`}
                      onClick={() =>
                        goTo({
                          clerkOrgId: data.personal!.clerkOrgId,
                          href: "/dashboard",
                          busyKey: `personal:${data.personal!.clerkOrgId}`,
                        })
                      }
                      testId="switcher-personal"
                    />
                  )}
                  {data.standaloneOrgs.map((s) => (
                    <MenuRow
                      key={s.clerkOrgId}
                      icon={<Building2 className="h-3.5 w-3.5 text-muted-foreground" />}
                      label={s.name}
                      active={!currentSubOrgId && activeClerkOrgId === s.clerkOrgId}
                      busy={switching === `stand:${s.clerkOrgId}`}
                      onClick={() =>
                        goTo({
                          clerkOrgId: s.clerkOrgId,
                          href: "/dashboard",
                          busyKey: `stand:${s.clerkOrgId}`,
                        })
                      }
                      testId={`switcher-standalone-${s.clerkOrgId}`}
                    />
                  ))}
                </SectionGroup>
              )}

              <div className="border-t border-white/[0.06] p-1.5">
                <Link
                  href="/dashboard/agency/sub-orgs"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  data-testid="switcher-add-sub-org"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Sub-Org
                </Link>
                <Link
                  href="/onboarding/create-organization"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  data-testid="switcher-create-organization"
                >
                  <Plus className="h-3.5 w-3.5" /> Create Organization
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SectionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/[0.06] last:border-b-0">
      <div className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
        {title}
      </div>
      <div className="pb-1">{children}</div>
    </div>
  );
}

function MenuRow({
  icon,
  label,
  active,
  indent,
  busy,
  onClick,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  indent?: boolean;
  busy?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      role="menuitem"
      data-testid={testId}
      className={cn(
        "flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-xs transition-colors",
        indent && "pl-7",
        active ? "text-kiln-orange font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        busy && "opacity-60",
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {active && <Check className="h-3 w-3 text-kiln-orange" />}
    </button>
  );
}
