"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import type { RBACResource, RBACAction, RBACRole } from "./rbac-manager";

// ── Permission Matrix (Client-seitige Kopie) ────────────────

const CLIENT_PERMISSION_MATRIX: Record<string, Record<string, Set<string>>> = {
  OWNER: {
    agent: new Set(["view", "create", "edit", "delete", "approve", "manage"]),
    workflow: new Set(["view", "create", "edit", "delete", "approve", "manage"]),
    settings: new Set(["view", "create", "edit", "delete", "approve", "manage"]),
    billing: new Set(["view", "create", "edit", "delete", "approve", "manage"]),
    marketplace: new Set(["view", "create", "edit", "delete", "approve", "manage"]),
    audit: new Set(["view", "manage"]),
    portal: new Set(["view", "create", "edit", "delete", "manage"]),
    health: new Set(["view", "manage"]),
    webhook: new Set(["view", "create", "edit", "delete", "manage"]),
    team_members: new Set(["view", "create", "edit", "delete", "manage"]),
  },
  ADMIN: {
    agent: new Set(["view", "create", "edit", "delete", "approve"]),
    workflow: new Set(["view", "create", "edit", "delete", "approve"]),
    settings: new Set(["view", "edit"]),
    billing: new Set(["view"]),
    marketplace: new Set(["view", "create", "edit"]),
    audit: new Set(["view"]),
    portal: new Set(["view", "create", "edit", "delete"]),
    health: new Set(["view", "manage"]),
    webhook: new Set(["view", "create", "edit", "delete"]),
    team_members: new Set(["view", "create", "edit", "delete"]),
  },
  BUILDER: {
    agent: new Set(["view", "create", "edit"]),
    workflow: new Set(["view", "create", "edit"]),
    settings: new Set(["view"]),
    billing: new Set(),
    marketplace: new Set(["view"]),
    audit: new Set(),
    portal: new Set(["view"]),
    health: new Set(["view"]),
    webhook: new Set(["view", "create", "edit"]),
    team_members: new Set(["view"]),
  },
  VIEWER: {
    agent: new Set(["view"]),
    workflow: new Set(["view"]),
    settings: new Set(),
    billing: new Set(),
    marketplace: new Set(["view"]),
    audit: new Set(),
    portal: new Set(["view"]),
    health: new Set(["view"]),
    webhook: new Set(["view"]),
    team_members: new Set(["view"]),
  },
  APPROVER: {
    agent: new Set(["view", "approve"]),
    workflow: new Set(["view", "approve"]),
    settings: new Set(),
    billing: new Set(),
    marketplace: new Set(["view"]),
    audit: new Set(["view"]),
    portal: new Set(["view"]),
    health: new Set(["view"]),
    webhook: new Set(["view"]),
    team_members: new Set(["view"]),
  },
};

function checkRolePermission(role: string, resource: string, action: string): boolean {
  const rolePerms = CLIENT_PERMISSION_MATRIX[role];
  if (!rolePerms) return false;
  const resourcePerms = rolePerms[resource];
  if (!resourcePerms) return false;
  return resourcePerms.has(action);
}

// ── Hook ─────────────────────────────────────────────────────

interface UsePermissionResult {
  allowed: boolean;
  loading: boolean;
  role: RBACRole | null;
}

/**
 * React Hook: Prüft ob der aktuelle User eine Aktion ausführen darf.
 * Für Einzelnutzer (kein Workspace-Kontext): immer erlaubt.
 */
export function usePermission(
  resource: RBACResource,
  action: RBACAction
): UsePermissionResult {
  const { user, isLoaded } = useUser();
  const [role, setRole] = useState<RBACRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;

    // Wenn kein User → nicht erlaubt
    if (!user) {
      setLoading(false);
      return;
    }

    // Versuche Rolle vom Server zu holen
    fetch("/api/team/members/me")
      .then((res) => {
        if (res.ok) return res.json();
        // Kein Team-Mitglied → User ist Owner
        return { role: "OWNER" };
      })
      .then((data) => {
        setRole(data.role as RBACRole);
      })
      .catch(() => {
        // Fallback: Owner
        setRole("OWNER");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [user, isLoaded]);

  const allowed = !loading && role
    ? checkRolePermission(role, resource, action)
    : false;

  return { allowed: loading ? true : allowed, loading, role };
}
