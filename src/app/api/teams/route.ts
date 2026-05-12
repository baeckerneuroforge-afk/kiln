import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { deployTeamTemplate } from "@/lib/team-templates";
import { getUserEmailOrPlaceholder } from "@/lib/clerk-user-email";
import { describeTeamSchedule, normalizeTeamScheduleConfig } from "@/lib/team-schedule";
import { getAccessibleTeamIds } from "@/lib/team-permissions";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { resolveCreateTargetOrgId } from "@/lib/sub-org/resolve-create-target";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Per-team run statistics surfaced on the workflow list cards.
 *
 * Computed from TeamExecution records: totals, success/failure counts,
 * average duration of completed runs, and the most recent run's
 * timestamp + status. `null` durations / lastRun mean the workflow
 * has never run.
 */
interface RunStats {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  successRate: number | null;
  avgDurationMs: number | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
}

async function fetchRunStatsByTeamId(teamIds: string[]): Promise<Map<string, RunStats>> {
  const result = new Map<string, RunStats>();
  if (teamIds.length === 0) return result;

  // One pass over recent executions. Sorted desc so the first match
  // per teamId is the latest run. We pull just the fields we need to
  // keep the payload small even for high-volume teams.
  const execs = await prisma.teamExecution.findMany({
    where: { teamId: { in: teamIds } },
    orderBy: { startedAt: "desc" },
    select: {
      teamId: true,
      status: true,
      startedAt: true,
      completedAt: true,
    },
  });

  // Group by teamId in a single sweep; we don't need a per-team query.
  for (const teamId of teamIds) {
    const teamExecs = execs.filter((e) => e.teamId === teamId);
    const total = teamExecs.length;
    const completed = teamExecs.filter((e) => e.status === "COMPLETED");
    const failed = teamExecs.filter((e) => e.status === "FAILED");
    const durations = completed
      .filter((e) => e.completedAt)
      .map((e) => e.completedAt!.getTime() - e.startedAt.getTime())
      .filter((ms) => Number.isFinite(ms) && ms >= 0);
    const avgDurationMs =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;
    const lastRun = teamExecs[0];

    result.set(teamId, {
      totalRuns: total,
      completedRuns: completed.length,
      failedRuns: failed.length,
      successRate: total > 0 ? completed.length / total : null,
      avgDurationMs,
      lastRunAt: lastRun?.startedAt?.toISOString() ?? null,
      lastRunStatus: lastRun?.status ?? null,
    });
  }

  return result;
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

    const body = await request.json();
    const { name, description, goal, template: templateKey, isSubWorkflow, subOrgId } = body;

    if (!name && !templateKey) {
      return Response.json(
        { error: "Name is required." },
        { status: 400 }
      );
    }

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
      const result = await deployTeamTemplate(userId, templateKey, {
        teamName: name,
      });

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
