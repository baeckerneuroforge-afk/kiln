"use client";

/**
 * ClientModeBanner — small alert strip rendered above the dashboard when
 * an agency owner is acting inside one of their sub-orgs.
 *
 * The banner is purely informational (so the operator doesn't forget
 * what context they're in) plus a one-click way back to the agency org.
 * Hidden when:
 *
 *   - login-status endpoint says isClientMode=false (i.e. the active
 *     org isn't a sub-org, or the user isn't a member of the parent
 *     agency, or no active org)
 *   - the endpoint hasn't loaded yet (avoid layout flicker)
 *
 * The "back to agency" action calls Clerk's setActive() with the parent
 * agency's id and router.refresh() to re-render server components in
 * agency context.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type LoginStatus = {
  isClientMode: boolean;
  parentAgencyId: string | null;
  parentAgencyName: string | null;
  subOrgName: string | null;
};

export function ClientModeBanner() {
  const router = useRouter();
  const { setActive } = useClerk();
  const [status, setStatus] = useState<LoginStatus | null>(null);
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agency/login-status")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((body) => {
        if (!cancelled) setStatus(body as LoginStatus);
      })
      .catch(() => {
        // Silent — endpoint may 401 during initial hydration.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const backToAgency = useCallback(async () => {
    if (!status?.parentAgencyId || !setActive) return;
    setReturning(true);
    try {
      await setActive({ organization: status.parentAgencyId });
      router.refresh();
    } catch (err) {
      console.warn("[ClientModeBanner] setActive failed:", err);
    } finally {
      setReturning(false);
    }
  }, [status?.parentAgencyId, setActive, router]);

  if (!status?.isClientMode) return null;

  return (
    <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
      <Building2 className="h-3.5 w-3.5 shrink-0 text-amber-400" />
      <span className="flex-1">
        You&apos;re acting as a client inside{" "}
        <strong className="font-semibold">{status.subOrgName}</strong>
        {status.parentAgencyName ? (
          <>
            {" "}
            from <strong>{status.parentAgencyName}</strong>
          </>
        ) : null}
        .
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={backToAgency}
        disabled={returning}
      >
        <ArrowLeft className="mr-1 h-3 w-3" />
        Back to agency
      </Button>
    </div>
  );
}
