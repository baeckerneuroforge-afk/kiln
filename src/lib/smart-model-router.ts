/**
 * Smart Model Router
 * Wählt automatisch das optimale LLM-Modell basierend auf Task-Typ, Kontext und Budget.
 */

export type TaskType =
  | "code_generation"
  | "code_analysis"
  | "research"
  | "classification"
  | "routing"
  | "long_document"
  | "image_analysis"
  | "creative_writing"
  | "data_extraction"
  | "structured_output"
  | "translation"
  | "conversation"
  | "summarization"
  | "general";

export interface ModelRoutingContext {
  taskType: TaskType;
  inputTokenEstimate?: number;
  requiresVision?: boolean;
  requiresSpeed?: boolean;
  requiresAccuracy?: boolean;
  budget?: "low" | "medium" | "high";
  language?: string;
  complexity?: "simple" | "medium" | "complex";
  previousModelFailed?: string;
}

export interface ModelSelection {
  model: string;
  provider: "anthropic" | "openai" | "google" | "perplexity";
  reason: string;
  estimatedCostPer1kTokens: number;
  maxContextTokens: number;
  supportsVision: boolean;
  priority: number; // 1=primary, 2=fallback, 3=last-resort
}

export interface RoutingDecision {
  primary: ModelSelection;
  fallback: ModelSelection | null;
  taskType: TaskType;
  reasoning: string;
}

/* ── Modell-Registry ── */

const MODELS: Record<string, ModelSelection> = {
  "claude-opus-4-6": {
    model: "claude-opus-4-6",
    provider: "anthropic",
    reason: "Höchste Qualität für komplexe Aufgaben",
    estimatedCostPer1kTokens: 0.075,
    maxContextTokens: 200000,
    supportsVision: true,
    priority: 1,
  },
  "claude-sonnet-4-6": {
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    reason: "Beste Balance aus Qualität und Geschwindigkeit",
    estimatedCostPer1kTokens: 0.015,
    maxContextTokens: 200000,
    supportsVision: true,
    priority: 1,
  },
  "claude-haiku-4-5-20251001": {
    model: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    reason: "Schnellstes Modell, ideal für einfache Aufgaben",
    estimatedCostPer1kTokens: 0.001,
    maxContextTokens: 200000,
    supportsVision: true,
    priority: 1,
  },
  "gpt-4.1": {
    model: "gpt-4.1",
    provider: "openai",
    reason: "Großer Kontext, gut für lange Dokumente",
    estimatedCostPer1kTokens: 0.03,
    maxContextTokens: 1000000,
    supportsVision: true,
    priority: 2,
  },
  "gpt-4.1-mini": {
    model: "gpt-4.1-mini",
    provider: "openai",
    reason: "Schnelle OpenAI-Alternative",
    estimatedCostPer1kTokens: 0.004,
    maxContextTokens: 1000000,
    supportsVision: true,
    priority: 2,
  },
  "sonar-pro": {
    model: "sonar-pro",
    provider: "perplexity",
    reason: "Web-Suche integriert, ideal für Research",
    estimatedCostPer1kTokens: 0.003,
    maxContextTokens: 200000,
    supportsVision: false,
    priority: 1,
  },
  "gemini-2.5-pro": {
    model: "gemini-2.5-pro",
    provider: "google",
    reason: "Starke Multilingual-Fähigkeiten",
    estimatedCostPer1kTokens: 0.00125,
    maxContextTokens: 1000000,
    supportsVision: true,
    priority: 2,
  },
};

/* ── Routing-Regeln ── */

const ROUTING_RULES: Record<TaskType, { primary: string; fallback: string }> = {
  code_generation: { primary: "claude-sonnet-4-6", fallback: "claude-opus-4-6" },
  code_analysis: { primary: "claude-sonnet-4-6", fallback: "claude-opus-4-6" },
  research: { primary: "sonar-pro", fallback: "claude-sonnet-4-6" },
  classification: { primary: "claude-haiku-4-5-20251001", fallback: "claude-sonnet-4-6" },
  routing: { primary: "claude-haiku-4-5-20251001", fallback: "claude-sonnet-4-6" },
  long_document: { primary: "gpt-4.1", fallback: "gemini-2.5-pro" },
  image_analysis: { primary: "claude-sonnet-4-6", fallback: "gpt-4.1" },
  creative_writing: { primary: "claude-opus-4-6", fallback: "claude-sonnet-4-6" },
  data_extraction: { primary: "claude-haiku-4-5-20251001", fallback: "claude-sonnet-4-6" },
  structured_output: { primary: "claude-haiku-4-5-20251001", fallback: "claude-sonnet-4-6" },
  translation: { primary: "gpt-4.1", fallback: "gemini-2.5-pro" },
  conversation: { primary: "claude-sonnet-4-6", fallback: "claude-haiku-4-5-20251001" },
  summarization: { primary: "claude-haiku-4-5-20251001", fallback: "claude-sonnet-4-6" },
  general: { primary: "claude-sonnet-4-6", fallback: "claude-haiku-4-5-20251001" },
};

/* ── Task-Typ Erkennung ── */

const TASK_TYPE_PATTERNS: { pattern: RegExp; type: TaskType }[] = [
  { pattern: /\b(code|program|function|class|implement|debug|refactor|fix bug)\b/i, type: "code_generation" },
  { pattern: /\b(review|analyze code|code review|audit|inspect)\b/i, type: "code_analysis" },
  { pattern: /\b(research|search|find|look up|investigate|web)\b/i, type: "research" },
  { pattern: /\b(classify|categorize|label|tag|sort into)\b/i, type: "classification" },
  { pattern: /\b(route|direct|forward|assign to|pick the right)\b/i, type: "routing" },
  { pattern: /\b(document|pdf|long text|article|book|report)\b/i, type: "long_document" },
  { pattern: /\b(image|photo|picture|screenshot|visual|diagram)\b/i, type: "image_analysis" },
  { pattern: /\b(write|creative|story|poem|blog|content|marketing)\b/i, type: "creative_writing" },
  { pattern: /\b(extract|parse|json|structured|data from|pull out)\b/i, type: "data_extraction" },
  { pattern: /\b(translate|translation|übersetze|traduc)\b/i, type: "translation" },
  { pattern: /\b(summarize|summary|zusammenfass|tldr|brief)\b/i, type: "summarization" },
  { pattern: /\b(chat|conversation|talk|discuss|help with)\b/i, type: "conversation" },
];

/**
 * Erkennt den Task-Typ aus dem Prompt-Text.
 */
export function detectTaskType(prompt: string): TaskType {
  for (const { pattern, type } of TASK_TYPE_PATTERNS) {
    if (pattern.test(prompt)) return type;
  }
  return "general";
}

/**
 * Wählt das optimale Modell basierend auf Kontext.
 */
export function selectOptimalModel(context: ModelRoutingContext): RoutingDecision {
  const { taskType, inputTokenEstimate, requiresVision, requiresSpeed, budget, previousModelFailed, complexity } = context;

  let rule = ROUTING_RULES[taskType] || ROUTING_RULES.general;

  // Budget-Anpassungen
  if (budget === "low") {
    // Immer das günstigste Modell
    rule = { primary: "claude-haiku-4-5-20251001", fallback: "gpt-4.1-mini" };
  } else if (budget === "high" && complexity === "complex") {
    // Höchste Qualität
    rule = { primary: "claude-opus-4-6", fallback: "claude-sonnet-4-6" };
  }

  // Speed-Override
  if (requiresSpeed) {
    rule = { primary: "claude-haiku-4-5-20251001", fallback: "gpt-4.1-mini" };
  }

  // Großer Kontext → Modelle mit großem Context-Window
  if (inputTokenEstimate && inputTokenEstimate > 150000) {
    rule = { primary: "gpt-4.1", fallback: "gemini-2.5-pro" };
  }

  // Vision-Anforderung
  if (requiresVision) {
    const primaryModel = MODELS[rule.primary];
    if (primaryModel && !primaryModel.supportsVision) {
      rule = { primary: "claude-sonnet-4-6", fallback: "gpt-4.1" };
    }
  }

  // Fallback bei vorherigem Fehler: wechsle zum Fallback-Modell
  if (previousModelFailed) {
    if (previousModelFailed === rule.primary) {
      rule = { primary: rule.fallback, fallback: getEscalationModel(rule.fallback) };
    }
  }

  const primary = MODELS[rule.primary] || MODELS["claude-sonnet-4-6"];
  const fallback = MODELS[rule.fallback] || null;

  return {
    primary: { ...primary },
    fallback: fallback ? { ...fallback, priority: 2 } : null,
    taskType,
    reasoning: buildReasoning(context, primary),
  };
}

function getEscalationModel(currentFallback: string): string {
  // Immer zu einem stärkeren Modell eskalieren
  const escalation: Record<string, string> = {
    "claude-haiku-4-5-20251001": "claude-sonnet-4-6",
    "claude-sonnet-4-6": "claude-opus-4-6",
    "claude-opus-4-6": "gpt-4.1",
    "gpt-4.1-mini": "gpt-4.1",
    "gpt-4.1": "claude-opus-4-6",
    "sonar-pro": "claude-sonnet-4-6",
    "gemini-2.5-pro": "claude-sonnet-4-6",
  };
  return escalation[currentFallback] || "claude-sonnet-4-6";
}

function buildReasoning(context: ModelRoutingContext, selected: ModelSelection): string {
  const parts: string[] = [`Task: ${context.taskType}`];
  if (context.budget) parts.push(`Budget: ${context.budget}`);
  if (context.requiresSpeed) parts.push("Speed-Priorität");
  if (context.requiresVision) parts.push("Vision benötigt");
  if (context.inputTokenEstimate) parts.push(`~${context.inputTokenEstimate} Input-Tokens`);
  if (context.previousModelFailed) parts.push(`Failover von ${context.previousModelFailed}`);
  parts.push(`→ ${selected.model} (${selected.reason})`);
  return parts.join(" | ");
}

/* ── Cost Tracking ── */

export interface ModelCostEntry {
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  estimatedCost: number;
  taskType: TaskType;
  timestamp: Date;
}

const costLog: ModelCostEntry[] = [];

export function trackModelCost(entry: ModelCostEntry): void {
  costLog.push(entry);
  // Behalte nur die letzten 1000 Einträge
  if (costLog.length > 1000) costLog.splice(0, costLog.length - 1000);
}

export function getCostSummary(hours = 24): {
  totalCost: number;
  byModel: Record<string, { calls: number; cost: number; tokens: number }>;
  byTaskType: Record<string, { calls: number; cost: number }>;
} {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const recent = costLog.filter((e) => e.timestamp >= cutoff);

  const byModel: Record<string, { calls: number; cost: number; tokens: number }> = {};
  const byTaskType: Record<string, { calls: number; cost: number }> = {};
  let totalCost = 0;

  for (const entry of recent) {
    totalCost += entry.estimatedCost;

    if (!byModel[entry.model]) byModel[entry.model] = { calls: 0, cost: 0, tokens: 0 };
    byModel[entry.model].calls++;
    byModel[entry.model].cost += entry.estimatedCost;
    byModel[entry.model].tokens += entry.tokensIn + entry.tokensOut;

    if (!byTaskType[entry.taskType]) byTaskType[entry.taskType] = { calls: 0, cost: 0 };
    byTaskType[entry.taskType].calls++;
    byTaskType[entry.taskType].cost += entry.estimatedCost;
  }

  return { totalCost, byModel, byTaskType };
}

/* ── Workflow-Integration Helper ── */

/**
 * Bestimmt das Modell für einen Workflow-Node basierend auf seiner Config.
 * Wenn model="auto", wird intelligent geroutet.
 */
export function resolveWorkflowNodeModel(
  nodeConfig: Record<string, unknown>,
  contextHint?: string
): string {
  const configuredModel = String(nodeConfig.model || "auto");

  if (configuredModel !== "auto") return configuredModel;

  // Erkennung aus der Node-Config / Kontext
  const prompt = String(nodeConfig.prompt || nodeConfig.taskDescription || nodeConfig.goal || contextHint || "");
  const taskType = detectTaskType(prompt);

  const decision = selectOptimalModel({
    taskType,
    requiresSpeed: nodeConfig.priority === "speed",
    budget: (nodeConfig.budget as "low" | "medium" | "high") || "medium",
    complexity: (nodeConfig.complexity as "simple" | "medium" | "complex") || "medium",
  });

  return decision.primary.model;
}
