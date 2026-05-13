"use client";

/**
 * Sprint 19.7.6 — client-side hook around /api/agency/role.
 *
 * Returns the caller's AgencyRole + the resolved permission set so
 * Sidebar (and any other client surface that needs to conditionally
 * render) can skip items they're not allowed to see.
 *
 * Returns `loading: true` until the first response lands so the UI
 * can render skeletons instead of flashing an empty state.
 */
import { useEffect, useState } from "react";
import type { AgencyRole } from "@prisma/client";

export type AgencyPermissionName =
  | "agency.manage"
  | "billing.manage"
  | "members.manage"
  | "sub-orgs.create"
  | "sub-orgs.delete"
  | "sub-orgs.read"
  | "templates.manage"
  | "all-sub-orgs.access";

export type AgencyPermissionsState = {
  loading: boolean;
  role: AgencyRole | null;
  permissions: ReadonlySet<AgencyPermissionName>;
  has: (permission: AgencyPermissionName) => boolean;
};

const EMPTY_SET: ReadonlySet<AgencyPermissionName> = new Set();

export function useAgencyPermissions(): AgencyPermissionsState {
  const [state, setState] = useState<{
    loading: boolean;
    role: AgencyRole | null;
    permissions: ReadonlySet<AgencyPermissionName>;
  }>({
    loading: true,
    role: null,
    permissions: EMPTY_SET,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agency/role", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { role: AgencyRole | null; permissions: AgencyPermissionName[] } | null) => {
        if (cancelled) return;
        setState({
          loading: false,
          role: data?.role ?? null,
          permissions: new Set(data?.permissions ?? []),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ loading: false, role: null, permissions: EMPTY_SET });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ...state,
    has: (permission) => state.permissions.has(permission),
  };
}
