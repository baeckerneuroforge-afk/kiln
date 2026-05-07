"use client";

/**
 * Shared empty-state component for the agent-detail tabs.
 *
 * Used by tabs that load a list of items (logs, memory entries,
 * model-routing rules, event subscriptions, etc) so they all surface
 * the same visual treatment when there's nothing to show.
 *
 * Knowledge-tab is intentionally NOT a consumer — that file is
 * being polished by a parallel agent and stays untouched.
 */
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TabEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  /**
   * Tonal hint color — drives the icon background tint and the CTA
   * accent. Defaults to kiln-orange so most tabs read consistently.
   */
  tone?: "orange" | "blue" | "green" | "violet" | "muted";
  /** Optional second-line hint shown under the description in muted text. */
  hint?: string;
  className?: string;
}

const toneClasses: Record<NonNullable<TabEmptyStateProps["tone"]>, { bg: string; fg: string }> = {
  orange: { bg: "bg-kiln-orange/10", fg: "text-kiln-orange" },
  blue: { bg: "bg-kiln-blue/10", fg: "text-kiln-blue" },
  green: { bg: "bg-kiln-green/10", fg: "text-kiln-green" },
  violet: { bg: "bg-violet-500/10", fg: "text-violet-400" },
  muted: { bg: "bg-muted", fg: "text-muted-foreground" },
};

export function TabEmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "orange",
  hint,
  className,
}: TabEmptyStateProps) {
  const t = toneClasses[tone];
  return (
    <div
      data-testid="tab-empty-state"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30 px-6 py-14 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "mb-4 flex h-14 w-14 items-center justify-center rounded-2xl",
          t.bg,
        )}
      >
        <Icon className={cn("h-7 w-7", t.fg)} />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {hint && (
        <p className="mx-auto mt-1 max-w-sm text-[10px] text-muted-foreground/70">
          {hint}
        </p>
      )}
      {action &&
        (action.href ? (
          <a
            href={action.href}
            className={cn(
              "mt-5 inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-medium transition-colors",
              "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {action.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className={cn(
              "mt-5 inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-medium transition-colors",
              "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}
