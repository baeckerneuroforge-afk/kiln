"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  Bot,
  Globe,
  Zap,
  LayoutDashboard,
  Settings,
  Bolt,
  X,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import { useEffect, useState } from "react";

const modules = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    color: "text-muted-foreground",
    activeColor: "text-kiln-orange",
  },
  {
    name: "AI Agent Studio",
    href: "/dashboard/agents",
    icon: Bot,
    color: "text-muted-foreground",
    activeColor: "text-kiln-orange",
    badge: null,
  },
  {
    name: "Site Builder",
    href: "/dashboard/sites",
    icon: Globe,
    color: "text-muted-foreground",
    activeColor: "text-kiln-blue",
    badge: "Soon",
  },
  {
    name: "Flow Engine",
    href: "/dashboard/flows",
    icon: Zap,
    color: "text-muted-foreground",
    activeColor: "text-kiln-green",
    badge: "Soon",
  },
];

const planBadgeStyles: Record<string, string> = {
  FREE: "bg-muted text-muted-foreground",
  PRO: "bg-kiln-orange/15 text-kiln-orange",
  AGENCY: "bg-purple-500/15 text-purple-400",
  ADMIN: "bg-purple-500/15 text-purple-400",
};

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { advancedMode, setAdvancedMode } = useAdvancedMode();
  const { user } = useUser();
  const [plan, setPlan] = useState<string>("FREE");

  useEffect(() => {
    fetch("/api/stripe/plan")
      .then((res) => res.json())
      .then((data) => setPlan(data.plan || "FREE"))
      .catch(() => {});
  }, []);

  const displayName =
    user?.firstName || user?.username || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "User";

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
          "fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col border-r border-border bg-sidebar transition-transform duration-200 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header: Logo + Close (mobile) */}
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-kiln-orange to-kiln-ember shadow-sm">
              <span className="font-serif text-lg font-bold text-white">K</span>
            </div>
            <span className="font-serif text-xl text-foreground">KILN</span>
          </Link>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <Separator className="mx-4 my-3" />

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {modules.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                )}
              >
                {/* Active indicator — orange left border */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-kiln-orange" />
                )}
                <item.icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-colors",
                    isActive ? item.activeColor : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span>{item.name}</span>
                {item.badge && (
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="flex flex-col gap-1 px-3 pb-2">
          {/* Settings */}
          <Link
            href="/dashboard/settings"
            onClick={onClose}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
              pathname.startsWith("/dashboard/settings")
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            )}
          >
            {pathname.startsWith("/dashboard/settings") && (
              <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-kiln-orange" />
            )}
            <Settings className="h-[18px] w-[18px] shrink-0" />
            <span>Settings</span>
          </Link>

          {/* Advanced Mode Toggle */}
          <button
            onClick={() => setAdvancedMode(!advancedMode)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 w-full",
              advancedMode
                ? "bg-purple-500/10 text-purple-400"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            )}
          >
            <Bolt className={cn("h-[18px] w-[18px] shrink-0", advancedMode && "text-purple-400")} />
            <span>Advanced</span>
            <div
              className={cn(
                "ml-auto relative h-5 w-9 rounded-full transition-colors duration-200",
                advancedMode ? "bg-purple-500" : "bg-muted"
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

          <Separator className="my-2" />

          {/* User Profile */}
          <div className="flex items-center gap-3 rounded-lg px-3 py-3">
            <div className="relative">
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
              {/* Online dot */}
              <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-kiln-green" />
            </div>
            <div className="flex-1 min-w-0">
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
          </div>
        </div>
      </aside>
    </>
  );
}
