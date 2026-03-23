"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import {
  Activity,
  Bot,
  Building2,
  Zap,
  LayoutDashboard,
  Settings,
  X,
  Sparkles,
  LogOut,
  ChevronUp,
  ChevronRight,
  Network,
  Plug,
  Store,
  ChevronsLeft,
  ChevronsRight,
  MessageSquare,
  HelpCircle,
  Radio,
  FlaskConical,
  Waypoints,
  Users,
  Code2,
  Database,
  Bolt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import { WhatsNewBell } from "@/components/whats-new";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

const SIDEBAR_COLLAPSED_KEY = "kiln-sidebar-collapsed";
const SIDEBAR_SECTIONS_KEY = "kiln-sidebar-sections";

/* ── Types ── */

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  minAgents: number;
  requiresPro?: boolean;
  requiresBusiness?: boolean;
  tourId?: string;
}

interface NavSection {
  id: string;
  label: string | null; // null = no header (always visible)
  defaultOpen: boolean;
  items: NavItem[];
}

/* ── Navigation Structure ── */

const NAV_SECTIONS: NavSection[] = [
  {
    id: "core",
    label: null,
    defaultOpen: true,
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, minAgents: 0 },
      { name: "Agents", href: "/dashboard/agents", icon: Bot, minAgents: 0, tourId: "agents" },
      { name: "Conversations", href: "/dashboard/conversations", icon: MessageSquare, minAgents: 0 },
    ],
  },
  {
    id: "build",
    label: "Build",
    defaultOpen: true,
    items: [
      { name: "Workflows", href: "/dashboard/teams", icon: Zap, minAgents: 0, requiresPro: true, tourId: "workflows" },
      { name: "Orchestration", href: "/dashboard/orchestration", icon: Network, minAgents: 2 },
      { name: "Knowledge", href: "/dashboard/knowledge", icon: Waypoints, minAgents: 1 },
      { name: "Integrations", href: "/dashboard/integrations", icon: Plug, minAgents: 1, tourId: "integrations" },
    ],
  },
  {
    id: "monitor",
    label: "Monitor",
    defaultOpen: false,
    items: [
      { name: "Analytics", href: "/dashboard/intelligence", icon: Activity, minAgents: 1 },
      { name: "Monitoring", href: "/dashboard/teams/monitor", icon: Radio, minAgents: 0, requiresPro: true },
      { name: "A/B Tests", href: "/dashboard/teams/ab-tests", icon: FlaskConical, minAgents: 0, requiresPro: true },
    ],
  },
  {
    id: "extend",
    label: "Extend",
    defaultOpen: false,
    items: [
      { name: "Marketplace", href: "/marketplace", icon: Store, minAgents: 0 },
      { name: "Nodes SDK", href: "/dashboard/nodes-marketplace", icon: Bolt, minAgents: 1 },
      { name: "Developers", href: "/developers", icon: Code2, minAgents: 0 },
      { name: "Shared Agents", href: "/dashboard/shared", icon: Users, minAgents: 1 },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    defaultOpen: false,
    items: [
      { name: "Clients", href: "/dashboard/clients", icon: Building2, minAgents: 1, requiresBusiness: true },
      { name: "Data Explorer", href: "/dashboard/data-explorer", icon: Database, minAgents: 1 },
      { name: "Settings", href: "/dashboard/settings", icon: Settings, minAgents: 0 },
    ],
  },
];

/* ── Helpers ── */

const planBadgeStyles: Record<string, string> = {
  FREE: "bg-muted text-muted-foreground",
  PRO: "bg-kiln-orange/15 text-kiln-orange",
  AGENCY: "bg-purple-500/15 text-purple-400",
  ADMIN: "bg-purple-500/15 text-purple-400",
};

function NavTooltip({ children, label, show }: { children: React.ReactNode; label: string; show: boolean }) {
  if (!show) return <>{children}</>;
  return (
    <div className="group/tip relative">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">
        {label}
      </div>
    </div>
  );
}

/* ── Sidebar Component ── */

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { advancedMode, setAdvancedMode } = useAdvancedMode();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [plan, setPlan] = useState<string>("FREE");
  const [agentCount, setAgentCount] = useState<number>(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Section expand/collapse state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    for (const s of NAV_SECTIONS) {
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

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }

  useEffect(() => {
    fetch("/api/stripe/plan")
      .then((res) => res.json())
      .then((data) => setPlan(data.plan || "FREE"))
      .catch(() => {});

    fetch("/api/agents")
      .then((res) => res.json())
      .then((data) => {
        const agents = data.agents || data || [];
        if (Array.isArray(agents)) setAgentCount(agents.length);
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

  // Check if an item should be visible based on plan/agent gates
  function isItemVisible(item: NavItem): boolean {
    if (item.requiresBusiness) {
      const isBusiness = ["AGENCY", "ENTERPRISE", "ADMIN"].includes(plan);
      if (!isBusiness) return false;
    }
    if (agentCount < item.minAgents) {
      if (item.requiresPro) {
        const isPro = ["PRO", "AGENCY", "ENTERPRISE", "ADMIN"].includes(plan);
        if (isPro) return true;
      }
      return false;
    }
    return true;
  }

  function isActive(href: string): boolean {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  }

  // Auto-expand section if it contains active item
  useEffect(() => {
    for (const section of NAV_SECTIONS) {
      if (!section.label) continue;
      const hasActive = section.items.some((item) => isActive(item.href));
      if (hasActive && !openSections[section.id]) {
        setOpenSections((prev) => ({ ...prev, [section.id]: true }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-kiln-orange to-kiln-ember shadow-lg shadow-kiln-orange/20">
              <span className="font-serif text-base font-bold text-white">K</span>
            </div>
            <span className={cn("font-serif text-lg text-foreground transition-opacity duration-200", isCollapsed && "lg:hidden")}>
              KILN
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <div className={cn(isCollapsed && "lg:hidden")}>
              <WhatsNewBell />
            </div>
            <button
              onClick={toggleCollapsed}
              className="hidden h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <Separator className={cn("my-2", isCollapsed ? "lg:mx-2" : "mx-3")} />

        {/* Navigation */}
        <nav className={cn("flex flex-1 flex-col overflow-y-auto scrollbar-thin", isCollapsed ? "lg:px-1.5" : "px-2")}>
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter(isItemVisible);
            if (visibleItems.length === 0) return null;

            const isSectionOpen = section.label === null || openSections[section.id] !== false;

            return (
              <div key={section.id} className={section.label ? "mt-3" : ""}>
                {/* Section header */}
                {section.label && !isCollapsed && (
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="flex w-full items-center gap-1 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500 transition-colors hover:text-zinc-400"
                  >
                    <ChevronRight
                      className={cn(
                        "h-3 w-3 shrink-0 transition-transform duration-150",
                        isSectionOpen && "rotate-90"
                      )}
                    />
                    {section.label}
                  </button>
                )}

                {/* Section header (collapsed) — thin divider */}
                {section.label && isCollapsed && (
                  <Separator className="lg:mx-0 my-2" />
                )}

                {/* Items */}
                {isSectionOpen && (
                  <div className="flex flex-col gap-px">
                    {visibleItems.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <NavTooltip key={item.href} label={item.name} show={isCollapsed}>
                          <Link
                            href={item.href}
                            onClick={onClose}
                            {...(item.tourId ? { "data-tour": item.tourId } : {})}
                            className={cn(
                              "group relative flex items-center rounded-md text-[13px] font-medium transition-all duration-150",
                              isCollapsed ? "lg:justify-center lg:px-0 lg:py-2 px-2.5 py-2 gap-2.5" : "gap-2.5 px-2.5 py-[7px]",
                              active
                                ? "bg-white/[0.06] text-foreground"
                                : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
                            )}
                          >
                            {active && (
                              <div className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-full bg-gradient-to-b from-kiln-orange to-kiln-ember" />
                            )}
                            <item.icon
                              className={cn(
                                "h-[16px] w-[16px] shrink-0 transition-colors",
                                active ? "text-kiln-orange" : "text-zinc-500 group-hover:text-zinc-300"
                              )}
                            />
                            <span className={cn("transition-opacity duration-200", isCollapsed && "lg:hidden")}>
                              {item.name}
                            </span>
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
                "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
              )}
            >
              <HelpCircle className="h-[16px] w-[16px] shrink-0 text-zinc-500" />
              <span className={cn("transition-opacity duration-200", isCollapsed && "lg:hidden")}>Help</span>
            </Link>
          </NavTooltip>

          <Separator className={cn("my-1.5", isCollapsed && "lg:mx-0")} />

          {/* User Profile */}
          <div className="relative" ref={menuRef}>
            <NavTooltip label={displayName} show={isCollapsed}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className={cn(
                  "flex w-full items-center rounded-md transition-colors hover:bg-white/[0.03]",
                  isCollapsed ? "lg:justify-center lg:px-0 lg:py-2 px-2.5 py-2 gap-2.5" : "gap-2.5 px-2.5 py-2"
                )}
              >
                <div className="relative shrink-0">
                  {user?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.imageUrl}
                      alt={displayName}
                      className="h-7 w-7 rounded-full object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground ring-1 ring-border">
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
