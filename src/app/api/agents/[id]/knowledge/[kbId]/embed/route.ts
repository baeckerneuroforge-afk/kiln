import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  chunkText,
  generateEmbeddingsBatched,
  storeChunks,
} from "@/lib/rag";
import { deductEmbeddingCredits } from "@/lib/credits";
import { timingSafeBearer } from "@/lib/api-auth";

/** Hard timeout — leave 10s margin for Vercel function limit */
const EMBED_TIMEOUT_MS = 50_000;

/**
 * Internal endpoint: generates embeddings for a KB entry in batches.
 * Called from the main knowledge POST route or retried from the UI.
 * Auth: CRON_SECRET Bearer token OR Clerk session (client retry).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; kbId: string } }
) {
  console.warn(`[EMBED] === Handler entered, kbId: ${params.kbId}, agentId: ${params.id}`);

  // Auth: CRON_SECRET (server-side trigger) or Clerk (client-side retry).
  // Strict timing-safe check (no dev fail-open) so the Clerk fallback below
  // stays reachable when CRON_SECRET is unset.
  const isCronAuth = timingSafeBearer(request.headers.get("authorization"), process.env.CRON_SECRET);

  let userId: string;

  if (isCronAuth) {
    const body = await request.json().catch(() => ({})) as { userId?: string };
    userId = body.userId || "system";
    console.warn(`[EMBED] Auth: CRON_SECRET, userId: ${userId}`);
  } else {
    // Client-side retry — check Clerk auth
    console.warn(`[EMBED] Auth: trying Clerk (no CRON_SECRET match)`);
    const { auth } = await import("@clerk/nextjs/server");
    const session = await auth();
    if (!session.userId) {
      console.warn(`[EMBED] Auth failed: no Clerk session`);
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = session.userId;

    // Verify agent ownership
    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      console.warn(`[EMBED] Auth failed: agent not found for user ${userId}`);
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }
  }

  const { id: agentId, kbId } = params;

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

  console.warn(`[EMBED] ${kbId}: content length ${textContent.length}, current status ${kb.embeddingStatus}, chunks ${kb.chunkCount}`);

  // Clear existing chunks (retry case — avoid duplicates)
  if (kb.chunkCount > 0) {
    try {
      const { getSupabaseAdmin } = await import("@/lib/supabase");
      await getSupabaseAdmin()
        .from("knowledge_chunks")
        .delete()
        .eq("knowledge_base_id", kbId);
      console.warn(`[EMBED] ${kbId}: cleared ${kb.chunkCount} existing chunks`);
    } catch (clearErr) {
      console.warn(`[EMBED] ${kbId}: failed to clear chunks:`, clearErr instanceof Error ? clearErr.message : clearErr);
    }
  }

  // Mark as PROCESSING
  await prisma.knowledgeBase.update({
    where: { id: kbId },
    data: { embeddingStatus: "PROCESSING", chunkCount: 0 },
  });

  // Check OpenAI API key
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  console.warn(`[EMBED] ${kbId}: OPENAI_API_KEY present: ${hasOpenAIKey}`);
  if (!hasOpenAIKey) {
    console.warn(`[EMBED] ${kbId}: FATAL — no OPENAI_API_KEY`);
    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: { embeddingStatus: "ERROR" },
    });
    return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let chunksProcessed = 0;
  const startTime = Date.now();

  try {
    const chunks = chunkText(textContent);
    console.warn(`[EMBED] ${kbId}: ${chunks.length} chunks to embed`);

    // Abort controller for hard timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

    try {
      chunksProcessed = await generateEmbeddingsBatched(
        chunks,
        async (batchChunks, batchEmbeddings, batchStartIndex) => {
          console.warn(`[EMBED] ${kbId}: storing batch at index ${batchStartIndex}, ${batchChunks.length} chunks, embedding dim ${batchEmbeddings[0]?.length}`);

          try {
            await storeChunks(kbId, agentId, batchChunks, batchEmbeddings);
          } catch (storeErr) {
            console.warn(`[EMBED] ${kbId}: storeChunks FAILED:`, storeErr instanceof Error ? storeErr.message : storeErr);
            throw storeErr;
          }

          const done = batchStartIndex + batchChunks.length;
          console.warn(`[EMBED] ${kbId}: batch saved, ${done}/${chunks.length} total`);

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

    console.warn(`[EMBED] ${kbId}: ${allDone ? "DONE" : "PARTIAL"} — ${chunksProcessed}/${chunks.length} in ${Math.round(elapsed / 1000)}s`);

    deductEmbeddingCredits(userId, chunksProcessed, agentId).catch((err) => {
      console.warn(`[EMBED] ${kbId}: credit deduction failed:`, err instanceof Error ? err.message : err);
    });

    return Response.json({
      success: true,
      chunksProcessed,
      totalChunks: chunks.length,
      durationMs: elapsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const stack = err instanceof Error ? err.stack?.split("\n").slice(0, 3).join(" | ") : "";
    console.warn(`[EMBED] ${kbId}: FAILED after ${chunksProcessed} chunks — ${message}`);
    if (stack) console.warn(`[EMBED] ${kbId}: stack: ${stack}`);

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
