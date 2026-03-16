import os from "os";
import path from "path";
import { promises as fs } from "fs";

export const DEFAULT_API_BASE_URL = "https://kilnbase.com/api/v1";

export type KilnStoredConfig = {
  apiKey: string;
  baseUrl?: string;
};

export type AgentSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  model: string;
  status: string;
  conversationCount: number;
  createdAt: string;
};

export type AgentUpsertPayload = {
  name: string;
  agentMode: "CHAT" | "TASK";
  llmModel: string;
  systemPrompt: string;
  welcomeMessage?: string;
  actions?: string[];
  whiteLabel?: Record<string, unknown>;
  status?: "LIVE" | "DRAFT" | "PAUSED";
};

export type AgentDeployResult = {
  id: string;
  name: string;
  slug: string;
  status: string;
  agentMode: "CHAT" | "TASK";
  publicUrl?: string;
  updatedFields?: string[];
  created?: boolean;
};

export type KnowledgePayload = {
  type: "URL" | "TEXT" | "FAQ" | "PDF";
  sourceName: string;
  content: string;
};

export type ConversationLog = {
  id: string;
  sessionId: string;
  channel: string;
  leadScore: number | null;
  visitorName: string | null;
  visitorEmail: string | null;
  messageCount: number;
  createdAt: string;
  messages: Array<{
    role: string;
    content: string;
    createdAt: string;
  }>;
};

export class KilnApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "KilnApiError";
  }
}

export function getKilnConfigPath() {
  return path.join(os.homedir(), ".kilnrc");
}

export async function readStoredConfig(): Promise<KilnStoredConfig | null> {
  try {
    const raw = await fs.readFile(getKilnConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<KilnStoredConfig>;
    if (!parsed.apiKey || typeof parsed.apiKey !== "string") return null;

    return {
      apiKey: parsed.apiKey,
      ...(typeof parsed.baseUrl === "string" ? { baseUrl: parsed.baseUrl } : {}),
    };
  } catch {
    return null;
  }
}

export async function writeStoredConfig(config: KilnStoredConfig) {
  await fs.writeFile(getKilnConfigPath(), `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
}

export class KilnApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  private constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  static async create(options: { apiKey?: string; baseUrl?: string } = {}) {
    const stored = await readStoredConfig();
    const apiKey = options.apiKey || process.env.KILN_API_KEY || stored?.apiKey;
    if (!apiKey) {
      throw new Error("No API key configured. Run `kiln login` or pass --api-key.");
    }

    const baseUrl = options.baseUrl || process.env.KILN_API_BASE_URL || stored?.baseUrl || DEFAULT_API_BASE_URL;
    return new KilnApiClient(apiKey, baseUrl);
  }

  private async request<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message =
        body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : `KILN API request failed with status ${response.status}`;
      throw new KilnApiError(message, response.status, body);
    }

    return body as T;
  }

  listAgents() {
    return this.request<{ agents: AgentSummary[] }>("/agents");
  }

  createAgent(payload: AgentUpsertPayload) {
    return this.request<AgentDeployResult>("/agents", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  updateAgent(agentId: string, payload: Partial<AgentUpsertPayload>) {
    return this.request<AgentDeployResult>(`/agents/${agentId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  addKnowledge(agentId: string, payload: KnowledgePayload) {
    return this.request<{ id: string; type: string; sourceName: string; embeddingStatus: string }>(
      `/agents/${agentId}/knowledge`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  getLogs(agentId: string, limit = 10) {
    const params = new URLSearchParams({ limit: String(limit) });
    return this.request<{ conversations: ConversationLog[]; total: number }>(`/agents/${agentId}/logs?${params}`);
  }

  testAgent(agentId: string, message: string, sessionId?: string) {
    return this.request<{
      response: string;
      sessionId: string;
      leadScore: number | null;
      conversationId: string;
      model: string;
    }>(`/agents/${agentId}/chat`, {
      method: "POST",
      body: JSON.stringify({
        message,
        ...(sessionId ? { sessionId } : {}),
      }),
    });
  }
}
