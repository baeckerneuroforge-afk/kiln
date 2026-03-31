import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  chunkText,
  generateEmbeddingsBatched,
  storeChunks,
  fetchUrlContent,
} from "@/lib/rag";
import { deductEmbeddingCredits } from "@/lib/credits";

// Load knowledge base entries
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const entries = await prisma.knowledgeBase.findMany({
      where: { agentId: params.id },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(entries);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/** Max time for background embedding before we save partial results */
const EMBEDDING_TIMEOUT_MS = 55_000;

// Background: process text → chunks → embeddings (batched) → store progressively
async function processKnowledgeEntry(
  kbId: string,
  agentId: string,
  userId: string,
  textContent: string
) {
  const startTime = Date.now();
  let chunksProcessed = 0;

  try {
    const chunks = chunkText(textContent);

    // Abort controller for timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

    try {
      chunksProcessed = await generateEmbeddingsBatched(
        chunks,
        async (batchChunks, batchEmbeddings, batchStartIndex) => {
          // Save each batch immediately so progress is not lost
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
        embeddingStatus: allDone ? "READY" : "READY",
        // Store partial info in content footer if not all chunks were processed
        ...(!allDone && {
          content: textContent.slice(0, 50000) +
            `\n\n[KILN: ${chunksProcessed}/${chunks.length} Chunks verarbeitet in ${Math.round(elapsed / 1000)}s]`,
        }),
      },
    });

    if (!allDone) {
      console.warn(
        `Knowledge ${kbId}: timeout after ${Math.round(elapsed / 1000)}s — saved ${chunksProcessed}/${chunks.length} chunks`
      );
    }

    // Deduct embedding credits (fire-and-forget)
    deductEmbeddingCredits(userId, chunksProcessed, agentId).catch((err) => {
      console.error("Knowledge embedding credit deduction failed:", err);
    });
  } catch (err) {
    console.error(`Knowledge embedding failed for ${kbId}:`, err instanceof Error ? err.message : err);

    // If some chunks were saved before the error, mark as READY (partial data is better than nothing)
    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: {
        embeddingStatus: chunksProcessed > 0 ? "READY" : "ERROR",
        chunkCount: chunksProcessed,
      },
    }).catch(() => {});

    // Deduct credits for whatever was processed
    if (chunksProcessed > 0) {
      deductEmbeddingCredits(userId, chunksProcessed, agentId).catch(() => {});
    }
  }
}

// Create new knowledge base entry + process async
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") || "";

    let type: "PDF" | "URL" | "FAQ" | "TEXT";
    let sourceName: string;
    let textContent: string;

    if (contentType.includes("multipart/form-data")) {
      // PDF Upload — parse synchronously (needs request body), embed async
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return Response.json(
          { error: "No file uploaded" },
          { status: 400 }
        );
      }

      type = "PDF";
      sourceName = file.name;

      // Upload to Supabase Storage
      const supabase = getSupabaseAdmin();
      const filePath = `knowledge/${params.id}/${Date.now()}-${file.name}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("knowledge-files")
        .upload(filePath, buffer, {
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error(`Upload error: ${uploadError.message}`);
      }

      // Extract PDF text
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse");
      const pdfData = await pdfParse(buffer);
      textContent = pdfData.text;
    } else {
      // JSON Body: URL, FAQ, or Text
      const body = await request.json();

      if (body.type === "URL") {
        type = "URL";
        sourceName = body.url;
        // URL fetch happens synchronously so we can validate content before creating the KB entry
        textContent = await fetchUrlContent(body.url);
      } else if (body.type === "FAQ") {
        type = "FAQ";
        sourceName = body.title || "FAQ";
        textContent = (body.pairs || [])
          .map(
            (p: { question: string; answer: string }) =>
              `Frage: ${p.question}\nAntwort: ${p.answer}`
          )
          .join("\n\n");
      } else {
        type = "TEXT";
        sourceName = body.title || "Text";
        textContent = body.content || "";
      }
    }

    if (!textContent.trim()) {
      return Response.json(
        { error: "No text content extracted" },
        { status: 400 }
      );
    }

    // Create KB entry with PROCESSING status
    const kb = await prisma.knowledgeBase.create({
      data: {
        agentId: params.id,
        type,
        sourceName,
        content: textContent.slice(0, 50000),
        embeddingStatus: "PROCESSING",
      },
    });

    // Run heavy embedding work in background via waitUntil
    waitUntil(processKnowledgeEntry(kb.id, params.id, userId, textContent));

    // Return immediately with 202
    return Response.json(
      { ...kb, status: "processing", id: kb.id },
      { status: 202 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
