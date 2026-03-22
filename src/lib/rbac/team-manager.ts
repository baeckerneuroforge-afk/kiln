/**
 * Team Manager — Einladungen, Mitgliederverwaltung, Rollenzuweisungen.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { RBACRole } from "./rbac-manager";

// ── Types ────────────────────────────────────────────────────

export interface WorkspaceMemberInfo {
  id: string;
  userId: string | null;
  email: string;
  role: RBACRole;
  status: "invited" | "active" | "removed";
  inviteToken: string | null;
  invitedBy: string;
  joinedAt: Date | null;
  createdAt: Date;
}

// ── Team Manager ─────────────────────────────────────────────

export class TeamManager {
  /**
   * Mitglied einladen: erstellt WorkspaceMember mit Status "invited".
   */
  static async inviteMember(
    workspaceId: string,
    email: string,
    role: RBACRole,
    invitedBy: string
  ): Promise<WorkspaceMemberInfo> {
    const normalizedEmail = email.toLowerCase().trim();

    // Prüfen ob bereits eingeladen oder aktiv
    const existing = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        email: normalizedEmail,
        status: { not: "removed" },
      },
    });

    if (existing) {
      throw new Error("Diese E-Mail wurde bereits eingeladen oder ist bereits Mitglied.");
    }

    const inviteToken = crypto.randomBytes(32).toString("hex");

    const member = await prisma.workspaceMember.create({
      data: {
        workspaceId,
        email: normalizedEmail,
        role,
        status: "invited",
        inviteToken,
        invitedBy,
      },
    });

    return this.toMemberInfo(member);
  }

  /**
   * Einladung annehmen: setzt Status auf "active" und verknüpft userId.
   */
  static async acceptInvite(
    token: string,
    userId: string
  ): Promise<WorkspaceMemberInfo> {
    const member = await prisma.workspaceMember.findFirst({
      where: {
        inviteToken: token,
        status: "invited",
      },
    });

    if (!member) {
      throw new Error("Einladung nicht gefunden oder bereits angenommen.");
    }

    const updated = await prisma.workspaceMember.update({
      where: { id: member.id },
      data: {
        userId,
        status: "active",
        inviteToken: null,
        joinedAt: new Date(),
      },
    });

    return this.toMemberInfo(updated);
  }

  /**
   * Rolle eines Mitglieds ändern.
   */
  static async updateRole(
    memberId: string,
    workspaceId: string,
    newRole: RBACRole
  ): Promise<WorkspaceMemberInfo> {
    const member = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
    });

    if (!member) {
      throw new Error("Mitglied nicht gefunden.");
    }

    if (member.role === "OWNER") {
      throw new Error("Die Owner-Rolle kann nicht geändert werden.");
    }

    const updated = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role: newRole },
    });

    return this.toMemberInfo(updated);
  }

  /**
   * Mitglied entfernen (Soft-Delete).
   */
  static async removeMember(
    memberId: string,
    workspaceId: string
  ): Promise<void> {
    const member = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
    });

    if (!member) {
      throw new Error("Mitglied nicht gefunden.");
    }

    if (member.role === "OWNER") {
      throw new Error("Der Owner kann nicht entfernt werden.");
    }

    await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { status: "removed" },
    });
  }

  /**
   * Alle Mitglieder eines Workspace auflisten.
   */
  static async listMembers(
    workspaceId: string
  ): Promise<WorkspaceMemberInfo[]> {
    const members = await prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        status: { not: "removed" },
      },
      orderBy: { createdAt: "asc" },
    });

    return members.map(this.toMemberInfo);
  }

  /**
   * Einladung erneut senden (neues Token generieren).
   */
  static async resendInvite(
    memberId: string,
    workspaceId: string
  ): Promise<string> {
    const member = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId, status: "invited" },
    });

    if (!member) {
      throw new Error("Einladung nicht gefunden oder bereits angenommen.");
    }

    const newToken = crypto.randomBytes(32).toString("hex");

    await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { inviteToken: newToken },
    });

    return newToken;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static toMemberInfo(member: any): WorkspaceMemberInfo {
    return {
      id: member.id,
      userId: member.userId,
      email: member.email,
      role: member.role as RBACRole,
      status: member.status as "invited" | "active" | "removed",
      inviteToken: member.inviteToken,
      invitedBy: member.invitedBy,
      joinedAt: member.joinedAt,
      createdAt: member.createdAt,
    };
  }
}
