"use client";

/**
 * Sprint 19.7.2 — context-aware reader for the current KILN view.
 *
 * URL-driven: anything under /dashboard/sub-org/[subOrgId] is the
 * sub-org context, everything else is the agency context. The
 * sub-org name is resolved best-effort via /api/sub-orgs/for-current-user
 * once the URL says we're in a sub-org context.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export type CurrentContext =
  | { type: "agency"; id: null; name: null }
  | { type: "sub_org"; id: string; name: string | null };

const SUB_ORG_PATH_REGEX = /^\/dashboard\/sub-org\/([^/]+)/;

export function parseContextFromPath(pathname: string | null | undefined): CurrentContext {
  if (!pathname) return { type: "agency", id: null, name: null };
  const match = SUB_ORG_PATH_REGEX.exec(pathname);
  if (match && match[1]) {
    return { type: "sub_org", id: match[1], name: null };
  }
  return { type: "agency", id: null, name: null };
}

export function useCurrentContext(): CurrentContext {
  const pathname = usePathname();
  const fromPath = parseContextFromPath(pathname);
  const [enriched, setEnriched] = useState<CurrentContext>(fromPath);

  useEffect(() => {
    setEnriched(fromPath);
    if (fromPath.type !== "sub_org") return;
    let cancelled = false;

    fetch("/api/sub-orgs/for-current-user", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.subOrgs) ? data.subOrgs : [];
        const hit = list.find((s: { subOrgId: string }) => s.subOrgId === fromPath.id);
        if (hit?.name) {
          setEnriched({ type: "sub_org", id: fromPath.id, name: hit.name });
        }
      })
      .catch(() => {
        /* leave name null */
      });

    return () => {
      cancelled = true;
    };
  // pathname is captured via fromPath.id/type below; re-run on change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return enriched;
}
