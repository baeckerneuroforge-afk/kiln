/**
 * RBAC Manager — Role-Based Access Control für KILN Workspaces.
 *
 * Rollen: OWNER, ADMIN, BUILDER, VIEWER, APPROVER
 * Rückwärtskompatibel: Einzelnutzer-Workspaces funktionieren weiterhin (als OWNER).
 */

import { prisma } from "@/lib/prisma";

// ── Types ────────────────────────────────────────────────────

export type RBACRole = "OWNER" | "ADMIN" | "BUILDER" | "VIEWER" | "APPROVER";

export type RBACResource =
  | "agent"
  | "workflow"
  | "settings"
  | "billing"
  | "marketplace"
  | "audit"
  | "portal"
  | "health"
  | "webhook"
  | "team_members";

export type RBACAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "manage";

// ── Permission Matrix ────────────────────────────────────────

type PermissionMatrix = Record<RBACRole, Record<RBACResource, Set<RBACAction>>>;

const PERMISSION_MATRIX: PermissionMatrix = {
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

// ── RBAC Manager ─────────────────────────────────────────────

export class RBACManager {
  /**
   * Prüft ob ein User eine bestimmte Aktion auf einer Ressource ausführen darf.
   * Für Einzelnutzer (kein WorkspaceMember): immer OWNER.
   */
  static async checkPermission(
    userId: string,
    resource: RBACResource,
    action: RBACAction,
    workspaceOwnerId?: string
  ): Promise<boolean> {
    // Wenn der User der Workspace-Owner ist → volle Rechte
    if (!workspaceOwnerId || userId === workspaceOwnerId) {
      return true;
    }

    // Rolle aus WorkspaceMember holen
    const role = await this.getUserRole(userId, workspaceOwnerId);
    if (!role) return false;

    return this.checkRolePermission(role, resource, action);
  }

  /**
   * Synchrone Permission-Prüfung wenn die Rolle bereits bekannt ist.
   */
  static checkRolePermission(
    role: RBACRole,
    resource: RBACResource,
    action: RBACAction
  ): boolean {
    const rolePermissions = PERMISSION_MATRIX[role];
    if (!rolePermissions) return false;

    const resourcePermissions = rolePermissions[resource];
    if (!resourcePermissions) return false;

    return resourcePermissions.has(action);
  }

  /**
   * Ermittelt die Rolle eines Users in einem Workspace.
   */
  static async getUserRole(
    userId: string,
    workspaceOwnerId: string
  ): Promise<RBACRole | null> {
    if (userId === workspaceOwnerId) return "OWNER";

    // Suche in WorkspaceMember-Tabelle
    const member = await prisma.workspaceMember.findFirst({
      where: {
        userId,
        workspaceId: workspaceOwnerId,
        status: "active",
      },
    }).catch(() => null);

    if (!member) return null;
    return (member.role as RBACRole) || null;
  }

  /**
   * Alle Permissions für eine Rolle zurückgeben.
   */
  static getRolePermissions(role: RBACRole): Record<RBACResource, RBACAction[]> {
    const rolePerms = PERMISSION_MATRIX[role];
    const result: Record<string, RBACAction[]> = {};

    for (const [resource, actions] of Object.entries(rolePerms)) {
      result[resource] = Array.from(actions);
    }

    return result as Record<RBACResource, RBACAction[]>;
  }

  /**
   * Alle verfügbaren Rollen mit Beschreibungen.
   */
  static getRoles(): Array<{ id: RBACRole; label: string; description: string }> {
    return [
      { id: "OWNER", label: "Owner", description: "Vollzugriff auf alle Ressourcen und Einstellungen" },
      { id: "ADMIN", label: "Admin", description: "Kann Agents, Workflows und Teammitglieder verwalten" },
      { id: "BUILDER", label: "Builder", description: "Kann Agents und Workflows erstellen und bearbeiten" },
      { id: "VIEWER", label: "Viewer", description: "Kann alle Ressourcen einsehen, aber nicht ändern" },
      { id: "APPROVER", label: "Approver", description: "Kann Agents und Workflows einsehen und genehmigen" },
    ];
  }
}
