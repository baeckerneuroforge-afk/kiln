/**
 * Intelligent Merge
 * Ersetzt einfache Merge-Strategien durch LLM-gestützte Synthese mit
 * Deduplizierung, Konflikt-Erkennung und Qualitätsbewertung.
 */

import Anthropic from "@anthropic-ai/sdk";
import { SharedWorkspace } from "./shared-workspace";
import { SwarmEventStream } from "./swarm-event-stream";
import { CostTracker } from "@/lib/cost/cost-tracker";
import type { SubAgentResult } from "./sub-agent-executor";

/* ── Types ── */

export type IntelligentMergeStrategy =
  | "wait_all"
  | "first_success"
  | "majority_vote"
  | "best_quality"
  | "synthesize";

export interface MergeConflict {
  topic: string;
  sources: { agentId: string; value: string }[];
  resolution?: string;
}

export interface IntelligentMergeResult {
  mergedResult: string;
  qualityScore: number;
  conflicts: MergeConflict[];
  duplicatesRemoved: number;
  agentsContributed: number;
}

/* ── IntelligentMerge Class ── */

export class IntelligentMerge {
  private costTracker: CostTracker;
  private eventStream: SwarmEventStream;

  constructor(costTracker: CostTracker, eventStream: SwarmEventStream) {
    this.costTracker = costTracker;
    this.eventStream = eventStream;
  }

  /**
   * Führt den intelligenten Merge aller Agent-Ergebnisse durch.
   */
  async merge(
    strategy: IntelligentMergeStrategy,
    workspace: SharedWorkspace,
    originalGoal: string,
    agentResults: SubAgentResult[],
    anthropicClient: Anthropic
  ): Promise<IntelligentMergeResult> {
    this.eventStream.mergeStarted(strategy);

    const completedResults = agentResults.filter((r) => r.stoppedReason !== "error" && r.result);

    if (completedResults.length === 0) {
      this.eventStream.mergeCompleted(0);
      return {
        mergedResult: "No agents completed successfully.",
        qualityScore: 0,
        conflicts: [],
        duplicatesRemoved: 0,
        agentsContributed: 0,
      };
    }

    // Schnelle Strategien die kein LLM brauchen
    if (strategy === "first_success") {
      const first = completedResults[0];
      this.eventStream.mergeCompleted(70);
      return {
        mergedResult: first.result,
        qualityScore: 70,
        conflicts: [],
        duplicatesRemoved: 0,
        agentsContributed: 1,
      };
    }

    if (strategy === "wait_all" && completedResults.length === 1) {
      this.eventStream.mergeCompleted(75);
      return {
        mergedResult: completedResults[0].result,
        qualityScore: 75,
        conflicts: [],
        duplicatesRemoved: 0,
        agentsContributed: 1,
      };
    }

    // Für alle anderen Strategien: LLM-basierter Merge
    return this.llmMerge(strategy, workspace, originalGoal, completedResults, anthropicClient);
  }

  private async llmMerge(
    strategy: IntelligentMergeStrategy,
    workspace: SharedWorkspace,
    originalGoal: string,
    results: SubAgentResult[],
    anthropicClient: Anthropic
  ): Promise<IntelligentMergeResult> {
    // Step 1: Alle Ergebnisse sammeln
    const agentFindings = results.map((r) => ({
      agentId: r.id,
      result: r.result.slice(0, 3000),
      toolCalls: r.toolCallsCount,
      model: r.modelUsed,
    }));

    // Workspace-Entries auch einbeziehen
    const workspaceEntries = workspace.read();
    const workspaceContext = workspaceEntries.length > 0
      ? "\n\nShared Workspace Findings:\n" + workspaceEntries
          .map((e) => `[${e.agentId}] ${e.key}: ${JSON.stringify(e.value).slice(0, 500)}`)
          .join("\n")
      : "";

    // Step 2: Deduplizierung + Konflikt-Erkennung (Haiku — günstig)
    const analysisPrompt = `You are analyzing results from ${results.length} research agents.

Original Goal: ${originalGoal}

Agent Results:
${agentFindings.map((f) => `--- Agent ${f.agentId} (${f.model}, ${f.toolCalls} tool calls) ---\n${f.result}`).join("\n\n")}
${workspaceContext}

Analyze the results and respond with ONLY valid JSON:
{
  "duplicates": [{"topic": "...", "agents": ["id1", "id2"], "keep_best_from": "id1"}],
  "conflicts": [{"topic": "...", "sources": [{"agentId": "id1", "value": "..."}, {"agentId": "id2", "value": "..."}]}],
  "unique_findings_count": 0
}`;

    let duplicatesRemoved = 0;
    let conflicts: MergeConflict[] = [];

    try {
      const analysisResponse = await anthropicClient.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: "You are a data analyst. Identify duplicates and conflicts across multiple agent results. Respond ONLY with valid JSON.",
        messages: [{ role: "user", content: analysisPrompt }],
      });

      const analysisText = analysisResponse.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      await this.costTracker.trackUsage(
        "claude-haiku-4-5-20251001",
        analysisResponse.usage?.input_tokens || 0,
        analysisResponse.usage?.output_tokens || 0,
        "merge:analysis"
      );

      try {
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        const analysis = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText);
        duplicatesRemoved = Array.isArray(analysis.duplicates) ? analysis.duplicates.length : 0;

        if (Array.isArray(analysis.conflicts)) {
          conflicts = analysis.conflicts.map((c: { topic: string; sources: { agentId: string; value: string }[] }) => ({
            topic: c.topic,
            sources: Array.isArray(c.sources) ? c.sources : [],
          }));
        }
      } catch {
        // JSON-Parsing fehlgeschlagen — weiter ohne Analyse
      }
    } catch {
      // Analyse fehlgeschlagen — weiter ohne
    }

    // Konflikte melden
    for (const conflict of conflicts) {
      this.eventStream.mergeConflict(`${conflict.topic}: ${conflict.sources.map((s) => `${s.agentId}="${s.value}"`).join(" vs ")}`);
    }

    // Step 3: Synthese (Sonnet für Qualität)
    const synthesisModel = results.length > 5 || originalGoal.length > 500
      ? "claude-sonnet-4-6"
      : "claude-haiku-4-5-20251001";

    const conflictContext = conflicts.length > 0
      ? `\n\nKNOWN CONFLICTS (include both sides with source attribution):\n${conflicts.map((c) => `- ${c.topic}: ${c.sources.map((s) => `${s.agentId} says "${s.value}"`).join(" vs ")}`).join("\n")}`
      : "";

    const synthesisPrompt = `You are synthesizing results from ${results.length} research agents.

Original Goal: ${originalGoal}

Each agent's findings:
${agentFindings.map((f) => `--- Agent ${f.agentId} ---\n${f.result}`).join("\n\n")}
${workspaceContext}
${conflictContext}

${duplicatesRemoved > 0 ? `Note: ${duplicatesRemoved} duplicate findings were identified across agents.` : ""}

Create a comprehensive, well-structured response that:
1. Combines all unique findings
2. Resolves contradictions by noting both sources
3. Highlights the most important discoveries
4. Directly answers the original goal
5. Is well-formatted with headers and bullet points where appropriate`;

    let mergedResult = "";

    try {
      const synthesisResponse = await anthropicClient.messages.create({
        model: synthesisModel,
        max_tokens: 4096,
        system: "You are a synthesis expert. Create a coherent, comprehensive response from multiple agent results. Be thorough but concise. Use markdown formatting.",
        messages: [{ role: "user", content: synthesisPrompt }],
      });

      mergedResult = synthesisResponse.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n\n");

      await this.costTracker.trackUsage(
        synthesisModel,
        synthesisResponse.usage?.input_tokens || 0,
        synthesisResponse.usage?.output_tokens || 0,
        "merge:synthesis"
      );
    } catch {
      // Fallback: einfache Konkatenation
      mergedResult = agentFindings.map((f) => `## Agent ${f.agentId}\n${f.result}`).join("\n\n---\n\n");
    }

    // Step 4: Quality Check (Haiku — günstig)
    let qualityScore = 50; // Default

    try {
      const qualityResponse = await anthropicClient.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: "You are a quality assessor. Score the response on a 0-100 scale. Respond with ONLY a JSON object.",
        messages: [{
          role: "user",
          content: `Original Goal: ${originalGoal}\n\nResponse to evaluate:\n${mergedResult.slice(0, 3000)}\n\nScore this response:\n{"completeness": 0-100, "accuracy": 0-100, "coherence": 0-100, "overall": 0-100}`,
        }],
      });

      const qualityText = qualityResponse.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      await this.costTracker.trackUsage(
        "claude-haiku-4-5-20251001",
        qualityResponse.usage?.input_tokens || 0,
        qualityResponse.usage?.output_tokens || 0,
        "merge:quality"
      );

      try {
        const jsonMatch = qualityText.match(/\{[\s\S]*\}/);
        const quality = JSON.parse(jsonMatch ? jsonMatch[0] : qualityText);
        qualityScore = Math.min(100, Math.max(0, Number(quality.overall) || 50));
      } catch {
        qualityScore = 60; // Parsing failed — konservativ bewerten
      }
    } catch {
      qualityScore = 50; // Quality check failed
    }

    this.eventStream.mergeCompleted(qualityScore);

    return {
      mergedResult,
      qualityScore,
      conflicts,
      duplicatesRemoved,
      agentsContributed: results.length,
    };
  }
}
