/**
 * Task Decomposer
 * Zerlegt komplexe Ziele in parallelisierbare Sub-Tasks mit Abhängigkeits-DAG.
 * Nutzt den Smart Model Router für die LLM-Aufrufe.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SubTask, SubTaskComplexity, ModelTier } from "./parallel-executor";

/* ── Types ── */

export interface DecompositionResult {
  tasks: SubTask[];
  executionPlan: {
    phases: { phaseIndex: number; taskIds: string[]; description: string }[];
    estimatedTotalSec: number;
    reasoning: string;
  };
}

export interface DecompositionContext {
  availableTools?: string[];
  availableAgents?: { id: string; name: string; description: string }[];
  constraints?: string[];
  maxTasks?: number;
}

/* ── Decomposer ── */

const DECOMPOSE_SYSTEM_PROMPT = `Du bist ein Task-Decomposer für die KILN AI Platform.
Zerlege ein Ziel in konkrete, parallelisierbare Sub-Tasks.

Regeln:
1. Maximal 15 Tasks
2. Identifiziere parallele Tasks (keine Abhängigkeiten untereinander)
3. Minimiere Sequentialität — je mehr parallel, desto besser
4. Jeder Task muss eigenständig ausführbar sein
5. Markiere Komplexität realistisch

Antworte AUSSCHLIESSLICH mit validem JSON:
{
  "tasks": [
    {
      "id": "task_1",
      "description": "Konkrete Aufgabe",
      "dependencies": [],
      "config": {},
      "estimatedComplexity": "low|medium|high",
      "suggestedModelTier": "fast|balanced|powerful"
    }
  ],
  "phases": [
    { "phaseIndex": 0, "taskIds": ["task_1", "task_2"], "description": "Parallel: Daten sammeln" }
  ],
  "estimatedTotalSec": 30,
  "reasoning": "Erklärung der Zerlegungsstrategie"
}`;

/**
 * Zerlegt ein Ziel in parallelisierbare Sub-Tasks.
 */
export async function decomposeGoal(
  goal: string,
  context?: DecompositionContext
): Promise<DecompositionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nicht konfiguriert");
  }

  const anthropic = new Anthropic({ apiKey });
  const maxTasks = Math.min(context?.maxTasks || 15, 15);

  let userPrompt = `Ziel: ${goal}\n\nMaximale Tasks: ${maxTasks}`;

  if (context?.availableAgents?.length) {
    userPrompt += `\n\nVerfügbare Agents:\n${context.availableAgents.map((a) => `- ${a.name}: ${a.description}`).join("\n")}`;
  }
  if (context?.availableTools?.length) {
    userPrompt += `\n\nVerfügbare Tools: ${context.availableTools.join(", ")}`;
  }
  if (context?.constraints?.length) {
    userPrompt += `\n\nConstraints:\n${context.constraints.map((c) => `- ${c}`).join("\n")}`;
  }

  userPrompt += "\n\nZerlege das Ziel in parallelisierbare Sub-Tasks.";

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: DECOMPOSE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? (b as { text: string }).text : ""))
    .join("");

  let parsed: {
    tasks: SubTask[];
    phases: { phaseIndex: number; taskIds: string[]; description: string }[];
    estimatedTotalSec: number;
    reasoning: string;
  };

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    throw new Error("Task-Zerlegung konnte nicht geparst werden");
  }

  if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    throw new Error("Zerlegung enthält keine Tasks");
  }

  // Validate and normalize
  parsed.tasks = parsed.tasks.slice(0, maxTasks).map((task, i) => ({
    id: task.id || `task_${i + 1}`,
    description: task.description || "",
    dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
    config: task.config || {},
    estimatedComplexity: validateComplexity(task.estimatedComplexity),
    suggestedModelTier: validateTier(task.suggestedModelTier),
  }));

  // Validate dependency references
  const taskIds = new Set(parsed.tasks.map((t) => t.id));
  for (const task of parsed.tasks) {
    task.dependencies = task.dependencies.filter((d) => taskIds.has(d));
  }

  // Detect circular dependencies
  if (hasCircularDependency(parsed.tasks)) {
    // Flatten: remove all dependencies as fallback
    for (const task of parsed.tasks) {
      task.dependencies = [];
    }
  }

  return {
    tasks: parsed.tasks,
    executionPlan: {
      phases: parsed.phases || buildPhases(parsed.tasks),
      estimatedTotalSec: parsed.estimatedTotalSec || 60,
      reasoning: parsed.reasoning || "",
    },
  };
}

/* ── Helpers ── */

function validateComplexity(c: unknown): SubTaskComplexity {
  if (c === "low" || c === "medium" || c === "high") return c;
  return "medium";
}

function validateTier(t: unknown): ModelTier {
  if (t === "fast" || t === "balanced" || t === "powerful") return t;
  return "balanced";
}

function hasCircularDependency(tasks: SubTask[]): boolean {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  function dfs(id: string): boolean {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    const task = taskMap.get(id);
    if (task) {
      for (const dep of task.dependencies) {
        if (dfs(dep)) return true;
      }
    }
    inStack.delete(id);
    return false;
  }

  for (const task of tasks) {
    if (dfs(task.id)) return true;
  }
  return false;
}

/**
 * Baut Phasen aus den Abhängigkeiten.
 */
function buildPhases(tasks: SubTask[]): { phaseIndex: number; taskIds: string[]; description: string }[] {
  const phases: { phaseIndex: number; taskIds: string[]; description: string }[] = [];
  const completed = new Set<string>();
  const remaining = new Set(tasks.map((t) => t.id));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  let phaseIndex = 0;

  while (remaining.size > 0) {
    const ready: string[] = [];
    Array.from(remaining).forEach((id) => {
      const task = taskMap.get(id)!;
      if (task.dependencies.every((d) => completed.has(d))) {
        ready.push(id);
      }
    });

    if (ready.length === 0) break; // Unresolvable

    for (const id of ready) {
      completed.add(id);
      remaining.delete(id);
    }

    phases.push({
      phaseIndex,
      taskIds: ready,
      description: ready.length > 1 ? `Parallel: ${ready.length} Tasks` : taskMap.get(ready[0])?.description || "",
    });
    phaseIndex++;
  }

  return phases;
}
