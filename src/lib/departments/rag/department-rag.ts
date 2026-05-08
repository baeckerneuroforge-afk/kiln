import { prisma } from "@/lib/prisma";
import { generateEmbedding, searchRelevantChunks } from "@/lib/rag";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface KnowledgeMatch {
  knowledgeBaseId: string;
  sourceName: string;
  content: string;
  similarity: number;
}

export interface GetKnowledgeArgs {
  departmentId: string;
  query: string;
  maxResults?: number;
  fallbackAgentId?: string | null;
  orgId?: string | null;
  userId?: string | null;
}

const DEFAULT_LIMIT = 5;
const SIMILARITY_THRESHOLD = 0.7;

export async function getRelevantKnowledgeForDepartment(
  args: GetKnowledgeArgs
): Promise<KnowledgeMatch[]> {
  const department = await prisma.department.findUnique({
    where: { id: args.departmentId },
    select: {
      id: true,
      useKnowledgeBase: true,
      knowledgeBaseId: true,
      orgId: true,
      userId: true,
    },
  });

  if (!department || !department.useKnowledgeBase) return [];

  const limit = args.maxResults ?? DEFAULT_LIMIT;
  const orgId = args.orgId ?? department.orgId ?? null;

  if (department.knowledgeBaseId) {
    return searchByKnowledgeBaseId({
      knowledgeBaseId: department.knowledgeBaseId,
      query: args.query,
      limit,
      orgId,
    });
  }

  if (args.fallbackAgentId) {
    const chunks = await searchRelevantChunks(
      args.fallbackAgentId,
      args.query,
      limit,
      orgId ?? undefined
    );
    if (chunks.length === 0) return [];

    const kbName = await resolveAgentKnowledgeBaseName(args.fallbackAgentId);
    return chunks.map((chunk) => ({
      knowledgeBaseId: kbName.id || args.fallbackAgentId!,
      sourceName: kbName.sourceName || "Agent knowledge base",
      content: chunk.content,
      similarity: chunk.similarity,
    }));
  }

  return [];
}

async function searchByKnowledgeBaseId(args: {
  knowledgeBaseId: string;
  query: string;
  limit: number;
  orgId: string | null;
}): Promise<KnowledgeMatch[]> {
  const kb = await prisma.knowledgeBase.findUnique({
    where: { id: args.knowledgeBaseId },
    select: { id: true, sourceName: true, orgId: true, agentId: true },
  });
  if (!kb) return [];

  if (args.orgId && kb.orgId && kb.orgId !== args.orgId) {
    return [];
  }

  if (kb.agentId) {
    return searchByAgentAndFilterKb({
      kbId: kb.id,
      kbSourceName: kb.sourceName,
      agentId: kb.agentId,
      query: args.query,
      limit: args.limit,
      orgId: args.orgId,
    });
  }

  return searchLexically({
    knowledgeBaseId: kb.id,
    sourceName: kb.sourceName,
    query: args.query,
    limit: args.limit,
  });
}

async function searchByAgentAndFilterKb(args: {
  kbId: string;
  kbSourceName: string;
  agentId: string;
  query: string;
  limit: number;
  orgId: string | null;
}): Promise<KnowledgeMatch[]> {
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(args.query);
  } catch (err) {
    console.error("[department-rag] embedding failed", err);
    return [];
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_agent_id: args.agentId,
    match_threshold: SIMILARITY_THRESHOLD,
    match_count: args.limit * 2,
    target_org_id: args.orgId,
  });

  if (error || !data) {
    console.error("[department-rag] rpc failed", error?.message);
    return [];
  }

  return (data as Array<{
    knowledge_base_id: string;
    content: string;
    similarity: number;
  }>)
    .filter((row) => row.knowledge_base_id === args.kbId)
    .slice(0, args.limit)
    .map((row) => ({
      knowledgeBaseId: row.knowledge_base_id,
      sourceName: args.kbSourceName,
      content: row.content,
      similarity: row.similarity,
    }));
}

async function searchLexically(args: {
  knowledgeBaseId: string;
  sourceName: string;
  query: string;
  limit: number;
}): Promise<KnowledgeMatch[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("id, knowledge_base_id, content")
    .eq("knowledge_base_id", args.knowledgeBaseId)
    .limit(args.limit * 4);

  if (error || !data) return [];

  return (data as Array<{ knowledge_base_id: string; content: string }>)
    .map((row) => ({
      knowledgeBaseId: row.knowledge_base_id,
      sourceName: args.sourceName,
      content: row.content,
      similarity: estimateSimilarity(args.query, row.content),
    }))
    .filter((match) => match.similarity >= SIMILARITY_THRESHOLD * 0.5)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, args.limit);
}

async function resolveAgentKnowledgeBaseName(
  agentId: string
): Promise<{ id: string | null; sourceName: string | null }> {
  const kb = await prisma.knowledgeBase.findFirst({
    where: { agentId },
    select: { id: true, sourceName: true },
    orderBy: { createdAt: "desc" },
  });
  return { id: kb?.id ?? null, sourceName: kb?.sourceName ?? null };
}

function estimateSimilarity(query: string, content: string): number {
  const queryTokens = tokenize(query);
  const contentTokens = new Set(tokenize(content));
  if (queryTokens.length === 0 || contentTokens.size === 0) return 0;

  const matches = queryTokens.filter((token) => contentTokens.has(token)).length;
  return matches / queryTokens.length;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9äöüß]+/iu)
    .filter((token) => token.length >= 3);
}

