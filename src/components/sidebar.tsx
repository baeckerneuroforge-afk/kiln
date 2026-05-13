"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import {
  Activity,
  Bot,
  Building2,
  LayoutDashboard,
  Settings,
  X,
  Sparkles,
  LogOut,
  ChevronUp,
  ChevronRight,
  Plug,
  Store,
  ChevronsLeft,
  ChevronsRight,
  MessageSquare,
  HelpCircle,
  Waypoints,
  Code2,
  Bolt,
  Workflow,
  CreditCard,
  TrendingUp,
  ShieldCheck,
  Lock,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import { WhatsNewBell } from "@/components/whats-new";
import { OrgChangeRefresh } from "@/components/org-switcher";
import { ContextSwitcher } from "@/components/context-switcher";
import { useOrgModeDetails } from "@/hooks/use-org-mode";
import {
  useAgencyPermissions,
  type AgencyPermissionName,
} from "@/hooks/use-agency-permissions";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { OrgMode } from "@/lib/org-mode";

const SIDEBAR_COLLAPSED_KEY = "kiln-sidebar-collapsed";
const SIDEBAR_SECTIONS_KEY = "kiln-sidebar-sections";

/* ── Types ── */

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  // Sprint 19.6.1 — minAgents/requiresPro removed. Items are always
  // visible so users can discover the platform's surface; tier-locked
  // items render with a Lock badge + "Upgrade to unlock" tooltip
  // instead of disappearing.
  //
  // Stripe-Connect-class features (AGENCY / ENTERPRISE / ADMIN only).
  // Branding white-label, Stripe Connect, revenue dashboard. NOT BUSINESS.
  requiresBusiness?: boolean;
  // Sub-org-class features (BUSINESS / AGENCY / ENTERPRISE / ADMIN).
  // Sub-orgs page itself, multi-tenant management. Includes BUSINESS.
  requiresAgencyTier?: boolean;
  requiresAgencyOps?: boolean;
  // Sprint 19.7.6 — agency-internal RBAC. Hidden unless the caller's
  // AgencyRole grants this permission. Distinct from the tier gates
  // above (those check plan, this checks role).
  requiresAgencyPermission?: AgencyPermissionName;
  // One-line context shown in the hover tooltip — used to disambiguate
  // visually-similar entries (e.g. Workflows vs Orchestration).
  tooltipDescription?: string;
  tourId?: string;
}

interface NavSection {
  id: string;
  label: string | null; // null = no header (always visible)
  defaultOpen: boolean;
  items: NavItem[];
}

/* ── Navigation Structure ── */

// Sprint 19.6 — sidebar consolidated to 14 primary items across 6 sections.
//
// Items removed from the sidebar but still reachable via direct URL or via
// inline buttons on the new home pages:
//   - /dashboard/operations  → consolidated into /dashboard (redirected)
//   - /dashboard/onboarding  → "Add Customer" button on /dashboard/agency/sub-orgs
//   - /dashboard/computer-use, /dashboard/agent-swarm, /dashboard/deep-research,
//     /dashboard/orchestration  → still routable, not in sidebar
//   - /dashboard/llm-usage, /dashboard/teams/monitor, /dashboard/teams/ab-tests
//     → still routable; future sprint folds them under Analytics tabs
//   - /dashboard/nodes-marketplace  → still routable; future sprint folds
//     under Developers tabs
//   - /dashboard/shared  → still routable; future sprint folds under
//     Marketplace tabs
//   - /dashboard/clients  → semantically separate from Sub-Orgs; kept routable
//     until product confirms whether to merge (TODO: clarify with stakeholder)
//   - /dashboard/agency/email-branding  → still routable; future sprint folds
//     under Branding tabs
//   - /dashboard/data-explorer  → still routable; lives under Settings flow
//   - /dashboard/templates/agents  → still routable; future sprint folds
//     under Workflows tabs
// Sprint 19.6.1 — items no longer carry a `minAgents` gate. Tier-locked
// items still render but with a Lock badge (see Sidebar.isItemLocked).
export const AGENCY_NAV_SECTIONS: NavSection[] = [
  {
    id: "primary",
    label: null,
    defaultOpen: true,
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    defaultOpen: true,
    items: [
      { name: "Sub-Orgs", href: "/dashboard/agency/sub-orgs", icon: Building2, requiresAgencyTier: true },
      { name: "Conversations", href: "/dashboard/conversations", icon: MessageSquare },
    ],
  },
  {
    id: "build",
    label: "Build",
    defaultOpen: true,
    items: [
      { name: "Agents", href: "/dashboard/agents", icon: Bot, tourId: "agents" },
      {
        name: "Workflows",
        href: "/dashboard/teams",
        icon: Workflow,
        tourId: "workflows",
        tooltipDescription: "Multi-step workflows + visual editor",
      },
      {
        name: "Departments",
        href: "/dashboard/departments",
        icon: Building2,
        tooltipDescription: "Autonomous manager-led teams",
      },
      { name: "Knowledge", href: "/dashboard/knowledge", icon: Waypoints, tooltipDescription: "Knowledge bases and graph" },
      { name: "Integrations", href: "/dashboard/integrations", icon: Plug, tourId: "integrations" },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    defaultOpen: false,
    items: [
      { name: "Analytics", href: "/dashboard/intelligence", icon: Activity },
    ],
  },
  {
    id: "extend",
    label: "Extend",
    defaultOpen: false,
    items: [
      { name: "Marketplace", href: "/marketplace", icon: Store },
      { name: "Industry Packs", href: "/dashboard/admin/industry-packs", icon: ShieldCheck, requiresAgencyTier: true },
      { name: "Developers", href: "/developers", icon: Code2 },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    defaultOpen: false,
    items: [
      {
        name: "Team",
        href: "/dashboard/agency/team",
        icon: Users,
        requiresAgencyPermission: "members.manage",
      },
      {
        name: "Billing",
        href: "/dashboard/agency/billing",
        icon: CreditCard,
        requiresBusiness: true,
        requiresAgencyPermission: "billing.manage",
      },
      { name: "Revenue", href: "/dashboard/agency/revenue", icon: TrendingUp, requiresBusiness: true },
      { name: "Branding", href: "/dashboard/agency/branding", icon: Settings, requiresBusiness: true },
      { name: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

export const SUB_ORG_NAV_SECTIONS: NavSection[] = [
  {
    id: "sub-org-core",
    label: null,
    defaultOpen: true,
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Meine Departments", href: "/dashboard/departments", icon: Building2 },
      { name: "Meine Agents", href: "/dashboard/agents", icon: Bot },
      { name: "Meine Workflows", href: "/dashboard/teams", icon: Workflow },
      { name: "Meine Conversations", href: "/dashboard/conversations", icon: MessageSquare },
      { name: "Meine Knowledge Base", href: "/dashboard/knowledge", icon: Waypoints },
      { name: "Meine Approvals", href: "/dashboard/departments", icon: ShieldCheck },
      { name: "Meine Integrationen", href: "/dashboard/integrations", icon: Plug },
      { name: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

export function getSidebarSectionsForMode(mode: OrgMode): NavSection[] {
  if (mode === "SUB_ORG") return SUB_ORG_NAV_SECTIONS;
  return AGENCY_NAV_SECTIONS;
}

// Sprint 19.7.2 — sub-org nested-route navigation.
//
// When an agency user opens /dashboard/sub-org/[subOrgId]/* the sidebar
// shows a sub-org-scoped 10-item nav. Hrefs are absolute and prefixed
// with the sub-org id so the routes stay scoped under the agency
// session. Only Dashboard exists today; Sprint 19.7.3 fills in the
// rest of the pages.
export function getNestedSubOrgNavSections(subOrgId: string): NavSection[] {
  const base = `/dashboard/sub-org/${subOrgId}`;
  return [
    {
      id: "primary",
      label: null,
      defaultOpen: true,
      items: [
        { name: "Dashboard", href: base, icon: LayoutDashboard },
      ],
    },
    {
      id: "agents",
      label: "Agents",
      defaultOpen: true,
      items: [
        { name: "Agents", href: `${base}/agents`, icon: Bot },
        { name: "Workflows", href: `${base}/workflows`, icon: Workflow },
        { name: "Knowledge", href: `${base}/knowledge`, icon: Waypoints },
      ],
    },
    {
      id: "engagement",
      label: "Engagement",
      defaultOpen: true,
      items: [
        { name: "Conversations", href: `${base}/conversations`, icon: MessageSquare },
        { name: "Customers", href: `${base}/customers`, icon: Building2 },
      ],
    },
    {
      id: "insights",
      label: "Insights",
      defaultOpen: false,
      items: [
        { name: "Analytics", href: `${base}/analytics`, icon: Activity },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      defaultOpen: false,
      items: [
        { name: "Integrations", href: `${base}/integrations`, icon: Plug },
        { name: "Memberships", href: `${base}/memberships`, icon: Users },
        { name: "Settings", href: `${base}/settings`, icon: Settings },
      ],
    },
  ];
}

const SUB_ORG_PATH_REGEX = /^\/dashboard\/sub-org\/([^/]+)/;

export function extractNestedSubOrgIdFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const match = SUB_ORG_PATH_REGEX.exec(pathname);
  return match?.[1] ?? null;
}

/* ── Helpers ── */

const planBadgeStyles: Record<string, string> = {
  FREE: "bg-muted text-muted-foreground",
  STARTER: "bg-blue-500/15 text-blue-400",
  PRO: "bg-kiln-orange/15 text-kiln-orange",
  BUSINESS: "bg-sky-500/15 text-sky-400",
  AGENCY: "bg-purple-500/15 text-purple-400",
  ENTERPRISE: "bg-emerald-500/15 text-emerald-400",
  ADMIN: "bg-purple-500/15 text-purple-400",
};

function NavTooltip({
  children,
  label,
  description,
  shortcut,
  show,
}: {
  children: React.ReactNode;
  label: string;
  description?: string;
  shortcut?: string;
  show: boolean;
}) {
  if (!show) return <>{children}</>;
  return (
    <div className="group/tip relative">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 z-[60] ml-2 -translate-y-1/2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground opacity-0 shadow-xl shadow-black/30 transition-opacity duration-150 group-hover/tip:opacity-100">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span>{label}</span>
          {shortcut && (
            <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
              {shortcut}
            </kbd>
          )}
        </div>
        {description && (
          <div className="mt-0.5 max-w-[220px] whitespace-normal text-[10px] font-normal text-muted-foreground">
            {description}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sidebar Component ── */

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { advancedMode, setAdvancedMode } = useAdvancedMode();
  const orgModeDetails = useOrgModeDetails();
  const { user } = useUser();
  const { signOut } = useClerk();
  const agencyPermissions = useAgencyPermissions();
  const [plan, setPlan] = useState<string>("FREE");
  const [canViewOperations, setCanViewOperations] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  // Agency white-label: when the active org is a sub-org, the branding API
  // returns the parent agency's logo + name with isInherited=true.
  const [agencyBrand, setAgencyBrand] = useState<{
    logoUrl: string | null;
    agencyName: string | null;
    showAgencyLogo: boolean;
    isInherited: boolean;
  } | null>(null);

  // Section expand/collapse state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    for (const s of AGENCY_NAV_SECTIONS) {
      if (s.label) defaults[s.id] = s.defaultOpen;
    }
    return defaults;
  });

  // Load persisted state
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === "true") setCollapsed(true);
      const sections = localStorage.getItem(SIDEBAR_SECTIONS_KEY);
      if (sections) {
        const parsed = JSON.parse(sections);
        if (typeof parsed === "object" && parsed !== null) {
          setOpenSections((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch { /* SSR / privacy */ }
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch { /* */ }
  }

  // Inject sidebar-specific CSS once: custom scrollbar (4px,
  // muted-foreground), and a stagger fade-in keyframe used by nav
  // links via inline animationDelay. Lives here so the styles are
  // co-located with the component that owns them.
  useEffect(() => {
    const id = "kiln-sidebar-styles";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes kiln-sidebar-item-in {
        from { opacity: 0; transform: translateX(-4px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      .kiln-sidebar-fade-in {
        animation: kiln-sidebar-item-in 220ms ease-out both;
      }
      /* Slim, theme-aware scrollbar inside the nav scroll-area */
      .kiln-sidebar-scroll::-webkit-scrollbar { width: 4px; }
      .kiln-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
      .kiln-sidebar-scroll::-webkit-scrollbar-thumb {
        background: hsl(var(--muted-foreground) / 0.25);
        border-radius: 4px;
      }
      .kiln-sidebar-scroll::-webkit-scrollbar-thumb:hover {
        background: hsl(var(--muted-foreground) / 0.45);
      }
      .kiln-sidebar-scroll {
        scrollbar-width: thin;
        scrollbar-color: hsl(var(--muted-foreground) / 0.25) transparent;
      }
      /* Respect reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .kiln-sidebar-fade-in { animation: none !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  // Cmd/Ctrl+B toggles the sidebar — standard shortcut in Linear /
  // Cursor / VS Code. Skipped while typing in an input so it doesn't
  // hijack legitimate text edits.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ctrl = e.metaKey || e.ctrlKey;
      if (!ctrl || e.key.toLowerCase() !== "b") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      toggleCollapsed();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }

  useEffect(() => {
    // Sprint 19.6.1 — only plan is read here now; agentCount used to
    // gate minAgents items but that gate was removed. canViewOperations
    // upgrades any AGENCY/ENTERPRISE/ADMIN tier into the ops view.
    fetch("/api/stripe/plan")
      .then((res) => res.json())
      .then((data) => {
        setPlan(data.plan || "FREE");
        if (["AGENCY", "ENTERPRISE", "ADMIN"].includes(data.plan || "FREE")) {
          setCanViewOperations(true);
        }
      })
      .catch(() => {});

    fetch("/api/agency/branding")
      .then((res) => res.json())
      .then((data) => {
        if (data?.branding) {
          setAgencyBrand({
            logoUrl: data.branding.logoUrl ?? null,
            agencyName: data.branding.agencyName ?? null,
            showAgencyLogo: data.branding.showAgencyLogo ?? true,
            isInherited: Boolean(data.isInherited),
          });
        }
      })
      .catch(() => {});

    fetch("/api/agency/sub-orgs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data?.subOrgs) && data.subOrgs.length >= 2) {
          setCanViewOperations(true);
        }
      })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    if (showUserMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showUserMenu]);

  const displayName =
    user?.firstName || user?.username || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "User";
  const displayEmail = user?.emailAddresses?.[0]?.emailAddress || "";

  const isCollapsed = collapsed;
  const orgMode = orgModeDetails.loading ? null : orgModeDetails.mode;
  const nestedSubOrgId = extractNestedSubOrgIdFromPath(pathname);
  // Sprint 19.7.2 — URL beats orgMode here. An agency user visiting
  // /dashboard/sub-org/[id]/* sees the sub-org nav even though their
  // active Clerk org is still the agency.
  const navSections = nestedSubOrgId
    ? getNestedSubOrgNavSections(nestedSubOrgId)
    : getSidebarSectionsForMode(orgMode ?? "AGENCY");

  // Sprint 19.6.1 — items are always visible (so users can discover the
  // surface area of the platform). The only thing we hide entirely is
  // `requiresAgencyOps`, which is internal and not a sales surface.
  //
  // Sprint 19.7.6 — agency-RBAC items (requiresAgencyPermission) are
  // also fully hidden when the caller's AgencyRole doesn't grant the
  // permission. Different from `requiresBusiness`: that gate is about
  // pricing tier and shows a Lock badge to drive upgrades, this gate
  // is about org-internal trust and should not be advertised at all.
  function isItemVisible(item: NavItem): boolean {
    if (item.requiresAgencyOps && !canViewOperations && !pathname.startsWith("/dashboard/operations")) {
      return false;
    }
    if (item.requiresAgencyPermission) {
      // While loading we keep the item hidden — better a brief hide
      // than a flash-then-disappear.
      if (agencyPermissions.loading) return false;
      if (!agencyPermissions.has(item.requiresAgencyPermission)) return false;
    }
    return true;
  }

  // Tier gates: still visible, but rendered with a Lock badge + tooltip.
  // The link itself stays clickable so the user can hit the page and see
  // its native upgrade prompt — we don't pre-empt that messaging here.
  function isItemLocked(item: NavItem): boolean {
    if (item.requiresBusiness) {
      // Stripe-Connect-class plans only — BUSINESS does NOT qualify.
      const isBusiness = ["AGENCY", "ENTERPRISE", "ADMIN"].includes(plan);
      if (!isBusiness) return true;
    }
    if (item.requiresAgencyTier) {
      // Anyone with sub-orgs — BUSINESS, AGENCY, ENTERPRISE, ADMIN.
      const isAgencyTier = ["BUSINESS", "AGENCY", "ENTERPRISE", "ADMIN"].includes(plan);
      if (!isAgencyTier) return true;
    }
    return false;
  }

  function isActive(href: string): boolean {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  }

  // Auto-expand section if it contains active item
  useEffect(() => {
    for (const section of navSections) {
      if (!section.label) continue;
      const hasActive = section.items.some((item) => isActive(item.href));
      if (hasActive && !openSections[section.id]) {
        setOpenSections((prev) => ({ ...prev, [section.id]: true }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, navSections]);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-border bg-sidebar transition-all duration-200 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          "w-60",
          isCollapsed && "lg:w-[60px]",
        )}
      >
        {/* Header — agency branding overrides the KILN mark in sub-orgs.
            Logo gets a subtle hover scale + the right-side button cluster
            (bell + collapse) groups tightly for a tidy top-bar feel. */}
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <Link
            href="/dashboard"
            className="group flex items-center gap-2.5"
            onClick={onClose}
            title="Dashboard"
          >
            {orgMode === "SUB_ORG" &&
            orgModeDetails.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={orgModeDetails.logoUrl}
                alt={orgModeDetails.subOrgName ?? "Sub-Org"}
                className="h-8 w-auto max-w-[140px] object-contain transition-transform duration-200 group-hover:scale-[1.04]"
              />
            ) : agencyBrand?.isInherited &&
            agencyBrand.showAgencyLogo &&
            agencyBrand.logoUrl ? (
              // White-label: render the agency's logo image. KILN moves to
              // a "powered by" footer (handled by LegalFooter).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={agencyBrand.logoUrl}
                alt={agencyBrand.agencyName ?? "Agency"}
                className="h-8 w-auto max-w-[140px] object-contain transition-transform duration-200 group-hover:scale-[1.04]"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-kiln-orange to-kiln-ember shadow-lg shadow-kiln-orange/20 transition-transform duration-200 group-hover:scale-[1.05]">
                <span className="font-serif text-base font-bold text-white">K</span>
              </div>
            )}
            <span
              className={cn(
                "font-serif text-lg text-foreground transition-all duration-200 group-hover:text-kiln-orange",
                isCollapsed && "lg:hidden",
                ((orgMode === "SUB_ORG" && orgModeDetails.logoUrl) ||
                  (agencyBrand?.isInherited &&
                  agencyBrand.showAgencyLogo &&
                  agencyBrand.logoUrl)) &&
                  "hidden"
              )}
            >
              {orgMode === "SUB_ORG" && orgModeDetails.subOrgName
                ? orgModeDetails.subOrgName
                : agencyBrand?.isInherited &&
              agencyBrand.showAgencyLogo &&
              agencyBrand.agencyName
                ? agencyBrand.agencyName
                : "KILN"}
            </span>
          </Link>
          <div className="flex items-center gap-0.5">
            <div className={cn(isCollapsed && "lg:hidden")}>
              <WhatsNewBell />
            </div>
            <NavTooltip
              label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              shortcut="⌘B"
              show={true}
            >
              <button
                onClick={toggleCollapsed}
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="hidden h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
              >
                {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
              </button>
            </NavTooltip>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <Separator className={cn("my-2", isCollapsed ? "lg:mx-2" : "mx-3")} />

        {/* Sprint 19.7.4.1 — single hierarchical context switcher.
            Combines Clerk-org switching (setActive) and KILN-side
            route switching (/dashboard ↔ /dashboard/sub-org/[id]) in
            one dropdown; the old AgencyOrgSwitcher is retired. */}
        <OrgChangeRefresh />
        <ContextSwitcher collapsed={isCollapsed} />

        <Separator className={cn("my-2", isCollapsed ? "lg:mx-2" : "mx-3")} />

        {/* Navigation */}
        <nav className={cn("kiln-sidebar-scroll flex flex-1 flex-col overflow-y-auto pb-2", isCollapsed ? "lg:px-1.5" : "px-2")}>
          {orgMode === null && (
            <div className={cn("space-y-2 px-2 py-3", isCollapsed && "lg:px-1.5")}>
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="h-8 rounded-md bg-muted/40" />
              ))}
            </div>
          )}
          {orgMode !== null && navSections.map((section) => {
            const visibleItems = section.items.filter(isItemVisible);
            if (visibleItems.length === 0) return null;

            const isSectionOpen = section.label === null || openSections[section.id] !== false;

            return (
              <div key={section.id} className={section.label ? "mt-4" : "mt-1"}>
                {/* Section header */}
                {section.label && !isCollapsed && (
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="flex w-full items-center gap-1.5 px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 transition-colors hover:text-foreground/80"
                  >
                    <ChevronRight
                      className={cn(
                        "h-3 w-3 shrink-0 transition-transform duration-200 ease-out",
                        isSectionOpen && "rotate-90"
                      )}
                    />
                    <span>{section.label}</span>
                  </button>
                )}

                {/* Section header (collapsed) — single dot divider so the
                    grouping stays visible without taking horizontal room */}
                {section.label && isCollapsed && (
                  <div className="my-2 flex justify-center">
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                  </div>
                )}

                {/* Items */}
                {isSectionOpen && (
                  <div className="flex flex-col gap-0.5">
                    {visibleItems.map((item, idx) => {
                      const active = isActive(item.href);
                      const locked = isItemLocked(item);
                      return (
                        <NavTooltip
                          key={item.href}
                          label={item.name}
                          description={locked ? "Upgrade to unlock" : item.tooltipDescription}
                          show={isCollapsed}
                        >
                          <Link
                            href={item.href}
                            onClick={onClose}
                            {...(item.tourId ? { "data-tour": item.tourId } : {})}
                            {...(locked ? { "data-locked": "true" } : {})}
                            style={{ animationDelay: `${idx * 25}ms` }}
                            className={cn(
                              "group relative flex items-center rounded-md text-[13px] font-medium kiln-sidebar-fade-in",
                              "transition-[background-color,color,box-shadow] duration-200 ease-out",
                              isCollapsed
                                ? "lg:justify-center lg:px-0 lg:py-2 px-3 py-2 gap-3"
                                : "gap-3 px-3 py-2",
                              active
                                ? "bg-kiln-orange/10 text-kiln-orange font-semibold"
                                : locked
                                  ? "text-muted-foreground/60 hover:bg-muted/30 hover:text-muted-foreground"
                                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            )}
                          >
                            {/* Strong 3px-wide kiln-orange left border —
                                full height of the item, not the partial
                                gradient bar from v1. */}
                            {active && (
                              <span
                                aria-hidden
                                className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-kiln-orange"
                              />
                            )}
                            <item.icon
                              className={cn(
                                "h-4 w-4 shrink-0 transition-colors duration-200",
                                active
                                  ? "text-kiln-orange"
                                  : locked
                                    ? "text-muted-foreground/50"
                                    : "text-muted-foreground/80 group-hover:text-foreground"
                              )}
                            />
                            <span
                              className={cn(
                                "truncate transition-opacity duration-200",
                                isCollapsed && "lg:hidden"
                              )}
                            >
                              {item.name}
                            </span>
                            {locked && !isCollapsed && (
                              <Lock
                                aria-label="locked"
                                className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/60"
                              />
                            )}
                          </Link>
                        </NavTooltip>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className={cn("flex flex-col gap-px border-t border-white/[0.06] pt-2 pb-2", isCollapsed ? "lg:px-1.5" : "px-2")}>
          {/* Help */}
          <NavTooltip label="Help" show={isCollapsed}>
            <Link
              href="/help"
              target="_blank"
              onClick={onClose}
              data-tour="help"
              className={cn(
                "group relative flex items-center rounded-md text-[13px] font-medium transition-all duration-150",
                isCollapsed ? "lg:justify-center lg:px-0 lg:py-2 px-2.5 py-2 gap-2.5" : "gap-2.5 px-2.5 py-[7px]",
                "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              )}
            >
              <HelpCircle className="h-[16px] w-[16px] shrink-0 text-muted-foreground" />
              <span className={cn("transition-opacity duration-200", isCollapsed && "lg:hidden")}>Help</span>
            </Link>
          </NavTooltip>

          <Separator className={cn("my-1.5", isCollapsed && "lg:mx-0")} />

          {/* User Profile — avatar gets a kiln-orange ring for ADMIN
              users so we can spot internal sessions at a glance */}
          <div className="relative" ref={menuRef}>
            <NavTooltip label="Account" show={isCollapsed}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-label="Open account menu"
                aria-expanded={showUserMenu}
                className={cn(
                  "flex w-full items-center rounded-md transition-colors hover:bg-muted/50",
                  isCollapsed ? "lg:justify-center lg:px-0 lg:py-2 px-3 py-2 gap-3" : "gap-3 px-3 py-2"
                )}
              >
                <div className="relative shrink-0">
                  {user?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.imageUrl}
                      alt={displayName}
                      className={cn(
                        "h-7 w-7 rounded-full object-cover ring-1",
                        plan === "ADMIN" ? "ring-2 ring-kiln-orange" : "ring-border",
                      )}
                    />
                  ) : (
                    <div
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground ring-1",
                        plan === "ADMIN" ? "ring-2 ring-kiln-orange" : "ring-border",
                      )}
                    >
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-[1.5px] border-sidebar bg-kiln-green" />
                </div>
                <div className={cn("flex-1 min-w-0 text-left transition-opacity duration-200", isCollapsed && "lg:hidden")}>
                  <p className="truncate text-[13px] font-medium text-foreground">{displayName}</p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                      planBadgeStyles[plan] || planBadgeStyles.FREE
                    )}
                  >
                    {plan === "ADMIN" && <Sparkles className="h-2 w-2" />}
                    {plan}
                  </span>
                </div>
                <ChevronUp
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                    showUserMenu ? "rotate-0" : "rotate-180",
                    isCollapsed && "lg:hidden"
                  )}
                />
              </button>
            </NavTooltip>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <div className={cn(
                "absolute bottom-full mb-2 rounded-xl border border-border bg-card shadow-xl overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-150",
                isCollapsed ? "lg:left-full lg:bottom-0 lg:mb-0 lg:ml-2 w-56" : "left-0 right-0"
              )}>
                <div className="border-b border-border px-4 py-3">
                  <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                  {displayEmail && (
                    <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
                  )}
                  <span
                    className={cn(
                      "mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      planBadgeStyles[plan] || planBadgeStyles.FREE
                    )}
                  >
                    {plan === "ADMIN" && <Sparkles className="h-2.5 w-2.5" />}
                    {plan} Plan
                  </span>
                </div>

                <div className="py-1">
                  <Link
                    href="/dashboard/settings"
                    onClick={() => {
                      setShowUserMenu(false);
                      onClose?.();
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                  <Link
                    href="/dashboard/organization/settings"
                    onClick={() => {
                      setShowUserMenu(false);
                      onClose?.();
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Building2 className="h-4 w-4" />
                    Organization
                  </Link>
                  {/* Advanced Mode toggle */}
                  <button
                    onClick={() => setAdvancedMode(!advancedMode)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Bolt className={cn("h-4 w-4", advancedMode && "text-purple-400")} />
                    <span className="flex-1 text-left">Advanced</span>
                    <div
                      className={cn(
                        "relative h-4 w-7 rounded-full transition-colors duration-200",
                        advancedMode ? "bg-purple-500" : "bg-muted"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200",
                          advancedMode ? "translate-x-3" : "translate-x-0.5"
                        )}
                      />
                    </div>
                  </button>
                  <Separator className="my-1" />
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      signOut({ redirectUrl: "/" });
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-500/10"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
