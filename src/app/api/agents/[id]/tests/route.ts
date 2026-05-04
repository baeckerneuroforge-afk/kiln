import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { searchRelevantChunks } from "@/lib/rag";
import { decrypt } from "@/lib/encryption";
import { deductCredits } from "@/lib/credits";

export const dynamic = "force-dynamic";

// GET — Test Cases und Test Runs laden
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (type === "runs") {
    const runs = await prisma.agentTestRun.findMany({
      where: { agentId: params.id },
      orderBy: { runAt: "desc" },
      take: 30,
    });
    return Response.json(runs);
  }

  const testCases = await prisma.agentTestCase.findMany({
    where: { agentId: params.id },
    orderBy: { createdAt: "asc" },
  });

  return Response.json(testCases);
}

// POST — Neuen Test Case erstellen oder Tests ausführen
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
    include: {
      knowledgeBases: { where: { embeddingStatus: "READY" } },
    },
  });
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await request.json();

  // Test Case erstellen
  if (body.action === "create") {
    const { name, inputMessage, expectedKeywords } = body;
    if (!name || !inputMessage || !expectedKeywords?.length) {
      return Response.json(
        { error: "Name, input message, and at least one expected keyword are required." },
        { status: 400 }
      );
    }

    // Max 50 Test Cases pro Agent
    const count = await prisma.agentTestCase.count({ where: { agentId: params.id } });
    if (count >= 50) {
      return Response.json({ error: "Maximum 50 test cases per agent." }, { status: 400 });
    }

    const testCase = await prisma.agentTestCase.create({
      data: {
        agentId: params.id,
        name,
        inputMessage,
        expectedKeywords,
      },
    });
    return Response.json(testCase, { status: 201 });
  }

  // Tests ausführen
  if (body.action === "run") {
    const testCases = await prisma.agentTestCase.findMany({
      where: { agentId: params.id },
      orderBy: { createdAt: "asc" },
    });

    if (testCases.length === 0) {
      return Response.json({ error: "No test cases to run." }, { status: 400 });
    }

    // BYOK prüfen
    const selectedModel = agent.llmModel || "claude-sonnet-4-6";
    const modelProvider = MODEL_PROVIDER_MAP[selectedModel] || "ANTHROPIC";
    let client: Anthropic;

    try {
      const apiKeyRecord = await prisma.apiKey.findUnique({
        where: { userId_provider: { userId: agent.userId, provider: modelProvider.toLowerCase() } },
      });
      if (apiKeyRecord) {
        client = getClaudeClientWithKey(decrypt(apiKeyRecord.encryptedKey));
      } else {
        client = getClaudeClient();
      }
    } catch {
      client = getClaudeClient();
    }

    const model = selectedModel.startsWith("gpt") ? "claude-sonnet-4-6" : selectedModel;
    let passed = 0;
    let failed = 0;
    const results: { id: string; result: string; response: string; matchedKeywords: string[]; missedKeywords: string[] }[] = [];

    for (const tc of testCases) {
      try {
        // RAG-Kontext für diesen Test laden
        let knowledgeContext = "";
        if (agent.knowledgeBases.length > 0) {
          try {
            const chunks = await searchRelevantChunks(params.id, tc.inputMessage, 5);
            if (chunks.length > 0) {
              knowledgeContext =
                "\n\n---\nRELEVANT KNOWLEDGE BASE CONTEXT:\n" +
                chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n") +
                "\n---";
            }
          } catch {
            // RAG fehlgeschlagen
          }
        }

        const systemPrompt = agent.systemPrompt + knowledgeContext;

        const response = await client.messages.create({
          model,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: tc.inputMessage }],
        });

        const responseText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");

        // Deduct credits per test case (fire-and-forget)
        waitUntil(
          deductCredits(agent.userId, model, "CHAT", params.id).catch((err) => {
            console.error("Agent test credit deduction failed:", err);
          })
        );

        // Keywords prüfen (case-insensitive)
        const keywords = tc.expectedKeywords as string[];
        const responseLower = responseText.toLowerCase();
        const matchedKeywords = keywords.filter((k) => responseLower.includes(k.toLowerCase()));
        const missedKeywords = keywords.filter((k) => !responseLower.includes(k.toLowerCase()));
        const testPassed = missedKeywords.length === 0;

        if (testPassed) passed++;
        else failed++;

        const result = testPassed ? "PASS" : "FAIL";

        // Test Case aktualisieren
        await prisma.agentTestCase.update({
          where: { id: tc.id },
          data: {
            lastResult: result,
            lastResponse: responseText.slice(0, 5000),
            lastRunAt: new Date(),
          },
        });

        results.push({
          id: tc.id,
          result,
          response: responseText.slice(0, 500),
          matchedKeywords,
          missedKeywords,
        });
      } catch (err) {
        failed++;
        const errorMsg = err instanceof Error ? err.message : "Test execution failed";

        await prisma.agentTestCase.update({
          where: { id: tc.id },
          data: {
            lastResult: "FAIL",
            lastResponse: `ERROR: ${errorMsg}`,
            lastRunAt: new Date(),
          },
        });

        results.push({
          id: tc.id,
          result: "FAIL",
          response: `ERROR: ${errorMsg}`,
          matchedKeywords: [],
          missedKeywords: (tc.expectedKeywords as string[]),
        });
      }
    }

    const total = passed + failed;
    const score = total > 0 ? passed / total : 0;

    // Test Run speichern
    await prisma.agentTestRun.create({
      data: {
        agentId: params.id,
        totalTests: total,
        passed,
        failed,
        score,
      },
    });

    return Response.json({ total, passed, failed, score, results });
  }

  return Response.json({ error: "Invalid action. Use 'create' or 'run'." }, { status: 400 });
}

// PATCH — Test Case aktualisieren
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const body = await request.json();
  const { testCaseId, name, inputMessage, expectedKeywords } = body;

  if (!testCaseId) {
    return Response.json({ error: "testCaseId is required." }, { status: 400 });
  }

  const existing = await prisma.agentTestCase.findFirst({
    where: { id: testCaseId, agentId: params.id },
  });
  if (!existing) {
    return Response.json({ error: "Test case not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (name) updateData.name = name;
  if (inputMessage) updateData.inputMessage = inputMessage;
  if (expectedKeywords) updateData.expectedKeywords = expectedKeywords;

  const updated = await prisma.agentTestCase.update({
    where: { id: testCaseId },
    data: updateData,
  });

  return Response.json(updated);
}

// DELETE — Test Case löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const { searchParams } = new URL(request.url);
  const testCaseId = searchParams.get("testCaseId");

  if (!testCaseId) {
    return Response.json({ error: "testCaseId is required." }, { status: 400 });
  }

  const existing = await prisma.agentTestCase.findFirst({
    where: { id: testCaseId, agentId: params.id },
  });
  if (!existing) {
    return Response.json({ error: "Test case not found" }, { status: 404 });
  }

  await prisma.agentTestCase.delete({ where: { id: testCaseId } });
  return Response.json({ success: true });
}
