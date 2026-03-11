import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { chunkText, generateEmbeddings, storeChunks } from "@/lib/rag";

// Korrektur speichern: FAQ-Paar → KB → Embedding → pgvector
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

    const body = await request.json();
    const { userMessage, correctAnswer, messageId } = body;

    if (!userMessage || !correctAnswer) {
      return Response.json(
        { error: "userMessage and correctAnswer are required" },
        { status: 400 }
      );
    }

    // FAQ-Text formatieren
    const faqContent = `Frage: ${userMessage}\nAntwort: ${correctAnswer}`;

    // KB-Eintrag als FAQ erstellen (status: PROCESSING)
    const kb = await prisma.knowledgeBase.create({
      data: {
        agentId: params.id,
        type: "FAQ",
        sourceName: `Correction: ${userMessage.slice(0, 60)}`,
        content: faqContent,
        embeddingStatus: "PROCESSING",
      },
    });

    // Chunking + Embedding
    try {
      const chunks = chunkText(faqContent);
      const embeddings = await generateEmbeddings(chunks);
      await storeChunks(kb.id, params.id, chunks, embeddings);

      await prisma.knowledgeBase.update({
        where: { id: kb.id },
        data: {
          chunkCount: chunks.length,
          embeddingStatus: "READY",
        },
      });

      return Response.json({
        success: true,
        knowledgeBaseId: kb.id,
        chunkCount: chunks.length,
        messageId,
      });
    } catch (embeddingError) {
      // Embedding failed → Trotzdem FAQ gespeichert, nur ohne Embedding
      await prisma.knowledgeBase.update({
        where: { id: kb.id },
        data: { embeddingStatus: "ERROR" },
      });

      const errMsg =
        embeddingError instanceof Error
          ? embeddingError.message
          : "Embedding error";
      return Response.json(
        { success: true, knowledgeBaseId: kb.id, embeddingError: errMsg },
        { status: 200 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
