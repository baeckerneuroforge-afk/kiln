import { prisma } from "@/lib/prisma";

export type PermissionLevel = "OWNER" | "EDITOR" | "VIEWER" | "APPROVER" | null;

/**
 * Check what permission level a user has for a team.
 * Returns OWNER if they are the team creator, or the role from TeamPermission.
 */
export async function getTeamPermission(
  teamId: string,
  userId: string
): Promise<PermissionLevel> {
  // Check if user is the team owner (creator)
  const team = await prisma.agentTeam.findUnique({
    where: { id: teamId },
    select: { userId: true },
  });

  if (!team) return null;
  if (team.userId === userId) return "OWNER";

  // Check TeamPermission
  const permission = await prisma.teamPermission.findFirst({
    where: {
      teamId,
      userId,
      status: "ACTIVE",
    },
    select: { role: true },
  });

  if (!permission) return null;
  return permission.role;
}

/**
 * Check if user has at least the required permission level.
 * Hierarchy: OWNER > EDITOR > VIEWER, APPROVER is special (only for approvals).
 */
export function hasPermission(
  userRole: PermissionLevel,
  requiredRole: "OWNER" | "EDITOR" | "VIEWER"
): boolean {
  if (!userRole) return false;

  const hierarchy: Record<string, number> = {
    OWNER: 3,
    EDITOR: 2,
    VIEWER: 1,
    APPROVER: 0,
  };

  return (hierarchy[userRole] ?? 0) >= (hierarchy[requiredRole] ?? 0);
}

/**
 * Quick check: can user access the team at all?
 */
export async function canAccessTeam(
  teamId: string,
  userId: string
): Promise<boolean> {
  const role = await getTeamPermission(teamId, userId);
  return role !== null;
}

/**
 * Quick check: can user edit the team?
 */
export async function canEditTeam(
  teamId: string,
  userId: string
): Promise<boolean> {
  const role = await getTeamPermission(teamId, userId);
  return hasPermission(role, "EDITOR");
}

/**
 * Get all teams a user has access to (owned + shared).
 */
export async function getAccessibleTeamIds(userId: string): Promise<{
  ownedIds: string[];
  sharedIds: string[];
}> {
  const [owned, shared] = await Promise.all([
    prisma.agentTeam.findMany({
      where: { userId },
      select: { id: true },
    }),
    prisma.teamPermission.findMany({
      where: { userId, status: "ACTIVE" },
      select: { teamId: true },
    }),
  ]);

  return {
    ownedIds: owned.map((t) => t.id),
    sharedIds: shared.map((p) => p.teamId),
  };
}

/**
 * Generate a secure invite token.
 */
export function generateInviteToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
