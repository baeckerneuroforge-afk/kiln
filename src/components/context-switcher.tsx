"use client";

/**
 * Sprint 19.7.2 — ContextSwitcher lives at the top of the sidebar and
 * lets an agency user jump between the Agency view and any sub-org
 * they have a SubOrgMembership for, all without changing the active
 * Clerk org. Routing-only — no Clerk session work.
 *
 * Hidden entirely when the caller has no sub-org memberships, since
 * there's nothing to switch to. The agency-org switcher beside it
 * still handles Clerk-side org switching for the rare cases that
 * actually need it (Personal Workspace ↔ Agency).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown, LayoutDashboard, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentContext } from "@/hooks/useCurrentContext";

interface SubOrgEntry {
  subOrgId: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}

export function ContextSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const context = useCurrentContext();
  const [subOrgs, setSubOrgs] = useState<SubOrgEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/sub-orgs/for-current-user", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { subOrgs: [] }))
      .then((data) => {
        const list: SubOrgEntry[] = Array.isArray(data?.subOrgs)
          ? data.subOrgs.map((s: SubOrgEntry) => ({
              subOrgId: s.subOrgId,
              name: s.name,
              status: s.status,
            }))
          : [];
        setSubOrgs(list.filter((s) => s.status === "ACTIVE"));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // No sub-orgs → no switcher. Hide so the sidebar isn't cluttered
  // with an empty dropdown.
  if (loaded && subOrgs.length === 0) return null;

  const isAgency = context.type === "agency";
  const activeSubOrg = isAgency ? null : subOrgs.find((s) => s.subOrgId === context.id);
  const label = isAgency
    ? "Agency Overview"
    : activeSubOrg?.name ?? context.name ?? "Sub-Org";

  return (
    <div className={cn("relative px-2 pt-2 pb-1", collapsed && "lg:px-1.5")} data-testid="context-switcher">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-white/[0.06] bg-card/40 px-2.5 py-2 text-left text-[12px] font-medium transition-colors hover:bg-card/70",
          isAgency ? "text-foreground" : "text-kiln-orange"
        )}
      >
        {isAgency ? (
          <LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Building2 className="h-3.5 w-3.5 shrink-0 text-kiln-orange" />
        )}
        <span className={cn("min-w-0 flex-1 truncate", collapsed && "lg:hidden")}>{label}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
            collapsed && "lg:hidden"
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-2 right-2 top-full z-30 mt-1 overflow-hidden rounded-md border border-white/[0.08] bg-popover shadow-xl"
        >
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-[12px] transition-colors hover:bg-muted/50",
              isAgency ? "text-foreground font-semibold" : "text-muted-foreground"
            )}
            role="menuitem"
          >
            <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 truncate">Agency Overview</span>
            {isAgency && <Check className="h-3 w-3 text-kiln-orange" />}
          </Link>
          {subOrgs.length > 0 && (
            <div className="border-t border-white/[0.06]" />
          )}
          {subOrgs.map((s) => {
            const isCurrent = !isAgency && context.id === s.subOrgId;
            return (
              <Link
                key={s.subOrgId}
                href={`/dashboard/sub-org/${s.subOrgId}`}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-[12px] transition-colors hover:bg-muted/50",
                  isCurrent ? "text-kiln-orange font-semibold" : "text-muted-foreground"
                )}
                role="menuitem"
              >
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate">{s.name}</span>
                {isCurrent && <Check className="h-3 w-3 text-kiln-orange" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
