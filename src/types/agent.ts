// Agent-Config die von Claude generiert wird
export interface GeneratedAgentConfig {
  name: string;
  slug: string;
  system_prompt: string;
  personality: {
    tone: string;
    language: string;
    formality: "du" | "Sie";
  };
  welcome_message: string;
  suggested_questions: string[];
  suggested_actions: string[];
}

// Chat-Nachricht im Builder
export interface BuilderMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentConfig?: GeneratedAgentConfig;
}
