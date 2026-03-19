/**
 * Workflow Node Type System
 * Defines all node types available in the visual workflow editor.
 * Agent nodes represent existing AI agents; all other types are
 * non-LLM nodes (triggers, logic, actions, control flow).
 */

/* ========== Node Type Registry ========== */

export type WorkflowNodeType =
  // AI Agents
  | "agent"
  // Triggers
  | "trigger_webhook"
  | "trigger_schedule"
  | "trigger_lead"
  | "trigger_chat"
  | "trigger_manual"
  // Logic
  | "if_condition"
  | "switch"
  | "filter"
  | "transform"
  // Actions
  | "http_request"
  | "send_email"
  | "send_slack"
  | "delay"
  | "set_variable"
  // Control
  | "approval_gate"
  | "wait_webhook"
  | "wait_form"
  | "sub_workflow"
  | "merge"
  // Integrations
  | "google_sheets_read"
  | "google_sheets_write"
  | "gmail_send"
  | "slack_send_integration"
  | "calendar_create"
  | "calendar_check"
  | "notion_create"
  | "airtable_create"
  // AI Tools
  | "ai_summarize"
  | "ai_classify"
  | "ai_extract";

export type WorkflowNodeCategory = "agents" | "triggers" | "logic" | "actions" | "control" | "integrations" | "ai_tools";

export interface WorkflowNodeDefinition {
  type: WorkflowNodeType;
  label: string;
  description: string;
  category: WorkflowNodeCategory;
  icon: string; // lucide icon name
  color: string; // hex color for the node border/accent
  defaultConfig: Record<string, unknown>;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  agentId?: string; // nur für "agent" Nodes
}

export interface WorkflowEdge {
  sourceId: string;
  targetId: string;
  condition?: string; // optional label/condition on the edge
  sourceHandle?: string; // z.B. "true" / "false" bei if_condition
}

/* ========== Workflow Variables ========== */

export interface WorkflowVariable {
  id: string;
  name: string;
  defaultValue: string;
  type: "string" | "number" | "boolean";
  description: string;
  isSecret: boolean;
}

/* ========== Category Definitions ========== */

export const WORKFLOW_CATEGORIES: {
  id: WorkflowNodeCategory;
  label: string;
  icon: string;
  color: string;
}[] = [
  { id: "triggers", label: "Triggers", icon: "Zap", color: "#F59E0B" },
  { id: "agents", label: "AI Agents", icon: "Bot", color: "#F97316" },
  { id: "logic", label: "Logic", icon: "GitBranch", color: "#8B5CF6" },
  { id: "actions", label: "Actions", icon: "Play", color: "#3B82F6" },
  { id: "control", label: "Control", icon: "Shield", color: "#06B6D4" },
  { id: "integrations", label: "Integrations", icon: "Plug", color: "#22C55E" },
  { id: "ai_tools", label: "AI Tools", icon: "Sparkles", color: "#EC4899" },
];

/* ========== Node Definitions ========== */

export const WORKFLOW_NODE_DEFINITIONS: WorkflowNodeDefinition[] = [
  // Triggers
  {
    type: "trigger_webhook",
    label: "Webhook Trigger",
    description: "Receives HTTP POST, extracts data",
    category: "triggers",
    icon: "Globe",
    color: "#F59E0B",
    defaultConfig: { method: "POST", path: "" },
  },
  {
    type: "trigger_schedule",
    label: "Schedule Trigger",
    description: "Runs on cron schedule",
    category: "triggers",
    icon: "Clock",
    color: "#F59E0B",
    defaultConfig: { cron: "0 9 * * *", timezone: "Europe/Berlin" },
  },
  {
    type: "trigger_lead",
    label: "Lead Captured",
    description: "Fires when any agent captures a lead",
    category: "triggers",
    icon: "UserPlus",
    color: "#F59E0B",
    defaultConfig: { agentFilter: "all" },
  },
  {
    type: "trigger_chat",
    label: "Chat Started",
    description: "Fires when embed chat begins",
    category: "triggers",
    icon: "MessageSquare",
    color: "#F59E0B",
    defaultConfig: { agentFilter: "all" },
  },
  {
    type: "trigger_manual",
    label: "Manual Trigger",
    description: "Click to run manually",
    category: "triggers",
    icon: "Play",
    color: "#F59E0B",
    defaultConfig: {},
  },

  // AI Agents
  {
    type: "agent",
    label: "AI Agent",
    description: "Run an existing AI agent",
    category: "agents",
    icon: "Bot",
    color: "#F97316",
    defaultConfig: {},
  },

  // Logic
  {
    type: "if_condition",
    label: "IF / Condition",
    description: "Evaluates expression, two outputs",
    category: "logic",
    icon: "GitBranch",
    color: "#8B5CF6",
    defaultConfig: { field: "", operator: "equals", value: "" },
  },
  {
    type: "switch",
    label: "Switch",
    description: "Multiple conditions, multiple outputs",
    category: "logic",
    icon: "GitFork",
    color: "#8B5CF6",
    defaultConfig: { cases: [{ label: "Case 1", condition: "" }] },
  },
  {
    type: "filter",
    label: "Filter",
    description: "Passes data if condition met",
    category: "logic",
    icon: "Filter",
    color: "#8B5CF6",
    defaultConfig: { field: "", operator: "exists", value: "" },
  },

  {
    type: "transform",
    label: "Transform",
    description: "Transform and reshape data with expressions",
    category: "logic",
    icon: "Shuffle",
    color: "#8B5CF6",
    defaultConfig: { transformations: [{ outputField: "", expression: "" }] },
  },

  // Actions
  {
    type: "http_request",
    label: "HTTP Request",
    description: "Make HTTP call (GET, POST, etc.)",
    category: "actions",
    icon: "Globe",
    color: "#3B82F6",
    defaultConfig: { method: "GET", url: "", headers: {}, body: "" },
  },
  {
    type: "send_email",
    label: "Send Email",
    description: "Send email via Resend",
    category: "actions",
    icon: "Mail",
    color: "#3B82F6",
    defaultConfig: { to: "", subject: "", body: "" },
  },
  {
    type: "send_slack",
    label: "Send Slack Message",
    description: "Post to Slack channel",
    category: "actions",
    icon: "Hash",
    color: "#3B82F6",
    defaultConfig: { channel: "", message: "" },
  },
  {
    type: "delay",
    label: "Delay",
    description: "Wait before continuing",
    category: "actions",
    icon: "Timer",
    color: "#3B82F6",
    defaultConfig: { duration: 60, unit: "seconds" },
  },
  {
    type: "set_variable",
    label: "Set Variable",
    description: "Store key=value in context",
    category: "actions",
    icon: "Variable",
    color: "#3B82F6",
    defaultConfig: { key: "", value: "" },
  },

  // Control
  {
    type: "approval_gate",
    label: "Approval Gate",
    description: "Pause until human approves",
    category: "control",
    icon: "ShieldCheck",
    color: "#06B6D4",
    defaultConfig: { approverEmail: "", timeoutMinutes: 60 },
  },
  {
    type: "wait_webhook",
    label: "Wait for Webhook",
    description: "Pause until external webhook received",
    category: "control",
    icon: "Pause",
    color: "#06B6D4",
    defaultConfig: { timeoutMinutes: 1440 },
  },
  {
    type: "wait_form",
    label: "Wait for Form",
    description: "Pause until a form is submitted",
    category: "control",
    icon: "FileText",
    color: "#06B6D4",
    defaultConfig: {
      formTitle: "",
      formDescription: "",
      fields: [],
      timeoutMinutes: 10080,
      timeoutAction: "fail",
    },
  },
  {
    type: "sub_workflow",
    label: "Sub-Workflow",
    description: "Run another workflow as a step",
    category: "control",
    icon: "Layers",
    color: "#06B6D4",
    defaultConfig: { workflowId: "", mode: "sync", inputMapping: [], outputMapping: [], timeoutMinutes: 5 },
  },
  {
    type: "merge",
    label: "Merge",
    description: "Wait for all parallel branches",
    category: "control",
    icon: "Merge",
    color: "#06B6D4",
    defaultConfig: { strategy: "wait_all" },
  },

  // Integrations
  {
    type: "google_sheets_read",
    label: "Google Sheets lesen",
    description: "Daten aus einem Google Sheet lesen",
    category: "integrations",
    icon: "Table",
    color: "#22C55E",
    defaultConfig: { spreadsheetId: "", range: "Sheet1!A:Z", resultKey: "sheetsData" },
  },
  {
    type: "google_sheets_write",
    label: "Google Sheets schreiben",
    description: "Zeile in ein Google Sheet schreiben",
    category: "integrations",
    icon: "TableProperties",
    color: "#22C55E",
    defaultConfig: { spreadsheetId: "", range: "Sheet1", values: [] },
  },
  {
    type: "gmail_send",
    label: "Gmail senden",
    description: "E-Mail über Gmail versenden",
    category: "integrations",
    icon: "Mail",
    color: "#22C55E",
    defaultConfig: { to: "", subject: "", body: "", replyToMessageId: "" },
  },
  {
    type: "slack_send_integration",
    label: "Slack Nachricht",
    description: "Nachricht über verbundenen Slack-Workspace senden",
    category: "integrations",
    icon: "Hash",
    color: "#22C55E",
    defaultConfig: { channel: "", message: "", threadTs: "" },
  },
  {
    type: "calendar_create",
    label: "Termin erstellen",
    description: "Google Calendar Termin erstellen",
    category: "integrations",
    icon: "CalendarPlus",
    color: "#22C55E",
    defaultConfig: { title: "", start: "", end: "", description: "", attendeeEmail: "", timezone: "Europe/Berlin" },
  },
  {
    type: "calendar_check",
    label: "Verfügbarkeit prüfen",
    description: "Freie Slots im Google Calendar finden",
    category: "integrations",
    icon: "CalendarSearch",
    color: "#22C55E",
    defaultConfig: { startDate: "", endDate: "", slotMinutes: 30, dayStartHour: 9, dayEndHour: 17, resultKey: "availableSlots" },
  },
  {
    type: "notion_create",
    label: "Notion Eintrag",
    description: "Neuen Eintrag in Notion-Datenbank erstellen",
    category: "integrations",
    icon: "FileText",
    color: "#22C55E",
    defaultConfig: { databaseId: "", properties: {}, content: "" },
  },
  {
    type: "airtable_create",
    label: "Airtable Eintrag",
    description: "Neuen Datensatz in Airtable erstellen",
    category: "integrations",
    icon: "Database",
    color: "#22C55E",
    defaultConfig: { baseId: "", tableName: "", fields: {} },
  },

  // AI Tools
  {
    type: "ai_summarize",
    label: "AI Zusammenfassung",
    description: "Text mit AI zusammenfassen",
    category: "ai_tools",
    icon: "Sparkles",
    color: "#EC4899",
    defaultConfig: { input: "", maxLength: "kurz", language: "de", resultKey: "summary" },
  },
  {
    type: "ai_classify",
    label: "AI Klassifizierung",
    description: "Text in Kategorien einordnen",
    category: "ai_tools",
    icon: "Tags",
    color: "#EC4899",
    defaultConfig: { input: "", categories: "", resultKey: "classification" },
  },
  {
    type: "ai_extract",
    label: "AI Extraktion",
    description: "Strukturierte Daten aus Text extrahieren",
    category: "ai_tools",
    icon: "FileSearch",
    color: "#EC4899",
    defaultConfig: { input: "", fields: "", resultKey: "extracted" },
  },
];

/* ========== Helpers ========== */

export function getNodeDefinition(type: WorkflowNodeType): WorkflowNodeDefinition | undefined {
  return WORKFLOW_NODE_DEFINITIONS.find((d) => d.type === type);
}

export function getNodesByCategory(category: WorkflowNodeCategory): WorkflowNodeDefinition[] {
  return WORKFLOW_NODE_DEFINITIONS.filter((d) => d.category === category);
}

export function getCategoryDef(id: WorkflowNodeCategory) {
  return WORKFLOW_CATEGORIES.find((c) => c.id === id);
}

/** Erstelle eine neue WorkflowNode-Instanz mit Default-Config */
export function createWorkflowNode(
  type: WorkflowNodeType,
  position: { x: number; y: number },
  overrides?: Partial<WorkflowNode>
): WorkflowNode {
  const def = getNodeDefinition(type);
  return {
    id: `wf_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    label: def?.label || type,
    position,
    config: { ...(def?.defaultConfig || {}) },
    ...overrides,
  };
}
