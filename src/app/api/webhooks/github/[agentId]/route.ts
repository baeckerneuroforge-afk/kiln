import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { searchRelevantChunks } from "@/lib/rag";
import { decrypt } from "@/lib/encryption";
import { checkCredits, deductCredits } from "@/lib/credits";
import crypto from "crypto";

function hashSession(sessionId: string): string {
  return crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
}

// Parse GitHub event into a human-readable message
function parseGitHubEvent(event: string, payload: Record<string, unknown>): { text: string; replyUrl: string | null } | null {
  const action = payload.action as string | undefined;

  if (event === "issues" && (action === "opened" || action === "edited")) {
    const issue = payload.issue as Record<string, unknown>;
    const title = issue?.title as string || "Untitled";
    const body = (issue?.body as string || "").slice(0, 2000);
    const number = issue?.number as number;
    const user = (issue?.user as Record<string, unknown>)?.login as string || "unknown";
    const commentsUrl = issue?.comments_url as string || null;
    return {
      text: `[GitHub Issue #${number} ${action}]\nTitle: ${title}\nAuthor: @${user}\n\n${body}`,
      replyUrl: commentsUrl,
    };
  }

  if (event === "pull_request" && (action === "opened" || action === "edited")) {
    const pr = payload.pull_request as Record<string, unknown>;
    const title = pr?.title as string || "Untitled";
    const body = (pr?.body as string || "").slice(0, 2000);
    const number = pr?.number as number;
    const user = (pr?.user as Record<string, unknown>)?.login as string || "unknown";
    const commentsUrl = pr?.comments_url as string || null;
    return {
      text: `[GitHub Pull Request #${number} ${action}]\nTitle: ${title}\nAuthor: @${user}\n\n${body}`,
      replyUrl: commentsUrl,
    };
  }

  if (event === "push") {
    const commits = payload.commits as Record<string, unknown>[] || [];
    const ref = payload.ref as string || "";
    const branch = ref.replace("refs/heads/", "");
    const pusher = (payload.pusher as Record<string, unknown>)?.name as string || "unknown";
    const commitMessages = commits
      .slice(0, 5)
      .map((c) => `- ${(c.message as string || "").split("\n")[0]}`)
      .join("\n");
    return {
      text: `[GitHub Push to ${branch}]\nPushed by: @${pusher}\nCommits (${commits.length}):\n${commitMessages}`,
      replyUrl: null,
    };
  }

  if (event === "release" && action === "published") {
    const release = payload.release as Record<string, unknown>;
    const tag = release?.tag_name as string || "unknown";
    const name = release?.name as string || tag;
    const body = (release?.body as string || "").slice(0, 2000);
    return {
      text: `[GitHub Release ${tag} published]\nName: ${name}\n\n${body}`,
      replyUrl: null,
    };
  }

  return null;
}

// Post a comment back to GitHub
async function postGitHubComment(url: string, body: string, token: string) {
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github.v3+json",
    },
    body: JSON.stringify({ body }),
  });
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST: Receive GitHub webhook events
export async function POST(request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await params;
    const event = request.headers.get("x-github-event") || "unknown";
    const payload = await request.json();

    // Parse the event
    const parsed = parseGitHubEvent(event, payload);
    if (!parsed) {
      // Event type not handled — acknowledge silently
      return Response.json({ ok: true, skipped: true });
    }

    // Load agent + channel config
    const channel = await prisma.agentChannel.findFirst({
      where: { agentId, type: "GITHUB" },
      include: { agent: true },
    });

    if (!channel || !channel.agent) {
      return Response.json({ error: "Agent not found or GitHub not connected" }, { status: 404 });
    }

    const agent = channel.agent;
    const config = JSON.parse(channel.config || "{}") as Record<string, unknown>;
    const githubToken = config.githubToken as string;
    const enabledEvents = (config.events as string[]) || ["issues", "pull_request"];

    // Check if this event type is enabled
    if (!enabledEvents.includes(event)) {
      return Response.json({ ok: true, skipped: true, reason: "Event type not enabled" });
    }

    // Rate limit: max 100/day
    const todayStr = new Date().toISOString().slice(0, 10);
    const dailyCount = (config.dailyCount as number) || 0;
    const dailyDate = (config.dailyDate as string) || "";
    const currentCount = dailyDate === todayStr ? dailyCount : 0;

    if (currentCount >= 100) {
      return Response.json({ error: "Daily limit reached (100/day)" }, { status: 429 });
    }

    // Update count
    await prisma.agentChannel.update({
      where: { id: channel.id },
      data: {
        config: JSON.stringify({ ...config, dailyCount: currentCount + 1, dailyDate: todayStr }),
      },
    });

    // Build session ID from repo
    const repoFullName = (payload.repository as Record<string, unknown>)?.full_name as string || "github";
    const sessionId = `github-${hashSession(repoFullName)}`;

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: { agentId, sessionId },
      orderBy: { updatedAt: "desc" },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { agentId, sessionId, channel: "GITHUB", visitorName: `GitHub (${repoFullName})` },
      });
    }

    // Save user message
    await prisma.message.create({
      data: { conversationId: conversation.id, role: "USER", content: parsed.text },
    });

    // Load conversation history (last 10 messages)
    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 10,
    });

    // RAG: search relevant chunks
    let ragContext = "";
    try {
      const chunks = await searchRelevantChunks(agentId, parsed.text, 3);
      if (chunks.length > 0) {
        ragContext = "\n\n--- Knowledge Base ---\n" + chunks.map((c) => c.content).join("\n---\n");
      }
    } catch { /* RAG optional */ }

    // Build system prompt
    const systemPrompt = `${agent.systemPrompt}

You are responding to GitHub events (issues, pull requests, pushes). Analyze the event context and provide a helpful, concise response. If this is an issue or PR, your response will be posted as a comment.

Format your response in GitHub Markdown. Be concise and actionable.${ragContext}`;

    // Build messages
    const messages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role === "USER" ? "user" as const : "assistant" as const,
      content: m.content,
    }));

    // Get Claude client (BYOK support)
    const model = agent.llmModel || "claude-sonnet-4-20250514";
    const provider = MODEL_PROVIDER_MAP[model] || "ANTHROPIC";

    if (provider !== "ANTHROPIC") {
      return Response.json({ error: "GitHub integration only supports Anthropic models" }, { status: 400 });
    }

    const byokKey = await prisma.apiKey.findFirst({
      where: { userId: agent.userId, provider: provider.toLowerCase() },
    });
    const anthropicClient = byokKey
      ? getClaudeClientWithKey(decrypt(byokKey.encryptedKey))
      : getClaudeClient();

    // Credit pre-check before LLM call
    const hasByokKey = !!byokKey;
    const creditCheck = await checkCredits(agent.userId, model, hasByokKey);
    if (!creditCheck.allowed) {
      console.warn(`GitHub webhook: insufficient credits for agent ${agentId}, user ${agent.userId}`);
      return Response.json({ error: "Insufficient credits" }, { status: 402 });
    }

    // Call Claude
    const response = await anthropicClient.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    const assistantText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    // Save assistant message
    await prisma.message.create({
      data: { conversationId: conversation.id, role: "ASSISTANT", content: assistantText },
    });

    // Deduct credits (fire-and-forget)
    waitUntil(
      deductCredits(agent.userId, model, "WEBHOOK", agent.id, conversation.id).catch((err) => {
        console.error("GitHub webhook credit deduction failed:", err);
      })
    );

    // Post comment back to GitHub if we have a reply URL and a token
    if (parsed.replyUrl && githubToken && assistantText) {
      try {
        await postGitHubComment(
          parsed.replyUrl,
          `${assistantText}\n\n---\n*🤖 Powered by [KILN AI](https://kiln-topaz.vercel.app) — ${agent.name}*`,
          githubToken
        );
      } catch (err) {
        console.error("Failed to post GitHub comment:", err);
      }
    }

    return Response.json({ ok: true, response: assistantText.slice(0, 200) });
  } catch (err) {
    console.error("GitHub webhook error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
