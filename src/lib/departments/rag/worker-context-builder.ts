import {
  getRelevantKnowledgeForDepartment,
  type KnowledgeMatch,
} from "./department-rag";

const KB_AWARE_ROLES = new Set(["L1_SUPPORT", "L2_SUPPORT"]);

export interface BuildWorkerContextArgs {
  departmentId: string;
  workerRole: string;
  fallbackAgentId: string | null;
  ticketContent: string;
  orgId: string | null;
  userId: string | null;
  baseSystemPrompt: string;
  maxResults?: number;
}

export interface BuildWorkerContextResult {
  systemPrompt: string;
  knowledgeContext: string;
  knowledgeSources: KnowledgeMatch[];
  used: boolean;
}

export function isKnowledgeBaseRole(role: string): boolean {
  return KB_AWARE_ROLES.has(role);
}

export async function buildWorkerContext(
  args: BuildWorkerContextArgs
): Promise<BuildWorkerContextResult> {
  if (!isKnowledgeBaseRole(args.workerRole)) {
    return {
      systemPrompt: args.baseSystemPrompt,
      knowledgeContext: "",
      knowledgeSources: [],
      used: false,
    };
  }

  let matches: KnowledgeMatch[] = [];
  try {
    matches = await getRelevantKnowledgeForDepartment({
      departmentId: args.departmentId,
      query: args.ticketContent,
      maxResults: args.maxResults ?? 5,
      fallbackAgentId: args.fallbackAgentId,
      orgId: args.orgId,
      userId: args.userId,
    });
  } catch (err) {
    console.error("[worker-context] KB lookup failed", err);
    return {
      systemPrompt: args.baseSystemPrompt,
      knowledgeContext: "",
      knowledgeSources: [],
      used: false,
    };
  }

  if (matches.length === 0) {
    return {
      systemPrompt: args.baseSystemPrompt,
      knowledgeContext: "",
      knowledgeSources: [],
      used: true,
    };
  }

  const knowledgeContext = formatKnowledgeContext(matches);
  return {
    systemPrompt: `${args.baseSystemPrompt}\n\n${knowledgeContext}`,
    knowledgeContext,
    knowledgeSources: matches,
    used: true,
  };
}

export function formatKnowledgeContext(matches: KnowledgeMatch[]): string {
  if (matches.length === 0) return "";

  const entries = matches
    .map((match, index) => {
      const heading = `[Entry ${index + 1}: ${match.sourceName}]`;
      return `${heading}\n${match.content.trim()}`;
    })
    .join("\n\n");

  return `Based on the following knowledge base entries:\n\n${entries}`;
}
