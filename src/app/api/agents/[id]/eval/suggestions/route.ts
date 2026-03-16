import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  analyzeKnowledgeGaps,
  generateFixSuggestions,
} from "@/lib/eval-auto-fix";
import {
  chunkText,
  generateEmbeddings,
  storeChunks,
} from "@/lib/rag";
import { deductEmbeddingCredits } from "@/lib/credits";

// GET — Wissenslücken analysieren und Vorschläge generieren
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
      select: { id: true },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const gaps = await analyzeKnowledgeGaps(params.id);
    const suggestions = await generateFixSuggestions(params.id, gaps);

    return Response.json({ gaps, suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST — Vorschlag anwenden
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
      select: { id: true, systemPrompt: true, userId: true },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const body = await request.json();
    const { type, payload } = body;

    if (!type || !payload) {
      return Response.json({ error: "type and payload are required" }, { status: 400 });
    }

    // --- Knowledge Base FAQ Eintrag erstellen ---
    if (type === "knowledge") {
      const { question, answer } = payload;
      if (!question || !answer) {
        return Response.json({ error: "question and answer are required" }, { status: 400 });
      }

      const textContent = `Frage: ${question}\nAntwort: ${answer}`;

      const kb = await prisma.knowledgeBase.create({
        data: {
          agentId: params.id,
          type: "FAQ",
          sourceName: `FAQ: ${question.slice(0, 50)}`,
          content: textContent,
          embeddingStatus: "PROCESSING",
        },
      });

      // Embedding im Hintergrund
      waitUntil(
        (async () => {
          try {
            const chunks = chunkText(textContent);
            const embeddings = await generateEmbeddings(chunks);
            await storeChunks(kb.id, params.id, chunks, embeddings);
            await prisma.knowledgeBase.update({
              where: { id: kb.id },
              data: { chunkCount: chunks.length, embeddingStatus: "READY" },
            });
            deductEmbeddingCredits(agent.userId, chunks.length, params.id).catch((err) => {
              console.error("Eval suggestion embedding credit deduction failed:", err);
            });
          } catch (err) {
            console.error(`Eval suggestion embedding failed for ${kb.id}:`, err);
            await prisma.knowledgeBase.update({
              where: { id: kb.id },
              data: { embeddingStatus: "ERROR" },
            }).catch(() => {});
          }
        })()
      );

      return Response.json({ success: true, type: "knowledge", id: kb.id });
    }

    // --- System Prompt erweitern ---
    if (type === "prompt") {
      const { addition } = payload;
      if (!addition || typeof addition !== "string") {
        return Response.json({ error: "addition is required" }, { status: 400 });
      }

      const newPrompt = (agent.systemPrompt || "") + addition;
      await prisma.agent.update({
        where: { id: params.id },
        data: { systemPrompt: newPrompt },
      });

      return Response.json({ success: true, type: "prompt" });
    }

    // --- Test Case erstellen ---
    if (type === "test") {
      const { name, inputMessage, expectedKeywords } = payload;
      if (!name || !inputMessage || !expectedKeywords?.length) {
        return Response.json(
          { error: "name, inputMessage, and expectedKeywords are required" },
          { status: 400 }
        );
      }

      // Max 50 Test Cases pro Agent
      const count = await prisma.agentTestCase.count({ where: { agentId: params.id } });
      if (count >= 50) {
        return Response.json({ error: "Maximum 50 test cases reached" }, { status: 400 });
      }

      const testCase = await prisma.agentTestCase.create({
        data: {
          agentId: params.id,
          name,
          inputMessage,
          expectedKeywords,
        },
      });

      return Response.json({ success: true, type: "test", id: testCase.id });
    }

    return Response.json({ error: "Invalid type. Use 'knowledge', 'prompt', or 'test'." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
