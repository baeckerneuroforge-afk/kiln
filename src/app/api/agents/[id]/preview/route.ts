import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP, type ProviderKey } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const rateLimiter =
  upstashUrl && upstashToken
    ? new Ratelimit({
        redis: new Redis({ url: upstashUrl, token: upstashToken }),
        limiter: Ratelimit.slidingWindow(20, "1 m"),
      })
    : null;

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: { type?: string }) => b.type === "text")
      .map((b: { text?: string }) => b.text || "")
      .join("");
  }
  return "";
}

// POST /api/agents/[id]/preview
// Runs a message against unsaved config — no persistence, no conversation record
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit per user
    if (rateLimiter) {
      const { success } = await rateLimiter.limit(`preview:${userId}`);
      if (!success) {
        return Response.json(
          { error: "Rate limit exceeded. Max 20 preview requests per minute." },
          { status: 429 }
        );
      }
    }

    const body = await request.json();
    const { messages, config } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "Messages are required." }, { status: 400 });
    }
    if (!config || !config.systemPrompt) {
      return Response.json({ error: "Config with systemPrompt is required." }, { status: 400 });
    }

    // Verify ownership
    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
      select: { id: true, userId: true },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const selectedModel = config.model || "claude-sonnet-4-20250514";
    const modelProvider: ProviderKey = (config.modelProvider as ProviderKey) || MODEL_PROVIDER_MAP[selectedModel] || "ANTHROPIC";
    const temperature = typeof config.temperature === "number" ? config.temperature : 0.7;

    // BYOK check
    const providerLower = modelProvider.toLowerCase();
    let userApiKey: string | null = null;

    try {
      const apiKeyRecord = await prisma.apiKey.findUnique({
        where: { userId_provider: { userId, provider: providerLower } },
      });
      if (apiKeyRecord) {
        userApiKey = decrypt(apiKeyRecord.encryptedKey);
      }
    } catch {
      // Fallback to platform key
    }

    // System prompt mit Variable-Replacement
    const now = new Date();
    const systemPrompt = config.systemPrompt
      .replace(/\{\{agent\.name\}\}/g, config.name || "Agent")
      .replace(/\{\{current\.time\}\}/g, now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }))
      .replace(/\{\{current\.date\}\}/g, now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }))
      .replace(/\{\{conversation\.count\}\}/g, "0")
      .replace(/\{\{user\.name\}\}/g, "Preview User")
      .replace(/\{\{user\.email\}\}/g, "preview@example.com")
      .replace(/\{\{knowledge\.context\}\}/g, "");

    const isOpenAI = modelProvider === "OPENAI";
    const isPerplexity = modelProvider === "PERPLEXITY";
    const isGoogle = modelProvider === "GOOGLE";
    const isGroq = modelProvider === "GROQ";
    const isOpenAICompat = isOpenAI || isPerplexity || isGroq;

    if ((isPerplexity || isGoogle || isGroq) && !userApiKey) {
      return Response.json(
        { error: `${modelProvider} requires your own API key. Add it in Settings → API Keys.` },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Google Gemini
          if (isGoogle && userApiKey) {
            const geminiMessages = messages.map((m: { role: string; content: unknown }) => ({
              role: m.role === "user" ? "user" : "model",
              parts: [{ text: extractText(m.content) }],
            }));

            const geminiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${userApiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  system_instruction: { parts: [{ text: systemPrompt }] },
                  contents: geminiMessages,
                  generationConfig: { maxOutputTokens: 2048, temperature },
                }),
              }
            );

            if (!geminiRes.ok) {
              const errData = await geminiRes.json().catch(() => ({}));
              throw new Error(errData?.error?.message || `Google API error: ${geminiRes.status}`);
            }

            const geminiData = await geminiRes.json();
            const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          // OpenAI-compatible (OpenAI, Perplexity, Groq)
          else if (isOpenAICompat) {
            let client: OpenAI;
            if (isOpenAI) {
              client = new OpenAI({ apiKey: userApiKey || process.env.OPENAI_API_KEY });
            } else if (isPerplexity) {
              client = new OpenAI({ apiKey: userApiKey!, baseURL: "https://api.perplexity.ai" });
            } else {
              client = new OpenAI({ apiKey: userApiKey!, baseURL: "https://api.groq.com/openai/v1" });
            }

            const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
              { role: "system", content: systemPrompt },
              ...messages.map((m: { role: string; content: unknown }) => ({
                role: m.role as "user" | "assistant",
                content: extractText(m.content),
              })),
            ];

            const response = await client.chat.completions.create({
              model: selectedModel,
              max_tokens: 2048,
              temperature,
              messages: openaiMessages,
            });

            const text = response.choices[0]?.message?.content || "";
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          // Anthropic (default)
          else {
            const anthropicClient = userApiKey
              ? getClaudeClientWithKey(userApiKey)
              : getClaudeClient();

            const claudeMessages: Anthropic.MessageParam[] = messages.map(
              (m: { role: string; content: string | Anthropic.ContentBlockParam[] }) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              })
            );

            const response = await anthropicClient.messages.create({
              model: selectedModel,
              max_tokens: 2048,
              temperature,
              system: systemPrompt,
              messages: claudeMessages,
            });

            for (const block of response.content) {
              if (block.type === "text" && block.text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: block.text })}\n\n`));
              }
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Preview failed";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Preview error:", err);
    return Response.json({ error: "Preview failed" }, { status: 500 });
  }
}
