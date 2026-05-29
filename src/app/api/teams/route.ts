import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { deployTeamTemplate } from "@/lib/team-templates";
import { getUserEmailOrPlaceholder } from "@/lib/clerk-user-email";
import { describeTeamSchedule, normalizeTeamScheduleConfig } from "@/lib/team-schedule";
import { getAccessibleTeamIds } from "@/lib/team-permissions";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { resolveCreateTargetOrgId } from "@/lib/sub-org/resolve-create-target";
import { fetchRunStatsByTeamId } from "@/lib/teams/run-stats";
import { validateBody } from "@/lib/api/validate-body";
import { teamCreateSchema } from "@/lib/api/request-schemas";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// List all teams in the active org (owned + shared, with legacy fallback)
export async function GET(request: NextRequest) {
  try {
    let scope;
    try {
      scope = await requireOrgId();
    } catch (err) {
      if (err instanceof OrgContextError) return unauthorized();
      throw err;
    }
    const { userId } = scope;

    const { ownedIds, sharedIds } = await getAccessibleTeamIds(userId);
    const allTeamIds = [...ownedIds, ...sharedIds];

    // Layer org filter on top of the existing owned/shared ACL: only teams
    // that belong to the active org (or are unmigrated and owned by the user)
    // come back.
    const onlySubWorkflows =
      request.nextUrl.searchParams.get("onlySubWorkflows") === "true";

    const teams = await prisma.agentTeam.findMany({
      where: {
        id: { in: allTeamIds },
        ...orgScopeFilter(scope),
        ...(onlySubWorkflows ? { isSubWorkflow: true } : {}),
      },
      include: {
        members: {
          include: {
            agent: { select: { id: true, name: true, slug: true } },
          },
        },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch roles for shared teams
    const sharedPermissions = sharedIds.length > 0
      ? await prisma.teamPermission.findMany({
          where: { userId, teamId: { in: sharedIds }, status: "ACTIVE" },
          select: { teamId: true, role: true },
        })
      : [];
    const roleMap = new Map(sharedPermissions.map((p) => [p.teamId, p.role]));

    // Fan out execution stats in parallel with the role lookup. Cards
    // need them inline; a /stats endpoint would just add a round-trip.
    const statsMap = await fetchRunStatsByTeamId(teams.map((t) => t.id));

    return Response.json(
      teams.map((team) => {
        const schedule = normalizeTeamScheduleConfig(
          team.config && typeof team.config === "object"
            ? (team.config as Record<string, unknown>).schedule
            : null
        );

        return {
          ...team,
          isOwner: team.userId === userId,
          sharedRole: roleMap.get(team.id) || null,
          scheduleSummary: describeTeamSchedule(schedule),
          runStats: statsMap.get(team.id) || null,
        };
      })
    );
  } catch (err) {
    console.error("GET /api/teams error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Create a new team (optionally from a template)
export async function POST(request: NextRequest) {
  try {
    let scope;
    try {
      scope = await requireOrgId();
    } catch (err) {
      if (err instanceof OrgContextError) return unauthorized();
      throw err;
    }
    const { userId, orgId } = scope;

    const rawBody = await request.json();
    const validation = validateBody(teamCreateSchema, rawBody);
    if (!validation.ok) return validation.response;
    const body = rawBody;
    const { name, description, goal, template: templateKey, isSubWorkflow, subOrgId } = body;

    // Sprint 19.7.4 — sub-org-scoped create. When the client is in a
    // sub-org page it passes the OrgRelationship.id so the new workflow
    // lands under the sub-org's Clerk org rather than the active agency.
    const target = await resolveCreateTargetOrgId({
      userId,
      defaultOrgId: orgId,
      subOrgId: typeof subOrgId === "string" ? subOrgId : null,
      requiredPermission: "workflows.write",
    });
    if (!target.ok) {
      return Response.json({ error: target.error }, { status: target.status });
    }
    const effectiveOrgId = target.orgId;

    // Ensure user exists
    const userEmail = await getUserEmailOrPlaceholder(userId);
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: userEmail },
    });

    if (templateKey) {
      // Sprint 19.7.5 — thread the resolved orgId into deployTeamTemplate
      // so the AgentTeam + every Agent created by the long transaction
      // land in the right Clerk org instead of inheriting the agency's.
      const result = await deployTeamTemplate(
        userId,
        templateKey,
        { teamName: name },
        effectiveOrgId,
      );

      const fullTeam = await prisma.agentTeam.findUnique({
        where: { id: result.teamId },
        include: {
          members: {
            include: { agent: { select: { id: true, name: true, slug: true } } },
          },
          _count: { select: { tasks: true } },
        },
      });

      return Response.json(fullTeam, { status: 201 });
    }

    const team = await prisma.agentTeam.create({
      data: {
        userId,
        orgId: effectiveOrgId,
        name,
        description: description || null,
        goal: goal || null,
        isSubWorkflow: isSubWorkflow === true,
      },
    });

    // Return full team with members
    const fullTeam = await prisma.agentTeam.findUnique({
      where: { id: team.id },
      include: {
        members: {
          include: { agent: { select: { id: true, name: true, slug: true } } },
        },
        _count: { select: { tasks: true } },
      },
    });

    return Response.json(fullTeam, { status: 201 });
  } catch (err) {
    console.error("POST /api/teams error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
