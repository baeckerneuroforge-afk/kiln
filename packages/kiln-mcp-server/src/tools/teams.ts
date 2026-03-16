import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { KilnClient } from "../client.js";

export function registerTeamTools(server: McpServer, client: KilnClient): void {
  // ── kiln_list_teams ──
  server.tool(
    "kiln_list_teams",
    "List all Agent Teams. Returns id, name, goal, status, member count, and task count.",
    {},
    async () => client.callTool("kiln_list_teams", {})
  );

  // ── kiln_create_team ──
  server.tool(
    "kiln_create_team",
    "Create a new Agent Team. Optionally use a template (SALES, SUPPORT, CONTENT) to auto-generate team structure.",
    {
      name: z.string().describe("Team name"),
      goal: z.string().optional().describe("Team goal or mission"),
      template: z.enum(["SALES", "SUPPORT", "CONTENT"]).optional().describe("Pre-built team template"),
    },
    async (args) => client.callTool("kiln_create_team", args)
  );

  // ── kiln_add_team_member ──
  server.tool(
    "kiln_add_team_member",
    "Add an agent to a team with a specific role (HEAD, COORDINATOR, EXECUTOR, REPORTER).",
    {
      teamId: z.string().describe("Team ID"),
      agentId: z.string().describe("Agent ID to add"),
      role: z.enum(["HEAD", "COORDINATOR", "EXECUTOR", "REPORTER"]).describe("Role in the team"),
      reportsToMemberId: z.string().optional().describe("ID of the team member this one reports to"),
      responsibilities: z.string().optional().describe("What this member is responsible for"),
    },
    async (args) => client.callTool("kiln_add_team_member", args)
  );

  // ── kiln_assign_task ──
  server.tool(
    "kiln_assign_task",
    "Assign a task to the team's HEAD agent for delegation. The HEAD will decompose it into subtasks.",
    {
      teamId: z.string().describe("Team ID"),
      task: z.string().describe("Task description or goal"),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional().describe("Priority level"),
    },
    async (args) => client.callTool("kiln_assign_task", args)
  );

  // ── kiln_execute_team ──
  server.tool(
    "kiln_execute_team",
    "Execute a team workflow: decompose a goal into subtasks assigned to team members using the HEAD agent. Returns all generated tasks.",
    {
      teamId: z.string().describe("Team ID"),
      goal: z.string().describe("Goal or task for the team to execute"),
    },
    async (args) => client.callTool("kiln_execute_team", args)
  );

  // ── kiln_get_team_status ──
  server.tool(
    "kiln_get_team_status",
    "Get current status of a team: members, tasks, progress.",
    {
      teamId: z.string().describe("Team ID"),
    },
    async (args) => client.callTool("kiln_get_team_status", args)
  );

  // ── kiln_orchestrate ──
  server.tool(
    "kiln_orchestrate",
    "Define an agent-to-agent handoff rule. When the condition matches in the source agent's conversation, it triggers a handoff to the target agent.",
    {
      sourceAgentId: z.string().describe("Source agent ID (the agent that detects the condition)"),
      targetAgentId: z.string().describe("Target agent ID (the agent that takes over)"),
      condition: z.string().describe("Condition description or keywords that trigger the handoff"),
    },
    async (args) => client.callTool("kiln_orchestrate", args)
  );

  // ── kiln_create_automation ──
  server.tool(
    "kiln_create_automation",
    "Create a scheduled automation rule for an agent. The agent will execute the task on the given schedule.",
    {
      agentId: z.string().describe("Agent ID"),
      name: z.string().describe("Automation name"),
      schedule: z.enum(["hourly", "daily", "weekly"]).describe("Schedule frequency"),
      task: z.string().describe("Task description for the agent to execute"),
    },
    async (args) => client.callTool("kiln_create_automation", args)
  );

  // ── kiln_create_workflow_automation ──
  server.tool(
    "kiln_create_workflow_automation",
    "Create a scheduled or webhook-triggered automation with cron expressions, input templates, and notification routing.",
    {
      agentId: z.string().describe("Agent ID to automate"),
      name: z.string().describe("Automation name"),
      trigger: z.object({
        type: z.enum(["schedule", "webhook"]).describe("Trigger type"),
        schedule: z.string().optional().describe("Cron expression or shorthand: 'hourly', 'daily', 'weekly', 'every-6h', 'twice-daily'"),
        webhookConfig: z.object({
          authType: z.enum(["NONE", "HEADER_AUTH", "HMAC"]).optional(),
          authValue: z.string().optional(),
        }).optional().describe("Webhook authentication config"),
      }).describe("How the automation is triggered"),
      inputTemplate: z.string().optional().describe("Input template (supports {{date}}, {{timestamp}} placeholders)"),
      notification: z.object({
        method: z.enum(["NONE", "EMAIL", "WEBHOOK"]).optional(),
        target: z.string().optional().describe("Email address or webhook URL"),
      }).optional().describe("Notification config for results"),
    },
    async (args) => client.callTool("kiln_create_workflow_automation", args)
  );

  // ── kiln_list_workflows ──
  server.tool(
    "kiln_list_workflows",
    "List all automations, team configurations, and orchestration rules. Provides a complete overview of all workflows.",
    {},
    async () => client.callTool("kiln_list_workflows", {})
  );
}
