"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Bot, Globe, Zap, LayoutDashboard, Settings, Bolt } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";

const modules = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    color: "text-muted-foreground",
  },
  {
    name: "AI Agent Studio",
    href: "/dashboard/agents",
    icon: Bot,
    color: "text-kiln-orange",
    badge: null,
  },
  {
    name: "Site Builder",
    href: "/dashboard/sites",
    icon: Globe,
    color: "text-kiln-blue",
    badge: "Soon",
  },
  {
    name: "Flow Engine",
    href: "/dashboard/flows",
    icon: Zap,
    color: "text-kiln-green",
    badge: "Soon",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { advancedMode, setAdvancedMode } = useAdvancedMode();

  return (
    <aside className="flex h-screen w-16 flex-col items-center border-r border-border bg-sidebar py-4 lg:w-56">
      {/* Logo */}
      <Link href="/dashboard" className="mb-6 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-kiln-orange to-kiln-ember">
          <span className="font-serif text-lg font-bold text-white">K</span>
        </div>
        <span className="hidden font-serif text-xl text-foreground lg:block">
          KILN
        </span>
      </Link>

      <Separator className="mb-4 w-10 lg:w-[calc(100%-2rem)]" />

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 w-full px-2">
        {modules.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                "hover:bg-sidebar-accent",
                isActive
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground"
              )}
            >
              <item.icon
                className={cn("h-5 w-5 shrink-0", isActive && item.color)}
              />
              <span className="hidden lg:block">{item.name}</span>
              {item.badge && (
                <span className="ml-auto hidden rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:block">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: Settings + User */}
      <div className="flex flex-col items-center gap-3 w-full px-2">
        <Link
          href="/dashboard/settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent w-full",
            pathname.startsWith("/dashboard/settings") &&
              "bg-sidebar-accent text-foreground"
          )}
        >
          <Settings className="h-5 w-5 shrink-0" />
          <span className="hidden lg:block">Settings</span>
        </Link>

        {/* Advanced Mode Toggle */}
        <button
          onClick={() => setAdvancedMode(!advancedMode)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors w-full",
            advancedMode
              ? "bg-purple-500/10 text-purple-400"
              : "text-muted-foreground hover:bg-sidebar-accent"
          )}
        >
          <Bolt className={cn("h-5 w-5 shrink-0", advancedMode && "text-purple-400")} />
          <span className="hidden lg:block">Advanced</span>
          <div className={cn(
            "ml-auto hidden lg:block relative h-5 w-9 rounded-full transition-colors",
            advancedMode ? "bg-purple-500" : "bg-muted"
          )}>
            <div className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
              advancedMode ? "translate-x-4" : "translate-x-0.5"
            )} />
          </div>
        </button>

        <Separator className="w-10 lg:w-full" />

        <div className="pb-2">
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: "h-8 w-8",
              },
            }}
          />
        </div>
      </div>
    </aside>
  );
}
