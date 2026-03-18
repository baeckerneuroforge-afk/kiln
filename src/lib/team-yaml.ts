import yaml from "js-yaml";
import crypto from "crypto";
import type {
  ActionType,
  AgentMode,
  AgentTeamRole,
} from "@prisma/client";
import { MODEL_PROVIDER_MAP } from "./ai";

// ── YAML Schema Types ──

interface YamlAction {
  type: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

interface YamlOutputSchemaField {
  field: string;
  type: "string" | "number" | "boolean";
  description?: string;
}

interface YamlAgent {
  name: string;
  role: string;
  model: string;
  mode?: string;
  systemPrompt: string;
  description?: string;
  responsibilities?: string;
  welcomeMessage?: string;
  suggestedQuestions?: string[];
  actions?: string[] | YamlAction[];
  reportsTo?: string;
  outputSchema?: YamlOutputSchemaField[];
  enabledActions?: string[];
  executionMode?: string;
}

interface YamlOrchestrationRule {
  from: string;
  to: string;
  condition: string | { field: string; operator: string; value: unknown };
}

interface YamlSchedule {
  enabled: boolean;
  cron?: string;
  timezone?: string;
}

interface YamlTeam {
  name: string;
  description?: string;
  goal?: string;
  agents: YamlAgent[];
  orchestration?: YamlOrchestrationRule[];
  schedule?: YamlSchedule;
}

// ── Helpers ──

function generateSlug(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

function normalizeActions(
  actions?: string[] | YamlAction[]
): YamlAction[] {
  if (!actions || actions.length === 0) return [];
  if (typeof actions[0] === "string") {
    return (actions as string[]).map((type) => ({
      type,
      enabled: true,
      config: {},
    }));
  }
  return actions as YamlAction[];
}

function conditionToString(
  condition: string | { field: string; operator: string; value: unknown }
): string {
  if (typeof condition === "string") return condition;
  return `${condition.field} ${condition.operator} ${condition.value}`;
}

// ── Export ──

export async function exportTeamAsYaml(teamId: string): Promise<string> {
  const { prisma } = await import("./prisma");

  const team = await prisma.agentTeam.findUniqueOrThrow({
    where: { id: teamId },
    include: {
      members: {
        include: {
          agent: {
            include: { actions: true },
          },
          reportsTo: {
            include: { agent: { select: { name: true } } },
          },
        },
        orderBy: { level: "asc" },
      },
    },
  });

  const agentIdToName = new Map<string, string>();
  for (const member of team.members) {
    if (member.agent) {
      agentIdToName.set(member.agent.id, member.agent.name);
    } else if (member.role === "APPROVAL_GATE") {
      const config = member.config as Record<string, unknown> | null;
      const label =
        typeof config?.label === "string" ? config.label : "Approval Gate";
      agentIdToName.set(member.id, label);
    }
  }

  const agents: YamlAgent[] = team.members.map((member) => {
    if (member.role === "APPROVAL_GATE") {
      const config = member.config as Record<string, unknown> | null;
      return {
        name:
          typeof config?.label === "string" ? config.label : "Approval Gate",
        role: member.role,
        model: "approval-gate",
        mode: "TASK",
        systemPrompt: "Human approval gate — pauses execution for review.",
        description: member.responsibilities || undefined,
        ...(member.reportsTo?.agent?.name && {
          reportsTo: member.reportsTo.agent.name,
        }),
      };
    }

    const agent = member.agent!;
    const actions = agent.actions
      .filter((a) => a.enabled)
      .map((a) => a.type as string);

    const result: YamlAgent = {
      name: agent.name,
      role: member.role,
      model: agent.llmModel,
      mode: agent.agentMode,
      systemPrompt: agent.systemPrompt,
    };

    if (agent.description) result.description = agent.description;
    if (member.responsibilities) result.responsibilities = member.responsibilities;
    if (agent.welcomeMessage) result.welcomeMessage = agent.welcomeMessage;
    if (agent.suggestedQuestions?.length) {
      result.suggestedQuestions = agent.suggestedQuestions;
    }
    if (actions.length > 0) result.actions = actions;
    if (member.reportsTo?.agent?.name) {
      result.reportsTo = member.reportsTo.agent.name;
    }
    if (member.outputSchema) {
      result.outputSchema = member.outputSchema as unknown as YamlOutputSchemaField[];
    }
    if (member.enabledActions?.length) {
      result.enabledActions = member.enabledActions;
    }
    if (member.executionMode && member.executionMode !== "sequential") {
      result.executionMode = member.executionMode;
    }

    return result;
  });

  // Fetch orchestration rules for all agents in this team
  const agentIds = team.members
    .filter((m) => m.agentId)
    .map((m) => m.agentId!);

  const orchestrationRules =
    agentIds.length > 0
      ? await prisma.agentOrchestration.findMany({
          where: {
            sourceAgentId: { in: agentIds },
            targetAgentId: { in: agentIds },
            enabled: true,
          },
        })
      : [];

  const orchestration: YamlOrchestrationRule[] = orchestrationRules.map(
    (rule) => ({
      from: agentIdToName.get(rule.sourceAgentId) || rule.sourceAgentId,
      to: agentIdToName.get(rule.targetAgentId) || rule.targetAgentId,
      condition: rule.condition,
    })
  );

  // Build schedule from team config
  const teamConfig = team.config as Record<string, unknown> | null;
  const scheduleConfig = teamConfig?.schedule as YamlSchedule | undefined;

  const yamlTeam: YamlTeam = {
    name: team.name,
    agents,
  };
  if (team.description) yamlTeam.description = team.description;
  if (team.goal) yamlTeam.goal = team.goal;
  if (orchestration.length > 0) yamlTeam.orchestration = orchestration;
  if (scheduleConfig?.enabled) yamlTeam.schedule = scheduleConfig;

  return yaml.dump(yamlTeam, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
}

// ── Import ──

export async function importTeamFromYaml(
  userId: string,
  yamlContent: string
): Promise<{
  teamId: string;
  teamName: string;
  detailUrl: string;
  agentIds: string[];
}> {
  const parsed = yaml.load(yamlContent) as YamlTeam;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Ungültiges YAML-Format");
  }
  if (!parsed.name) {
    throw new Error("Team-Name fehlt im YAML");
  }
  if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) {
    throw new Error("Mindestens ein Agent muss definiert sein");
  }

  const [{ prisma }, { getUserEmailOrPlaceholder }] = await Promise.all([
    import("./prisma"),
    import("./clerk-user-email"),
  ]);

  const userEmail = await getUserEmailOrPlaceholder(userId);
  const levelMap: Record<string, number> = {
    HEAD: 0,
    COORDINATOR: 1,
    APPROVAL_GATE: 2,
    EXECUTOR: 2,
    REPORTER: 2,
  };

  return prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: userEmail },
    });

    const team = await tx.agentTeam.create({
      data: {
        userId,
        name: parsed.name,
        description: parsed.description || null,
        goal: parsed.goal || null,
        config: parsed.schedule?.enabled
          ? ({ schedule: JSON.parse(JSON.stringify(parsed.schedule)) } as Record<string, string>)
          : undefined,
      },
    });

    const memberIds = new Map<string, string>();
    const agentIdsByName = new Map<string, string>();
    const agentIds: string[] = [];

    // First pass: create agents and members
    for (const agentDef of parsed.agents) {
      const role = (agentDef.role || "EXECUTOR") as AgentTeamRole;
      const level = levelMap[role] ?? 2;

      if (role === "APPROVAL_GATE") {
        const member = await tx.agentTeamMember.create({
          data: {
            teamId: team.id,
            role,
            level,
            responsibilities: agentDef.responsibilities || agentDef.description || null,
            config: {
              approverEmail: userEmail,
              label: agentDef.name,
            },
          },
        });
        memberIds.set(agentDef.name, member.id);
        continue;
      }

      const agentMode = (agentDef.mode || "CHAT") as AgentMode;
      const actions = normalizeActions(agentDef.actions);

      const agent = await tx.agent.create({
        data: {
          userId,
          name: agentDef.name,
          slug: generateSlug(agentDef.name),
          description: agentDef.description || "",
          systemPrompt: agentDef.systemPrompt,
          welcomeMessage: agentDef.welcomeMessage || "",
          suggestedQuestions: agentDef.suggestedQuestions || [],
          llmModel: agentDef.model || "claude-sonnet-4-6",
          modelProvider:
            MODEL_PROVIDER_MAP[agentDef.model || "claude-sonnet-4-6"] ||
            "ANTHROPIC",
          status: "DRAFT",
          agentMode,
          temperature: agentMode === "CHAT" ? 0.7 : 0.4,
          personality: {
            tone: "professional",
            language: "de",
            style: agentMode === "CHAT" ? "customer-facing" : "operator",
          },
        },
      });

      if (actions.length > 0) {
        await tx.agentAction.createMany({
          data: actions.map((a) => ({
            agentId: agent.id,
            type: a.type as ActionType,
            enabled: a.enabled,
            config: (a.config ?? {}) as Record<string, string>,
          })),
        });
      }

      const member = await tx.agentTeamMember.create({
        data: {
          teamId: team.id,
          agentId: agent.id,
          role,
          level,
          responsibilities: agentDef.responsibilities || agentDef.description || null,
          outputSchema: agentDef.outputSchema
            ? (agentDef.outputSchema as unknown as Record<string, string>[])
            : undefined,
          enabledActions: agentDef.enabledActions || [],
          executionMode: agentDef.executionMode || "sequential",
        },
      });

      memberIds.set(agentDef.name, member.id);
      agentIdsByName.set(agentDef.name, agent.id);
      agentIds.push(agent.id);
    }

    // Second pass: set reportsTo relationships
    for (const agentDef of parsed.agents) {
      if (!agentDef.reportsTo) continue;
      const memberId = memberIds.get(agentDef.name);
      const reportsToId = memberIds.get(agentDef.reportsTo);
      if (memberId && reportsToId) {
        await tx.agentTeamMember.update({
          where: { id: memberId },
          data: { reportsToMemberId: reportsToId },
        });
      }
    }

    // Third pass: create orchestration rules
    if (parsed.orchestration) {
      for (const rule of parsed.orchestration) {
        const sourceAgentId = agentIdsByName.get(rule.from);
        const targetAgentId = agentIdsByName.get(rule.to);
        if (!sourceAgentId || !targetAgentId) continue;

        await tx.agentOrchestration.create({
          data: {
            sourceAgentId,
            targetAgentId,
            condition: conditionToString(rule.condition),
            enabled: true,
          },
        });
      }
    }

    return {
      teamId: team.id,
      teamName: team.name,
      detailUrl: `/dashboard/teams/${team.id}`,
      agentIds,
    };
  });
}

// ── Preview (parse without creating) ──

export function previewTeamYaml(yamlContent: string): {
  name: string;
  description?: string;
  goal?: string;
  agentCount: number;
  agents: { name: string; role: string; model: string }[];
  orchestrationRules: number;
  hasSchedule: boolean;
} {
  const parsed = yaml.load(yamlContent) as YamlTeam;

  if (!parsed || typeof parsed !== "object" || !parsed.name) {
    throw new Error("Ungültiges YAML-Format");
  }

  const agents = (parsed.agents || []).map((a) => ({
    name: a.name,
    role: a.role || "EXECUTOR",
    model: a.model || "claude-sonnet-4-6",
  }));

  return {
    name: parsed.name,
    description: parsed.description,
    goal: parsed.goal,
    agentCount: agents.filter((a) => a.role !== "APPROVAL_GATE").length,
    agents,
    orchestrationRules: parsed.orchestration?.length ?? 0,
    hasSchedule: !!parsed.schedule?.enabled,
  };
}
