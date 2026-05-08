"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "", label: "Overview" },
  { href: "/workers", label: "Workers" },
  { href: "/memory", label: "Memory" },
  { href: "/backlog", label: "Backlog" },
  { href: "/approvals", label: "Approvals" },
  { href: "/settings", label: "Settings" },
];

export function DepartmentTabs({ departmentId }: { departmentId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/departments/${departmentId}`;

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-border bg-card/50 p-1">
      {tabs.map((tab) => {
        const href = `${base}${tab.href}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.href || "overview"}
            href={href}
            className={cn(
              "rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground",
              active && "bg-orange-500/15 text-orange-200"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
