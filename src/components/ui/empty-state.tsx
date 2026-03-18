"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 border border-border mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-sm mb-5">{description}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="flex items-center gap-2 rounded-lg bg-kiln-orange px-4 py-2.5 text-xs font-semibold text-white hover:bg-kiln-orange/90 transition-colors"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <button
          onClick={onAction}
          className="flex items-center gap-2 rounded-lg bg-kiln-orange px-4 py-2.5 text-xs font-semibold text-white hover:bg-kiln-orange/90 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
