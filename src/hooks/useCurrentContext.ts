"use client";

/**
 * Sprint 19.7.2 — context-aware reader for the current KILN view.
 *
 * URL-driven: anything under /dashboard/sub-org/[subOrgId] is the
 * sub-org context, everything else is the agency context. Sprint
 * 19.7.5.1 extends this with a `?subOrgId=...` search-param override
 * so create flows that live OUTSIDE a sub-org path
 * (e.g. /dashboard/agents/new, /dashboard/teams/new) can still pick
 * up the sub-org context when launched from a sub-org page's Link.
 *
 * The sub-org name is resolved best-effort via
 * /api/sub-orgs/for-current-user once the context says we're in a
 * sub-org.
 */
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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

/**
 * Pure resolver — pathname wins, but a non-empty `subOrgIdParam`
 * overrides the agency-default when the URL itself isn't a sub-org
 * path. Exported for unit testing.
 */
export function resolveContext(
  pathname: string | null | undefined,
  subOrgIdParam: string | null | undefined,
): CurrentContext {
  const fromPath = parseContextFromPath(pathname);
  if (fromPath.type === "sub_org") return fromPath;
  if (subOrgIdParam) {
    return { type: "sub_org", id: subOrgIdParam, name: null };
  }
  return fromPath;
}

export function useCurrentContext(): CurrentContext {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const subOrgIdParam = searchParams?.get("subOrgId") ?? null;
  const resolved = resolveContext(pathname, subOrgIdParam);
  const [enriched, setEnriched] = useState<CurrentContext>(resolved);

  useEffect(() => {
    setEnriched(resolved);
    if (resolved.type !== "sub_org") return;
    let cancelled = false;

    fetch("/api/sub-orgs/for-current-user", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.subOrgs) ? data.subOrgs : [];
        const hit = list.find((s: { subOrgId: string }) => s.subOrgId === resolved.id);
        if (hit?.name) {
          setEnriched({ type: "sub_org", id: resolved.id, name: hit.name });
        }
      })
      .catch(() => {
        /* leave name null */
      });

    return () => {
      cancelled = true;
    };
  // resolved is derived from pathname + subOrgId search param
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, subOrgIdParam]);

  return enriched;
}
