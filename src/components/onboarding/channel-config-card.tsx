"use client";

import { cn } from "@/lib/utils";

export function ChannelConfigCard({
  title,
  description,
  checked,
  onChange,
  children,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border p-4", checked ? "border-kiln-orange/50 bg-kiln-orange/5" : "border-border bg-card")}>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-1 h-4 w-4 accent-kiln-orange"
        />
        <span>
          <span className="block font-semibold text-foreground">{title}</span>
          <span className="text-sm text-muted-foreground">{description}</span>
        </span>
      </label>
      {checked && children && <div className="mt-4 space-y-3 pl-7">{children}</div>}
    </section>
  );
}
