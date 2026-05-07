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
  | "ensemble"
  | "llm_prompt"
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
  | "loop"
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
  | "ai_extract"
  | "computer_use"
  | "deep_research"
  | "code_sandbox"
  | "diff_detection"
  | "multi_site"
  // A2A
  | "a2a_call"
  // Goal & Sub-Agent
  | "goal_trigger"
  | "spawn_helper"
  // Parallel & Swarm
  | "agent_swarm"
  | "parallel_split"
  | "parallel_merge"
  // MCP
  | "mcp_tool"
  // Data Pipeline
  | "data_query"
  // Canvas-only documentation
  | "comment";

export type WorkflowNodeCategory = "agents" | "triggers" | "logic" | "actions" | "control" | "integrations" | "ai_tools" | "advanced";

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

// Order matters: top categories surface first in the node palette. AI
// Agents leads because that's KILN's headline use case — operators
// land here first when reaching for a node. Triggers and Integrations
// follow as the most common second / third picks. Logic / Actions /
// Control / AI Tools / Advanced trail behind.
export const WORKFLOW_CATEGORIES: {
  id: WorkflowNodeCategory;
  label: string;
  icon: string;
  color: string;
}[] = [
  { id: "agents", label: "AI Agents", icon: "Bot", color: "#F97316" },
  { id: "triggers", label: "Triggers", icon: "Zap", color: "#F59E0B" },
  { id: "integrations", label: "Integrations", icon: "Plug", color: "#22C55E" },
  { id: "logic", label: "Logic", icon: "GitBranch", color: "#8B5CF6" },
  { id: "actions", label: "Actions", icon: "Play", color: "#3B82F6" },
  { id: "control", label: "Control", icon: "Shield", color: "#06B6D4" },
  { id: "ai_tools", label: "AI Tools", icon: "Sparkles", color: "#EC4899" },
  { id: "advanced", label: "Advanced", icon: "Layers", color: "#A855F7" },
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
    description: "Freely configurable AI agent with tools",
    category: "agents",
    icon: "Bot",
    color: "#F97316",
    defaultConfig: {
      name: "AI Agent",
      model: "claude-sonnet-4-6",
      systemPrompt: "",
      temperature: 0.7,
      maxTokens: 4096,
      tools: [],
    },
  },
  {
    type: "ensemble",
    label: "Ensemble",
    description: "Run 3+ agents on the same task and choose a consensus result",
    category: "agents",
    icon: "Users",
    color: "#F97316",
    defaultConfig: {
      agents: [
        { agentId: "", weight: 1 },
        { agentId: "", weight: 1 },
        { agentId: "", weight: 1 },
      ],
      strategy: "majority_vote",
      judgeAgentId: "",
      taskTemplate: "{{ input }}",
      resultKey: "ensembleResult",
    },
  },
  {
    type: "llm_prompt",
    label: "LLM Prompt",
    description: "Simple LLM call: input → prompt → output",
    category: "agents",
    icon: "MessageSquare",
    color: "#F97316",
    defaultConfig: {
      model: "claude-sonnet-4-6",
      systemPrompt: "",
      userPrompt: "",
      temperature: 0.7,
      maxTokens: 2048,
    },
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
  {
    type: "loop",
    label: "Loop",
    description: "Repeat a branch until condition is met",
    category: "logic",
    icon: "GitBranch",
    color: "#8B5CF6",
    defaultConfig: { maxIterations: 10, condition: "", mode: "while" },
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
    label: "Google Sheets Read",
    description: "Read rows from a Google Sheet",
    category: "integrations",
    icon: "Table",
    color: "#22C55E",
    defaultConfig: { spreadsheetId: "", range: "Sheet1!A:Z", resultKey: "sheetsData" },
  },
  {
    type: "google_sheets_write",
    label: "Google Sheets Write",
    description: "Append a row to a Google Sheet",
    category: "integrations",
    icon: "TableProperties",
    color: "#22C55E",
    defaultConfig: { spreadsheetId: "", range: "Sheet1", values: [] },
  },
  {
    type: "gmail_send",
    label: "Gmail Send",
    description: "Send an email via Gmail",
    category: "integrations",
    icon: "Mail",
    color: "#22C55E",
    defaultConfig: { to: "", subject: "", body: "", replyToMessageId: "" },
  },
  {
    type: "slack_send_integration",
    label: "Slack Message",
    description: "Send a message to a connected Slack workspace",
    category: "integrations",
    icon: "Hash",
    color: "#22C55E",
    defaultConfig: { channel: "", message: "", threadTs: "" },
  },
  {
    type: "calendar_create",
    label: "Calendar Create",
    description: "Create a Google Calendar event",
    category: "integrations",
    icon: "CalendarPlus",
    color: "#22C55E",
    defaultConfig: { title: "", start: "", end: "", description: "", attendeeEmail: "", timezone: "Europe/Berlin" },
  },
  {
    type: "calendar_check",
    label: "Calendar Availability",
    description: "Find free slots in a Google Calendar",
    category: "integrations",
    icon: "CalendarSearch",
    color: "#22C55E",
    defaultConfig: { startDate: "", endDate: "", slotMinutes: 30, dayStartHour: 9, dayEndHour: 17, resultKey: "availableSlots" },
  },
  {
    type: "notion_create",
    label: "Notion Create",
    description: "Add a new entry to a Notion database",
    category: "integrations",
    icon: "FileText",
    color: "#22C55E",
    defaultConfig: { databaseId: "", properties: {}, content: "" },
  },
  {
    type: "airtable_create",
    label: "Airtable Create",
    description: "Add a new record to an Airtable base",
    category: "integrations",
    icon: "Database",
    color: "#22C55E",
    defaultConfig: { baseId: "", tableName: "", fields: {} },
  },
  {
    type: "mcp_tool",
    label: "MCP Tool",
    description: "Run a tool from a connected MCP server",
    category: "integrations",
    icon: "Plug",
    color: "#3B82F6",
    defaultConfig: { mcpConnectionId: "", toolName: "", toolParams: {}, resultKey: "mcpResult", agentId: "" },
  },
  {
    type: "data_query",
    label: "Database Query",
    description: "Run SQL or a natural-language query against a connected database",
    category: "integrations",
    icon: "Database",
    color: "#06B6D4",
    defaultConfig: { connectionId: "", queryMode: "natural_language", query: "", resultKey: "queryResult" },
  },

  // AI Tools
  {
    type: "ai_summarize",
    label: "AI Summarize",
    description: "Summarize text using AI",
    category: "ai_tools",
    icon: "Sparkles",
    color: "#EC4899",
    defaultConfig: { input: "", maxLength: "kurz", language: "de", resultKey: "summary" },
  },
  {
    type: "ai_classify",
    label: "AI Classify",
    description: "Classify text into one of several categories",
    category: "ai_tools",
    icon: "Tags",
    color: "#EC4899",
    defaultConfig: { input: "", categories: "", resultKey: "classification" },
  },
  {
    type: "ai_extract",
    label: "AI Extract",
    description: "Extract structured data from free-form text",
    category: "ai_tools",
    icon: "FileSearch",
    color: "#EC4899",
    defaultConfig: { input: "", fields: "", resultKey: "extracted" },
  },
  {
    type: "computer_use",
    label: "Computer Use",
    description: "AI browses a website and extracts data",
    category: "ai_tools",
    icon: "Monitor",
    color: "#EC4899",
    defaultConfig: {
      task: "",
      startUrl: "",
      maxSteps: 10,
      captureScreenshots: true,
      extractData: false,
      dataSchema: "",
      resultKey: "computerUseResult",
    },
  },

  {
    type: "deep_research",
    label: "Deep Research",
    description: "Multi-source web research with automatic consolidation",
    category: "ai_tools",
    icon: "Search",
    color: "#EC4899",
    defaultConfig: {
      topic: "",
      depth: "standard",
      layer: "auto",
      language: "de",
      resultKey: "researchResult",
    },
  },
  {
    type: "code_sandbox",
    label: "Code Sandbox",
    description: "Write and run code (Python / JavaScript)",
    category: "ai_tools",
    icon: "Terminal",
    color: "#22C55E",
    defaultConfig: {
      goal: "",
      language: "python",
      maxIterations: 5,
      packages: [],
      timeoutMs: 600000,
      resultKey: "codeSandboxResult",
    },
  },

  // Diff Detection
  {
    type: "diff_detection",
    label: "Diff Detection",
    description: "Monitors websites for changes — detects price changes, new content, removed items",
    category: "ai_tools",
    icon: "Eye",
    color: "#3B82F6",
    defaultConfig: {
      urls: [],
      sensitivity: "important_only",
      compareWith: "previous",
      continueIfNoChanges: true,
      resultKey: "diffResults",
    },
  },
  // Multi-Site
  {
    type: "multi_site",
    label: "Multi-Site",
    description: "Runs the same task on multiple websites in parallel and merges results",
    category: "ai_tools",
    icon: "Globe",
    color: "#14B8A6",
    defaultConfig: {
      urls: [],
      taskPerSite: "",
      preset: "custom",
      mergeStrategy: "aggregate",
      outputFormat: "json",
      maxParallel: 3,
      timeoutPerSite: 60,
      resultKey: "multiSiteResults",
    },
  },

  // A2A (Agent-to-Agent)
  {
    type: "a2a_call",
    label: "A2A Agent Call",
    description: "Call an external agent via the A2A protocol",
    category: "actions",
    icon: "Radio",
    color: "#3B82F6",
    defaultConfig: {
      targetUrl: "",
      messageTemplate: "",
      timeout: 30000,
      apiKey: "",
      resultKey: "a2aResponse",
    },
  },

  // Advanced — Goal & Sub-Agent
  {
    type: "goal_trigger",
    label: "Goal Planner",
    description: "Generates and executes a plan from a natural-language goal",
    category: "advanced",
    icon: "Target",
    color: "#F97316",
    defaultConfig: {
      goal: "",
      maxSteps: 10,
      autoApprove: true,
    },
  },
  {
    type: "spawn_helper",
    label: "Spawn Helper",
    description: "Creates a temporary helper agent for a specific sub-task",
    category: "advanced",
    icon: "Sparkles",
    color: "#A855F7",
    defaultConfig: {
      task: "",
      helperType: "general",
      model: "auto",
      maxTokens: 1024,
    },
  },

  // Parallel & Swarm
  {
    type: "agent_swarm",
    label: "Agent Swarm",
    description: "Splits a goal into parallel sub-tasks and runs them across multiple agents",
    category: "advanced",
    icon: "Layers",
    color: "#A855F7",
    defaultConfig: {
      goal: "",
      maxAgents: 5,
      maxParallel: 3,
      mergeStrategy: "wait_all",
      timeoutPerAgent: 60,
      resultKey: "swarmResult",
    },
  },
  {
    type: "parallel_split",
    label: "Parallel",
    description: "Fan-out: run multiple branches concurrently",
    category: "logic",
    icon: "GitFork",
    color: "#3B82F6",
    defaultConfig: {
      branches: 3,
    },
  },
  {
    type: "parallel_merge",
    label: "Merge",
    description: "Fan-in: waits for parallel branches and merges results",
    category: "logic",
    icon: "Merge",
    color: "#3B82F6",
    defaultConfig: {
      mergeStrategy: "concat",
      nRequired: 0,
      resultKey: "parallelResult",
    },
  },
  {
    type: "comment",
    label: "Comment",
    description: "Sticky note annotation for documenting workflow logic",
    category: "advanced",
    icon: "StickyNote",
    color: "#F59E0B",
    defaultConfig: {
      content: "Add a note...",
      color: "yellow",
      width: 260,
      height: 160,
    },
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
