import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { canCreateAgent } from "@/lib/plan-limits";
import { getUserEmailOrPlaceholder } from "@/lib/clerk-user-email";
import { validateSchema } from "@/lib/agents/io-schema-validator";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { resolveCreateTargetOrgId } from "@/lib/sub-org/resolve-create-target";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// Load all agents in the active org (with legacy fallback for unmigrated rows)
export async function GET() {
  try {
    let scope;
    try {
      scope = await requireOrgId();
    } catch (err) {
      if (err instanceof OrgContextError) return unauthorized();
      throw err;
    }

    const agents = await prisma.agent.findMany({
      where: orgScopeFilter(scope),
      include: {
        _count: { select: { conversations: true, runs: true } },
        agentTeamMembers: {
          include: { team: { select: { id: true, name: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(agents);
  } catch (err) {
    console.error("GET /api/agents error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Create new agent
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
    const {
      name,
      slug,
      description,
      systemPrompt,
      personality,
      welcomeMessage,
      suggestedQuestions,
      suggestedActions,
      modelProvider,
      llmModel: bodyLlmModel,
      triggerType,
      triggerConfig,
      outputType,
      outputConfig,
      // Sprint 19.7.4 — when the create flow originates from a sub-org
      // page, the client passes the OrgRelationship.id here so we
      // create the agent under the sub-org's Clerk org instead of the
      // active agency org.
      subOrgId,
    } = body;

    const target = await resolveCreateTargetOrgId({
      userId,
      defaultOrgId: orgId,
      subOrgId: typeof subOrgId === "string" ? subOrgId : null,
      requiredPermission: "agents.write",
    });
    if (!target.ok) {
      return Response.json({ error: target.error }, { status: target.status });
    }
    const effectiveOrgId = target.orgId;
    // Backward-compat: accept legacy field names (agentMode, agentType) from
    // older API consumers; prefer the new names (mode, visibility) when present.
    const mode = body.mode ?? body.agentMode;
    const visibility = body.visibility ?? body.agentType;

    if (!name || !slug || !systemPrompt) {
      return Response.json(
        { error: "Name, slug, and system prompt are required." },
        { status: 400 }
      );
    }

    // Validate optional I/O schemas before persisting.
    const inputSchema = body.inputSchema ?? null;
    const outputSchema = body.outputSchema ?? null;
    const strictOutputValidation = body.strictOutputValidation === true;
    if (inputSchema !== null) {
      const r = validateSchema(inputSchema);
      if (!r.valid) {
        return Response.json(
          { error: "Invalid inputSchema", details: r.errors },
          { status: 400 }
        );
      }
    }
    if (outputSchema !== null) {
      const r = validateSchema(outputSchema);
      if (!r.valid) {
        return Response.json(
          { error: "Invalid outputSchema", details: r.errors },
          { status: 400 }
        );
      }
    }

    // Check plan limit
    const agentCheck = await canCreateAgent(userId);
    if (!agentCheck.allowed) {
      return Response.json(
        { error: `Agent limit reached (${agentCheck.current}/${agentCheck.limit}). Please upgrade your plan.` },
        { status: 403 }
      );
    }

    // Ensure user exists in DB (Clerk Sync)
    const userEmail = await getUserEmailOrPlaceholder(userId);
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: userEmail },
    });

    // Check slug collision
    const existingSlug = await prisma.agent.findUnique({ where: { slug } });
    const finalSlug = existingSlug ? `${slug}-${Date.now().toString(36)}` : slug;

    const agent = await prisma.agent.create({
      data: {
        userId,
        orgId: effectiveOrgId,
        name,
        slug: finalSlug,
        description,
        systemPrompt,
        personality: personality || {},
        welcomeMessage: welcomeMessage || "",
        suggestedQuestions: suggestedQuestions || [],
        llmModel: bodyLlmModel || "claude-sonnet-4-6",
        modelProvider: modelProvider || "ANTHROPIC",
        status: "DRAFT",
        mode: mode || "CHAT",
        ...(visibility ? { visibility } : {}),
        triggerType: triggerType || "MANUAL",
        triggerConfig: triggerConfig || undefined,
        outputType: outputType || "NONE",
        outputConfig: outputConfig || undefined,
        ...(inputSchema !== null ? { inputSchema } : {}),
        ...(outputSchema !== null ? { outputSchema } : {}),
        strictOutputValidation,
        whiteLabel: { primaryColor: "#F97316", position: "bottom-right" },
        // Create actions from suggested_actions
        actions: {
          create: (() => {
            const typeMap: Record<string, string> = {
              booking: "BOOK_APPOINTMENT",
              email: "COLLECT_EMAIL",
              send_email: "SEND_EMAIL",
              lead_scoring: "SCORE_LEAD",
              notification: "NOTIFY_OWNER",
              webhook: "FIRE_WEBHOOK",
              handoff: "HANDOFF_HUMAN",
            };
            // FAQ is not an action — filter and avoid duplicates
            const seen = new Set<string>();
            return (suggestedActions || [])
              .filter((action: string) => {
                const mapped = typeMap[action];
                if (!mapped || seen.has(mapped)) return false;
                seen.add(mapped);
                return true;
              })
              .map((action: string) => ({
                type: typeMap[action],
                enabled: true,
                config: {},
              }));
          })(),
        },
      },
    });

    return Response.json(agent, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
