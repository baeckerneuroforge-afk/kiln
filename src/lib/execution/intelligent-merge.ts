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
  normalizeDateValue,
  normalizePriceValue,
  summarizeVerification,
  type VerificationSummary,
} from "./hallucination-guard";
import { generateFile, buildSmartFileName } from "@/lib/output/file-generator";

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

/* ── Quality Gate ── */

interface AgentQualityResult {
  agentId: string;
  score: number;
  issues: string[];
  include: boolean;
  confidence: "high" | "medium" | "low";
}

function validateAgentResult(result: SubAgentResult): AgentQualityResult {
  const issues: string[] = [];
  const agentId = result.id || "unknown";

  // 1. Did the agent produce output?
  const hasWorkspace = (result.workspaceEntries?.length ?? 0) > 0;
  const hasResult = !!result.result && result.result.length > 50;
  if (!hasWorkspace && !hasResult) {
    issues.push("NO_OUTPUT");
  }

  // 2. Does the output contain source URLs?
  const combined = [
    result.result || "",
    ...(result.workspaceEntries || []).map((e) => stringifyValue(e.value)),
  ].join(" ");
  const hasUrls = /https?:\/\/[^\s"'<>]+/.test(combined);
  if (!hasUrls) {
    issues.push("NO_SOURCE_URLS");
  }

  // 3. Is the output suspiciously short?
  if (combined.length < 150) {
    issues.push("TOO_SHORT");
  }

  // 4. Does it contain actual data vs generic statements?
  const hasNumbers = /\d+[.,]\d+|\$\d+|€\d+|\d+%/.test(combined);
  const hasSpecificData = /\b(pricing|price|feature|limitation|rating|review|pro|con)\b/i.test(combined);
  if (!hasNumbers && !hasSpecificData) {
    issues.push("NO_SPECIFIC_DATA");
  }

  // 5. Check for error indicators
  if (result.stoppedReason === "error" || result.stoppedReason === "budget_exceeded") {
    issues.push("AGENT_ERROR");
  }

  // Score: 1.0 minus 0.25 per issue, min 0
  const score = Math.max(0, 1 - issues.length * 0.25);
  const include = score >= 0.25; // Only exclude truly empty/broken results
  const confidence: "high" | "medium" | "low" = score >= 0.75 ? "high" : score >= 0.5 ? "medium" : "low";

  return { agentId, score, issues, include, confidence };
}

function applyQualityGate(
  results: SubAgentResult[],
  eventStream: SwarmEventStream,
): { passed: SubAgentResult[]; quality: AgentQualityResult[] } {
  const quality = results.map(validateAgentResult);

  // Only log quality issues for original tasks, not retries (internal detail)
  for (const q of quality) {
    if (q.agentId.includes("_retry_")) continue;
    if (!q.include) {
      eventStream.mergeConflict(
        `Agent ${q.agentId} excluded: ${q.issues.join(", ")}`,
      );
    } else if (q.confidence === "low") {
      eventStream.mergeConflict(
        `Agent ${q.agentId} low confidence: ${q.issues.join(", ")}`,
      );
    }
  }

  const passed = results.filter((_, i) => quality[i].include);
  return { passed, quality };
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

    // Quality Gate: validate and filter agent results before merge
    const { passed: qualityPassedResults, quality } = applyQualityGate(completedResults, this.eventStream);

    if (qualityPassedResults.length === 0) {
      this.eventStream.mergeCompleted(0);
      // Summarize issues: deduplicate, count by type, cap at 5
      const issueCounts = new Map<string, number>();
      for (const q of quality) {
        for (const issue of q.issues) {
          issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
        }
      }
      // Filter to only original tasks (not retries) for the summary
      const originalFailed = quality
        .filter((q) => !q.include && !q.agentId.includes("_retry_"))
        .map((q) => q.agentId);
      const issueSummary = [...issueCounts.entries()]
        .slice(0, 5)
        .map(([issue, count]) => `${issue} (${count}×)`)
        .join(", ");

      return {
        mergedResult: `${originalFailed.length || quality.length} agents failed quality checks. Issues: ${issueSummary}`,
        qualityScore: 0,
        conflicts: [],
        duplicatesRemoved: 0,
        agentsContributed: 0,
      };
    }

    if (strategy === "first_success") {
      const first = qualityPassedResults[0];
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

    return this.mergeWithSynthesis(strategy, workspace, originalGoal, qualityPassedResults, anthropicClient);
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
          "You are a synthesis specialist creating a premium research report.",
          "",
          "SYNTHESIS RULES:",
          "1. STRUCTURE: Start with a 2-sentence executive summary answering the user's question DIRECTLY.",
          "2. COMPARISON: If comparing entities, create a markdown comparison TABLE with ALL data points aligned. Every cell must have data or explicitly say 'Not found'.",
          "3. SOURCES: Preserve ALL [N] citations from agent findings. If agents cited the same source, merge into one citation number.",
          "4. CONFLICTS: When agents found different data, show BOTH: 'Pricing ranges from €10/user [1] to €15/user [3]'.",
          "5. GAPS: Explicitly state what could NOT be found: 'Note: Enterprise pricing was not publicly available.'",
          "6. CONFIDENCE: End with a data quality assessment: sources count, data freshness, confidence level.",
          "7. RECOMMENDATION: If comparing, end with: 'Best for budget: X. Best for features: Y. Best overall: Z.'",
          "",
          "FORMAT for comparison reports:",
          "## Executive Summary",
          "[2 sentences directly answering the question]",
          "## Comparison",
          "| Feature | Tool A | Tool B | Tool C |",
          "| --- | --- | --- | --- |",
          "| Free tier | ... [1] | ... [2] | ... [3] |",
          "## Key Differences",
          "## Recommendation",
          "## Data Quality",
          "",
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
          fileName: buildSmartFileName(originalGoal, "Vergleich", "xlsx"),
          data: comparisonRows,
          title: originalGoal.slice(0, 80),
          userId: this.userId,
        }));
        files.push(await generateFile({
          kind: "csv",
          fileName: buildSmartFileName(originalGoal, "Vergleich", "csv"),
          data: comparisonRows,
          userId: this.userId,
        }));
      } else if (resultType === "research") {
        files.push(await generateFile({
          kind: "pdf",
          fileName: buildSmartFileName(originalGoal, "Report", "pdf"),
          content: markdown,
          title: originalGoal.slice(0, 80),
          userId: this.userId,
        }));
      } else if ((resultType === "price_list" || resultType === "list") && comparisonRows.length > 0) {
        files.push(await generateFile({
          kind: "csv",
          fileName: buildSmartFileName(originalGoal, "Daten", "csv"),
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
  // Group findings by agent for better context
  const findingsByAgent = new Map<string, NormalizedFinding[]>();
  for (const f of normalization.findings) {
    const existing = findingsByAgent.get(f.agentId) || [];
    existing.push(f);
    findingsByAgent.set(f.agentId, existing);
  }

  const agentSections = Array.from(findingsByAgent.entries())
    .map(([agentId, findings]) => {
      const verified = findings.filter((f) => f.verified);
      const unverified = findings.filter((f) => !f.verified);
      return [
        `### Agent: ${agentId}`,
        verified.length > 0
          ? "Verified:\n" + verified.map((f) => `- ${f.key}: ${f.value}${f.citation ? ` ${f.citation}` : ""}${f.sourceUrl ? ` (${f.sourceUrl})` : ""}`).join("\n")
          : "No verified findings.",
        unverified.length > 0
          ? "Unverified:\n" + unverified.map((f) => `- ${f.key}: ${f.value} [unverified]`).join("\n")
          : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  const conflictsText = conflicts.length > 0
    ? conflicts
        .map((conflict) => `- ${conflict.topic}: ${conflict.sources.map((source) => `${source.value}${source.citation ? ` ${source.citation}` : ""}`).join(" vs ")}`)
        .join("\n")
    : "None";

  const sourceList = normalization.verification.sources
    .map((s) => `[${s.id}] ${s.title || s.domain || "Source"} — ${s.url}`)
    .join("\n");

  return [
    `USER'S QUESTION: ${originalGoal}`,
    "",
    `Agents completed: ${results.length}`,
    `Data completeness: ${normalization.verification.completeness}`,
    `Strategy: ${strategy}`,
    "",
    "=== AGENT FINDINGS ===",
    agentSections || "No findings collected.",
    "",
    "=== CONFLICTS ===",
    conflictsText,
    "",
    "=== SOURCE INDEX ===",
    sourceList || "No sources.",
    "",
    "INSTRUCTIONS:",
    "1. Answer the user's question DIRECTLY in the first 2 sentences.",
    "2. If comparing entities: create a COMPLETE markdown comparison table. Every cell must have data or 'Not found'.",
    "3. Every fact must keep its [N] citation.",
    "4. Show contradictions: 'X ranges from A [1] to B [3]'.",
    "5. List what was NOT found explicitly.",
    "6. End with a clear recommendation if applicable.",
    "7. Add 3-4 specific follow-up questions.",
    "",
    "Respond ONLY with JSON:",
    "{",
    '  "summary": "2-3 sentence executive summary directly answering the question",',
    '  "resultType": "comparison|research|price_list|single_fact|list|general",',
    '  "markdown": "Full markdown report with ## headers, comparison table, citations [N], recommendation",',
    '  "followUpQuestions": ["Specific question 1", "Specific question 2", "Specific question 3"]',
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
