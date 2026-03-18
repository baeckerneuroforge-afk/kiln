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

function applyCustomizations(text: string, customizations: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(customizations)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
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
    const {
      name: customName,
      businessName,
      industry,
      agentNameTweaks,
    } = body as {
      name?: string;
      businessName?: string;
      industry?: string;
      agentNameTweaks?: Record<string, string>; // oldAgentId → newName
    };

    // Anpassungs-Map für Template-Variablen
    const customizations: Record<string, string> = {};
    if (businessName) customizations.businessName = businessName;
    if (industry) customizations.industry = industry;

    // Original-Team laden
    const original = await prisma.agentTeam.findFirst({
      where: { id: params.id },
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

    const teamName = customName?.trim() || `${original.name} (Forked)`;

    // Neues Team erstellen
    const newTeam = await prisma.agentTeam.create({
      data: {
        userId,
        name: teamName,
        description: original.description
          ? applyCustomizations(original.description, customizations)
          : null,
        goal: original.goal
          ? applyCustomizations(original.goal, customizations)
          : null,
        config: original.config ?? undefined,
        status: "ACTIVE",
        parentTeamId: original.id,
      },
    });

    const agentIdMap = new Map<string, string>();
    const memberIdMap = new Map<string, string>();

    for (const member of original.members) {
      let newAgentId: string | null = null;

      if (member.agent) {
        const agent = member.agent;
        const newAgentName = agentNameTweaks?.[agent.id] || agent.name;

        const newAgent = await prisma.agent.create({
          data: {
            userId,
            name: newAgentName,
            slug: generateSlug(newAgentName),
            description: agent.description
              ? applyCustomizations(agent.description, customizations)
              : null,
            systemPrompt: applyCustomizations(agent.systemPrompt, customizations),
            personality: agent.personality ?? undefined,
            welcomeMessage: agent.welcomeMessage
              ? applyCustomizations(agent.welcomeMessage, customizations)
              : null,
            suggestedQuestions: agent.suggestedQuestions,
            llmModel: agent.llmModel,
            temperature: agent.temperature,
            modelProvider: agent.modelProvider,
            status: "LIVE",
            agentType: agent.agentType,
            agentMode: agent.agentMode,
            triggerType: agent.triggerType,
            outputType: agent.outputType,
            whiteLabel: agent.whiteLabel ?? undefined,
            showPoweredBy: agent.showPoweredBy,
            autoDetectLanguage: agent.autoDetectLanguage,
            memoryEnabled: agent.memoryEnabled,
            imageAnalysisEnabled: agent.imageAnalysisEnabled,
            showAiDisclaimer: agent.showAiDisclaimer,
            clonedFromId: agent.id,
            clonedFromName: agent.name,
          },
        });

        agentIdMap.set(agent.id, newAgent.id);
        newAgentId = newAgent.id;

        // Actions kopieren
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

        // KB kopieren
        for (const kb of agent.knowledgeBases) {
          await prisma.knowledgeBase.create({
            data: {
              agentId: newAgent.id,
              type: kb.type,
              sourceName: kb.sourceName,
              content: applyCustomizations(kb.content, customizations),
              chunkCount: 0,
              embeddingStatus: "PENDING",
            },
          });
        }
      }

      const newMember = await prisma.agentTeamMember.create({
        data: {
          teamId: newTeam.id,
          agentId: newAgentId,
          role: member.role,
          level: member.level,
          responsibilities: member.responsibilities
            ? applyCustomizations(member.responsibilities, customizations)
            : null,
          config: member.config ?? undefined,
          outputSchema: member.outputSchema ?? undefined,
          enabledActions: member.enabledActions,
          feedbackLoop: member.feedbackLoop ?? undefined,
          executionMode: member.executionMode,
          fallbackModel: member.fallbackModel,
          fallbackEnabled: member.fallbackEnabled,
          maxRetries: member.maxRetries,
        },
      });

      memberIdMap.set(member.id, newMember.id);
    }

    // ReportsTo + FallbackAgent setzen
    for (const member of original.members) {
      const newMemberId = memberIdMap.get(member.id);
      if (!newMemberId) continue;

      const updates: Record<string, unknown> = {};
      if (member.reportsToMemberId) {
        const nr = memberIdMap.get(member.reportsToMemberId);
        if (nr) updates.reportsToMemberId = nr;
      }
      if (member.fallbackAgentId) {
        const nf = agentIdMap.get(member.fallbackAgentId);
        if (nf) updates.fallbackAgentId = nf;
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
          content: applyCustomizations(kb.content, customizations),
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
        const s = agentIdMap.get(rule.sourceAgentId);
        const t = agentIdMap.get(rule.targetAgentId);
        if (s && t) {
          await prisma.agentOrchestration.create({
            data: { sourceAgentId: s, targetAgentId: t, condition: rule.condition, enabled: rule.enabled },
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
    console.error("POST /api/teams/[id]/fork error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
