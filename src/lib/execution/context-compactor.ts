/**
 * Context Compaction
 * Verhindert Context-Window-Overflow bei langen Conversations und Workflows.
 * Verwendet Haiku für günstige Zusammenfassungen.
 */

import Anthropic from "@anthropic-ai/sdk";

/* ── Types ── */

export interface CompactionMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Markiert Nachrichten mit Tool-Ergebnissen (werden bevorzugt behalten) */
  hasToolResult?: boolean;
}

export interface CompactionResult {
  compactedMessages: CompactionMessage[];
  originalTokenCount: number;
  compactedTokenCount: number;
  summaryGenerated: boolean;
}

export interface WorkflowStateCompaction {
  compactedState: Record<string, unknown>;
  nodesCompacted: number;
  tokensSaved: number;
}

/* ── Token Estimation ── */

/**
 * Grobe Token-Schätzung: ~1.3 Tokens pro Wort für Englisch,
 * ~4 Chars pro Token für gemischten Content.
 * Für Screenshots: ~1500 Tokens pro Bild-Referenz.
 */
export function estimateTokens(content: string): number {
  if (!content) return 0;
  // Base64-encoded images are very large but compress to ~1500 tokens each
  const imageMatches = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g);
  const imageTokens = (imageMatches?.length || 0) * 1500;
  // Remove base64 data for text token estimation
  const textOnly = content.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, "");
  const wordCount = textOnly.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3) + imageTokens;
}

export function estimateMessagesTokens(messages: CompactionMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

/* ── Context Compactor ── */

export class ContextCompactor {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || "";
  }

  /**
   * Komprimiert eine Nachrichtenliste wenn sie das Token-Limit überschreitet.
   * Behält: System Prompt, letzte 3 Nachrichten, Tool-Ergebnisse.
   * Fasst den Rest per Haiku zusammen.
   */
  async compact(
    messages: CompactionMessage[],
    maxTokens: number
  ): Promise<CompactionResult> {
    const originalTokenCount = estimateMessagesTokens(messages);

    if (originalTokenCount <= maxTokens) {
      return {
        compactedMessages: messages,
        originalTokenCount,
        compactedTokenCount: originalTokenCount,
        summaryGenerated: false,
      };
    }

    // System-Prompt immer behalten
    const systemMessages = messages.filter((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    // Letzte 3 Nachrichten behalten (aktueller Kontext)
    const recentMessages = nonSystemMessages.slice(-3);
    const middleMessages = nonSystemMessages.slice(0, -3);

    if (middleMessages.length === 0) {
      return {
        compactedMessages: messages,
        originalTokenCount,
        compactedTokenCount: originalTokenCount,
        summaryGenerated: false,
      };
    }

    // Tool-Ergebnisse aus dem Mittelteil extrahieren (wichtige Daten)
    const toolMessages = middleMessages.filter((m) => m.hasToolResult);
    const otherMiddle = middleMessages.filter((m) => !m.hasToolResult);

    // Zusammenfassung generieren
    const summaryText = await this.generateSummary(otherMiddle, toolMessages);

    const summaryMessage: CompactionMessage = {
      role: "user",
      content: `[Context Summary — komprimiert aus ${middleMessages.length} Nachrichten]\n\n${summaryText}`,
    };

    const compactedMessages = [
      ...systemMessages,
      summaryMessage,
      ...recentMessages,
    ];

    const compactedTokenCount = estimateMessagesTokens(compactedMessages);

    console.log(
      `[ContextCompactor] Komprimiert: ${originalTokenCount} → ${compactedTokenCount} Tokens`
    );

    return {
      compactedMessages,
      originalTokenCount,
      compactedTokenCount,
      summaryGenerated: true,
    };
  }

  /**
   * Komprimiert den Parent-Kontext bevor er an einen Sub-Agent übergeben wird.
   */
  async compactForSubAgent(
    parentContext: CompactionMessage[],
    subTaskDescription: string
  ): Promise<CompactionMessage[]> {
    const contextText = parentContext
      .map((m) => `[${m.role}]: ${m.content.slice(0, 500)}`)
      .join("\n");

    const summary = await this.callHaiku(
      `Du bist ein Kontext-Komprimierer. Fasse den folgenden Gesprächsverlauf zusammen.
Bewahre ALLE Fakten, Zahlen, Daten, Entscheidungen und den aktuellen Aufgabenstatus.
Die Zusammenfassung wird einem Sub-Agent übergeben, der folgende Aufgabe hat: ${subTaskDescription}

Fokussiere dich auf Informationen die für diese Aufgabe relevant sind.

Gesprächsverlauf:
${contextText}`
    );

    return [
      {
        role: "system",
        content: `Du bist ein Sub-Agent. Deine Aufgabe: ${subTaskDescription}\n\nKontext aus dem übergeordneten Prozess:\n${summary}`,
      },
    ];
  }

  /**
   * Komprimiert den Workflow-State zwischen Nodes.
   * Outputs älter als 3 Nodes werden zusammengefasst.
   */
  async compactWorkflowState(
    executionState: Record<string, unknown>,
    currentNodeIndex: number
  ): Promise<WorkflowStateCompaction> {
    const nodeOutputs = executionState._nodeOutputs as
      | Record<string, unknown>
      | undefined;
    if (!nodeOutputs) {
      return { compactedState: executionState, nodesCompacted: 0, tokensSaved: 0 };
    }

    const entries = Object.entries(nodeOutputs);
    const recentThreshold = currentNodeIndex - 3;

    // Finde alte Outputs (Index < recentThreshold)
    const oldEntries: [string, unknown][] = [];
    const recentEntries: [string, unknown][] = [];

    for (const [key, value] of entries) {
      const nodeIdx = parseInt(key.split("_")[0] || "0", 10);
      if (nodeIdx < recentThreshold) {
        oldEntries.push([key, value]);
      } else {
        recentEntries.push([key, value]);
      }
    }

    if (oldEntries.length === 0) {
      return { compactedState: executionState, nodesCompacted: 0, tokensSaved: 0 };
    }

    const oldText = JSON.stringify(Object.fromEntries(oldEntries));
    const originalTokens = estimateTokens(oldText);

    const summary = await this.callHaiku(
      `Fasse die folgenden Workflow-Node-Outputs zusammen. Bewahre ALLE Zahlen, Daten, Ergebnisse und Fakten. Sei prägnant.\n\n${oldText.slice(0, 8000)}`
    );

    const compactedNodeOutputs: Record<string, unknown> = {
      _compacted_summary: summary,
      ...Object.fromEntries(recentEntries),
    };

    const compactedState = {
      ...executionState,
      _nodeOutputs: compactedNodeOutputs,
    };

    const savedTokens = originalTokens - estimateTokens(summary);

    console.log(
      `[ContextCompactor] Workflow-State komprimiert: ${oldEntries.length} alte Nodes zusammengefasst, ~${savedTokens} Tokens gespart`
    );

    return {
      compactedState,
      nodesCompacted: oldEntries.length,
      tokensSaved: Math.max(0, savedTokens),
    };
  }

  /* ── Private Helpers ── */

  private async generateSummary(
    messages: CompactionMessage[],
    toolMessages: CompactionMessage[]
  ): Promise<string> {
    const conversationText = messages
      .map((m) => `[${m.role}]: ${m.content.slice(0, 300)}`)
      .join("\n");

    const toolText = toolMessages.length > 0
      ? `\n\nWichtige Tool-Ergebnisse:\n${toolMessages
          .map((m) => m.content.slice(0, 500))
          .join("\n---\n")}`
      : "";

    return this.callHaiku(
      `Fasse den folgenden Gesprächsverlauf zusammen. Bewahre ALLE:
- Schlüsselfakten, Zahlen, Daten
- Getroffene Entscheidungen
- Gefundene Ergebnisse
- Aktuellen Aufgabenstatus
- Tool-Ergebnisse und deren Daten

Sei prägnant aber verliere KEINE wichtigen Details.

Verlauf:
${conversationText}${toolText}`
    );
  }

  private async callHaiku(prompt: string): Promise<string> {
    if (!this.apiKey) {
      // Fallback ohne API: einfache Kürzung
      return prompt.slice(0, 2000) + "\n\n[Gekürzt — kein API-Key für Zusammenfassung]";
    }

    try {
      const client = new Anthropic({ apiKey: this.apiKey });
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      const block = response.content[0];
      return block.type === "text" ? block.text : "[Zusammenfassung fehlgeschlagen]";
    } catch (err) {
      console.error("[ContextCompactor] Haiku-Aufruf fehlgeschlagen:", err);
      // Fallback: gekürzte Version
      return prompt.slice(0, 2000) + "\n\n[Zusammenfassung konnte nicht generiert werden]";
    }
  }
}
