import Anthropic from "@anthropic-ai/sdk";
import { deductCreditsByAmount } from "@/lib/credits";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type {
  QuickUseGeneratedFile,
  QuickUseMemoryPreview,
  QuickUseResult,
  QuickUseType,
} from "@/lib/quick-use/types";
import { AgentWorkspace } from "@/lib/workspace/agent-workspace";

const MEMORY_MODEL = "claude-haiku-4-5-20251001";
const MEMORY_EXTRACTION_CREDITS = 0.5;
const MAX_RELEVANT_MEMORIES = 3;
const MEMORY_EXPIRY_DAYS = 90;
const RECENT_MEMORY_DAYS = 7;
const QUICK_USE_WORKSPACE_AGENT_ID = "quick-use";

const STOP_WORDS = new Set([
  "the", "and", "that", "this", "with", "from", "your", "have", "what", "when", "where", "which",
  "about", "into", "over", "under", "also", "more", "than", "then", "just", "like", "need", "want",
  "please", "could", "would", "should", "show", "tell", "give", "make", "create", "build", "find",
  "check", "compare", "research", "analyze", "analyse", "update", "refresh", "rerun", "recheck",
  "previous", "task", "tasks", "same", "latest", "current", "these", "those", "there", "their",
  "yesterday", "today", "week", "month", "last", "next", "from", "for", "und", "der", "die", "das",
  "mit", "für", "auf", "von", "eine", "einen", "dem", "den", "ist", "sind", "war", "waren", "bitte",
  "zeige", "mach", "erstelle", "vergleiche", "prüfe", "checke", "aktualisiere", "nochmal", "erneut",
]);

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  sonntag: 0,
  monday: 1,
  montag: 1,
  tuesday: 2,
  dienstag: 2,
  wednesday: 3,
  mittwoch: 3,
  thursday: 4,
  donnerstag: 4,
  friday: 5,
  freitag: 5,
  saturday: 6,
  samstag: 6,
};

interface WorkspaceFileReference {
  name: string;
  kind?: QuickUseGeneratedFile["kind"];
  mimeType?: string;
  size?: number;
  url?: string;
  workspacePath?: string;
  storageUrl?: string;
}

export interface SavedQuickUseTaskContext {
  type: QuickUseType;
  inputMessage: string;
  result: QuickUseResult;
  completedAt?: Date;
}

export interface RelevantQuickUseMemory {
  id: string;
  taskId: string;
  type: QuickUseType;
  title?: string;
  inputSummary: string;
  summary: string;
  keyData: Record<string, unknown>;
  keywords: string[];
  createdAt: Date;
  ageLabel: string;
  highlights: string[];
  sourceDomains: string[];
  visitedUrls: string[];
  generatedFiles: WorkspaceFileReference[];
  fullResult: QuickUseResult | null;
}

interface MemorySearchOptions {
  limit?: number;
  quickUseType?: QuickUseType;
  selectedMemoryIds?: string[];
}

interface ReferenceIntent {
  update: boolean;
  extend: boolean;
  temporal: boolean;
  previous: boolean;
  resend: boolean;
  targetDate: Date | null;
}

type StoredMemoryRow = Awaited<ReturnType<typeof prisma.quickUseMemory.findMany>>[number];

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeType(value: string): QuickUseType {
  if (value === "agent-swarm" || value === "deep-research" || value === "computer-use") return value;
  if (value === "agent_swarm") return "agent-swarm";
  if (value === "deep_research") return "deep-research";
  return "computer-use";
}

function truncate(text: string, max = 280): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function slugify(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "file";
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+.-]*/g) || [])
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
    .slice(0, 40);
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 10): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (deduped.includes(trimmed)) continue;
    deduped.push(trimmed);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

function extractDomains(urls: string[]): string[] {
  return uniqueStrings(urls.map((url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }));
}

function extractHighlights(text: string): string[] {
  const values = Array.from(
    new Set(text.match(/(?:[$€£]\s?\d[\d.,]*|\d+(?:\.\d+)?%|\b20\d{2}\b|\b[A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2}\b)/g) || [])
  );
  return values.slice(0, 4);
}

function formatRelativeAge(date: Date, now = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / 86_400_000));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;

  const weeks = Math.floor(diffDays / 7);
  if (weeks === 1) return "1 week ago";
  if (weeks < 5) return `${weeks} weeks ago`;

  const months = Math.floor(diffDays / 30);
  if (months <= 1) return "1 month ago";
  return `${months} months ago`;
}

function detectReferenceIntent(message: string): ReferenceIntent {
  const lower = message.toLowerCase();
  return {
    update: /\b(update|refresh|recheck|rerun|latest|current|again|nochmal|erneut|aktualisier)/i.test(lower),
    extend: /\b(add|also include|include|expand|extend|plus|mit|ergänz|zusätzlich)\b/i.test(lower),
    temporal: /\b(yesterday|last week|from \w+day|gestern|letzte woche|vom|von)\b/i.test(lower),
    previous: /\b(previous|same|that|earlier|before|from|vorherig|letzte|frühere)\b/i.test(lower),
    resend: /\b(send|email|mail|share|download|excel|pdf)\b/i.test(lower),
    targetDate: detectTemporalTarget(message),
  };
}

function detectTemporalTarget(message: string): Date | null {
  const lower = message.toLowerCase();
  const now = new Date();

  if (/\byesterday\b|\bgestern\b/i.test(lower)) {
    const target = new Date(now);
    target.setDate(now.getDate() - 1);
    return target;
  }

  if (/\blast week\b|\bletzte woche\b/i.test(lower)) {
    const target = new Date(now);
    target.setDate(now.getDate() - 7);
    return target;
  }

  for (const [label, weekday] of Object.entries(WEEKDAY_INDEX)) {
    if (!new RegExp(`\\b(?:from|on|vom|am)?\\s*${label}\\b`, "i").test(lower)) continue;
    const current = now.getDay();
    let diff = current - weekday;
    if (diff <= 0) diff += 7;
    const target = new Date(now);
    target.setDate(now.getDate() - diff);
    return target;
  }

  return null;
}

function sanitizeResultForStorage(result: QuickUseResult): QuickUseResult {
  return {
    title: result.title,
    summary: truncate(result.summary, 600),
    markdown: result.markdown ? truncate(result.markdown, 4000) : undefined,
    resultType: result.resultType,
    followUpQuestions: result.followUpQuestions?.slice(0, 4),
    model: result.model,
    durationMs: result.durationMs,
    data: result.data,
    artifacts: result.artifacts?.map((artifact) => ({
      kind: artifact.kind,
      name: artifact.name,
      url: artifact.url,
      mimeType: artifact.mimeType,
    })),
    sources: result.sources?.slice(0, 12),
    generatedFiles: result.generatedFiles?.slice(0, 8),
    qualityScore: result.qualityScore,
    meta: result.meta,
  };
}

function normalizeWorkspaceFiles(value: unknown): WorkspaceFileReference[] {
  return safeArray(value)
    .map((entry) => safeObject(entry))
    .map((entry) => ({
      name: typeof entry.name === "string" ? entry.name : "Generated file",
      kind: typeof entry.kind === "string" ? entry.kind as QuickUseGeneratedFile["kind"] : undefined,
      mimeType: typeof entry.mimeType === "string" ? entry.mimeType : undefined,
      size: typeof entry.size === "number" ? entry.size : undefined,
      url: typeof entry.url === "string" ? entry.url : undefined,
      workspacePath: typeof entry.workspacePath === "string" ? entry.workspacePath : undefined,
      storageUrl: typeof entry.storageUrl === "string" ? entry.storageUrl : undefined,
    }))
    .filter((entry) => entry.name);
}

function asResult(value: unknown): QuickUseResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as QuickUseResult;
}

function scoreTemporalDistance(memoryDate: Date, targetDate: Date | null): number {
  if (!targetDate) return 0;
  const diffDays = Math.abs(Math.round((memoryDate.getTime() - targetDate.getTime()) / 86_400_000));
  return Math.max(0, 12 - (diffDays * 2));
}

function memorySourceDomains(memory: RelevantQuickUseMemory): string[] {
  return memory.sourceDomains.length > 0
    ? memory.sourceDomains
    : extractDomains(memory.visitedUrls);
}

async function cleanupExpiredMemories(userId?: string): Promise<void> {
  await prisma.quickUseMemory.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
      ...(userId ? { userId } : {}),
    },
  }).catch(() => {});
}

export class QuickUseSessionMemory {
  async saveTaskContext(userId: string, taskId: string, context: SavedQuickUseTaskContext): Promise<void> {
    const completedAt = context.completedAt || new Date();
    await cleanupExpiredMemories(userId);

    const workspaceFiles = await this.persistGeneratedFiles(userId, taskId, context.result.generatedFiles);
    const extracted = await this.extractMemorySummary(context, workspaceFiles);
    const fallback = this.fallbackExtraction(context, workspaceFiles);
    const summary = truncate(extracted?.summary || fallback.summary, 420);
    const title = truncate(extracted?.title || context.result.title || fallback.title || "", 160) || undefined;
    const keywords = uniqueStrings(
      [
        ...(extracted?.keywords || []),
        ...fallback.keywords,
      ],
      10
    );
    const keyData = {
      ...fallback.keyData,
      ...safeObject(extracted?.keyData),
      highlights: uniqueStrings([
        ...safeArray(safeObject(extracted?.keyData).highlights).map((value) => String(value)),
        ...fallback.highlights,
      ], 6),
      generatedFiles: workspaceFiles.length > 0 ? workspaceFiles : fallback.generatedFiles,
      sourceDomains: uniqueStrings([
        ...fallback.sourceDomains,
        ...safeArray(safeObject(extracted?.keyData).sourceDomains).map((value) => String(value)),
      ], 10),
      urls: uniqueStrings([
        ...fallback.urls,
        ...safeArray(safeObject(extracted?.keyData).urls).map((value) => String(value)),
      ], 12),
    };

    await prisma.quickUseMemory.upsert({
      where: { taskId },
      update: {
        type: context.type,
        title,
        inputSummary: truncate(context.inputMessage, 500),
        summary,
        keyData: keyData as unknown as Prisma.InputJsonValue,
        keywords,
        result: sanitizeResultForStorage(context.result) as unknown as Prisma.InputJsonValue,
        workspaceFiles: workspaceFiles as unknown as Prisma.InputJsonValue,
        createdAt: completedAt,
        expiresAt: new Date(completedAt.getTime() + (MEMORY_EXPIRY_DAYS * 86_400_000)),
      },
      create: {
        userId,
        taskId,
        type: context.type,
        title,
        inputSummary: truncate(context.inputMessage, 500),
        summary,
        keyData: keyData as unknown as Prisma.InputJsonValue,
        keywords,
        result: sanitizeResultForStorage(context.result) as unknown as Prisma.InputJsonValue,
        workspaceFiles: workspaceFiles as unknown as Prisma.InputJsonValue,
        createdAt: completedAt,
        expiresAt: new Date(completedAt.getTime() + (MEMORY_EXPIRY_DAYS * 86_400_000)),
      },
    });

    await deductCreditsByAmount(
      userId,
      MEMORY_EXTRACTION_CREDITS,
      "TASK_RUN",
      "quick_use_memory_extraction"
    ).catch(() => {});
  }

  async getRelevantMemory(
    userId: string,
    newMessage: string,
    options: MemorySearchOptions = {}
  ): Promise<RelevantQuickUseMemory[]> {
    await cleanupExpiredMemories(userId);

    const selected = await this.getMemoriesByIds(userId, options.selectedMemoryIds || []);
    const queryKeywords = uniqueStrings(tokenize(newMessage), 10);
    const intent = detectReferenceIntent(newMessage);

    if (queryKeywords.length === 0 && !intent.previous && !intent.temporal && selected.length === 0) {
      return [];
    }

    const orFilters: Prisma.QuickUseMemoryWhereInput[] = [];
    if (queryKeywords.length > 0) {
      orFilters.push({ keywords: { hasSome: queryKeywords } });
    }
    if (intent.previous || intent.temporal || selected.length > 0) {
      orFilters.push({
        createdAt: { gte: new Date(Date.now() - (MEMORY_EXPIRY_DAYS * 86_400_000)) },
      });
    }

    const rows = await prisma.quickUseMemory.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
        OR: orFilters,
      },
      orderBy: { createdAt: "desc" },
      take: 24,
    });

    const candidateMap = new Map<string, RelevantQuickUseMemory>();
    for (const memory of [...selected, ...rows.map((row) => this.inflateMemory(row))]) {
      candidateMap.set(memory.id, memory);
    }

    const candidates = Array.from(candidateMap.values());
    const scored = candidates
      .map((memory) => ({
        memory,
        score: this.scoreMemory(memory, queryKeywords, intent, options.quickUseType, newMessage, selected),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.memory.createdAt.getTime() - a.memory.createdAt.getTime())
      .slice(0, options.limit || MAX_RELEVANT_MEMORIES)
      .map((entry) => entry.memory);

    return scored;
  }

  async getMemoriesByIds(userId: string, ids: string[]): Promise<RelevantQuickUseMemory[]> {
    const uniqueIds = uniqueStrings(ids, MAX_RELEVANT_MEMORIES);
    if (uniqueIds.length === 0) return [];

    const rows = await prisma.quickUseMemory.findMany({
      where: {
        userId,
        id: { in: uniqueIds },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((row) => this.inflateMemory(row));
  }

  toPreview(memory: RelevantQuickUseMemory): QuickUseMemoryPreview {
    return {
      id: memory.id,
      taskId: memory.taskId,
      type: memory.type,
      title: memory.title,
      summary: memory.summary,
      ageLabel: memory.ageLabel,
      createdAt: memory.createdAt.toISOString(),
      highlights: memory.highlights.slice(0, 3),
      sourceDomains: memorySourceDomains(memory).slice(0, 4),
      fileNames: memory.generatedFiles.map((file) => file.name).slice(0, 4),
    };
  }

  buildContextPrompt(memories: RelevantQuickUseMemory[], newMessage: string): string {
    if (memories.length === 0) return "";

    const intent = detectReferenceIntent(newMessage);
    const lines = [
      "Previous relevant Quick Use tasks:",
    ];

    for (const memory of memories.slice(0, MAX_RELEVANT_MEMORIES)) {
      lines.push(`- ${memory.ageLabel} (${memory.type}): ${memory.summary}`);

      if (memory.highlights.length > 0) {
        lines.push(`  Key results: ${memory.highlights.join("; ")}.`);
      }

      const domains = memorySourceDomains(memory);
      if (domains.length > 0) {
        lines.push(`  Sources: ${domains.join(", ")}.`);
      }

      const files = memory.generatedFiles
        .map((file) => file.workspacePath || file.name)
        .slice(0, 3);
      if (files.length > 0) {
        lines.push(`  Files: ${files.join(", ")}.`);
      }

      const previousResult = memory.fullResult?.markdown || memory.fullResult?.summary;
      if ((intent.update || intent.extend || intent.resend) && previousResult) {
        lines.push(`  Previous result excerpt: ${truncate(previousResult, 500)}`);
      }
    }

    lines.push(
      "The user may be referring to these earlier results. Use them for continuity, but verify fresh facts before presenting them as current."
    );

    if (intent.update) {
      lines.push("The user likely wants an update of the prior work. Preserve the original scope where it still applies and highlight changes.");
    }

    if (intent.extend) {
      lines.push("The user likely wants to extend prior work with additional items or angles. Reuse the earlier scope, then add the requested expansion.");
    }

    if (intent.resend) {
      lines.push("The user may want to reuse or resend a previously generated file. Mention any matching saved file when relevant.");
    }

    return lines.join("\n");
  }

  private inflateMemory(row: StoredMemoryRow): RelevantQuickUseMemory {
    const keyData = safeObject(row.keyData);
    const fullResult = asResult(row.result);
    const workspaceFiles = normalizeWorkspaceFiles(row.workspaceFiles);
    const urls = uniqueStrings([
      ...safeArray(keyData.urls).map((value) => String(value)),
      ...(fullResult?.sources || []).map((source) => source.url),
    ], 12);
    const sourceDomains = uniqueStrings([
      ...safeArray(keyData.sourceDomains).map((value) => String(value)),
      ...(fullResult?.sources || []).map((source) => source.domain || ""),
      ...extractDomains(urls),
    ], 10);
    const generatedFiles = workspaceFiles.length > 0
      ? workspaceFiles
      : (fullResult?.generatedFiles || []).map((file) => ({
          name: file.name,
          kind: file.kind,
          mimeType: file.mimeType,
          size: file.size,
          url: file.url,
        }));
    const highlights = uniqueStrings([
      ...safeArray(keyData.highlights).map((value) => String(value)),
      ...extractHighlights(`${row.summary}\n${fullResult?.summary || ""}`),
    ], 6);

    return {
      id: row.id,
      taskId: row.taskId,
      type: normalizeType(row.type),
      title: row.title || undefined,
      inputSummary: row.inputSummary,
      summary: row.summary,
      keyData,
      keywords: row.keywords,
      createdAt: row.createdAt,
      ageLabel: formatRelativeAge(row.createdAt),
      highlights,
      sourceDomains,
      visitedUrls: urls,
      generatedFiles,
      fullResult,
    };
  }

  private scoreMemory(
    memory: RelevantQuickUseMemory,
    queryKeywords: string[],
    intent: ReferenceIntent,
    quickUseType: QuickUseType | undefined,
    message: string,
    selected: RelevantQuickUseMemory[]
  ): number {
    let score = 0;
    const overlap = queryKeywords.filter((keyword) => memory.keywords.includes(keyword));
    score += overlap.length * 12;

    const lower = message.toLowerCase();
    for (const domain of memorySourceDomains(memory)) {
      if (domain && lower.includes(domain.toLowerCase())) {
        score += 8;
      }
    }

    const daysOld = Math.max(0, Math.floor((Date.now() - memory.createdAt.getTime()) / 86_400_000));
    score += Math.max(0, RECENT_MEMORY_DAYS - Math.min(daysOld, RECENT_MEMORY_DAYS));

    if (quickUseType && memory.type === quickUseType) {
      score += 4;
    }

    if (selected.some((entry) => entry.id === memory.id)) {
      score += 100;
    }

    if (intent.previous) score += 4;
    if (intent.temporal) score += scoreTemporalDistance(memory.createdAt, intent.targetDate);
    if (intent.update && memory.visitedUrls.length > 0) score += 5;
    if (intent.extend && (memory.visitedUrls.length > 0 || memory.highlights.length > 0)) score += 4;
    if (intent.resend && memory.generatedFiles.length > 0) score += 8;

    if (overlap.length === 0 && !intent.previous && !intent.temporal) {
      score -= 4;
    }

    return score;
  }

  private fallbackExtraction(
    context: SavedQuickUseTaskContext,
    workspaceFiles: WorkspaceFileReference[]
  ): {
    title: string;
    summary: string;
    keywords: string[];
    highlights: string[];
    sourceDomains: string[];
    urls: string[];
    generatedFiles: WorkspaceFileReference[];
    keyData: Record<string, unknown>;
  } {
    const result = context.result;
    const urls = uniqueStrings((result.sources || []).map((source) => source.url), 12);
    const sourceDomains = uniqueStrings(
      [
        ...(result.sources || []).map((source) => source.domain || ""),
        ...extractDomains(urls),
      ],
      10
    );
    const fileNames = uniqueStrings(workspaceFiles.map((file) => file.name), 6);
    const baseText = [
      context.inputMessage,
      result.title || "",
      result.summary,
      result.markdown || "",
      sourceDomains.join(" "),
      fileNames.join(" "),
    ].join("\n");
    const keywords = uniqueStrings(tokenize(baseText), 10);
    const highlights = uniqueStrings(
      [
        ...extractHighlights(baseText),
        ...(result.sources || []).slice(0, 3).map((source) => source.title),
        ...fileNames,
      ],
      6
    );

    return {
      title: result.title || truncate(context.inputMessage, 90),
      summary: truncate(result.summary || context.inputMessage, 320),
      keywords,
      highlights,
      sourceDomains,
      urls,
      generatedFiles: workspaceFiles,
      keyData: {
        highlights,
        sourceDomains,
        urls,
        generatedFiles: workspaceFiles,
        resultType: result.resultType,
      },
    };
  }

  private async extractMemorySummary(
    context: SavedQuickUseTaskContext,
    workspaceFiles: WorkspaceFileReference[]
  ): Promise<{
    title?: string;
    summary?: string;
    keywords?: string[];
    keyData?: Record<string, unknown>;
  } | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    try {
      const anthropic = new Anthropic({ apiKey });
      const result = sanitizeResultForStorage(context.result);
      const response = await anthropic.messages.create({
        model: MEMORY_MODEL,
        max_tokens: 600,
        system: `You extract reusable task memory for future continuity.

Return ONLY valid JSON with this shape:
{
  "title": "short task label",
  "summary": "one or two concise sentences",
  "keywords": ["5-10 lowercase keywords"],
  "keyData": {
    "highlights": ["short key results"],
    "sourceDomains": ["example.com"],
    "urls": ["https://example.com"],
    "generatedFiles": [{"name": "report.xlsx", "kind": "xlsx", "workspacePath": "quick-use/..."}]
  }
}

Rules:
- Keep the summary compact and factual.
- Include prices, names, dates, URLs, and generated files when present.
- Keywords should be useful for future lookup.
- Do not include base64 or large payloads.`,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              type: context.type,
              inputMessage: context.inputMessage,
              result,
              workspaceFiles,
            }),
          },
        ],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]) as {
        title?: string;
        summary?: string;
        keywords?: string[];
        keyData?: Record<string, unknown>;
      };

      return {
        title: typeof parsed.title === "string" ? parsed.title : undefined,
        summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
        keywords: Array.isArray(parsed.keywords)
          ? parsed.keywords.map((value) => String(value).toLowerCase())
          : undefined,
        keyData: safeObject(parsed.keyData),
      };
    } catch {
      return null;
    }
  }

  private async persistGeneratedFiles(
    userId: string,
    taskId: string,
    generatedFiles?: QuickUseGeneratedFile[]
  ): Promise<WorkspaceFileReference[]> {
    if (!generatedFiles?.length) return [];

    const workspace = new AgentWorkspace();
    const datePrefix = new Date().toISOString().slice(0, 10);
    const stored: WorkspaceFileReference[] = [];

    for (const file of generatedFiles.slice(0, 5)) {
      const fallback: WorkspaceFileReference = {
        name: file.name,
        kind: file.kind,
        mimeType: file.mimeType,
        size: file.size,
        url: file.url,
      };

      try {
        const response = await fetch(file.url);
        if (!response.ok) {
          stored.push(fallback);
          continue;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const path = `quick-use/${datePrefix}/${taskId}/${slugify(file.name)}`;
        const saved = await workspace.saveFile(
          QUICK_USE_WORKSPACE_AGENT_ID,
          userId,
          path,
          buffer,
          file.mimeType
        );

        stored.push({
          ...fallback,
          workspacePath: path,
          storageUrl: saved.storageUrl,
        });
      } catch {
        stored.push(fallback);
      }
    }

    return stored;
  }
}

export const quickUseSessionMemory = new QuickUseSessionMemory();
