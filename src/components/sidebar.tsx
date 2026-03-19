"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import {
  Activity,
  Bot,
  Globe,
  Zap,
  LayoutDashboard,
  Settings,
  Bolt,
  X,
  Sparkles,
  LogOut,
  ChevronUp,
  Network,
  Plug,
  Store,
  ChevronsLeft,
  ChevronsRight,
  MessageCircle,
  MessageSquare,
  HelpCircle,
  Radio,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import { WhatsNewBell } from "@/components/whats-new";
import { useEffect, useRef, useState } from "react";

const SIDEBAR_COLLAPSED_KEY = "kiln-sidebar-collapsed";

const allModules = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    color: "text-muted-foreground",
    activeColor: "text-kiln-orange",
    minAgents: 0,
  },
  {
    name: "AI Agent Studio",
    href: "/dashboard/agents",
    icon: Bot,
    color: "text-muted-foreground",
    activeColor: "text-kiln-orange",
    badge: null as string | null,
    minAgents: 0,
    tourId: "agents",
  },
  {
    name: "Conversations",
    href: "/dashboard/conversations",
    icon: MessageSquare,
    color: "text-muted-foreground",
    activeColor: "text-kiln-orange",
    minAgents: 0,
  },
  {
    name: "Operations",
    href: "/dashboard/operations",
    icon: Activity,
    color: "text-muted-foreground",
    activeColor: "text-kiln-orange",
    minAgents: 0,
  },
  {
    name: "Orchestration",
    href: "/dashboard/orchestration",
    icon: Network,
    color: "text-muted-foreground",
    activeColor: "text-kiln-orange",
    minAgents: 2, // Show after 2+ agents
  },
  {
    name: "Workflows",
    href: "/dashboard/teams",
    icon: Zap,
    color: "text-muted-foreground",
    activeColor: "text-kiln-orange",
    minAgents: 5, // Show after 5+ agents or Pro+
    requiresPro: true,
    tourId: "workflows",
  },
  {
    name: "Workflow Monitor",
    href: "/dashboard/teams/monitor",
    icon: Radio,
    color: "text-muted-foreground",
    activeColor: "text-kiln-orange",
    minAgents: 5,
    requiresPro: true,
  },
  {
    name: "A/B Tests",
    href: "/dashboard/teams/ab-tests",
    icon: FlaskConical,
    color: "text-muted-foreground",
    activeColor: "text-kiln-orange",
    minAgents: 5,
    requiresPro: true,
  },
  {
    name: "Marketplace",
    href: "/marketplace",
    icon: Store,
    color: "text-muted-foreground",
    activeColor: "text-kiln-orange",
    badge: "NEW" as string | null,
    minAgents: 0,
  },
  {
    name: "Integrations",
    href: "/dashboard/integrations",
    icon: Plug,
    color: "text-muted-foreground",
    activeColor: "text-kiln-blue",
    minAgents: 1,
    tourId: "integrations",
  },
  {
    name: "Site Builder",
    href: "/dashboard/sites",
    icon: Globe,
    color: "text-muted-foreground",
    activeColor: "text-kiln-blue",
    badge: "Q3 2026" as string | null,
    minAgents: 0,
  },
];

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

  // Load collapsed state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === "true") setCollapsed(true);
    } catch { /* SSR / privacy */ }
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch { /* */ }
  }

  useEffect(() => {
    fetch("/api/stripe/plan")
      .then((res) => res.json())
      .then((data) => setPlan(data.plan || "FREE"))
      .catch(() => {});

    // Load agent count for progressive sidebar reveal
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

  // On mobile, always show expanded
  const isCollapsed = collapsed; // only applies on lg+

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
          // Mobile always w-64, desktop depends on collapsed
          "w-64",
          isCollapsed && "lg:w-[60px]",
        )}
      >
        {/* Header: Logo + Collapse toggle + Close (mobile) */}
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-kiln-orange to-kiln-ember shadow-lg shadow-kiln-orange/20">
              <span className="font-serif text-lg font-bold text-white">K</span>
            </div>
            <span className={cn("font-serif text-xl text-foreground transition-opacity duration-200", isCollapsed && "lg:hidden")}>
              KILN
            </span>
          </Link>
          <div className="flex items-center gap-1">
            {/* What's New bell */}
            <div className={cn(isCollapsed && "lg:hidden")}>
              <WhatsNewBell />
            </div>
            {/* Collapse toggle — desktop only */}
            <button
              onClick={toggleCollapsed}
              className="hidden h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
            {/* Close button — mobile only */}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <Separator className={cn("my-3", isCollapsed ? "lg:mx-2" : "mx-4")} />

        {/* Navigation */}
        <nav className={cn("flex flex-1 flex-col gap-0.5", isCollapsed ? "lg:px-1.5" : "px-3")}>
          {allModules
            .filter((item) => {
              // Progressive reveal: hide modules until user has enough agents
              if (agentCount < item.minAgents) {
                // Agent Teams also unlocks on Pro+
                if ('requiresPro' in item && item.requiresPro) {
                  const isPro = ["PRO", "AGENCY", "ENTERPRISE", "ADMIN"].includes(plan);
                  if (isPro) return true;
                }
                return false;
              }
              return true;
            })
            .map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <NavTooltip key={item.href} label={item.name} show={isCollapsed}>
                {/* Separator before future modules */}
                {item.href === "/dashboard/sites" && (
                  <Separator className={cn("my-2", isCollapsed ? "lg:mx-0" : "")} />
                )}
                <Link
                  href={item.href}
                  onClick={onClose}
                  {...('tourId' in item && item.tourId ? { "data-tour": item.tourId } : {})}
                  className={cn(
                    "group relative flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                    isCollapsed ? "lg:justify-center lg:px-0 lg:py-2.5 px-3 py-2.5 gap-3" : "gap-3 px-3 py-2.5",
                    isActive
                      ? "bg-sidebar-accent/80 backdrop-blur-sm text-foreground"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  )}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-kiln-orange to-kiln-ember" />
                  )}
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0 transition-colors",
                      isActive ? item.activeColor : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  <span className={cn("transition-opacity duration-200", isCollapsed && "lg:hidden")}>{item.name}</span>
                  {item.badge && (
                    <span className={cn(
                      "ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium",
                      item.badge === "NEW" ? "bg-kiln-orange/15 text-kiln-orange" : "bg-muted text-muted-foreground",
                      isCollapsed && "lg:hidden"
                    )}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              </NavTooltip>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className={cn("flex flex-col gap-1 pb-2 border-t border-white/[0.06] pt-2", isCollapsed ? "lg:px-1.5" : "px-3")}>
          {/* Community */}
          <NavTooltip label="Community" show={isCollapsed}>
            <a
              href="https://discord.gg/kiln"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className={cn(
                "group relative flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                isCollapsed ? "lg:justify-center lg:px-0 lg:py-2.5 px-3 py-2.5 gap-3" : "gap-3 px-3 py-2.5",
                "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              )}
            >
              <MessageCircle className="h-[18px] w-[18px] shrink-0" />
              <span className={cn("transition-opacity duration-200", isCollapsed && "lg:hidden")}>Community</span>
            </a>
          </NavTooltip>

          {/* Help Center */}
          <NavTooltip label="Help" show={isCollapsed}>
            <Link
              href="/help"
              target="_blank"
              onClick={onClose}
              data-tour="help"
              className={cn(
                "group relative flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                isCollapsed ? "lg:justify-center lg:px-0 lg:py-2.5 px-3 py-2.5 gap-3" : "gap-3 px-3 py-2.5",
                "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              )}
            >
              <HelpCircle className="h-[18px] w-[18px] shrink-0" />
              <span className={cn("transition-opacity duration-200", isCollapsed && "lg:hidden")}>Help</span>
            </Link>
          </NavTooltip>

          {/* Settings */}
          <NavTooltip label="Settings" show={isCollapsed}>
            <Link
              href="/dashboard/settings"
              onClick={onClose}
              className={cn(
                "group relative flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                isCollapsed ? "lg:justify-center lg:px-0 lg:py-2.5 px-3 py-2.5 gap-3" : "gap-3 px-3 py-2.5",
                pathname.startsWith("/dashboard/settings")
                  ? "bg-sidebar-accent/80 backdrop-blur-sm text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              )}
            >
              {pathname.startsWith("/dashboard/settings") && (
                <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-kiln-orange to-kiln-ember" />
              )}
              <Settings className="h-[18px] w-[18px] shrink-0" />
              <span className={cn("transition-opacity duration-200", isCollapsed && "lg:hidden")}>Settings</span>
            </Link>
          </NavTooltip>

          {/* Advanced Mode Toggle */}
          <NavTooltip label="Advanced Mode" show={isCollapsed}>
            <button
              onClick={() => setAdvancedMode(!advancedMode)}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-all duration-200 w-full",
                isCollapsed ? "lg:justify-center lg:px-0 lg:py-2.5 px-3 py-2.5 gap-3" : "gap-3 px-3 py-2.5",
                advancedMode
                  ? "bg-purple-500/10 text-purple-400"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              )}
            >
              <Bolt className={cn("h-[18px] w-[18px] shrink-0", advancedMode && "text-purple-400")} />
              <span className={cn("transition-opacity duration-200", isCollapsed && "lg:hidden")}>Advanced</span>
              <div
                className={cn(
                  "ml-auto relative h-5 w-9 rounded-full transition-colors duration-200",
                  advancedMode ? "bg-purple-500" : "bg-muted",
                  isCollapsed && "lg:hidden"
                )}
              >
                <div
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                    advancedMode ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </div>
            </button>
          </NavTooltip>

          <Separator className={cn("my-2", isCollapsed && "lg:mx-0")} />

          {/* User Profile */}
          <div className="relative" ref={menuRef}>
            <NavTooltip label={displayName} show={isCollapsed}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className={cn(
                  "flex w-full items-center rounded-lg transition-colors hover:bg-white/[0.04]",
                  isCollapsed ? "lg:justify-center lg:px-0 lg:py-2.5 px-3 py-3 gap-3" : "gap-3 px-3 py-3"
                )}
              >
                <div className="relative shrink-0">
                  {user?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.imageUrl}
                      alt={displayName}
                      className="h-8 w-8 rounded-full object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground ring-1 ring-border">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-kiln-green" />
                </div>
                <div className={cn("flex-1 min-w-0 text-left transition-opacity duration-200", isCollapsed && "lg:hidden")}>
                  <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      planBadgeStyles[plan] || planBadgeStyles.FREE
                    )}
                  >
                    {plan === "ADMIN" && <Sparkles className="h-2.5 w-2.5" />}
                    {plan}
                  </span>
                </div>
                <ChevronUp
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
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
