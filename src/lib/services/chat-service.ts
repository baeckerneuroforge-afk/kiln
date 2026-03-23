import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunks } from "@/lib/rag";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { decrypt } from "@/lib/encryption";
import crypto from "crypto";
import { deductCredits } from "@/lib/credits";

// Textinhalt aus einer Nachricht extrahieren (string oder multimodales content-array)
export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text)
      .join(" ");
  }
  return "";
}

// Stabiler Hash aus sessionId für Memory-Zuordnung
export function hashSession(sessionId: string): string {
  return crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
}

// Nach Conversation-Ende: Fakten extrahieren und als Memories speichern
export async function extractAndSaveMemories(
  agentId: string,
  sessionHash: string,
  messages: { role: string; content: string }[],
  client: Anthropic,
  model: string
) {
  try {
    const transcript = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const response = await client.messages.create({
      model: model || "claude-sonnet-4-6",
      max_tokens: 512,
      system: `You extract key facts about the user from a conversation. Return a JSON array of {key, value} pairs.
Keys should be short identifiers like: name, email, company, role, preference, interest, decision, question_topic, location, budget, timeline.
Only extract facts that are clearly stated or strongly implied. Do not guess.
If no meaningful facts can be extracted, return an empty array [].
Return ONLY the JSON array, no other text.`,
      messages: [
        {
          role: "user",
          content: `Extract key facts about the user from this conversation:\n\n${transcript}`,
        },
      ],
    });

    // Note: memory extraction credits are not billed separately to avoid double-charging

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    // JSON aus der Antwort parsen
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const facts: { key: string; value: string }[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(facts) || facts.length === 0) return;

    // Upsert jede Memory
    for (const fact of facts) {
      if (!fact.key || !fact.value) continue;
      const key = fact.key.toLowerCase().replace(/\s+/g, "_").slice(0, 50);
      const value = String(fact.value).slice(0, 1000);

      await prisma.agentMemory.upsert({
        where: {
          agentId_sessionHash_key: { agentId, sessionHash, key },
        },
        update: { value },
        create: { agentId, sessionHash, key, value },
      });
    }
  } catch {
    // Memory-Extraktion fehlgeschlagen — kein Abbruch des Hauptflusses
  }
}

// Evaluate orchestration rules and execute handoff if matched
export async function evaluateOrchestrationHandoff(
  agentId: string,
  conversationId: string,
  lastUserMessage: string,
  assistantResponse: string,
  leadScore: number | null,
  client: Anthropic,
  model: string,
  userId: string,
): Promise<{ handedOff: boolean; targetResponse?: string }> {
  try {
    // Load active orchestration rules for this agent
    const rules = await prisma.agentOrchestration.findMany({
      where: { sourceAgentId: agentId, enabled: true },
      include: {
        targetAgent: {
          include: {
            knowledgeBases: { where: { embeddingStatus: "READY" } },
            actions: true,
            customTools: { where: { enabled: true } },
          },
        },
      },
    });

    if (rules.length === 0) return { handedOff: false };

    // Ask Claude to evaluate which rule (if any) matches
    const rulesDescription = rules.map((r, i) => `Rule ${i + 1}: "${r.condition}" → Agent "${r.targetAgent.name}"`).join("\n");

    const evalResponse = await client.messages.create({
      model: model || "claude-sonnet-4-6",
      max_tokens: 256,
      system: `You evaluate orchestration handoff rules. Given a conversation context, determine if any rule should trigger.
Return ONLY a JSON object: {"ruleIndex": <number or null>, "reason": "<brief reason>"}
ruleIndex is 1-based. Return null if no rule matches. Be conservative — only trigger when the condition is clearly met.`,
      messages: [{
        role: "user",
        content: `Conversation context:
- Last user message: "${lastUserMessage}"
- Assistant response: "${assistantResponse.slice(0, 500)}"
- Lead score: ${leadScore ?? "unknown"}

Available rules:
${rulesDescription}

Which rule (if any) should trigger?`,
      }],
    });

    if (userId) {
      deductCredits(userId, model || "claude-sonnet-4-6", "ORCHESTRATION").catch((err) => {
        console.error("Orchestration eval credit deduction failed:", err);
      });
    }

    const evalText = evalResponse.content[0]?.type === "text" ? evalResponse.content[0].text : "";
    const jsonMatch = evalText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { handedOff: false };

    const evalResult = JSON.parse(jsonMatch[0]) as { ruleIndex: number | null; reason: string };
    if (!evalResult.ruleIndex || evalResult.ruleIndex < 1 || evalResult.ruleIndex > rules.length) {
      return { handedOff: false };
    }

    const matchedRule = rules[evalResult.ruleIndex - 1];
    const targetAgent = matchedRule.targetAgent;

    // Log the handoff
    await prisma.orchestrationHandoff.create({
      data: {
        orchestrationRuleId: matchedRule.id,
        sourceAgentId: agentId,
        targetAgentId: targetAgent.id,
        conversationId,
        reason: evalResult.reason || matchedRule.condition,
      },
    });

    // Transfer conversation to target agent: load history, build target prompt, call Claude
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) return { handedOff: false };

    // Update conversation to point to new agent
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { agentId: targetAgent.id },
    });

    // Build target agent's system prompt
    const now = new Date();
    let targetPrompt = targetAgent.systemPrompt
      .replace(/\{\{agent\.name\}\}/g, targetAgent.name)
      .replace(/\{\{current\.time\}\}/g, now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }))
      .replace(/\{\{current\.date\}\}/g, now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }))
      .replace(/\{\{user\.name\}\}/g, conversation.visitorName || "Unknown")
      .replace(/\{\{user\.email\}\}/g, conversation.visitorEmail || "Unknown")
      .replace(/\{\{knowledge\.context\}\}/g, "");

    // RAG for target agent
    if (targetAgent.knowledgeBases.length > 0) {
      try {
        const ragChunks = await searchRelevantChunks(targetAgent.id, lastUserMessage, 5);
        if (ragChunks.length > 0) {
          const ragContext = "\n\n---\nRELEVANT KNOWLEDGE FROM THE KNOWLEDGE BASE:\n" +
            ragChunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n") +
            "\n---\nUse the above knowledge to answer the question.";
          targetPrompt += ragContext;
        }
      } catch { /* continue without RAG */ }
    }

    // Add handoff context
    targetPrompt += `\n\nIMPORTANT: This conversation was seamlessly handed off to you from another agent. The user does not know about the handoff. Continue the conversation naturally without mentioning any transfer or handoff. Reason for handoff: ${evalResult.reason}`;

    // Load memory for target agent
    const sessionHash = hashSession(conversation.sessionId);
    if (targetAgent.memoryEnabled) {
      try {
        const memories = await prisma.agentMemory.findMany({
          where: { agentId: targetAgent.id, sessionHash },
          orderBy: { updatedAt: "desc" },
        });
        if (memories.length > 0) {
          targetPrompt += "\n\n---\nWHAT YOU REMEMBER ABOUT THIS USER:\n" +
            memories.map((m) => `- ${m.key}: ${m.value}`).join("\n") +
            "\n---\nUse these memories to personalize your responses.";
        }
      } catch { /* continue */ }
    }

    // Load recent messages
    const recentMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    const targetMessages: Anthropic.MessageParam[] = recentMessages.map((m) => ({
      role: m.role === "USER" ? "user" as const : "assistant" as const,
      content: m.content,
    }));

    // Get Claude client for target agent (BYOK)
    const targetModel = targetAgent.llmModel || "claude-sonnet-4-6";
    const targetProvider = MODEL_PROVIDER_MAP[targetModel] || "ANTHROPIC";
    let targetClient: Anthropic;

    if (targetProvider === "ANTHROPIC") {
      try {
        const apiKeyRecord = await prisma.apiKey.findUnique({
          where: { userId_provider: { userId: targetAgent.userId, provider: "anthropic" } },
        });
        if (apiKeyRecord) {
          targetClient = getClaudeClientWithKey(decrypt(apiKeyRecord.encryptedKey));
        } else {
          targetClient = getClaudeClient();
        }
      } catch {
        targetClient = getClaudeClient();
      }
    } else {
      targetClient = getClaudeClient();
    }

    // Call target agent's Claude
    const targetResponse = await targetClient.messages.create({
      model: targetProvider === "ANTHROPIC" ? targetModel : "claude-sonnet-4-6",
      max_tokens: 2048,
      system: targetPrompt,
      messages: targetMessages,
    });

    if (userId) {
      deductCredits(userId, targetProvider === "ANTHROPIC" ? targetModel : "claude-sonnet-4-6", "ORCHESTRATION").catch((err) => {
        console.error("Orchestration handoff credit deduction failed:", err);
      });
    }

    const targetText = targetResponse.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n\n");

    if (targetText) {
      // Save the target agent's response
      await prisma.message.create({
        data: {
          conversationId,
          role: "ASSISTANT",
          content: targetText,
        },
      });

      return { handedOff: true, targetResponse: targetText };
    }

    return { handedOff: false };
  } catch (err) {
    console.error("Orchestration handoff error:", err);
    return { handedOff: false };
  }
}
