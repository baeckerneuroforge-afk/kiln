import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { cleanupOrchestrationLogs } from "@/lib/orchestration-logger";
import { Prisma } from "@prisma/client";
import { getClaudeClient } from "@/lib/ai";
import { deductCredits } from "@/lib/credits";
import { sendTeamScheduleCompletionEmail } from "@/lib/email-notifications";
import { prisma } from "@/lib/prisma";
import {
  setExecutionContextMeta,
  type TeamExecutionTrigger,
} from "@/lib/team-execution-metadata";
import {
  executeTeamExecution,
  loadTeamExecutionRuntimeContext,
} from "@/lib/services/team-runtime";
import {
  getTeamScheduleConfig,
  isTeamScheduleDue,
  updateTeamScheduleConfig,
} from "@/lib/team-schedule";

async function decomposeScheduledGoal(params: {
  team: Awaited<ReturnType<typeof loadTeamExecutionRuntimeContext>>;
  goal: string;
}) {
  const team = params.team;
  if (!team) {
    throw new Error("Team not found");
  }

  const headMember = team.members.find((member) => member.role === "HEAD");
  if (!headMember) {
    throw new Error("Team has no HEAD member.");
  }

  const memberDescriptions = team.members
    .map((member) =>
      member.role === "APPROVAL_GATE"
        ? `- Approval Gate (Role: ${member.role}, ID: ${member.id})${member.responsibilities ? ` — ${member.responsibilities}` : ""}.`
        : `- ${member.agent?.name || "Unnamed agent"} (Role: ${member.role}, ID: ${member.id})${member.responsibilities ? ` — ${member.responsibilities}` : ""}${member.agent?.description ? ` | ${member.agent.description}` : ""}`
    )
    .join("\n");

  const claude = getClaudeClient();
  const response = await claude.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: `You are a team coordinator AI. You decompose a goal into actionable subtasks and assign them to team members.

The team "${team.name}" has the following members:
${memberDescriptions}

Break the scheduled goal into 3-8 concrete subtasks. Each subtask should be assigned to the most appropriate team member.

Respond with a JSON array of tasks. Each task has:
- "title": Short, actionable task title
- "description": Detailed description of what needs to be done
- "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT"
- "assignedToId": The member ID from the list above (or null if unassigned)

Respond ONLY with a valid JSON array, no other text.`,
    messages: [{ role: "user", content: params.goal }],
  });

  await deductCredits(team.userId, "claude-sonnet-4-20250514", "TEAM_TASK").catch(
    (error) => {
      console.error("Scheduled team decomposition credit deduction failed:", error);
    }
  );

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Failed to generate scheduled subtasks.");
  }

  const jsonText = textBlock.text
    .replace(/```json?\n?/g, "")
    .replace(/```/g, "")
    .trim();

  const subtasks = JSON.parse(jsonText) as Array<{
    title: string;
    description?: string;
    priority?: string;
    assignedToId?: string | null;
  }>;

  if (!Array.isArray(subtasks) || subtasks.length === 0) {
    throw new Error("Scheduled run produced no valid subtasks.");
  }

  const validMemberIds = new Set(team.members.map((member) => member.id));
  return subtasks.map((task, taskIndex) => ({
    id: `scheduled-${taskIndex}`,
    title: task.title,
    description: task.description || null,
    priority: task.priority || "MEDIUM",
    assignedToId:
      task.assignedToId && validMemberIds.has(task.assignedToId)
        ? task.assignedToId
        : null,
    taskIndex,
  }));
}

async function runScheduledTeamExecution(params: {
  teamId: string;
  userId: string;
  goal: string;
  scheduleCron: string;
  notifyOnComplete: boolean;
  notifyEmail: string;
}) {
  const team = await loadTeamExecutionRuntimeContext(params.teamId, params.userId);
  if (!team) {
    throw new Error("Team not found");
  }

  const tasks = await decomposeScheduledGoal({
    team,
    goal: params.goal,
  });

  const executionContext = setExecutionContextMeta(
    {},
    {
      trigger: "scheduled" satisfies TeamExecutionTrigger,
      scheduledCron: params.scheduleCron,
      scheduledAt: new Date().toISOString(),
      notifyOnComplete: params.notifyOnComplete,
      notifyEmail: params.notifyEmail || null,
    }
  );

  const execution = await prisma.teamExecution.create({
    data: {
      teamId: params.teamId,
      userId: params.userId,
      goal: params.goal,
      totalTasks: tasks.length,
      completedTasks: 0,
      failedTasks: 0,
      taskPlan: tasks,
      executionContext,
    },
  });

  const createdTasks = await prisma.$transaction(
    tasks.map((task) =>
      prisma.agentTeamTask.create({
        data: {
          teamId: params.teamId,
          title: task.title,
          description: task.description,
          priority: task.priority,
          assignedToId: task.assignedToId,
          status: "PENDING",
        },
      })
    )
  );

  await prisma.teamExecution.update({
    where: { id: execution.id },
    data: {
      taskPlan: createdTasks.map((task, taskIndex) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        assignedToId: task.assignedToId,
        taskIndex,
      })),
    },
  });

  await executeTeamExecution({
    executionId: execution.id,
    team,
    userId: params.userId,
    goal: params.goal,
    tasks: createdTasks.map((task, taskIndex) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      assignedToId: task.assignedToId,
      taskIndex,
    })),
    executionContext,
  });

  if (params.notifyOnComplete && params.notifyEmail) {
    const finishedExecution = await prisma.teamExecution.findUnique({
      where: { id: execution.id },
      select: {
        id: true,
        status: true,
        completedTasks: true,
        failedTasks: true,
      },
    });

    if (finishedExecution) {
      await sendTeamScheduleCompletionEmail({
        to: params.notifyEmail,
        teamName: team.name,
        goal: params.goal,
        executionId: finishedExecution.id,
        status: finishedExecution.status,
        completedTasks: finishedExecution.completedTasks,
        failedTasks: finishedExecution.failedTasks,
      });
    }
  }

  return execution.id;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const teams = await prisma.agentTeam.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      userId: true,
      name: true,
      config: true,
    },
  });

  const triggered: Array<{ teamId: string; executionId: string | null; status: string }> = [];

  for (const team of teams) {
    const schedule = getTeamScheduleConfig(team.config);
    if (!isTeamScheduleDue(schedule, now)) {
      continue;
    }

    const updatedConfig = updateTeamScheduleConfig(team.config, {
      ...schedule,
      lastRunAt: now.toISOString(),
    });

    await prisma.agentTeam.update({
      where: { id: team.id },
      data: {
        config: JSON.parse(JSON.stringify(updatedConfig)) as Prisma.InputJsonValue,
      },
    });

    waitUntil(
      runScheduledTeamExecution({
        teamId: team.id,
        userId: team.userId,
        goal: schedule.input,
        scheduleCron: schedule.cron,
        notifyOnComplete: schedule.notifyOnComplete,
        notifyEmail: schedule.notifyEmail,
      })
        .then((executionId) => {
          triggered.push({
            teamId: team.id,
            executionId,
            status: "triggered",
          });
        })
        .catch((error) => {
          console.error("Scheduled team execution failed:", error);
          triggered.push({
            teamId: team.id,
            executionId: null,
            status: "failed",
          });
        })
    );
  }

  // Auto-cleanup: delete orchestration logs older than 90 days
  waitUntil(
    cleanupOrchestrationLogs(90).catch((err) => {
      console.error("Orchestration log cleanup failed:", err);
    })
  );

  return Response.json({
    checkedAt: now.toISOString(),
    checkedTeams: teams.length,
    triggered,
  });
}
