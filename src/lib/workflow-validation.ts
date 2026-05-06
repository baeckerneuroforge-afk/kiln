/**
 * Pre-save / pre-run validation for workflows.
 *
 * The visual editor auto-persists every change, so validation isn't a
 * "save guard" — it's a Run guard. The banner is informational while
 * editing and blocks Run Workflow when there are blocking errors.
 *
 * Validation kept light on purpose: the goal is to catch the obvious
 * mistakes (missing trigger, agent picker not chosen, isolated nodes)
 * not to enforce full schema integrity. False positives are worse
 * than false negatives because the operator will ignore the banner.
 */

import type { WorkflowNodeType } from "./workflow-node-types";

export interface WorkflowNodeLite {
  id: string;
  type: WorkflowNodeType;
  label: string;
  config: Record<string, unknown>;
}

export interface WorkflowEdgeLite {
  sourceId: string;
  targetId: string;
}

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  /** Node the issue points at, if any. Null = workflow-level (e.g. "no trigger"). */
  nodeId: string | null;
  /** Short human-readable description shown in the banner row. */
  message: string;
  /** Stable code so callers can dedupe / inspect programmatically. */
  code: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const TRIGGER_TYPES: ReadonlySet<WorkflowNodeType> = new Set([
  "trigger_webhook",
  "trigger_schedule",
  "trigger_lead",
  "trigger_chat",
  "trigger_manual",
  "goal_trigger",
]);

const REQUIRED_FIELDS: Partial<Record<WorkflowNodeType, string[]>> = {
  http_request: ["url"],
  send_email: ["to"],
  send_slack: ["channel"],
  delay: ["duration"],
  sub_workflow: ["workflowId"],
  approval_gate: ["approverEmail"],
  // Integrations
  google_sheets_read: ["spreadsheetId"],
  google_sheets_write: ["spreadsheetId"],
  gmail_send: ["to"],
  slack_send_integration: ["channel"],
  notion_create: ["databaseId"],
  airtable_create: ["baseId"],
  // AI tools
  ai_classify: ["categories"],
};

function fieldEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Run all validation checks against a workflow snapshot.
 *
 * Returns separated `errors` (block Run Workflow) and `warnings`
 * (informational — the banner shows them but doesn't block).
 */
export function validateWorkflow(
  nodes: WorkflowNodeLite[],
  edges: WorkflowEdgeLite[]
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (nodes.length === 0) {
    errors.push({
      severity: "error",
      nodeId: null,
      message: "Workflow is empty — add a trigger and at least one action.",
      code: "EMPTY_WORKFLOW",
    });
    return { errors, warnings };
  }

  // 1. At least one trigger
  const triggerNodes = nodes.filter((n) => TRIGGER_TYPES.has(n.type));
  if (triggerNodes.length === 0) {
    errors.push({
      severity: "error",
      nodeId: null,
      message: "No trigger node — add one (Webhook / Schedule / Lead / Chat / Manual).",
      code: "NO_TRIGGER",
    });
  }

  // Build edge adjacency once for orphan detection
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  for (const e of edges) {
    inbound.set(e.targetId, (inbound.get(e.targetId) || 0) + 1);
    outbound.set(e.sourceId, (outbound.get(e.sourceId) || 0) + 1);
  }

  for (const node of nodes) {
    // 2. Agent nodes — must reference an agent OR have an inline prompt
    if (node.type === "agent") {
      const hasAgentId = typeof node.config.agentId === "string" && (node.config.agentId as string).trim().length > 0;
      const hasInlinePrompt =
        typeof node.config.systemPrompt === "string" &&
        (node.config.systemPrompt as string).trim().length >= 20;

      if (!hasAgentId && !hasInlinePrompt) {
        errors.push({
          severity: "error",
          nodeId: node.id,
          message: `${node.label}: pick an agent or write a system prompt.`,
          code: "AGENT_NOT_CONFIGURED",
        });
      }
    }

    if (node.type === "ensemble") {
      const agents = Array.isArray(node.config.agents) ? node.config.agents : [];
      const configured = agents.filter((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
        const record = entry as Record<string, unknown>;
        return typeof record.agentId === "string" && record.agentId.trim().length > 0;
      });
      if (configured.length < 2) {
        errors.push({
          severity: "error",
          nodeId: node.id,
          message: `${node.label}: configure at least two voting agents.`,
          code: "ENSEMBLE_NOT_CONFIGURED",
        });
      }
    }

    // 3. Required-field check based on node type
    const required = REQUIRED_FIELDS[node.type];
    if (required) {
      const missing = required.filter((field) => fieldEmpty(node.config[field]));
      if (missing.length > 0) {
        errors.push({
          severity: "error",
          nodeId: node.id,
          message: `${node.label}: missing required field${missing.length > 1 ? "s" : ""} ${missing.join(", ")}.`,
          code: "MISSING_REQUIRED_FIELD",
        });
      }
    }

    // 4. Isolated nodes — neither inbound nor outbound. Triggers are
    //    allowed without inbound (they ARE the inbound). Leaf actions
    //    are allowed without outbound. Only flag nodes truly
    //    disconnected from the graph.
    const isTrigger = TRIGGER_TYPES.has(node.type);
    const inCount = inbound.get(node.id) || 0;
    const outCount = outbound.get(node.id) || 0;

    if (nodes.length > 1 && inCount === 0 && outCount === 0) {
      warnings.push({
        severity: "warning",
        nodeId: node.id,
        message: `${node.label}: not connected to anything.`,
        code: "ISOLATED_NODE",
      });
    } else if (!isTrigger && inCount === 0 && nodes.length > 1) {
      warnings.push({
        severity: "warning",
        nodeId: node.id,
        message: `${node.label}: nothing flows into this node.`,
        code: "NO_INBOUND",
      });
    }
  }

  return { errors, warnings };
}
