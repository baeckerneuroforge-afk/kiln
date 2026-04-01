import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getClaudeClient } from "@/lib/ai";
import { checkCredits, deductCredits } from "@/lib/credits";

export interface SuggestedRole {
  name: string;
  role: "HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER";
  agentMode?: "CHAT" | "TASK";
  suggestedModel?: string;
  suggestedProvider?: string;
  responsibilities: string;
  systemPrompt: string;
  reportsTo?: string;
  enabledActions?: string[];
}

/**
 * Verfügbare Tools die Team-Mitglieder nutzen können.
 * Wird dem LLM als Katalog mitgegeben und auch für
 * lokales Matching per suggestToolsForTask() verwendet.
 */
const AVAILABLE_TOOLS_CATALOG = [
  // Immer verfügbar (kein Integration nötig)
  { name: "web_search", category: "research", description: "Search the web for information" },
  { name: "fetch_url", category: "research", description: "Fetch and read a web page" },
  // Gmail
  { name: "gmail_read_inbox", category: "gmail", description: "Read emails from Gmail inbox" },
  { name: "gmail_read_email", category: "gmail", description: "Read a specific email thread" },
  { name: "gmail_send_email", category: "gmail", description: "Send a new email" },
  { name: "gmail_reply", category: "gmail", description: "Reply to an email thread" },
  // Google Sheets
  { name: "sheets_read", category: "google-sheets", description: "Read data from a Google Sheet" },
  { name: "sheets_append", category: "google-sheets", description: "Append rows to a Google Sheet" },
  // Slack
  { name: "slack_send_message", category: "slack", description: "Send a message to a Slack channel" },
  { name: "slack_read_channel", category: "slack", description: "Read recent messages from a Slack channel" },
  // Notion
  { name: "notion_search", category: "notion", description: "Search pages in Notion" },
  { name: "notion_create_page", category: "notion", description: "Create a new page in Notion" },
  // HubSpot
  { name: "hubspot_search_contacts", category: "hubspot", description: "Search contacts in HubSpot CRM" },
  { name: "hubspot_create_contact", category: "hubspot", description: "Create a new CRM contact" },
  { name: "hubspot_create_deal", category: "hubspot", description: "Create a new CRM deal" },
  { name: "hubspot_update_deal", category: "hubspot", description: "Update an existing CRM deal" },
  // Airtable
  { name: "airtable_read", category: "airtable", description: "Read records from Airtable" },
  { name: "airtable_create", category: "airtable", description: "Create a record in Airtable" },
  // Built-in Actions
  { name: "book_appointment", category: "builtin", description: "Check availability and book appointments" },
  { name: "collect_email", category: "builtin", description: "Collect visitor email addresses" },
  { name: "score_lead", category: "builtin", description: "Score and qualify leads" },
];

/** Keyword-basiertes Tool-Matching für eine Aufgabenbeschreibung */
export function suggestToolsForTask(taskDescription: string): string[] {
  const desc = taskDescription.toLowerCase();
  const tools: string[] = [];

  if (desc.match(/research|search|find|look up|investigate|web|browse|google/))
    tools.push("web_search", "fetch_url");
  if (desc.match(/email|mail|inbox|send.*mail|read.*mail|gmail/))
    tools.push("gmail_read_inbox", "gmail_read_email", "gmail_send_email", "gmail_reply");
  if (desc.match(/calendar|appointment|meeting|schedule|book|termin/))
    tools.push("book_appointment");
  if (desc.match(/crm|contact|lead|deal|hubspot|customer|kunde/))
    tools.push("hubspot_search_contacts", "hubspot_create_contact", "hubspot_create_deal");
  if (desc.match(/slack|message|notify|channel|nachricht/))
    tools.push("slack_send_message", "slack_read_channel");
  if (desc.match(/notion|wiki|document|page|dokument/))
    tools.push("notion_search", "notion_create_page");
  if (desc.match(/spreadsheet|sheet|data|table|csv|tabelle/))
    tools.push("sheets_read", "sheets_append");
  if (desc.match(/airtable|base|record/))
    tools.push("airtable_read", "airtable_create");
  if (desc.match(/score|qualify|bewert/))
    tools.push("score_lead");
  if (desc.match(/collect.*email|capture.*email|email.*sammeln/))
    tools.push("collect_email");

  return [...new Set(tools)];
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

    // Credit check before LLM call
    const creditCheck = await checkCredits(userId, "claude-sonnet-4-6", false);
    if (!creditCheck.allowed) {
      return Response.json(
        { error: creditCheck.message, creditExhausted: true },
        { status: 402 }
      );
    }

    const toolCatalogText = AVAILABLE_TOOLS_CATALOG
      .map((t) => `  - ${t.name}: ${t.description}`)
      .join("\n");

    const claude = getClaudeClient();
    const response = await claude.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: `You are KILN's Team Architect AI. Given a team name and goal, you design the optimal hierarchical agent team structure that is IMMEDIATELY EXECUTABLE.

RULES:
- Design 3-6 agents with clear hierarchy (prefer fewer, focused agents over many vague ones)
- Exactly 1 HEAD (top-level director/manager)
- 0-2 COORDINATORs (only if team has 5+ members)
- 1-4 EXECUTORs (workers who perform specific tasks)
- 0-1 REPORTER (for summarization/reporting)
- Every non-HEAD agent must have a "reportsTo" pointing to the name of their manager
- HEAD has no reportsTo
- Each agent needs a detailed systemPrompt (at least 3 sentences describing their specific behavior, what data they read from shared context, and what data they write back)
- Each agent needs clear responsibilities
- Each agent must have an "agentMode": either "CHAT" or "TASK"
  - HEAD → always "TASK" (autonomous background execution)
  - COORDINATOR → always "TASK"
  - REPORTER → always "TASK"
  - EXECUTOR → "TASK" by default, "CHAT" only if direct customer/user interaction
- Each agent must have a "suggestedModel" and "suggestedProvider" for the optimal LLM:
  - HEAD (strategy/delegation): "claude-opus-4-6" (ANTHROPIC) or "gpt-4o" (OPENAI)
  - COORDINATOR (balanced): "claude-sonnet-4-6" (ANTHROPIC)
  - EXECUTOR doing research: "sonar-pro" (PERPLEXITY) — has built-in web search
  - EXECUTOR doing writing/content: "claude-sonnet-4-6" (ANTHROPIC) — best writing quality
  - EXECUTOR doing fast/simple tasks: "claude-haiku-4-5-20251001" (ANTHROPIC) or "llama-3.3-70b-versatile" (GROQ) — fastest, cheapest
  - REPORTER (summarization): "gpt-4o-mini" (OPENAI) — cost-effective summarization

TOOL ASSIGNMENT (CRITICAL):
Each agent MUST have an "enabledActions" array with the tools they need.
Available tools:
${toolCatalogText}

Rules for tool assignment:
- Match tools to each agent's specific task. An email reader needs gmail_read_inbox. A researcher needs web_search.
- HEAD agents usually need no tools (they coordinate), set enabledActions to []
- REPORTER agents usually need no tools (they summarize), set enabledActions to []
- COORDINATORs usually need no tools, set enabledActions to []
- EXECUTORs MUST have the tools they need to do their job
- web_search and fetch_url are always available (no integration needed)
- Only assign tools the agent actually needs — don't give every tool to every agent

DATA FLOW:
- Agents execute sequentially. Each agent can read outputs from all previous agents via shared context.
- In each agent's systemPrompt, explicitly mention:
  1. What data this agent should READ from previous agents (e.g. "Read the research results from the Lead Researcher")
  2. What data this agent should PRODUCE for downstream agents (e.g. "Write your email drafts so the CRM Manager can log them")
- The HEAD agent should describe the overall execution plan and what each member should focus on.

Respond ONLY with a valid JSON array of role objects. No other text.

JSON format per role:
{
  "name": "Agent Name",
  "role": "HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER",
  "agentMode": "CHAT" | "TASK",
  "suggestedModel": "model-id",
  "suggestedProvider": "ANTHROPIC" | "OPENAI" | "PERPLEXITY" | "GOOGLE" | "GROQ",
  "responsibilities": "What this agent is responsible for",
  "systemPrompt": "You are a [Role] AI. You [detailed behavior description with data flow instructions]...",
  "enabledActions": ["tool_name_1", "tool_name_2"],
  "reportsTo": "Name of manager" // omit for HEAD
}`,
      messages: [
        {
          role: "user",
          content: `Team: "${teamName || "Custom Team"}"
Goal: "${goal}"

Design the optimal team structure. Each agent must have the right tools to do their job immediately.`,
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
      roles[0].role = "HEAD";
      delete roles[0].reportsTo;
    }

    // Fallback: auto-assign tools if LLM didn't provide them
    for (const role of roles) {
      if (!role.enabledActions || role.enabledActions.length === 0) {
        const taskText = `${role.responsibilities} ${role.systemPrompt} ${role.name}`;
        role.enabledActions = suggestToolsForTask(taskText);
      }
    }

    // Deduct credits after successful LLM call
    deductCredits(userId, "claude-sonnet-4-6", "TEAM_TASK").catch((err) => {
      console.error("Team suggest-structure credit deduction failed:", err);
    });

    return Response.json({ roles });
  } catch (err) {
    console.error("POST /api/teams/suggest-structure error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
