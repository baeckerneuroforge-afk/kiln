import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getClaudeClient } from "@/lib/ai";
import { checkAndDeductCredits } from "@/lib/credits";

type FieldType =
  | "email_subject"
  | "email_body"
  | "system_prompt"
  | "condition"
  | "prompt"
  | "request_body";

interface GenerateFieldBody {
  fieldType: FieldType;
  context: {
    workflowGoal?: string;
    nodeType?: string;
    currentValue?: string;
    nodeName?: string;
    description?: string;
  };
}

const SYSTEM_PROMPTS: Record<FieldType, string> = {
  email_subject:
    "You are a copywriting assistant. Generate a concise, professional email subject line. Return ONLY the subject line, nothing else.",
  email_body:
    "You are a copywriting assistant. Generate a professional email body. Keep it concise and effective. Return ONLY the email body text.",
  system_prompt:
    "You are an AI agent design expert. Generate a clear, effective system prompt for an AI agent. The prompt should define the agent's role, capabilities, and behavior guidelines. Return ONLY the system prompt.",
  condition:
    "You are a JavaScript expert. Convert the user's natural language description into a valid JavaScript boolean expression. Use common variable names like `input`, `data`, `value`. Return ONLY the expression, no explanation.",
  prompt:
    "You are a prompt engineering expert. Improve the given LLM prompt for clarity, specificity, and effectiveness. Return ONLY the improved prompt.",
  request_body:
    "You are an API expert. Generate a JSON request body based on the description. Return ONLY valid JSON.",
};

function buildUserMessage(
  fieldType: FieldType,
  context: GenerateFieldBody["context"]
): string {
  const parts: string[] = [];

  if (context.workflowGoal) {
    parts.push(`Workflow-Ziel: ${context.workflowGoal}`);
  }

  if (context.nodeName) {
    parts.push(`Node: ${context.nodeName}`);
  }

  if (context.description) {
    parts.push(`Beschreibung: ${context.description}`);
  }

  if (context.currentValue) {
    parts.push(`Aktueller Wert:\n${context.currentValue}`);
  }

  if (parts.length === 0) {
    parts.push(`Generiere einen passenden Wert für: ${fieldType}`);
  }

  return parts.join("\n\n");
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: GenerateFieldBody = await request.json();
    const { fieldType, context } = body;

    if (!fieldType || !SYSTEM_PROMPTS[fieldType]) {
      return Response.json(
        { error: "Invalid or missing fieldType" },
        { status: 400 }
      );
    }

    // Credit-Check und Abzug (1 credit for Haiku)
    const creditResult = await checkAndDeductCredits(
      userId,
      "claude-haiku-4-5-20251001",
      "CHAT"
    );

    if (!creditResult.success) {
      return Response.json(
        { error: "Insufficient credits" },
        { status: 402 }
      );
    }

    const systemPrompt = SYSTEM_PROMPTS[fieldType];
    const userMessage = buildUserMessage(fieldType, context);

    const client = getClaudeClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const generatedText = textBlock?.type === "text" ? textBlock.text : "";

    return Response.json({ generatedText });
  } catch (error) {
    console.error("Field generation error:", error);
    return Response.json(
      { error: "Failed to generate field content" },
      { status: 500 }
    );
  }
}
