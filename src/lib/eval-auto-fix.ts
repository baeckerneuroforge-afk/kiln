import { prisma } from "@/lib/prisma";

const UNCERTAINTY_PHRASES = [
  "i don't know",
  "i am not sure",
  "i'm not sure",
  "i can't help with that",
  "i cannot help with that",
  "i don't have that information",
  "i don't have information about",
  "i'm unable to",
  "i am unable to",
  "ich weiss es nicht",
  "ich weiß es nicht",
  "ich bin mir nicht sicher",
  "dabei kann ich nicht helfen",
  "dazu habe ich keine informationen",
];

export interface KnowledgeGap {
  id: string;
  topic: string;
  questions: { question: string; response: string; conversationId: string; createdAt: string }[];
  count: number;
}

export interface FixSuggestion {
  gapId: string;
  type: "knowledge" | "prompt" | "test";
  title: string;
  description: string;
  payload: Record<string, unknown>;
}

/**
 * Analysiert Conversations der letzten 30 Tage und findet Wissenslücken
 * anhand von Unsicherheits-Phrasen in Agent-Antworten.
 */
export async function analyzeKnowledgeGaps(agentId: string): Promise<KnowledgeGap[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const conversations = await prisma.conversation.findMany({
    where: {
      agentId,
      createdAt: { gte: thirtyDaysAgo },
    },
    select: {
      id: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true, createdAt: true },
      },
    },
  });

  // Finde alle User-Fragen, auf die der Agent unsicher geantwortet hat
  const rawGaps: { question: string; response: string; conversationId: string; createdAt: string }[] = [];

  for (const conv of conversations) {
    for (let i = 0; i < conv.messages.length; i++) {
      const msg = conv.messages[i];
      if (msg.role !== "ASSISTANT") continue;

      const lower = msg.content.toLowerCase();
      if (!UNCERTAINTY_PHRASES.some((p) => lower.includes(p))) continue;

      // Vorherige User-Nachricht finden
      let userQuestion = "";
      for (let j = i - 1; j >= 0; j--) {
        if (conv.messages[j].role === "USER") {
          userQuestion = conv.messages[j].content;
          break;
        }
      }

      if (userQuestion && userQuestion.length > 5) {
        rawGaps.push({
          question: userQuestion.slice(0, 300),
          response: msg.content.slice(0, 300),
          conversationId: conv.id,
          createdAt: msg.createdAt.toISOString(),
        });
      }
    }
  }

  // Gruppiere nach Ähnlichkeit (einfaches Keyword-Matching)
  const groups = new Map<string, typeof rawGaps>();

  for (const gap of rawGaps) {
    const normalized = gap.question
      .toLowerCase()
      .replace(/[^a-z0-9äöüß\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Extrahiere die wichtigsten Wörter (>3 Zeichen) als Topic-Key
    const words = normalized.split(" ").filter((w) => w.length > 3);
    const key = words.slice(0, 4).sort().join("|") || normalized.slice(0, 40);

    // Versuche, eine bestehende Gruppe mit überlappenden Keywords zu finden
    let matched = false;
    const entries = Array.from(groups.entries());
    for (let e = 0; e < entries.length; e++) {
      const [existingKey, items] = entries[e];
      const existingWords = new Set(existingKey.split("|"));
      const overlap = words.filter((w) => existingWords.has(w)).length;
      if (overlap >= 2 || (words.length <= 2 && overlap >= 1)) {
        items.push(gap);
        matched = true;
        break;
      }
    }

    if (!matched) {
      groups.set(key, [gap]);
    }
  }

  // In KnowledgeGap-Objekte umwandeln, sortiert nach Häufigkeit
  const gaps: KnowledgeGap[] = [];
  const groupValues = Array.from(groups.values());

  for (let g = 0; g < groupValues.length; g++) {
    const items = groupValues[g];
    gaps.push({
      id: `gap-${g + 1}`,
      topic: items[0].question.slice(0, 120),
      questions: items.slice(0, 5),
      count: items.length,
    });
  }

  return gaps
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * Generiert konkrete Fix-Vorschläge für jede identifizierte Wissenslücke.
 */
export async function generateFixSuggestions(
  agentId: string,
  gaps: KnowledgeGap[]
): Promise<FixSuggestion[]> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { systemPrompt: true },
  });

  const suggestions: FixSuggestion[] = [];

  for (const gap of gaps) {
    const sampleQuestion = gap.questions[0].question;

    // Primär: FAQ-Eintrag in Knowledge Base
    suggestions.push({
      gapId: gap.id,
      type: "knowledge",
      title: "Add to Knowledge Base",
      description: `Create a FAQ entry so the agent can answer: "${sampleQuestion.slice(0, 80)}${sampleQuestion.length > 80 ? "…" : ""}"`,
      payload: {
        question: sampleQuestion,
        answer: `[Enter the correct answer for: ${sampleQuestion.slice(0, 100)}]`,
      },
    });

    // Wenn die Frage auf ein allgemeines Verhaltens-/Scope-Thema hinweist → Prompt-Update
    const scopeIndicators = [
      "can you", "are you able", "do you", "why don't you",
      "kannst du", "warum", "wieso",
    ];
    const lowerQ = sampleQuestion.toLowerCase();
    if (scopeIndicators.some((s) => lowerQ.includes(s))) {
      const currentPromptSnippet = (agent?.systemPrompt || "").slice(0, 100);
      suggestions.push({
        gapId: gap.id,
        type: "prompt",
        title: "Update System Prompt",
        description: `Add guidance so the agent knows how to handle: "${sampleQuestion.slice(0, 60)}…"`,
        payload: {
          addition: `\n\nWhen users ask about "${gap.topic.slice(0, 60)}", respond with: [describe your expected behavior here]`,
          currentPromptPreview: currentPromptSnippet,
        },
      });
    }

    // Test Case, um die Verbesserung zu verifizieren
    suggestions.push({
      gapId: gap.id,
      type: "test",
      title: "Add Test Case",
      description: `Verify the agent can answer: "${sampleQuestion.slice(0, 60)}${sampleQuestion.length > 60 ? "…" : ""}"`,
      payload: {
        name: `Verify: ${gap.topic.slice(0, 50)}`,
        inputMessage: sampleQuestion,
        expectedKeywords: extractKeywords(sampleQuestion),
      },
    });
  }

  return suggestions;
}

/** Extrahiert sinnvolle Keywords aus einer Frage für Test-Cases */
function extractKeywords(question: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "about", "like",
    "through", "after", "over", "between", "out", "up", "down",
    "what", "how", "when", "where", "who", "which", "why", "that", "this",
    "and", "or", "but", "not", "no", "so", "if", "then", "than",
    "ich", "du", "er", "sie", "es", "wir", "ihr", "was", "wie", "wo",
    "wann", "warum", "der", "die", "das", "ein", "eine", "und", "oder",
    "aber", "nicht", "auch", "noch", "schon", "mit", "von", "für",
    "your", "you", "my", "me", "i",
  ]);

  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Deduplizieren und max 3 Keywords
  return Array.from(new Set(words)).slice(0, 3);
}
