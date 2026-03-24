/**
 * Intelligent Merge V2
 * Phase 1: Normalize evidence
 * Phase 2: Detect conflicts
 * Phase 3: Synthesize from verified findings
 * Phase 4: Generate optional deliverables
 */

import Anthropic from "@anthropic-ai/sdk";
import { SharedWorkspace, type WorkspaceEntry } from "./shared-workspace";
import { SwarmEventStream } from "./swarm-event-stream";
import { CostTracker } from "@/lib/cost/cost-tracker";
import type { SubAgentResult } from "./sub-agent-executor";
import {
  detectQuickUseResultType,
  extractPresentationBlocks,
} from "@/lib/quick-use/result-presentation";
import type {
  QuickUseGeneratedFile,
  QuickUseResultType,
  QuickUseSource,
} from "@/lib/quick-use/types";
import {
  formatUnverifiedClaims,
  normalizeDateValue,
  normalizePriceValue,
  summarizeVerification,
  type VerificationSummary,
} from "./hallucination-guard";
import { generateFile } from "@/lib/output/file-generator";

/* ── Types ── */

export type IntelligentMergeStrategy =
  | "wait_all"
  | "first_success"
  | "majority_vote"
  | "best_quality"
  | "synthesize";

export interface MergeConflict {
  topic: string;
  sources: { agentId: string; value: string; citation?: string }[];
  resolution?: string;
}

export interface IntelligentMergeResult {
  mergedResult: string;
  qualityScore: number;
  conflicts: MergeConflict[];
  duplicatesRemoved: number;
  agentsContributed: number;
  presentation?: {
    summary: string;
    resultType: QuickUseResultType;
    markdown: string;
    sources: QuickUseSource[];
    followUpQuestions: string[];
    generatedFiles?: QuickUseGeneratedFile[];
    meta?: Record<string, unknown>;
  };
  synthesisModel?: string;
  verification?: VerificationSummary;
  generatedFiles?: QuickUseGeneratedFile[];
}

interface NormalizedFinding {
  agentId: string;
  key: string;
  value: string;
  normalizedValue: string;
  tags: string[];
  sourceUrl?: string;
  sourceTitle?: string;
  verified: boolean;
  citation?: string;
}

interface MergeNormalizationResult {
  findings: NormalizedFinding[];
  duplicatesRemoved: number;
  verification: VerificationSummary;
  sourceMap: Map<string, number>;
}

/* ── Merge ── */

export class IntelligentMerge {
  private readonly costTracker: CostTracker;
  private readonly eventStream: SwarmEventStream;
  private readonly userId?: string;

  constructor(
    costTracker: CostTracker,
    eventStream: SwarmEventStream,
    options?: { userId?: string },
  ) {
    this.costTracker = costTracker;
    this.eventStream = eventStream;
    this.userId = options?.userId;
  }

  async merge(
    strategy: IntelligentMergeStrategy,
    workspace: SharedWorkspace,
    originalGoal: string,
    agentResults: SubAgentResult[],
    anthropicClient: Anthropic,
  ): Promise<IntelligentMergeResult> {
    this.eventStream.mergeStarted(strategy);

    const completedResults = agentResults.filter((result) => result.stoppedReason !== "error" && result.result);
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

    if (strategy === "first_success") {
      const first = completedResults[0];
      const verification = summarizeVerification(first.workspaceEntries || [], undefined, 1);
      this.eventStream.mergeCompleted(70);
      return {
        mergedResult: first.result,
        qualityScore: 70,
        conflicts: [],
        duplicatesRemoved: 0,
        agentsContributed: 1,
        verification,
      };
    }

    return this.mergeWithSynthesis(strategy, workspace, originalGoal, completedResults, anthropicClient);
  }

  private async mergeWithSynthesis(
    strategy: IntelligentMergeStrategy,
    workspace: SharedWorkspace,
    originalGoal: string,
    results: SubAgentResult[],
    anthropicClient: Anthropic,
  ): Promise<IntelligentMergeResult> {
    const normalization = this.normalizeEvidence(workspace.read(), results);
    const conflicts = detectConflicts(normalization.findings);
    for (const conflict of conflicts) {
      this.eventStream.mergeConflict(
        `${conflict.topic}: ${conflict.sources.map((source) => `${source.agentId}=${source.value}`).join(" vs ")}`
      );
    }

    const synthesisModel = chooseSynthesisModel(results, originalGoal, normalization.findings.length);
    const synthesisPrompt = buildSynthesisPrompt(
      originalGoal,
      strategy,
      normalization,
      conflicts,
      results,
    );

    let markdown = buildFallbackMarkdown(normalization, conflicts, results);
    let summary = `Completed swarm synthesis from ${results.length} agent${results.length === 1 ? "" : "s"}.`;
    let resultType: QuickUseResultType = detectQuickUseResultType({
      markdown,
      summary,
    });
    let followUpQuestions: string[] = [];

    try {
      const synthesisResponse = await anthropicClient.messages.create({
        model: synthesisModel,
        max_tokens: 4096,
        system: [
          "You are a synthesis specialist.",
          "Create a final report from verified agent findings.",
          "Every factual claim must keep a citation like [1] or [2].",
          "Do not hide contradictions. Note them explicitly.",
          "If evidence is missing, say so in Limitations instead of guessing.",
          "Respond ONLY with valid JSON.",
        ].join("\n"),
        messages: [{ role: "user", content: synthesisPrompt }],
      });

      await this.costTracker.trackUsage(
        synthesisModel,
        synthesisResponse.usage?.input_tokens || 0,
        synthesisResponse.usage?.output_tokens || 0,
        "merge:synthesis",
      );

      const parsed = parseJson(
        synthesisResponse.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n"),
      ) as {
        summary?: string;
        resultType?: QuickUseResultType;
        markdown?: string;
        followUpQuestions?: string[];
      } | null;

      if (parsed?.markdown) {
        const extracted = extractPresentationBlocks(parsed.markdown);
        summary = parsed.summary?.trim() || extracted.markdown.slice(0, 280) || summary;
        resultType = detectQuickUseResultType({
          markdown: extracted.markdown || parsed.markdown,
          summary,
          explicitResultType: parsed.resultType,
        });
        markdown = extracted.markdown || parsed.markdown;
        followUpQuestions = Array.from(
          new Set([...(parsed.followUpQuestions || []), ...extracted.followUpQuestions]),
        ).slice(0, 4);
      }
    } catch {
      // Fallback bleibt bei code-first synthesized markdown
    }

    const generatedFiles = await this.generateDeliverables(resultType, originalGoal, normalization, markdown);
    const qualityScore = await this.scoreQuality(
      anthropicClient,
      originalGoal,
      markdown,
      normalization.verification,
      conflicts.length,
    );

    const presentation = {
      summary,
      resultType,
      markdown,
      sources: normalization.verification.sources,
      followUpQuestions: followUpQuestions.length > 0
        ? followUpQuestions
        : buildDefaultFollowUps(resultType, originalGoal),
      ...(generatedFiles.length > 0 ? { generatedFiles } : {}),
      meta: {
        completeness: normalization.verification.completeness,
        unverifiedClaims: normalization.verification.unverifiedClaims,
        duplicateFindingsRemoved: normalization.duplicatesRemoved,
        conflictCount: conflicts.length,
        strategy,
      },
    } satisfies IntelligentMergeResult["presentation"];

    this.eventStream.mergeCompleted(qualityScore);

    return {
      mergedResult: markdown,
      qualityScore,
      conflicts,
      duplicatesRemoved: normalization.duplicatesRemoved,
      agentsContributed: results.length,
      presentation,
      synthesisModel,
      verification: normalization.verification,
      generatedFiles,
    };
  }

  private normalizeEvidence(
    workspaceEntries: WorkspaceEntry[],
    results: SubAgentResult[],
  ): MergeNormalizationResult {
    const mergedEntries = workspaceEntries.length > 0
      ? workspaceEntries
      : results.flatMap((result) => result.workspaceEntries || []);
    const verification = summarizeVerification(mergedEntries, undefined, results.length);
    const sourceMap = new Map<string, number>();

    verification.sources.forEach((source, index) => {
      sourceMap.set(source.url, source.id ?? index + 1);
    });

    const dedupe = new Map<string, NormalizedFinding>();
    let duplicatesRemoved = 0;

    for (const entry of mergedEntries) {
      const value = stringifyValue(entry.value);
      const normalizedValue = normalizeComparableValue(value);
      const sourceUrl = entry.source?.url;
      const citationNumber = sourceUrl ? sourceMap.get(sourceUrl) : undefined;
      const finding: NormalizedFinding = {
        agentId: entry.agentId,
        key: entry.key,
        value,
        normalizedValue,
        tags: entry.tags,
        sourceUrl,
        sourceTitle: entry.source?.title,
        verified: Boolean(entry.source?.verified ?? entry.source?.url ?? entry.source?.snippet ?? entry.source?.screenshot),
        citation: citationNumber ? `[${citationNumber}]` : undefined,
      };

      const dedupeKey = `${entry.key}:${normalizedValue}:${sourceUrl || "no_source"}`;
      if (dedupe.has(dedupeKey)) {
        duplicatesRemoved++;
        continue;
      }

      dedupe.set(dedupeKey, finding);
    }

    return {
      findings: Array.from(dedupe.values()),
      duplicatesRemoved,
      verification,
      sourceMap,
    };
  }

  private async generateDeliverables(
    resultType: QuickUseResultType,
    originalGoal: string,
    normalization: MergeNormalizationResult,
    markdown: string,
  ): Promise<QuickUseGeneratedFile[]> {
    if (!this.userId) {
      return [];
    }

    const files: QuickUseGeneratedFile[] = [];
    const comparisonRows = buildComparisonRows(normalization.findings);

    try {
      if (resultType === "comparison" && comparisonRows.length > 0) {
        files.push(await generateFile({
          kind: "xlsx",
          fileName: `agent-swarm-comparison-${Date.now()}.xlsx`,
          data: comparisonRows,
          title: originalGoal.slice(0, 80),
          userId: this.userId,
        }));
        files.push(await generateFile({
          kind: "csv",
          fileName: `agent-swarm-comparison-${Date.now()}.csv`,
          data: comparisonRows,
          userId: this.userId,
        }));
      } else if (resultType === "research") {
        files.push(await generateFile({
          kind: "pdf",
          fileName: `agent-swarm-report-${Date.now()}.pdf`,
          content: markdown,
          title: originalGoal.slice(0, 80),
          userId: this.userId,
        }));
      } else if ((resultType === "price_list" || resultType === "list") && comparisonRows.length > 0) {
        files.push(await generateFile({
          kind: "csv",
          fileName: `agent-swarm-data-${Date.now()}.csv`,
          data: comparisonRows,
          userId: this.userId,
        }));
      }
    } catch {
      // File generation is optional. Keep merge result even if artifacts fail.
    }

    return files;
  }

  private async scoreQuality(
    anthropicClient: Anthropic,
    originalGoal: string,
    markdown: string,
    verification: VerificationSummary,
    conflictCount: number,
  ): Promise<number> {
    let qualityScore = 50;

    try {
      const response = await anthropicClient.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: "You are a quality assessor. Score the response from 0-100. Respond ONLY with JSON.",
        messages: [{
          role: "user",
          content: [
            `Goal: ${originalGoal}`,
            `Verified sources: ${verification.sources.length}`,
            `Unverified claims: ${verification.unverifiedClaims.length}`,
            `Conflicts noted: ${conflictCount}`,
            "",
            markdown.slice(0, 3000),
            "",
            'Respond as {"overall": 0-100}',
          ].join("\n"),
        }],
      });

      await this.costTracker.trackUsage(
        "claude-haiku-4-5-20251001",
        response.usage?.input_tokens || 0,
        response.usage?.output_tokens || 0,
        "merge:quality",
      );

      const parsed = parseJson(
        response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n"),
      ) as { overall?: number } | null;

      qualityScore = Math.min(100, Math.max(0, Number(parsed?.overall) || 50));
    } catch {
      qualityScore = Math.max(45, Math.min(92, 55 + (verification.sources.length * 6) - (verification.unverifiedClaims.length * 4)));
    }

    return qualityScore;
  }
}

/* ── Code-first Normalization / Conflict Detection ── */

function normalizeComparableValue(value: string): string {
  const normalizedPrice = normalizePriceValue(value);
  if (normalizedPrice) {
    return `${normalizedPrice.currency} ${normalizedPrice.amount.toFixed(2)}`;
  }

  const normalizedDate = normalizeDateValue(value);
  if (normalizedDate) {
    return normalizedDate;
  }

  return value.replace(/\s+/g, " ").trim();
}

function detectConflicts(findings: NormalizedFinding[]): MergeConflict[] {
  const grouped = new Map<string, NormalizedFinding[]>();

  for (const finding of findings) {
    const key = finding.key;
    const bucket = grouped.get(key) || [];
    bucket.push(finding);
    grouped.set(key, bucket);
  }

  const conflicts: MergeConflict[] = [];
  for (const [topic, bucket] of grouped.entries()) {
    const uniqueValues = Array.from(new Set(bucket.map((item) => item.normalizedValue)));
    if (uniqueValues.length <= 1) continue;

    conflicts.push({
      topic,
      sources: bucket.slice(0, 4).map((item) => ({
        agentId: item.agentId,
        value: item.value,
        citation: item.citation,
      })),
      resolution: "Report both verified values and note the disagreement explicitly.",
    });
  }

  return conflicts;
}

function buildComparisonRows(findings: NormalizedFinding[]): Record<string, unknown>[] {
  return findings.map((finding) => ({
    agentId: finding.agentId,
    key: finding.key,
    value: finding.value,
    normalizedValue: finding.normalizedValue,
    source: finding.sourceUrl || "",
    citation: finding.citation || "",
    verified: finding.verified ? "yes" : "no",
  }));
}

/* ── Synthesis Prompt / Fallback ── */

function buildSynthesisPrompt(
  originalGoal: string,
  strategy: IntelligentMergeStrategy,
  normalization: MergeNormalizationResult,
  conflicts: MergeConflict[],
  results: SubAgentResult[],
): string {
  const verifiedFindings = normalization.findings
    .filter((finding) => finding.verified)
    .map((finding) => `- ${finding.key}: ${finding.value}${finding.citation ? ` ${finding.citation}` : ""}${finding.sourceUrl ? ` (${finding.sourceUrl})` : ""}`)
    .join("\n");

  const conflictsText = conflicts.length > 0
    ? conflicts
        .map((conflict) => `- ${conflict.topic}: ${conflict.sources.map((source) => `${source.value}${source.citation ? ` ${source.citation}` : ""}`).join(" vs ")}`)
        .join("\n")
    : "None";

  return [
    `Original goal: ${originalGoal}`,
    `Merge strategy: ${strategy}`,
    `Data completeness: ${normalization.verification.completeness}`,
    "",
    "Verified findings:",
    verifiedFindings || "- No verified findings were collected.",
    "",
    "Known conflicts:",
    conflictsText,
    "",
    normalization.verification.unverifiedClaims.length > 0
      ? `Unverified claims (mention only as unverified if needed):\n${formatUnverifiedClaims(normalization.verification.unverifiedClaims)}`
      : "Unverified claims: none",
    "",
    `Agent count: ${results.length}`,
    "",
    "Write the final report in this structure:",
    "Executive Summary",
    "Key Findings",
    "Detailed Comparison",
    "Limitations",
    "Recommendation",
    "",
    "Rules:",
    "1. Every factual claim must have a citation [N].",
    "2. Contradictions must be noted, not hidden.",
    "3. Include data completeness and blocked/failed coverage if relevant.",
    "4. End with a clear recommendation or conclusion.",
    "5. Preserve source citations.",
    "",
    "Respond ONLY with valid JSON in this exact shape:",
    "{",
    '  "summary": "2-3 sentence executive summary",',
    '  "resultType": "comparison|research|price_list|single_fact|list|general",',
    '  "markdown": "Markdown report WITHOUT a Sources section or FOLLOW_UP_QUESTIONS block.",',
    '  "followUpQuestions": ["Question 1", "Question 2", "Question 3"]',
    "}",
  ].join("\n");
}

function buildFallbackMarkdown(
  normalization: MergeNormalizationResult,
  conflicts: MergeConflict[],
  results: SubAgentResult[],
): string {
  const verified = normalization.findings.filter((finding) => finding.verified);
  const topFindings = verified.slice(0, 8);

  const keyFindings = topFindings.length > 0
    ? topFindings.map((finding) => `- **${humanizeKey(finding.key)}:** ${finding.value}${finding.citation ? ` ${finding.citation}` : ""}`).join("\n")
    : "- No verified findings were available.";

  const limitations = [
    normalization.verification.completeness,
    results.some((result) => result.stoppedReason !== "completed")
      ? "Some agents did not complete successfully."
      : "",
    normalization.verification.unverifiedClaims.length > 0
      ? `${normalization.verification.unverifiedClaims.length} claim${normalization.verification.unverifiedClaims.length === 1 ? " is" : "s are"} unverified and excluded from the main findings.`
      : "",
  ]
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join("\n");

  const conflictText = conflicts.length > 0
    ? conflicts
        .map((conflict) => `- **${humanizeKey(conflict.topic)}:** ${conflict.sources.map((source) => `${source.value}${source.citation ? ` ${source.citation}` : ""}`).join(" vs ")}`)
        .join("\n")
    : "- No material conflicts detected across verified findings.";

  return [
    "## Executive Summary",
    normalization.verification.completeness,
    "",
    "## Key Findings",
    keyFindings,
    "",
    "## Detailed Comparison",
    keyFindings,
    "",
    "## Limitations",
    limitations,
    "",
    "## Recommendation",
    conflicts.length > 0
      ? "Use the conflict notes to verify the disputed data points before acting on them."
      : "Act on the verified findings above and use the cited sources for confirmation.",
    "",
    "## Conflicts",
    conflictText,
  ].join("\n");
}

function buildDefaultFollowUps(resultType: QuickUseResultType, goal: string): string[] {
  const subject = goal.replace(/\s+/g, " ").trim().slice(0, 70) || "this";

  switch (resultType) {
    case "comparison":
      return [
        `Which option in ${subject} looks best if delivery speed matters most?`,
        `Can you turn this comparison into a downloadable spreadsheet?`,
        `What changed compared with the cheapest option last time?`,
      ];
    case "research":
      return [
        `What are the main risks or downsides related to ${subject}?`,
        `How does this compare with the leading alternative?`,
        `Can you turn this into a PDF brief?`,
      ];
    case "price_list":
      return [
        `Can you re-check the cheapest option for ${subject} on the actual site?`,
        `Which seller has the best delivery terms?`,
        `Should I also compare refurbished or used options?`,
      ];
    default:
      return [
        `Can you expand on the most important finding in ${subject}?`,
        `What should be checked next before acting on this?`,
        `Can you export the verified data?`,
      ];
  }
}

function chooseSynthesisModel(
  results: SubAgentResult[],
  originalGoal: string,
  findingsCount: number,
): string {
  if (results.some((result) => result.sources.some((source) => source.tool === "browse_url" || source.tool === "take_screenshot"))) {
    return "claude-sonnet-4-6";
  }
  if (results.length > 5 || findingsCount > 20 || originalGoal.length > 400) {
    return "claude-sonnet-4-6";
  }
  return "claude-haiku-4-5-20251001";
}

/* ── Helpers ── */

function parseJson(text: string): unknown {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
