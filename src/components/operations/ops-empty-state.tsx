"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function OpsEmptyState({ redirectTarget }: { redirectTarget: string | null }) {
  return (
    <div className="mx-auto flex min-h-[520px] max-w-2xl flex-col items-center justify-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-kiln-orange/10 text-kiln-orange">
        <Building2 className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">Operations Center unlocks with multiple customers</h1>
      <p className="mt-2 text-muted-foreground">
        This cockpit is built for agencies managing several sub-orgs. Add another customer or open the existing sub-org directly.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {redirectTarget && (
          <Link href={redirectTarget} className={buttonVariants({ variant: "outline" })}>Open customer</Link>
        )}
        <Link href="/dashboard/agency/sub-orgs" className={buttonVariants()}>Create Sub-Org</Link>
      </div>
    </div>
  );
}
