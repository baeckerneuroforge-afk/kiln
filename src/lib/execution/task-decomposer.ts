/**
 * Task Decomposer
 * Multi-phase orchestration planner for Agent Swarm.
 * Phase 1: Goal analysis
 * Phase 2: Dependency graph generation
 * Phase 3: Validation and repair
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SubTask, SubTaskComplexity, ModelTier } from "./parallel-executor";
import type { SubAgentTool, ModelPreference } from "./sub-agent-executor";
import {
  decideToolRouting,
  resolveSpecialization,
  type AgentSpecializationId,
  type ToolRoutingDecision,
} from "./agent-specializations";

/* ── Types ── */

export type GoalTaskType =
  | "research"
  | "comparison"
  | "creation"
  | "analysis"
  | "monitoring"
  | "extraction"
  | "multi_step_workflow";

export type GoalScope = "narrow" | "medium" | "wide";
export type GoalOutputType =
  | "text_summary"
  | "comparison_table"
  | "report"
  | "data_file"
  | "action_confirmation";
export type GoalQuality = "speed_priority" | "quality_priority" | "balanced";
export type GoalComplexity = "low" | "medium" | "high";

export interface GoalAnalysis {
  taskType: GoalTaskType;
  scope: GoalScope;
  outputType: GoalOutputType;
  requiredTools: SubAgentTool[];
  qualityRequirements: GoalQuality;
  estimatedComplexity: GoalComplexity;
  reasoning: string;
}

export interface DecompositionValidation {
  valid: boolean;
  issues: string[];
  immediateStartRatio: number;
  maxDependencies: number;
  estimatedCredits: number;
}

export interface DecompositionResult {
  tasks: SubTask[];
  goalAnalysis: GoalAnalysis;
  executionPlan: {
    phases: { phaseIndex: number; taskIds: string[]; description: string }[];
    estimatedTotalSec: number;
    reasoning: string;
    criticalPath: string[];
    optionalTaskIds: string[];
    mergeStrategy: string;
    validation: DecompositionValidation;
  };
}

export interface DecompositionContext {
  availableTools?: string[];
  availableAgents?: { id: string; name: string; description: string }[];
  constraints?: string[];
  maxTasks?: number;
  model?: string;
  budgetCredits?: number;
}

interface DependencyGraphResponse {
  tasks: Array<Record<string, unknown>>;
  criticalPath?: string[];
  optionalTasks?: string[];
  mergeStrategy?: string;
  reasoning?: string;
}

/* ── Prompts ── */

function buildAnalysisPrompt(goal: string, context: DecompositionContext, allowedTools: SubAgentTool[]): string {
  return [
    "Analyze the following swarm goal and classify it.",
    "",
    `Goal: ${goal}`,
    allowedTools.length > 0 ? `Allowed tools: ${allowedTools.join(", ")}` : "",
    context.constraints?.length ? `Constraints:\n${context.constraints.map((item) => `- ${item}`).join("\n")}` : "",
    "",
    "Respond ONLY with valid JSON in this exact shape:",
    "{",
    '  "taskType": "research|comparison|creation|analysis|monitoring|extraction|multi_step_workflow",',
    '  "scope": "narrow|medium|wide",',
    '  "outputType": "text_summary|comparison_table|report|data_file|action_confirmation",',
    '  "requiredTools": ["web_search"],',
    '  "qualityRequirements": "speed_priority|quality_priority|balanced",',
    '  "estimatedComplexity": "low|medium|high",',
    '  "reasoning": "1-2 sentence explanation"',
    "}",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildDependencyPrompt(
  goal: string,
  analysis: GoalAnalysis,
  context: DecompositionContext,
  maxTasks: number,
): string {
  return [
    "Create a task plan for this goal. CRITICAL: MINIMIZE agents. Each agent must do REAL WORK that requires separate execution.",
    "",
    `Goal: ${goal}`,
    `Task type: ${analysis.taskType}`,
    `Scope: ${analysis.scope}`,
    `Output type: ${analysis.outputType}`,
    `Required tools: ${analysis.requiredTools.join(", ")}`,
    `Quality: ${analysis.qualityRequirements}`,
    `Max tasks: ${maxTasks}`,
    context.availableAgents?.length
      ? `Available agents:\n${context.availableAgents.map((agent) => `- ${agent.name}: ${agent.description}`).join("\n")}`
      : "",
    context.constraints?.length ? `Constraints:\n${context.constraints.map((item) => `- ${item}`).join("\n")}` : "",
    "",
    "AGENT PLANNING RULES:",
    "1. Number of agents = number of DISTINCT ENTITIES to research. 'Compare 3 PM tools' = 3 agents, one per tool.",
    "2. Each RESEARCHER agent researches ONE entity COMPREHENSIVELY (pricing + features + reviews + pros/cons). Do NOT split pricing and features into separate agents.",
    "3. NEVER create agents for: 'compile findings', 'create table', 'summarize results', 'write report'. The merge phase does this AUTOMATICALLY.",
    "4. NEVER create agents that just read other agents' results. That is the merge phase.",
    "5. NEVER include a SYNTHESIZER task. Synthesis happens automatically after all agents complete.",
    "6. ALL research agents should be PARALLEL (no dependencies between them).",
    "7. For a single topic with no comparison, use 1-2 agents max.",
    "",
    "BAD (8 agents): Search Asana pricing → Search Asana features → Search Monday pricing → Search Monday features → Compile → Analyze → Table → Summary",
    "WHY BAD: Features+pricing for one tool = ONE agent. Compile/table/summary = merge phase.",
    "",
    "GOOD (3 agents): 'Research Asana comprehensively' | 'Research Monday.com comprehensively' | 'Research Notion comprehensively'",
    "WHY GOOD: Each agent does thorough work on one topic. All parallel. Merge handles the rest.",
    "",
    "Respond ONLY with valid JSON:",
    "{",
    '  "tasks": [',
    "    {",
    '      "id": "task_1",',
    '      "description": "Research [entity] comprehensively: pricing tiers, key features, limitations, user reviews, best for",',
    '      "tools": ["web_search"],',
    '      "model_preference": "research",',
    '      "estimatedComplexity": "medium",',
    '      "suggestedModelTier": "fast",',
    '      "dependencies": [],',
    '      "output_format": "json",',
    '      "expected_output": "Structured data: pricing, features, limitations, reviews, sources",',
    '      "estimated_duration_sec": 30,',
    '      "estimated_credits": 5,',
    '      "priority": "critical",',
    '      "fallback": "Use alternative sources or search with different keywords",',
    '      "task_type": "research",',
    '      "optional": false,',
    '      "success_criteria": "Found pricing, 3+ features, and at least 2 source URLs"',
    "    }",
    "  ],",
    '  "criticalPath": ["task_1"],',
    '  "optionalTasks": [],',
    '  "mergeStrategy": "comparison_table|structured_report|ranked_list|analytical_narrative",',
    '  "reasoning": "Explain why this number of agents is optimal."',
    "}",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRepairPrompt(
  goal: string,
  analysis: GoalAnalysis,
  graph: DependencyGraphResponse,
  issues: string[],
  maxTasks: number,
): string {
  return [
    "Repair this decomposition plan. Keep the same goal, but fix the validation issues.",
    "",
    `Goal: ${goal}`,
    `Analysis: ${JSON.stringify(analysis)}`,
    `Current plan: ${JSON.stringify(graph)}`,
    "Validation issues:",
    ...issues.map((issue) => `- ${issue}`),
    "",
    `Maximum tasks: ${maxTasks}`,
    "Return ONLY valid JSON with the same schema as before.",
  ].join("\n");
}

/* ── Main Entry ── */

export async function decomposeGoal(
  goal: string,
  context: DecompositionContext = {},
): Promise<DecompositionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nicht konfiguriert");
  }

  const anthropic = new Anthropic({ apiKey });
  const maxTasks = Math.min(Math.max(context.maxTasks || 6, 2), 10);
  const allowedTools = normalizeAllowedTools(context.availableTools);
  const model = context.model || (allowedTools.includes("computer_use")
    ? "claude-sonnet-4-6"
    : "claude-haiku-4-5-20251001");

  const analysis = await analyzeGoal(anthropic, model, goal, context, allowedTools);
  let graph = await buildDependencyGraph(anthropic, model, goal, analysis, context, maxTasks);

  let tasks = normalizeTasks(graph.tasks || [], analysis, allowedTools, maxTasks);
  tasks = stripSynthesisTasks(tasks); // Merge handles synthesis — no agent needed
  tasks = repairDependencies(tasks);
  tasks = enforceParallelism(tasks, analysis);

  let validation = validatePlan(tasks, context.budgetCredits);
  if (!validation.valid) {
    graph = await repairGraph(anthropic, model, goal, analysis, graph, validation.issues, maxTasks, allowedTools);
    tasks = normalizeTasks(graph.tasks || [], analysis, allowedTools, maxTasks);
    tasks = stripSynthesisTasks(tasks);
    tasks = repairDependencies(tasks);
    tasks = enforceParallelism(tasks, analysis);
    validation = validatePlan(tasks, context.budgetCredits);
  }

  const phases = buildPhases(tasks);
  const criticalPath = computeCriticalPath(tasks);
  const estimatedTotalSec = estimateTotalDuration(tasks, phases);
  const optionalTaskIds = tasks.filter((task) => task.optional || task.priority === "nice_to_have").map((task) => task.id);
  const mergeStrategy = graph.mergeStrategy || defaultMergeStrategy(analysis);

  return {
    tasks,
    goalAnalysis: analysis,
    executionPlan: {
      phases,
      estimatedTotalSec,
      reasoning: graph.reasoning || analysis.reasoning,
      criticalPath: graph.criticalPath?.filter((id) => tasks.some((task) => task.id === id)) || criticalPath,
      optionalTaskIds: graph.optionalTasks?.filter((id) => tasks.some((task) => task.id === id)) || optionalTaskIds,
      mergeStrategy,
      validation,
    },
  };
}

/* ── Phase 1: Goal Analysis ── */

async function analyzeGoal(
  anthropic: Anthropic,
  model: string,
  goal: string,
  context: DecompositionContext,
  allowedTools: SubAgentTool[],
): Promise<GoalAnalysis> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 800,
    system: "You are an expert orchestration planner. Classify user goals precisely. Respond ONLY with valid JSON.",
    messages: [{ role: "user", content: buildAnalysisPrompt(goal, context, allowedTools) }],
  });

  const parsed = parseJsonRecord(
    response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n"),
  );

  return normalizeGoalAnalysis(parsed, allowedTools, goal);
}

/* ── Phase 2: Dependency Graph ── */

async function buildDependencyGraph(
  anthropic: Anthropic,
  model: string,
  goal: string,
  analysis: GoalAnalysis,
  context: DecompositionContext,
  maxTasks: number,
): Promise<DependencyGraphResponse> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 2400,
    system: "You are an expert orchestrator. Create high-parallelism, self-contained sub-task DAGs. Respond ONLY with valid JSON.",
    messages: [{ role: "user", content: buildDependencyPrompt(goal, analysis, context, maxTasks) }],
  });

  const parsed = parseJsonRecord(
    response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n"),
  );

  return {
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks.filter(isRecord) : [],
    criticalPath: Array.isArray(parsed.criticalPath) ? parsed.criticalPath.map(String) : [],
    optionalTasks: Array.isArray(parsed.optionalTasks) ? parsed.optionalTasks.map(String) : [],
    mergeStrategy: typeof parsed.mergeStrategy === "string" ? parsed.mergeStrategy : undefined,
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : undefined,
  };
}

/* ── Phase 3: Validation / Repair ── */

async function repairGraph(
  anthropic: Anthropic,
  model: string,
  goal: string,
  analysis: GoalAnalysis,
  graph: DependencyGraphResponse,
  issues: string[],
  maxTasks: number,
  allowedTools: SubAgentTool[],
): Promise<DependencyGraphResponse> {
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 2400,
      system: "You repair orchestration plans. Fix serial bottlenecks, unclear outputs, and invalid dependencies. Respond ONLY with valid JSON.",
      messages: [{ role: "user", content: buildRepairPrompt(goal, analysis, graph, issues, maxTasks) }],
    });

    const parsed = parseJsonRecord(
      response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n"),
    );

    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.filter(isRecord) : graph.tasks,
      criticalPath: Array.isArray(parsed.criticalPath) ? parsed.criticalPath.map(String) : graph.criticalPath,
      optionalTasks: Array.isArray(parsed.optionalTasks) ? parsed.optionalTasks.map(String) : graph.optionalTasks,
      mergeStrategy: typeof parsed.mergeStrategy === "string" ? parsed.mergeStrategy : graph.mergeStrategy,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : graph.reasoning,
    };
  } catch {
    const heuristicGraph = buildHeuristicGraph(goal, analysis, allowedTools, maxTasks);
    return heuristicGraph;
  }
}

/* ── Normalization ── */

const VALID_TOOLS: SubAgentTool[] = ["computer_use", "code_sandbox", "mcp", "deep_research", "web_search"];
const VALID_PREFERENCES: ModelPreference[] = ["fast_extraction", "research", "code_generation", "deep_reasoning", "creative"];

function normalizeAllowedTools(tools?: string[]): SubAgentTool[] {
  const filtered = (tools || []).filter((tool): tool is SubAgentTool => VALID_TOOLS.includes(tool as SubAgentTool));
  return filtered.length > 0 ? filtered : [...VALID_TOOLS];
}

function normalizeGoalAnalysis(raw: Record<string, unknown>, allowedTools: SubAgentTool[], goal: string): GoalAnalysis {
  const taskType = validateGoalTaskType(raw.taskType) || inferGoalTaskType(goal);
  const outputType = validateGoalOutputType(raw.outputType) || inferOutputType(taskType, goal);
  const requiredTools = validateTools(raw.requiredTools, allowedTools) || inferRequiredTools(goal, allowedTools);

  return {
    taskType,
    scope: validateGoalScope(raw.scope) || inferScope(goal),
    outputType,
    requiredTools,
    qualityRequirements: validateGoalQuality(raw.qualityRequirements) || inferQuality(goal),
    estimatedComplexity: validateGoalComplexity(raw.estimatedComplexity) || inferComplexity(goal),
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "Plan derived from goal analysis and allowed tool set.",
  };
}

function normalizeTasks(
  rawTasks: Array<Record<string, unknown>>,
  analysis: GoalAnalysis,
  allowedTools: SubAgentTool[],
  maxTasks: number,
): SubTask[] {
  if (rawTasks.length === 0) {
    return buildHeuristicGraph("", analysis, allowedTools, maxTasks).tasks.map((task) =>
      normalizeTask(task, analysis, allowedTools, 0)
    );
  }

  return rawTasks.slice(0, maxTasks).map((task, index) => normalizeTask(task, analysis, allowedTools, index));
}

function normalizeTask(
  raw: Record<string, unknown>,
  analysis: GoalAnalysis,
  allowedTools: SubAgentTool[],
  index: number,
): SubTask {
  const description = typeof raw.description === "string" && raw.description.trim()
    ? raw.description.trim()
    : `Sub-task ${index + 1}`;
  const outputFormat = validateOutputFormat(raw.output_format ?? raw.outputFormat) || defaultOutputFormat(analysis.outputType);
  const tools = validateTools(raw.tools ?? raw.tools_needed, allowedTools) || analysis.requiredTools;
  const specialization = resolveSpecialization(
    description,
    tools,
    typeof raw.task_type === "string" ? raw.task_type : analysis.taskType,
    outputFormat,
  );
  const toolRouting = decideToolRouting(description, tools);
  const complexity = validateComplexity(raw.estimatedComplexity ?? raw.estimated_complexity) || mapComplexity(analysis.estimatedComplexity);
  const priority = validatePriority(raw.priority) || inferPriority(index, description);
  const optional = typeof raw.optional === "boolean" ? raw.optional : priority === "nice_to_have";
  const dependencies = Array.isArray(raw.dependencies) ? raw.dependencies.map(String).slice(0, 3) : [];

  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `task_${index + 1}`,
    description,
    dependencies,
    config: isRecord(raw.config) ? raw.config : {},
    estimatedComplexity: complexity,
    suggestedModelTier: validateTier(raw.suggestedModelTier ?? raw.suggested_model_tier) || inferModelTier(specialization.id, toolRouting, complexity),
    tools,
    modelPreference: validateModelPreference(raw.model_preference ?? raw.modelPreference) || inferModelPreference(specialization.id, tools, analysis.taskType),
    outputFormat,
    expectedOutput: typeof raw.expected_output === "string" ? raw.expected_output : defaultExpectedOutput(specialization.id, outputFormat),
    estimatedDurationSec: sanitizePositiveNumber(raw.estimated_duration_sec ?? raw.estimatedDurationSec) || estimateDurationSec(complexity, tools, optional),
    estimatedCredits: sanitizePositiveNumber(raw.estimated_credits ?? raw.estimatedCredits) || estimateCredits(tools, complexity, toolRouting),
    priority,
    fallbackStrategy: typeof raw.fallback === "string" ? raw.fallback : defaultFallback(tools, toolRouting),
    optional,
    specialization: specialization.id,
    taskType: typeof raw.task_type === "string" ? raw.task_type : analysis.taskType,
    toolRouting,
    successCriteria: typeof raw.success_criteria === "string" ? raw.success_criteria : defaultSuccessCriteria(specialization.id),
  };
}

/* ── Validation / Repair ── */

function validatePlan(tasks: SubTask[], budgetCredits?: number): DecompositionValidation {
  const issues: string[] = [];
  const immediateStartCount = tasks.filter((task) => task.dependencies.length === 0).length;
  const immediateStartRatio = tasks.length > 0 ? immediateStartCount / tasks.length : 0;
  const maxDependencies = Math.max(0, ...tasks.map((task) => task.dependencies.length));
  const estimatedCredits = tasks.reduce((sum, task) => sum + (task.estimatedCredits || 0), 0);

  if (tasks.length === 0) {
    issues.push("No tasks were produced.");
  }
  if (hasCircularDependency(tasks)) {
    issues.push("The plan contains circular dependencies.");
  }
  if (immediateStartRatio < 0.5 && tasks.length > 1) {
    issues.push("Fewer than 50% of tasks can start immediately. Increase parallelism.");
  }
  if (maxDependencies > 3) {
    issues.push("At least one task has more than 3 dependencies.");
  }
  if (tasks.some((task) => !task.expectedOutput || !task.successCriteria)) {
    issues.push("At least one task is missing an expected output or success criteria.");
  }
  if (budgetCredits && estimatedCredits > budgetCredits) {
    issues.push(`Estimated credits ${estimatedCredits} exceed budget ${budgetCredits}.`);
  }

  return {
    valid: issues.length === 0,
    issues,
    immediateStartRatio,
    maxDependencies,
    estimatedCredits,
  };
}

function repairDependencies(tasks: SubTask[]): SubTask[] {
  const ids = new Set(tasks.map((task) => task.id));
  const normalized = tasks.map((task) => ({
    ...task,
    dependencies: task.dependencies.filter((dep) => dep !== task.id && ids.has(dep)).slice(0, 3),
  }));

  if (hasCircularDependency(normalized)) {
    const synthesisId = normalized.find((task) => task.specialization === "synthesizer")?.id;
    return normalized.map((task) => ({
      ...task,
      dependencies: task.id === synthesisId ? task.dependencies.filter((dep) => dep !== task.id) : [],
    }));
  }

  return normalized;
}

/**
 * Remove synthesizer/meta-tasks that the LLM may generate despite instructions.
 * Merge handles synthesis automatically — these tasks waste credits.
 */
function stripSynthesisTasks(tasks: SubTask[]): SubTask[] {
  const metaPatterns = /\b(synthesiz|compile|combine|merge|summariz|create table|write report|create report|final report)\b/i;
  const filtered = tasks.filter((task) => {
    if (task.specialization === "synthesizer") return false;
    // Remove tasks whose ONLY purpose is to read other agents' output
    if (task.dependencies.length > 0 && metaPatterns.test(task.description) && !task.tools?.includes("web_search") && !task.tools?.includes("computer_use")) {
      return false;
    }
    return true;
  });
  // Never filter out everything — keep at least 1 task
  return filtered.length > 0 ? filtered : tasks.slice(0, 1);
}

function enforceParallelism(tasks: SubTask[], analysis: GoalAnalysis): SubTask[] {
  if (tasks.length <= 1) return tasks;

  let normalized = [...tasks];
  let immediateStartCount = normalized.filter((task) => task.dependencies.length === 0).length;
  const requiredImmediate = Math.ceil(normalized.length * 0.5);
  if (immediateStartCount >= requiredImmediate) return normalized;

  const synthesisIds = new Set(normalized.filter((task) => task.specialization === "synthesizer").map((task) => task.id));
  normalized = normalized.map((task) => {
    if (synthesisIds.has(task.id)) {
      return task;
    }

    if (task.dependencies.length > 1) {
      return { ...task, dependencies: task.dependencies.slice(0, 1) };
    }

    if (analysis.taskType === "comparison" || analysis.taskType === "research") {
      return { ...task, dependencies: [] };
    }

    return task;
  });

  immediateStartCount = normalized.filter((task) => task.dependencies.length === 0).length;
  if (immediateStartCount < requiredImmediate) {
    normalized = normalized.map((task, index) => (
      index < requiredImmediate || synthesisIds.has(task.id)
        ? { ...task, dependencies: synthesisIds.has(task.id) ? task.dependencies : [] }
        : task
    ));
  }

  return normalized;
}

/* ── Heuristics / Fallback ── */

function buildHeuristicGraph(
  goal: string,
  analysis: GoalAnalysis,
  allowedTools: SubAgentTool[],
  maxTasks: number,
): DependencyGraphResponse {
  const domains = extractDomains(goal);
  const tasks: Array<Record<string, unknown>> = [];

  if ((analysis.taskType === "comparison" || analysis.taskType === "extraction") && domains.length > 1) {
    for (const [index, domain] of domains.slice(0, Math.max(1, maxTasks - 1)).entries()) {
      tasks.push({
        id: `task_${index + 1}`,
        description: `Check ${domain} for the requested information and extract the key structured facts.`,
        tools: allowedTools.includes("computer_use") ? ["computer_use", "web_search"] : ["web_search"],
        estimatedComplexity: "medium",
        suggestedModelTier: allowedTools.includes("computer_use") ? "powerful" : "fast",
        model_preference: allowedTools.includes("computer_use") ? "research" : "fast_extraction",
        dependencies: [],
        output_format: analysis.outputType === "comparison_table" ? "json" : "text",
        expected_output: "Structured facts with price/availability/source URL or equivalent requested data.",
        estimated_duration_sec: 45,
        estimated_credits: allowedTools.includes("computer_use") ? 12 : 4,
        priority: "critical",
        fallback: "Use search results or alternative marketplace coverage if direct site access fails.",
        task_type: analysis.taskType,
        optional: false,
        success_criteria: "Return a structured finding with at least one verified source URL.",
      });
    }
  } else if (analysis.taskType === "research") {
    const angles = [
      "market landscape and current leaders",
      "recent developments and notable changes",
      "risks, limitations, and decision criteria",
    ];

    for (const [index, angle] of angles.slice(0, Math.max(1, maxTasks - 1)).entries()) {
      tasks.push({
        id: `task_${index + 1}`,
        description: `Research ${angle} for the user's goal and cite multiple recent sources.`,
        tools: allowedTools.includes("web_search") ? ["web_search", "deep_research"].filter((tool) => allowedTools.includes(tool as SubAgentTool)) : allowedTools,
        estimatedComplexity: "medium",
        suggestedModelTier: "balanced",
        model_preference: "research",
        dependencies: [],
        output_format: "text",
        expected_output: "A concise set of cited findings and source URLs for this angle.",
        estimated_duration_sec: 35,
        estimated_credits: 4,
        priority: "important",
        fallback: "If search results are weak, broaden the query and use authoritative sources.",
        task_type: "research",
        optional: false,
        success_criteria: "Return at least 3 cited findings or clearly state evidence gaps.",
      });
    }
  } else {
    tasks.push({
      id: "task_1",
      description: `Gather the core information needed to answer: ${goal}`,
      tools: analysis.requiredTools,
      estimatedComplexity: mapComplexity(analysis.estimatedComplexity),
      suggestedModelTier: analysis.qualityRequirements === "quality_priority" ? "powerful" : "balanced",
      model_preference: analysis.taskType === "analysis" ? "deep_reasoning" : "research",
      dependencies: [],
      output_format: defaultOutputFormat(analysis.outputType),
      expected_output: "Core verified findings in a structured format.",
      estimated_duration_sec: 40,
      estimated_credits: estimateCredits(analysis.requiredTools, mapComplexity(analysis.estimatedComplexity)),
      priority: "critical",
      fallback: "Use a cheaper or more general source if the preferred route fails.",
      task_type: analysis.taskType,
      optional: false,
      success_criteria: "Return enough structured evidence for the final answer.",
    });
  }

  return {
    tasks,
    criticalPath: tasks.map((task) => String(task.id)).slice(0, 1),
    optionalTasks: [],
    mergeStrategy: defaultMergeStrategy(analysis),
    reasoning: "Heuristic fallback plan emphasizing parallel evidence gathering followed by synthesis.",
  };
}

/* ── Inference Helpers ── */

function inferGoalTaskType(goal: string): GoalTaskType {
  const lower = goal.toLowerCase();
  if (/\bcompare|comparison|vs\b/.test(lower)) return "comparison";
  if (/\bmonitor|watch|track|update|refresh|recheck\b/.test(lower)) return "monitoring";
  if (/\bcreate|write|draft|generate\b/.test(lower)) return "creation";
  if (/\banaly[sz]e|insight|pattern|trend|calculate\b/.test(lower)) return "analysis";
  if (/\bextract|scrape|collect\b/.test(lower)) return "extraction";
  if (/\bworkflow|send|publish|upload|submit|login\b/.test(lower)) return "multi_step_workflow";
  return "research";
}

function inferScope(goal: string): GoalScope {
  const domains = extractDomains(goal);
  if (domains.length >= 10) return "wide";
  if (domains.length >= 3) return "medium";
  return "narrow";
}

function inferOutputType(taskType: GoalTaskType, goal: string): GoalOutputType {
  const lower = goal.toLowerCase();
  if (/\bexcel|csv|sheet|spreadsheet|file|pdf\b/.test(lower)) return "data_file";
  if (taskType === "comparison") return "comparison_table";
  if (taskType === "monitoring") return "action_confirmation";
  if (taskType === "analysis" || /\breport\b/.test(lower)) return "report";
  return "text_summary";
}

function inferRequiredTools(goal: string, allowedTools: SubAgentTool[]): SubAgentTool[] {
  const lower = goal.toLowerCase();
  const tools = new Set<SubAgentTool>();

  if (allowedTools.includes("web_search")) {
    tools.add("web_search");
  }
  if (allowedTools.includes("computer_use") && (/\bhttps?:\/\/|\b[a-z0-9-]+\.(?:com|de|net|org|io|co\.uk)\b/.test(lower) || /\bwebsite|browse|visit|open|price on|screenshot|fill form|navigate|scrape\b/.test(lower))) {
    tools.add("computer_use");
  }
  if (allowedTools.includes("code_sandbox") && /\bcsv|excel|spreadsheet|chart|graph|calculate|data|table|report|pdf\b/.test(lower)) {
    tools.add("code_sandbox");
  }
  if (allowedTools.includes("mcp") && /\bslack|email|calendar|notion|sheets\b/.test(lower)) {
    tools.add("mcp");
  }
  if (allowedTools.includes("deep_research") && /\bresearch|latest|market|industry|news|regulation\b/.test(lower)) {
    tools.add("deep_research");
  }

  if (tools.size === 0) {
    return allowedTools.includes("web_search") ? ["web_search"] : [allowedTools[0]];
  }

  return Array.from(tools);
}

function inferQuality(goal: string): GoalQuality {
  const lower = goal.toLowerCase();
  if (/\bbest possible|thorough|comprehensive|deep\b/.test(lower)) return "quality_priority";
  if (/\bquick|fast|brief\b/.test(lower)) return "speed_priority";
  return "balanced";
}

function inferComplexity(goal: string): GoalComplexity {
  const domains = extractDomains(goal).length;
  if (domains >= 6 || goal.length > 350) return "high";
  if (domains >= 3 || goal.length > 160) return "medium";
  return "low";
}

function inferPriority(index: number, description: string): "critical" | "important" | "nice_to_have" {
  if (index === 0 || /\bfinal|synthesi[sz]e|merge|recommendation\b/.test(description.toLowerCase())) {
    return "critical";
  }
  if (/\balso|optional|bonus|if time allows\b/.test(description.toLowerCase())) {
    return "nice_to_have";
  }
  return "important";
}

function inferModelPreference(
  specialization: AgentSpecializationId,
  tools: SubAgentTool[],
  taskType: GoalTaskType,
): ModelPreference {
  if (specialization === "price_extractor") return "fast_extraction";
  if (specialization === "data_analyst") return "deep_reasoning";
  if (specialization === "synthesizer") return "deep_reasoning";
  if (tools.includes("code_sandbox")) return "code_generation";
  if (taskType === "creation") return "creative";
  return "research";
}

function inferModelTier(
  specialization: AgentSpecializationId,
  toolRouting: ToolRoutingDecision | undefined,
  complexity: SubTaskComplexity,
): ModelTier {
  if (toolRouting?.requiresVision || specialization === "synthesizer" || specialization === "data_analyst") {
    return "powerful";
  }
  if (complexity === "low" && specialization === "price_extractor") {
    return "fast";
  }
  return complexity === "high" ? "powerful" : "balanced";
}

function defaultOutputFormat(outputType: GoalOutputType): "text" | "json" | "table" | "file" {
  switch (outputType) {
    case "comparison_table":
      return "table";
    case "data_file":
      return "file";
    case "report":
      return "text";
    default:
      return "json";
  }
}

function defaultExpectedOutput(
  specialization: AgentSpecializationId,
  outputFormat: "text" | "json" | "table" | "file",
): string {
  if (specialization === "price_extractor") {
    return outputFormat === "json"
      ? "JSON with price, currency, availability, shipping, and source URL."
      : "Structured price findings with availability, shipping, and source URL.";
  }
  if (specialization === "data_analyst") {
    return "Quantitative comparison with rankings, calculations, and notable patterns.";
  }
  if (specialization === "synthesizer") {
    return "A final report with executive summary, findings, limitations, and recommendation.";
  }
  if (specialization === "monitor") {
    return "Change report describing what changed, what stayed the same, and supporting evidence.";
  }
  return "Structured cited findings relevant to the assigned angle.";
}

function defaultSuccessCriteria(specialization: AgentSpecializationId): string {
  switch (specialization) {
    case "price_extractor":
      return "Return a numeric price plus availability and a verified source URL.";
    case "data_analyst":
      return "Return explicit numerical comparisons or calculated insights.";
    case "synthesizer":
      return "Return a coherent final deliverable that preserves citations and limitations.";
    case "monitor":
      return "Return a clear change or no-change conclusion with evidence.";
    default:
      return "Return multiple cited findings with source URLs.";
  }
}

function defaultFallback(tools: SubAgentTool[], toolRouting?: ToolRoutingDecision): string {
  if (toolRouting?.primaryTool === "computer_use") {
    return "If direct browsing is blocked, fall back to search results or an alternate marketplace/source.";
  }
  if (tools.includes("web_search")) {
    return "Broaden the query and prioritize authoritative sources if the first search results are weak.";
  }
  if (tools.includes("code_sandbox")) {
    return "Reduce the scope of the computation and produce a smaller verified output.";
  }
  return "Use a simpler verified path and clearly note any gaps.";
}

function estimateDurationSec(
  complexity: SubTaskComplexity,
  tools: SubAgentTool[],
  optional: boolean,
): number {
  let seconds = complexity === "high" ? 70 : complexity === "medium" ? 40 : 20;
  if (tools.includes("computer_use")) seconds += 25;
  if (tools.includes("code_sandbox")) seconds += 15;
  if (optional) seconds = Math.round(seconds * 0.8);
  return seconds;
}

function estimateCredits(
  tools: SubAgentTool[],
  complexity: SubTaskComplexity,
  toolRouting?: ToolRoutingDecision,
): number {
  let credits = complexity === "high" ? 8 : complexity === "medium" ? 5 : 3;
  if (tools.includes("computer_use")) {
    credits += toolRouting?.requiresVision ? 18 : 12;
  }
  if (tools.includes("code_sandbox")) credits += 5;
  if (tools.includes("mcp")) credits += 4;
  return credits;
}

function mapComplexity(complexity: GoalComplexity): SubTaskComplexity {
  return complexity === "high" ? "high" : complexity === "low" ? "low" : "medium";
}

function defaultMergeStrategy(analysis: GoalAnalysis): string {
  switch (analysis.outputType) {
    case "comparison_table":
      return "comparison_table";
    case "report":
      return "structured_report";
    case "data_file":
      return "analytical_narrative";
    default:
      return "ranked_list";
  }
}

/* ── Validation Helpers ── */

function hasCircularDependency(tasks: SubTask[]): boolean {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const taskMap = new Map(tasks.map((task) => [task.id, task]));

  const visit = (id: string): boolean => {
    if (stack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    stack.add(id);
    const task = taskMap.get(id);
    if (task) {
      for (const dep of task.dependencies) {
        if (visit(dep)) return true;
      }
    }
    stack.delete(id);
    return false;
  };

  return tasks.some((task) => visit(task.id));
}

function buildPhases(tasks: SubTask[]): { phaseIndex: number; taskIds: string[]; description: string }[] {
  const phases: { phaseIndex: number; taskIds: string[]; description: string }[] = [];
  const completed = new Set<string>();
  const remaining = new Set(tasks.map((task) => task.id));
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  let phaseIndex = 0;

  while (remaining.size > 0) {
    const ready = Array.from(remaining).filter((id) => {
      const task = taskMap.get(id);
      return task ? task.dependencies.every((dep) => completed.has(dep)) : false;
    });

    if (ready.length === 0) {
      break;
    }

    for (const id of ready) {
      completed.add(id);
      remaining.delete(id);
    }

    phases.push({
      phaseIndex,
      taskIds: ready,
      description: ready.length > 1
        ? `Parallel evidence gathering (${ready.length} tasks)`
        : taskMap.get(ready[0])?.description || `Phase ${phaseIndex + 1}`,
    });
    phaseIndex++;
  }

  return phases;
}

function computeCriticalPath(tasks: SubTask[]): string[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const memo = new Map<string, string[]>();

  const longest = (id: string): string[] => {
    if (memo.has(id)) return memo.get(id)!;
    const task = taskMap.get(id);
    if (!task || task.dependencies.length === 0) {
      const path = [id];
      memo.set(id, path);
      return path;
    }

    let best: string[] = [];
    for (const dep of task.dependencies) {
      const candidate = longest(dep);
      if (candidate.length > best.length) {
        best = candidate;
      }
    }

    const path = [...best, id];
    memo.set(id, path);
    return path;
  };

  let bestPath: string[] = [];
  for (const task of tasks) {
    const candidate = longest(task.id);
    if (candidate.length > bestPath.length) {
      bestPath = candidate;
    }
  }
  return bestPath;
}

function estimateTotalDuration(
  tasks: SubTask[],
  phases: { phaseIndex: number; taskIds: string[]; description: string }[],
): number {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  return phases.reduce((total, phase) => {
    const phaseDuration = Math.max(
      0,
      ...phase.taskIds.map((id) => taskMap.get(id)?.estimatedDurationSec || 0),
    );
    return total + phaseDuration;
  }, 0);
}

/* ── Generic Validation Helpers ── */

function validateGoalTaskType(value: unknown): GoalTaskType | undefined {
  return value === "research"
    || value === "comparison"
    || value === "creation"
    || value === "analysis"
    || value === "monitoring"
    || value === "extraction"
    || value === "multi_step_workflow"
    ? value
    : undefined;
}

function validateGoalScope(value: unknown): GoalScope | undefined {
  return value === "narrow" || value === "medium" || value === "wide" ? value : undefined;
}

function validateGoalOutputType(value: unknown): GoalOutputType | undefined {
  return value === "text_summary"
    || value === "comparison_table"
    || value === "report"
    || value === "data_file"
    || value === "action_confirmation"
    ? value
    : undefined;
}

function validateGoalQuality(value: unknown): GoalQuality | undefined {
  return value === "speed_priority" || value === "quality_priority" || value === "balanced" ? value : undefined;
}

function validateGoalComplexity(value: unknown): GoalComplexity | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function validateComplexity(value: unknown): SubTaskComplexity | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function validateTier(value: unknown): ModelTier | undefined {
  return value === "fast" || value === "balanced" || value === "powerful" ? value : undefined;
}

function validateModelPreference(value: unknown): ModelPreference | undefined {
  return VALID_PREFERENCES.includes(value as ModelPreference) ? value as ModelPreference : undefined;
}

function validateOutputFormat(value: unknown): "text" | "json" | "table" | "file" | undefined {
  return value === "text" || value === "json" || value === "table" || value === "file" ? value : undefined;
}

function validatePriority(value: unknown): "critical" | "important" | "nice_to_have" | undefined {
  return value === "critical" || value === "important" || value === "nice_to_have" ? value : undefined;
}

function validateTools(value: unknown, allowedTools: SubAgentTool[]): SubAgentTool[] | undefined {
  const allowed = new Set(allowedTools);
  const tools = Array.isArray(value)
    ? value
        .map(String)
        .filter((tool): tool is SubAgentTool => VALID_TOOLS.includes(tool as SubAgentTool) && allowed.has(tool as SubAgentTool))
    : [];

  if (tools.length > 0) {
    return Array.from(new Set(tools));
  }

  return undefined;
}

function sanitizePositiveNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function parseJsonRecord(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Task decomposition response was not valid JSON.");
  }
  return JSON.parse(match[0]) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractDomains(text: string): string[] {
  const matches = text.match(/\b(?:https?:\/\/)?([a-z0-9-]+\.(?:com|de|net|org|io|co\.uk))\b/gi) || [];
  return Array.from(
    new Set(
      matches.map((match) => match.replace(/^https?:\/\//, "").toLowerCase()),
    ),
  );
}
