import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  chunkText,
  generateEmbeddingsBatched,
  storeChunks,
} from "@/lib/rag";
import { deductEmbeddingCredits } from "@/lib/credits";

/** Hard timeout — leave 10s margin for Vercel function limit */
const EMBED_TIMEOUT_MS = 50_000;

/**
 * Internal endpoint: generates embeddings for a KB entry in batches.
 * Called fire-and-forget from the main knowledge POST route.
 * Auth: CRON_SECRET Bearer token (not Clerk — runs as background job).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; kbId: string } }
) {
  // Auth: CRON_SECRET (server-side trigger) or Clerk (client-side retry)
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  let userId: string;

  if (isCronAuth) {
    // Server-side trigger — userId in body
    const body = await request.json().catch(() => ({})) as { userId?: string };
    userId = body.userId || "system";
  } else {
    // Client-side retry — check Clerk auth
    const { auth } = await import("@clerk/nextjs/server");
    const session = await auth();
    if (!session.userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = session.userId;

    // Verify agent ownership
    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }
  }

  const { id: agentId, kbId } = params;

  console.warn(`[EMBED] Started for KB: ${kbId}, agent: ${agentId}`);

  // Load the KB entry to get the text content
  const kb = await prisma.knowledgeBase.findFirst({
    where: { id: kbId, agentId },
  });
  if (!kb) {
    console.warn(`[EMBED] KB not found: ${kbId}`);
    return Response.json({ error: "KB entry not found" }, { status: 404 });
  }

  const textContent = kb.content || "";
  if (!textContent.trim()) {
    console.warn(`[EMBED] No content for KB: ${kbId}`);
    return Response.json({ error: "No content to embed" }, { status: 400 });
  }

  // Clear existing chunks (retry case — avoid duplicates)
  if (kb.chunkCount > 0) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    await getSupabaseAdmin()
      .from("knowledge_chunks")
      .delete()
      .eq("knowledge_base_id", kbId);
    console.warn(`[EMBED] ${kbId}: cleared ${kb.chunkCount} existing chunks (retry)`);
  }

  // Mark as PROCESSING
  await prisma.knowledgeBase.update({
    where: { id: kbId },
    data: { embeddingStatus: "PROCESSING", chunkCount: 0 },
  });

  let chunksProcessed = 0;
  const startTime = Date.now();

  try {
    const chunks = chunkText(textContent);
    console.warn(`[EMBED] ${kbId}: ${chunks.length} chunks to process`);

    // Abort controller for hard timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

    try {
      chunksProcessed = await generateEmbeddingsBatched(
        chunks,
        async (batchChunks, batchEmbeddings, batchStartIndex) => {
          await storeChunks(kbId, agentId, batchChunks, batchEmbeddings);

          const done = batchStartIndex + batchChunks.length;
          console.warn(`[EMBED] ${kbId}: batch done, ${done}/${chunks.length} chunks saved`);

          // Update chunk count progressively
          await prisma.knowledgeBase.update({
            where: { id: kbId },
            data: { chunkCount: done },
          });
        },
        controller.signal,
      );
    } finally {
      clearTimeout(timer);
    }

    const allDone = chunksProcessed >= chunks.length;
    const elapsed = Date.now() - startTime;

    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: {
        chunkCount: chunksProcessed,
        embeddingStatus: "READY",
        ...(!allDone && {
          content: textContent.slice(0, 50000) +
            `\n\n[KILN: ${chunksProcessed}/${chunks.length} Chunks verarbeitet in ${Math.round(elapsed / 1000)}s]`,
        }),
      },
    });

    console.warn(`[EMBED] ${kbId}: ${allDone ? "DONE" : "PARTIAL"} — ${chunksProcessed}/${chunks.length} chunks in ${Math.round(elapsed / 1000)}s`);

    // Deduct embedding credits
    deductEmbeddingCredits(userId, chunksProcessed, agentId).catch((err) => {
      console.error("Embedding credit deduction failed:", err);
    });

    return Response.json({
      success: true,
      chunksProcessed,
      totalChunks: chunks.length,
      durationMs: elapsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn(`[EMBED] ${kbId}: ERROR after ${chunksProcessed} chunks — ${message}`);

    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: {
        embeddingStatus: chunksProcessed > 0 ? "READY" : "ERROR",
        chunkCount: chunksProcessed,
      },
    }).catch(() => {});

    if (chunksProcessed > 0) {
      deductEmbeddingCredits(userId, chunksProcessed, agentId).catch(() => {});
    }

    return Response.json({ error: message, chunksProcessed }, { status: 500 });
  }
}
