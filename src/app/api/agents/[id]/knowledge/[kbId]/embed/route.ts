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
  // Auth: CRON_SECRET
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await request.json() as { userId: string };
  const { id: agentId, kbId } = params;

  // Load the KB entry to get the text content
  const kb = await prisma.knowledgeBase.findFirst({
    where: { id: kbId, agentId },
  });
  if (!kb) {
    return Response.json({ error: "KB entry not found" }, { status: 404 });
  }

  const textContent = kb.content || "";
  if (!textContent.trim()) {
    return Response.json({ error: "No content to embed" }, { status: 400 });
  }

  let chunksProcessed = 0;
  const startTime = Date.now();

  try {
    const chunks = chunkText(textContent);

    // Abort controller for hard timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

    try {
      chunksProcessed = await generateEmbeddingsBatched(
        chunks,
        async (batchChunks, batchEmbeddings, batchStartIndex) => {
          await storeChunks(kbId, agentId, batchChunks, batchEmbeddings);

          // Update chunk count progressively
          await prisma.knowledgeBase.update({
            where: { id: kbId },
            data: { chunkCount: batchStartIndex + batchChunks.length },
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

    if (!allDone) {
      console.warn(`Knowledge ${kbId}: timeout — ${chunksProcessed}/${chunks.length} chunks in ${Math.round(elapsed / 1000)}s`);
    }

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
    console.error(`Embedding failed for ${kbId}:`, message);

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
