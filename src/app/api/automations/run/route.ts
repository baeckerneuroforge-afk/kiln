import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { searchRelevantChunks } from "@/lib/rag";
import { decrypt } from "@/lib/encryption";
import { checkCredits, deductCredits } from "@/lib/credits";

// Cron-Expression Parser: Prüft ob eine Automation jetzt fällig ist
// Unterstützt: "0 * * * *" (stündlich), "0 9 * * *" (täglich 9h),
// "0 9 * * 1" (montags 9h), "0 9 1 * *" (1. des Monats 9h)
function isDue(cronExpression: string, lastRunAt: Date | null): boolean {
  const now = new Date();
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  // Minute prüfen
  if (minute !== "*" && parseInt(minute) !== now.getUTCMinutes()) return false;
  // Stunde prüfen
  if (hour !== "*" && parseInt(hour) !== now.getUTCHours()) return false;
  // Tag des Monats prüfen
  if (dayOfMonth !== "*" && parseInt(dayOfMonth) !== now.getUTCDate()) return false;
  // Wochentag prüfen (0 = Sonntag)
  if (dayOfWeek !== "*" && parseInt(dayOfWeek) !== now.getUTCDay()) return false;

  // Sicherstellen, dass wir nicht doppelt in derselben Stunde laufen
  if (lastRunAt) {
    const msSinceLastRun = now.getTime() - lastRunAt.getTime();
    if (msSinceLastRun < 55 * 60 * 1000) return false; // Min 55 Minuten Abstand
  }

  return true;
}

// Cron-Endpoint: wird von Vercel Cron oder externem Service aufgerufen
export async function GET(request: NextRequest) {
  // Vercel Cron Authorization prüfen
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const automations = await prisma.automationRule.findMany({
    where: { enabled: true },
    include: {
      agent: {
        include: {
          knowledgeBases: { where: { embeddingStatus: "READY" } },
          user: { select: { email: true } },
        },
      },
    },
  });

  const results: { id: string; name: string; status: string; error?: string }[] = [];

  for (const automation of automations) {
    if (!isDue(automation.cronExpression, automation.lastRunAt)) {
      continue;
    }

    try {
      const agent = automation.agent;

      // RAG-Kontext für die Task-Beschreibung laden
      let knowledgeContext = "";
      if (agent.knowledgeBases.length > 0) {
        try {
          const chunks = await searchRelevantChunks(
            agent.id,
            automation.taskDescription,
            5
          );
          if (chunks.length > 0) {
            knowledgeContext =
              "\n\n---\nRELEVANT KNOWLEDGE BASE CONTEXT:\n" +
              chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n") +
              "\n---";
          }
        } catch {
          // RAG fehlgeschlagen — weiter ohne
        }
      }

      const systemPrompt = `${agent.systemPrompt}\n\nYou are running as a scheduled automation. The current time is ${new Date().toISOString()}.${knowledgeContext}`;

      // BYOK prüfen
      const selectedModel = agent.llmModel || "claude-sonnet-4-6";
      const modelProvider = MODEL_PROVIDER_MAP[selectedModel] || "ANTHROPIC";
      let userApiKey: string | null = null;

      try {
        const apiKeyRecord = await prisma.apiKey.findUnique({
          where: { userId_provider: { userId: agent.userId, provider: modelProvider.toLowerCase() } },
        });
        if (apiKeyRecord) userApiKey = decrypt(apiKeyRecord.encryptedKey);
      } catch { /* fallback to platform key */ }

      // Credit pre-check
      const hasByokKey = !!userApiKey;
      const creditCheck = await checkCredits(agent.userId, selectedModel, hasByokKey);
      if (!creditCheck.allowed) {
        console.warn(`Automation skipped: insufficient credits for agent ${agent.id}, user ${agent.userId}`);
        results.push({ id: automation.id, name: automation.name, status: "error", error: "Insufficient credits" });
        continue;
      }

      const taskMessage = `Execute the following scheduled task:\n\n${automation.taskDescription}\n\nProvide a clear, structured result.`;
      let resultText = "";

      if (modelProvider === "GOOGLE" && userApiKey) {
        // Google Gemini REST API
        const geminiBody = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: taskMessage }] }],
          generationConfig: { maxOutputTokens: 2048 },
        };
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${userApiKey}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiBody) }
        );
        if (!geminiRes.ok) {
          const errData = await geminiRes.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Google API error: ${geminiRes.status}`);
        }
        const geminiData = await geminiRes.json();
        resultText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else if (modelProvider === "OPENAI" || modelProvider === "PERPLEXITY" || modelProvider === "GROQ") {
        // OpenAI-compatible API
        let openaiClient: OpenAI;
        if (modelProvider === "OPENAI") {
          openaiClient = new OpenAI({ apiKey: userApiKey || process.env.OPENAI_API_KEY });
        } else if (modelProvider === "PERPLEXITY") {
          if (!userApiKey) throw new Error("Perplexity requires your own API key");
          openaiClient = new OpenAI({ apiKey: userApiKey, baseURL: "https://api.perplexity.ai" });
        } else {
          if (!userApiKey) throw new Error("Groq requires your own API key");
          openaiClient = new OpenAI({ apiKey: userApiKey, baseURL: "https://api.groq.com/openai/v1" });
        }
        const resp = await openaiClient.chat.completions.create({
          model: selectedModel,
          max_tokens: 2048,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: taskMessage },
          ],
        });
        resultText = resp.choices[0]?.message?.content || "";
      } else {
        // Anthropic (default)
        const client = userApiKey ? getClaudeClientWithKey(userApiKey) : getClaudeClient();
        const response = await client.messages.create({
          model: selectedModel,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: taskMessage }],
        });
        resultText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");
      }

      // Deduct credits (fire-and-forget)
      waitUntil(
        deductCredits(agent.userId, selectedModel, "SCHEDULED", agent.id).catch((err) => {
          console.error("Automation credit deduction failed:", err);
        })
      );

      // Ergebnis speichern
      await prisma.automationRule.update({
        where: { id: automation.id },
        data: {
          lastRunAt: new Date(),
          lastRunResult: resultText.slice(0, 5000),
        },
      });

      // Notification senden
      if (automation.notificationMethod === "EMAIL" && automation.notificationTarget) {
        try {
          // Resend E-Mail senden
          const resendKey = process.env.RESEND_API_KEY;
          if (resendKey) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "KILN Automations <noreply@getkiln.com>",
                to: automation.notificationTarget,
                subject: `[KILN] Automation "${automation.name}" completed`,
                text: `Automation: ${automation.name}\nAgent: ${agent.name}\nTime: ${new Date().toISOString()}\n\nResult:\n${resultText.slice(0, 3000)}`,
              }),
            });
          }
        } catch {
          // E-Mail-Versand fehlgeschlagen — kein Abbruch
        }
      } else if (automation.notificationMethod === "WEBHOOK" && automation.notificationTarget) {
        try {
          const { validateUrl } = await import("@/lib/url-validation");
          const urlCheck = await validateUrl(automation.notificationTarget);
          if (!urlCheck.safe) {
            console.error(`Blocked SSRF attempt to ${automation.notificationTarget}: ${urlCheck.error}`);
            throw new Error(urlCheck.error || "Blocked URL");
          }
          await fetch(automation.notificationTarget, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              automationId: automation.id,
              automationName: automation.name,
              agentId: agent.id,
              agentName: agent.name,
              result: resultText.slice(0, 5000),
              timestamp: new Date().toISOString(),
            }),
          });
        } catch {
          // Webhook fehlgeschlagen — kein Abbruch
        }
      }

      results.push({ id: automation.id, name: automation.name, status: "success" });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";

      waitUntil(
        prisma.automationRule.update({
          where: { id: automation.id },
          data: {
            lastRunAt: new Date(),
            lastRunResult: `ERROR: ${errorMsg}`,
          },
        }).catch((err) => {
          console.error("Automation error status update failed:", err);
        })
      );

      results.push({ id: automation.id, name: automation.name, status: "error", error: errorMsg });
    }
  }

  return Response.json({
    executed: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
