import { prisma } from "@/lib/prisma";
import { getClaudeClient } from "@/lib/ai";
import {
  executeTeamExecution,
  loadTeamExecutionRuntimeContext,
  type TeamSharedContext,
  type TeamExecutionTaskInput,
} from "@/lib/services/team-runtime";
import { setExecutionContextMeta } from "@/lib/team-execution-metadata";

export interface TriggerTeamConfig {
  targetTeamId: string;
  inputTemplate?: string; // Template mit {{field}} Referenzen auf shared memory
  mode?: "async" | "sync"; // Default: async
  goalTemplate?: string; // Template für das Goal
}

export function parseTriggerTeamConfig(config: unknown): TriggerTeamConfig | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const c = config as Record<string, unknown>;
  if (typeof c.targetTeamId !== "string" || !c.targetTeamId) return null;
  return {
    targetTeamId: c.targetTeamId,
    inputTemplate: typeof c.inputTemplate === "string" ? c.inputTemplate : undefined,
    mode: c.mode === "sync" ? "sync" : "async",
    goalTemplate: typeof c.goalTemplate === "string" ? c.goalTemplate : undefined,
  };
}

// Template-Variablen ersetzen mit Werten aus dem Shared Context
function applyTemplate(template: string, context: TeamSharedContext): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path: string) => {
    const parts = path.split(".");
    let value: unknown = context;
    for (const part of parts) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return match; // Keine Auflösung möglich
      }
    }
    return value != null ? String(value) : match;
  });
}

// Team-Execution in einem anderen Team auslösen
export async function triggerTeamExecution({
  userId,
  targetTeamId,
  sourceExecutionId,
  sourceTeamId,
  sharedContext,
  config,
}: {
  userId: string;
  targetTeamId: string;
  sourceExecutionId: string;
  sourceTeamId: string;
  sharedContext: TeamSharedContext;
  config: TriggerTeamConfig;
}): Promise<{
  executionId: string;
  teamId: string;
  status: string;
  result?: TeamSharedContext;
}> {
  const team = await loadTeamExecutionRuntimeContext(targetTeamId, userId);
  if (!team) throw new Error(`Target team ${targetTeamId} not found`);

  // Goal zusammensetzen
  const goal = config.goalTemplate
    ? applyTemplate(config.goalTemplate, sharedContext)
    : `Triggered from team execution ${sourceExecutionId}`;

  // HEAD Member finden
  const headMember = team.members.find((m) => m.role === "HEAD");
  if (!headMember) throw new Error("Target team has no HEAD member");

  // Aufgaben via Claude decomponieren
  const memberDescriptions = team.members
    .map((m) =>
      m.role === "APPROVAL_GATE"
        ? `- Approval Gate (Role: ${m.role}, ID: ${m.id})${m.responsibilities ? ` — ${m.responsibilities}` : ""}`
        : `- ${m.agent?.name || "Unnamed agent"} (Role: ${m.role}, ID: ${m.id})${m.responsibilities ? ` — ${m.responsibilities}` : ""}${m.agent?.description ? ` | ${m.agent.description}` : ""}`
    )
    .join("\n");

  const claude = getClaudeClient();
  const response = await claude.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: `You are a team coordinator AI. You decompose a goal into actionable subtasks and assign them to team members.

The team "${team.name}" has the following members:
${memberDescriptions}

Given a goal, break it down into 3-8 concrete subtasks.

Respond with a JSON array of tasks. Each task has:
- "title": Short, actionable task title
- "description": Detailed description
- "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT"
- "assignedToId": The member ID from the list above

Respond ONLY with a valid JSON array, no other text.`,
    messages: [{ role: "user", content: goal }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const rawTasks = textBlock ? JSON.parse(textBlock.text) : [];

  // Execution + Tasks erstellen
  const initialContext: TeamSharedContext = {};
  // Kontext vom Source-Team übergeben (bereinigt)
  if (config.inputTemplate) {
    const inputStr = applyTemplate(config.inputTemplate, sharedContext);
    try {
      const parsed = JSON.parse(inputStr);
      Object.assign(initialContext, parsed);
    } catch {
      initialContext._triggerInput = inputStr;
    }
  } else {
    // Relevante Felder aus dem Source-Kontext übernehmen (ohne interne Meta-Felder)
    for (const [key, value] of Object.entries(sharedContext)) {
      if (!key.startsWith("_")) {
        initialContext[key] = value;
      }
    }
  }

  initialContext._sourceTeamId = sourceTeamId;
  initialContext._sourceExecutionId = sourceExecutionId;

  const executionContext = setExecutionContextMeta(initialContext, {
    trigger: "team_trigger",
  });

  const execution = await prisma.teamExecution.create({
    data: {
      teamId: targetTeamId,
      userId,
      goal,
      status: "RUNNING",
      totalTasks: rawTasks.length,
    },
  });

  // Tasks erstellen
  const tasks: TeamExecutionTaskInput[] = [];
  for (let i = 0; i < rawTasks.length; i++) {
    const t = rawTasks[i];
    const task = await prisma.agentTeamTask.create({
      data: {
        teamId: targetTeamId,
        title: t.title || `Task ${i + 1}`,
        description: t.description || null,
        priority: t.priority || "MEDIUM",
        assignedToId: t.assignedToId || null,
        status: "PENDING",
      },
    });
    tasks.push({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      assignedToId: task.assignedToId,
      taskIndex: i,
    });
  }

  // Aufgabenplan speichern
  await prisma.teamExecution.update({
    where: { id: execution.id },
    data: { taskPlan: rawTasks },
  });

  if (config.mode === "sync") {
    // Synchron: Warten bis die Execution abgeschlossen ist
    await executeTeamExecution({
      executionId: execution.id,
      team,
      userId,
      goal,
      tasks,
      executionContext,
    });

    // Ergebnis laden
    const completed = await prisma.teamExecution.findUnique({
      where: { id: execution.id },
      select: { status: true, executionContext: true },
    });

    return {
      executionId: execution.id,
      teamId: targetTeamId,
      status: completed?.status || "COMPLETED",
      result: (completed?.executionContext as TeamSharedContext) || {},
    };
  } else {
    // Async: Fire and forget
    executeTeamExecution({
      executionId: execution.id,
      team,
      userId,
      goal,
      tasks,
      executionContext,
    }).catch((err) => {
      console.error(`Triggered team execution ${execution.id} failed:`, err);
    });

    return {
      executionId: execution.id,
      teamId: targetTeamId,
      status: "RUNNING",
    };
  }
}
