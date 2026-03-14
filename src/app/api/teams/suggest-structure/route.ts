import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getClaudeClient } from "@/lib/ai";

export interface SuggestedRole {
  name: string;
  role: "HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER";
  agentMode?: "CHAT" | "TASK";
  suggestedModel?: string;
  suggestedProvider?: string;
  responsibilities: string;
  systemPrompt: string;
  reportsTo?: string;
}

// POST: Use Claude to suggest a team structure based on a goal
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { goal, teamName } = await request.json();
    if (!goal) {
      return Response.json({ error: "Goal is required." }, { status: 400 });
    }

    const claude = getClaudeClient();
    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: `You are KILN's Team Architect AI. Given a team name and goal, you design the optimal hierarchical agent team structure.

RULES:
- Design 5-8 agents with clear hierarchy
- Exactly 1 HEAD (top-level director/manager)
- 1-3 COORDINATORs (mid-level managers who delegate to executors)
- 2-5 EXECUTORs (workers who perform specific tasks)
- 0-1 REPORTER (optional, for analytics/reporting)
- Every non-HEAD agent must have a "reportsTo" pointing to the name of their manager
- HEAD has no reportsTo
- Each agent needs a detailed systemPrompt (at least 2 sentences describing how they work)
- Each agent needs clear responsibilities
- Each agent must have an "agentMode": either "CHAT" or "TASK"
  - HEAD → always "TASK" (autonomous background execution)
  - COORDINATOR → always "TASK"
  - REPORTER → always "TASK"
  - EXECUTOR → "TASK" by default, but use "CHAT" if the role involves direct customer/user interaction (e.g. support chat, onboarding, live sales conversations)
- Each agent must have a "suggestedModel" and "suggestedProvider" for the optimal LLM:
  - HEAD (strategy/delegation): "claude-opus-4-20250514" (ANTHROPIC) or "gpt-4o" (OPENAI)
  - COORDINATOR (balanced): "claude-sonnet-4-20250514" (ANTHROPIC)
  - EXECUTOR doing research: "sonar-pro" (PERPLEXITY) — has built-in web search
  - EXECUTOR doing writing/content: "claude-sonnet-4-20250514" (ANTHROPIC) — best writing quality
  - EXECUTOR doing fast/simple tasks: "claude-haiku-4-5-20251001" (ANTHROPIC) or "llama-3.3-70b-versatile" (GROQ) — fastest, cheapest
  - REPORTER (summarization): "gpt-4o-mini" (OPENAI) — cost-effective summarization

Respond ONLY with a valid JSON array of role objects. No other text.

JSON format per role:
{
  "name": "Agent Name",
  "role": "HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER",
  "agentMode": "CHAT" | "TASK",
  "suggestedModel": "model-id",
  "suggestedProvider": "ANTHROPIC" | "OPENAI" | "PERPLEXITY" | "GOOGLE" | "GROQ",
  "responsibilities": "What this agent is responsible for",
  "systemPrompt": "You are a [Role] AI. You [detailed behavior description]...",
  "reportsTo": "Name of manager" // omit for HEAD
}`,
      messages: [
        {
          role: "user",
          content: `Team: "${teamName || "Custom Team"}"
Goal: "${goal}"

Design the optimal team structure.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json(
        { error: "Failed to generate team structure." },
        { status: 500 }
      );
    }

    let roles: SuggestedRole[];
    try {
      const jsonText = textBlock.text
        .replace(/```json?\n?/g, "")
        .replace(/```/g, "")
        .trim();
      roles = JSON.parse(jsonText);
    } catch {
      return Response.json(
        { error: "Failed to parse AI response." },
        { status: 500 }
      );
    }

    if (!Array.isArray(roles) || roles.length === 0) {
      return Response.json(
        { error: "AI returned no valid roles." },
        { status: 500 }
      );
    }

    // Validate structure
    const hasHead = roles.some((r) => r.role === "HEAD");
    if (!hasHead) {
      // Force first role to HEAD if AI forgot
      roles[0].role = "HEAD";
      delete roles[0].reportsTo;
    }

    return Response.json({ roles });
  } catch (err) {
    console.error("POST /api/teams/suggest-structure error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
