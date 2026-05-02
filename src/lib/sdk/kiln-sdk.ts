/**
 * KILN SDK — Programmatischer Zugang zur KILN AI Platform
 *
 * Usage:
 *   import { KilnSDK } from '@kiln/sdk';
 *   const sdk = new KilnSDK({ apiKey: 'sk-kiln-...' });
 *   const agents = await sdk.agents.list();
 */

// ── Error Types ──────────────────────────────────────────────

export class KilnAPIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "KilnAPIError";
  }
}

export class KilnAuthError extends KilnAPIError {
  constructor(message = "Invalid or missing API key") {
    super(message, 401, "AUTH_ERROR");
    this.name = "KilnAuthError";
  }
}

export class KilnRateLimitError extends KilnAPIError {
  constructor(
    public retryAfter: number,
    message = "Rate limit exceeded"
  ) {
    super(message, 429, "RATE_LIMIT");
    this.name = "KilnRateLimitError";
  }
}

// ── Types ────────────────────────────────────────────────────

export interface KilnSDKConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  model: string;
  status: string;
  conversationCount: number;
  createdAt: string;
}

export interface AgentDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  systemPrompt: string;
  welcomeMessage: string | null;
  model: string;
  status: string;
  mode: string;
  actions: Array<{ type: string; enabled: boolean }>;
  createdAt: string;
}

export interface CreateAgentInput {
  name: string;
  systemPrompt: string;
  description?: string;
  llmModel?: string;
  mode?: "CHAT" | "TASK";
  welcomeMessage?: string;
  status?: "DRAFT" | "LIVE" | "PAUSED";
  actions?: string[];
  whiteLabel?: Record<string, unknown>;
}

export interface UpdateAgentInput {
  name?: string;
  systemPrompt?: string;
  description?: string;
  llmModel?: string;
  welcomeMessage?: string;
  status?: "DRAFT" | "LIVE" | "PAUSED";
}

export interface ChatInput {
  message: string;
  sessionId?: string;
  visitorId?: string;
}

export interface ChatResponse {
  response: string;
  conversationId: string;
  sessionId: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  memberCount: number;
  createdAt: string;
}

export interface WorkflowExecution {
  id: string;
  status: string;
  goal: string | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  startedAt: string;
  completedAt: string | null;
}

export interface TriggerWorkflowInput {
  goal: string;
  context?: Record<string, unknown>;
}

export interface ComputerUseSession {
  sessionId: string;
  status: string;
}

export interface KnowledgeSearchResult {
  content: string;
  similarity: number;
  source: string;
}

export interface CreditBalance {
  balance: number;
  monthly: number;
  resetDate: string | null;
}

export interface CreditUsageEntry {
  creditsUsed: number;
  model: string;
  type: string;
  createdAt: string;
}

export interface WebhookConfig {
  url: string;
  events: string[];
  secret?: string;
  headers?: Record<string, string>;
}

export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  lastDeliveredAt: string | null;
  createdAt: string;
}

// ── SDK Class ────────────────────────────────────────────────

export class KilnSDK {
  private apiKey: string;
  private baseUrl: string;

  public agents: AgentsNamespace;
  public workflows: WorkflowsNamespace;
  public computerUse: ComputerUseNamespace;
  public knowledge: KnowledgeNamespace;
  public analytics: AnalyticsNamespace;
  public credits: CreditsNamespace;
  public webhooks: WebhooksNamespace;

  constructor(config: KilnSDKConfig) {
    if (!config.apiKey) {
      throw new KilnAuthError("API key is required");
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || "https://app.kiln.ai").replace(/\/$/, "");

    this.agents = new AgentsNamespace(this);
    this.workflows = new WorkflowsNamespace(this);
    this.computerUse = new ComputerUseNamespace(this);
    this.knowledge = new KnowledgeNamespace(this);
    this.analytics = new AnalyticsNamespace(this);
    this.credits = new CreditsNamespace(this);
    this.webhooks = new WebhooksNamespace(this);
  }

  /** Internal: make authenticated API request */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      throw new KilnAuthError();
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "60", 10);
      throw new KilnRateLimitError(retryAfter);
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new KilnAPIError(
        (errorBody as Record<string, string>).error || `Request failed with status ${res.status}`,
        res.status,
        undefined,
        errorBody
      );
    }

    return res.json() as Promise<T>;
  }
}

// ── Agents Namespace ─────────────────────────────────────────

class AgentsNamespace {
  constructor(private sdk: KilnSDK) {}

  async list(): Promise<Agent[]> {
    const data = await this.sdk.request<{ agents: Agent[] }>("GET", "/api/v1/agents");
    return data.agents;
  }

  async get(id: string): Promise<AgentDetail> {
    return this.sdk.request<AgentDetail>("GET", `/api/v1/agents/${id}`);
  }

  async create(input: CreateAgentInput): Promise<{ id: string; slug: string; status: string }> {
    return this.sdk.request("POST", "/api/v1/agents", input);
  }

  async update(id: string, input: UpdateAgentInput): Promise<AgentDetail> {
    return this.sdk.request("PUT", `/api/v1/agents/${id}`, input);
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    return this.sdk.request("DELETE", `/api/v1/agents/${id}`);
  }

  async chat(id: string, input: ChatInput): Promise<ChatResponse> {
    return this.sdk.request("POST", `/api/v1/agents/${id}/chat`, input);
  }
}

// ── Workflows Namespace ──────────────────────────────────────

class WorkflowsNamespace {
  constructor(private sdk: KilnSDK) {}

  async list(): Promise<Workflow[]> {
    const data = await this.sdk.request<{ teams: Workflow[] }>("GET", "/api/v1/agents");
    // Workflows are teams in KILN — SDK wraps them
    return data.teams || [];
  }

  async get(id: string): Promise<Workflow> {
    return this.sdk.request("GET", `/api/workflows/${id}`);
  }

  async create(input: { name: string; description?: string; goal?: string }): Promise<Workflow> {
    return this.sdk.request("POST", "/api/workflows", input);
  }

  async trigger(id: string, input: TriggerWorkflowInput): Promise<WorkflowExecution> {
    return this.sdk.request("POST", "/api/workflows/trigger", {
      teamId: id,
      ...input,
    });
  }

  async getExecution(executionId: string): Promise<WorkflowExecution> {
    return this.sdk.request("GET", `/api/workflows/executions/${executionId}`);
  }
}

// ── Computer Use Namespace ───────────────────────────────────

class ComputerUseNamespace {
  constructor(private sdk: KilnSDK) {}

  async startSession(agentId: string, input: { task: string; url?: string }): Promise<ComputerUseSession> {
    return this.sdk.request("POST", "/api/v1/sandbox", {
      agentId,
      ...input,
    });
  }

  async executeAction(sessionId: string, action: { type: string; data?: unknown }): Promise<{ success: boolean; result?: unknown }> {
    return this.sdk.request("POST", `/api/v1/sandbox/${sessionId}/action`, action);
  }

  async getArtifacts(sessionId: string): Promise<{ artifacts: Array<{ id: string; fileName: string; url: string }> }> {
    return this.sdk.request("GET", `/api/v1/sandbox/${sessionId}/artifacts`);
  }

  async stopSession(sessionId: string): Promise<{ stopped: boolean }> {
    return this.sdk.request("DELETE", `/api/v1/sandbox/${sessionId}`);
  }
}

// ── Knowledge Namespace ──────────────────────────────────────

class KnowledgeNamespace {
  constructor(private sdk: KilnSDK) {}

  async search(agentId: string, query: string, limit = 5): Promise<KnowledgeSearchResult[]> {
    return this.sdk.request("POST", `/api/v1/agents/${agentId}/knowledge`, {
      action: "search",
      query,
      limit,
    });
  }

  async getEntities(agentId: string): Promise<{ entities: Array<{ topic: string; type: string; mentionCount: number }> }> {
    return this.sdk.request("GET", `/api/v1/agents/${agentId}/knowledge`, undefined, { type: "entities" });
  }
}

// ── Analytics Namespace ──────────────────────────────────────

class AnalyticsNamespace {
  constructor(private sdk: KilnSDK) {}

  async getROI(agentId: string): Promise<Record<string, unknown>> {
    return this.sdk.request("GET", `/api/agents/${agentId}/roi`);
  }

  async getCosts(agentId: string, period?: string): Promise<Record<string, unknown>> {
    return this.sdk.request("GET", `/api/agents/${agentId}/roi`, undefined, {
      ...(period ? { period } : {}),
    });
  }

  async getHealth(): Promise<Record<string, unknown>> {
    return this.sdk.request("GET", "/api/intelligence");
  }
}

// ── Credits Namespace ────────────────────────────────────────

class CreditsNamespace {
  constructor(private sdk: KilnSDK) {}

  async getBalance(): Promise<CreditBalance> {
    return this.sdk.request("GET", "/api/credits/balance");
  }

  async getUsage(period?: string): Promise<{ usage: CreditUsageEntry[] }> {
    return this.sdk.request("GET", "/api/credits/usage", undefined, {
      ...(period ? { period } : {}),
    });
  }
}

// ── Webhooks Namespace ───────────────────────────────────────

class WebhooksNamespace {
  constructor(private sdk: KilnSDK) {}

  async list(): Promise<WebhookSubscription[]> {
    const data = await this.sdk.request<{ webhooks: WebhookSubscription[] }>("GET", "/api/v1/webhooks");
    return data.webhooks;
  }

  async create(config: WebhookConfig): Promise<WebhookSubscription> {
    return this.sdk.request("POST", "/api/v1/webhooks", config);
  }

  async get(webhookId: string): Promise<WebhookSubscription & { deliveries: unknown[] }> {
    return this.sdk.request("GET", `/api/v1/webhooks/${webhookId}`);
  }

  async update(webhookId: string, config: Partial<WebhookConfig> & { isActive?: boolean }): Promise<WebhookSubscription> {
    return this.sdk.request("PUT", `/api/v1/webhooks/${webhookId}`, config);
  }

  async delete(webhookId: string): Promise<{ deleted: boolean }> {
    return this.sdk.request("DELETE", `/api/v1/webhooks/${webhookId}`);
  }

  async test(webhookId: string): Promise<{ success: boolean; statusCode: number | null }> {
    return this.sdk.request("POST", `/api/v1/webhooks/${webhookId}/test`);
  }
}

export default KilnSDK;
