// Voice Command Router — routet Sprachbefehle zu Navigation oder Meta-Agent

export interface VoiceCommandResult {
  type: "navigate" | "action" | "meta_agent";
  path?: string;
  action?: string;
  query?: string;
}

interface CommandPattern {
  keywords: string[];
  result: VoiceCommandResult;
}

class VoiceCommandRouter {
  private readonly patterns: CommandPattern[] = [
    {
      keywords: ["zeig meine agents", "show my agents", "agents anzeigen"],
      result: { type: "navigate", path: "/dashboard/agents" },
    },
    {
      keywords: ["neuer agent", "create new agent", "agent erstellen"],
      result: { type: "navigate", path: "/dashboard/agents/new" },
    },
    {
      keywords: ["marketplace", "marktplatz"],
      result: { type: "navigate", path: "/marketplace" },
    },
    {
      keywords: ["roi", "rendite", "return on investment"],
      result: { type: "navigate", path: "/dashboard/operations" },
    },
    {
      keywords: ["genehmigungen", "approvals", "check approvals"],
      result: { type: "navigate", path: "/dashboard/approvals" },
    },
    {
      keywords: ["einstellungen", "settings"],
      result: { type: "navigate", path: "/dashboard/settings" },
    },
    {
      keywords: ["workflows"],
      result: { type: "navigate", path: "/dashboard/workflows" },
    },
    {
      keywords: ["knowledge", "wissensgraph", "wissen"],
      result: { type: "navigate", path: "/dashboard/knowledge" },
    },
    {
      keywords: ["conversations", "gespräche"],
      result: { type: "navigate", path: "/dashboard/conversations" },
    },
    {
      keywords: ["hilfe", "help"],
      result: { type: "navigate", path: "/help" },
    },
  ];

  /**
   * Parst ein Sprach-Transkript und routet zum passenden Ziel
   */
  route(transcript: string): VoiceCommandResult {
    const normalized = transcript.toLowerCase().trim();

    for (const pattern of this.patterns) {
      for (const keyword of pattern.keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          return { ...pattern.result };
        }
      }
    }

    // Kein Keyword-Match — Weiterleitung an Meta-Agent
    return {
      type: "meta_agent",
      query: transcript,
    };
  }
}

export const voiceCommandRouter = new VoiceCommandRouter();
