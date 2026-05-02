import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function generateSlug(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const customName = typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : null;

    // Original-Team laden mit allen Details
    const original = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
      include: {
        members: {
          include: {
            agent: {
              include: {
                actions: true,
                knowledgeBases: true,
              },
            },
          },
          orderBy: { level: "asc" },
        },
        knowledgeBases: true,
      },
    });

    if (!original) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    // Neues Team erstellen
    const newTeam = await prisma.agentTeam.create({
      data: {
        userId,
        name: customName || `${original.name} (Copy)`,
        description: original.description,
        goal: original.goal,
        config: original.config ?? undefined,
        status: "ACTIVE",
        parentTeamId: original.id,
      },
    });

    // Agent-ID-Mapping: alte ID → neue ID
    const agentIdMap = new Map<string, string>();
    const memberIdMap = new Map<string, string>();

    // Agents klonen und Members erstellen
    for (const member of original.members) {
      let newAgentId: string | null = null;

      if (member.agent) {
        const agent = member.agent;

        // Agent kopieren
        const newAgent = await prisma.agent.create({
          data: {
            userId,
            name: `${agent.name}`,
            slug: generateSlug(agent.name),
            description: agent.description,
            systemPrompt: agent.systemPrompt,
            personality: agent.personality ?? undefined,
            welcomeMessage: agent.welcomeMessage,
            suggestedQuestions: agent.suggestedQuestions,
            llmModel: agent.llmModel,
            temperature: agent.temperature,
            modelProvider: agent.modelProvider,
            status: agent.status,
            visibility: agent.visibility,
            mode: agent.mode,
            triggerType: agent.triggerType,
            triggerConfig: agent.triggerConfig ?? undefined,
            outputType: agent.outputType,
            outputConfig: agent.outputConfig ?? undefined,
            whiteLabel: agent.whiteLabel ?? undefined,
            showPoweredBy: agent.showPoweredBy,
            autoDetectLanguage: agent.autoDetectLanguage,
            memoryEnabled: agent.memoryEnabled,
            imageAnalysisEnabled: agent.imageAnalysisEnabled,
            showAiDisclaimer: agent.showAiDisclaimer,
            promptBranches: agent.promptBranches ?? undefined,
            clonedFromId: agent.id,
            clonedFromName: agent.name,
          },
        });

        agentIdMap.set(agent.id, newAgent.id);
        newAgentId = newAgent.id;

        // Agent-Actions kopieren
        if (agent.actions.length > 0) {
          await prisma.agentAction.createMany({
            data: agent.actions.map((action) => ({
              agentId: newAgent.id,
              type: action.type,
              enabled: action.enabled,
              config: action.config ?? undefined,
            })),
          });
        }

        // Agent-KB kopieren
        for (const kb of agent.knowledgeBases) {
          await prisma.knowledgeBase.create({
            data: {
              agentId: newAgent.id,
              type: kb.type,
              sourceName: kb.sourceName,
              content: kb.content,
              chunkCount: 0,
              embeddingStatus: "PENDING",
            },
          });
        }
      }

      // Team-Member erstellen (reportsToMemberId wird in zweiter Runde gesetzt)
      const newMember = await prisma.agentTeamMember.create({
        data: {
          teamId: newTeam.id,
          agentId: newAgentId,
          role: member.role,
          level: member.level,
          responsibilities: member.responsibilities,
          config: member.config ?? undefined,
          outputSchema: member.outputSchema ?? undefined,
          enabledActions: member.enabledActions,
          feedbackLoop: member.feedbackLoop ?? undefined,
          executionMode: member.executionMode,
          fallbackModel: member.fallbackModel,
          fallbackEnabled: member.fallbackEnabled,
          maxRetries: member.maxRetries,
          // fallbackAgentId wird in zweiter Runde gesetzt
        },
      });

      memberIdMap.set(member.id, newMember.id);
    }

    // Zweite Runde: reportsToMemberId und fallbackAgentId setzen
    for (const member of original.members) {
      const newMemberId = memberIdMap.get(member.id);
      if (!newMemberId) continue;

      const updates: Record<string, unknown> = {};

      if (member.reportsToMemberId) {
        const newReportsTo = memberIdMap.get(member.reportsToMemberId);
        if (newReportsTo) updates.reportsToMemberId = newReportsTo;
      }

      if (member.fallbackAgentId) {
        const newFallbackAgentId = agentIdMap.get(member.fallbackAgentId);
        if (newFallbackAgentId) updates.fallbackAgentId = newFallbackAgentId;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.agentTeamMember.update({
          where: { id: newMemberId },
          data: updates,
        });
      }
    }

    // Team-KB kopieren
    for (const kb of original.knowledgeBases) {
      await prisma.knowledgeBase.create({
        data: {
          teamId: newTeam.id,
          type: kb.type,
          sourceName: kb.sourceName,
          content: kb.content,
          chunkCount: 0,
          embeddingStatus: "PENDING",
        },
      });
    }

    // Orchestration Rules kopieren
    const allOriginalAgentIds = Array.from(agentIdMap.keys());
    if (allOriginalAgentIds.length > 0) {
      const orchRules = await prisma.agentOrchestration.findMany({
        where: {
          sourceAgentId: { in: allOriginalAgentIds },
          targetAgentId: { in: allOriginalAgentIds },
        },
      });

      for (const rule of orchRules) {
        const newSourceId = agentIdMap.get(rule.sourceAgentId);
        const newTargetId = agentIdMap.get(rule.targetAgentId);
        if (newSourceId && newTargetId) {
          await prisma.agentOrchestration.create({
            data: {
              sourceAgentId: newSourceId,
              targetAgentId: newTargetId,
              condition: rule.condition,
              enabled: rule.enabled,
            },
          });
        }
      }
    }

    return Response.json(
      {
        id: newTeam.id,
        name: newTeam.name,
        url: `/dashboard/teams/${newTeam.id}`,
        parentTeamId: original.id,
        agentsCloned: agentIdMap.size,
        membersCloned: memberIdMap.size,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/teams/[id]/clone error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
