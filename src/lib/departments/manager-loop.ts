import type Anthropic from "@anthropic-ai/sdk";
import type { ManagerDecision, ManagerDecisionResult, DepartmentManagerArgs } from "./types";
import { getAnthropicClientForUser } from "./anthropic-client";
import { asJsonRecord } from "./json";

const DECISION_TOOL_NAME = "department_manager_decision";

const decisionTool = {
  name: DECISION_TOOL_NAME,
  description: "Return the next action for the department manager loop.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["type"],
    properties: {
      type: {
        type: "string",
        enum: [
          "INVOKE_WORKER",
          "INVOKE_WORKFLOW",
          "INVOKE_SWARM",
          "REQUEST_APPROVAL",
          "UPDATE_MEMORY",
          "MARK_DONE",
          "FOLLOWUP_LATER",
        ],
      },
      workerId: { type: "string" },
      workflowId: { type: "string" },
      swarmConfig: { type: "object", additionalProperties: true },
      input: { type: "object", additionalProperties: true },
      draftedAction: { type: "object", additionalProperties: true },
      patch: { type: "object", additionalProperties: true },
      result: { type: "object", additionalProperties: true },
      scheduledFor: { type: "string" },
      payload: { type: "object", additionalProperties: true },
    },
  },
} satisfies Anthropic.Tool;

export async function decideNextAction(
  args: DepartmentManagerArgs
): Promise<ManagerDecisionResult> {
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const client = await getAnthropicClientForUser(
        args.department.userId,
        args.department.managerModel
      );
      const response = await client.messages.create({
        model: args.department.managerModel,
        max_tokens: 1200,
        temperature: 0,
        system: buildSystemPrompt(args),
        messages: [{ role: "user", content: buildUserPrompt(args, lastError) }],
        tools: [decisionTool],
        tool_choice: { type: "tool", name: DECISION_TOOL_NAME },
      });

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock =>
          block.type === "tool_use" && block.name === DECISION_TOOL_NAME
      );
      if (!toolUse) {
        throw new Error("Manager response did not include a decision tool call.");
      }

      const decision = normalizeDecision(asJsonRecord(toolUse.input));
      return {
        decision,
        tokensUsed:
          (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        raw: toolUse.input,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`Manager decision failed: ${lastError || "unknown error"}`);
}

function buildSystemPrompt(args: DepartmentManagerArgs): string {
  const workerLines = args.availableWorkers
    .map((worker) =>
      `- ${worker.role} (${worker.id}, agent ${worker.agentId}, priority ${worker.priority}): ${
        worker.description || "No description"
      }`
    )
    .join("\n");

  const customPrompt =
    args.department.managerSystemPrompt ||
    "You manage this department. Choose the next concrete action that advances the current backlog item.";

  return `${customPrompt}

Department:
- Name: ${args.department.name}
- Type: ${args.department.type}
- Approval mode: ${args.department.approvalMode}
- Status: ${args.department.status}

Rules:
- Return exactly one JSON decision through the provided tool.
- In APPROVAL_FIRST mode, never mark a customer-facing action done until a human has reviewed the draft.
- Prefer INVOKE_WORKER when a specialized worker can produce or refine the next result.
- Use REQUEST_APPROVAL for drafted customer replies, escalation summaries, or external actions that need review.
- Use UPDATE_MEMORY for durable facts that should persist across runs.
- Use MARK_DONE only when the backlog item needs no more work or an approval has already captured the draft.

Available workers:
${workerLines || "- No workers configured"}

Operating memory:
${JSON.stringify(args.operatingMemory, null, 2)}

Recent run logs:
${JSON.stringify(args.recentRunLogs.slice(0, 5), null, 2)}`;
}

function buildUserPrompt(args: DepartmentManagerArgs, retryError: string | null): string {
  return `Current backlog item:
${JSON.stringify(args.backlogItem, null, 2)}

${retryError ? `Previous decision was invalid: ${retryError}\n` : ""}
Choose the next manager action.`;
}

function normalizeDecision(input: Record<string, unknown>): ManagerDecision {
  const type = String(input.type || "");
  switch (type) {
    case "INVOKE_WORKER":
      return {
        type,
        workerId: requireString(input.workerId, "workerId"),
        input: asJsonRecord(input.input),
      };
    case "INVOKE_WORKFLOW":
      return {
        type,
        workflowId: requireString(input.workflowId, "workflowId"),
        input: asJsonRecord(input.input),
      };
    case "INVOKE_SWARM":
      return {
        type,
        swarmConfig: asJsonRecord(input.swarmConfig),
        input: asJsonRecord(input.input),
      };
    case "REQUEST_APPROVAL":
      return { type, draftedAction: asJsonRecord(input.draftedAction) };
    case "UPDATE_MEMORY":
      return { type, patch: asJsonRecord(input.patch) };
    case "MARK_DONE":
      return { type, result: asJsonRecord(input.result) };
    case "FOLLOWUP_LATER":
      return {
        type,
        scheduledFor: requireString(input.scheduledFor, "scheduledFor"),
        payload: asJsonRecord(input.payload),
      };
    default:
      throw new Error(`Unknown manager decision type: ${type}`);
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing manager decision field: ${field}`);
  }
  return value;
}
