import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const mockWaitUntil = vi.hoisted(() =>
  vi.fn((promise?: Promise<unknown>) => {
    void promise;
  })
);
const mockCaptureException = vi.hoisted(() => vi.fn());
const mockAnthropicCreate = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  agent: {
    findUnique: vi.fn(),
  },
  apiKey: {
    findUnique: vi.fn(),
  },
  conversation: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  },
  agentOrchestration: {
    findMany: vi.fn(),
  },
  webhookEndpoint: {
    findMany: vi.fn(),
  },
  webhookDelivery: {
    create: vi.fn(),
  },
  message: {
    create: vi.fn(),
  },
}));
const mockCheckCredits = vi.hoisted(() => vi.fn());
const mockDeductCredits = vi.hoisted(() => vi.fn());
const mockFireWebhookEvent = vi.hoisted(() => vi.fn());
const mockSendNewLeadEmail = vi.hoisted(() => vi.fn());
const mockSearchRelevantChunks = vi.hoisted(() => vi.fn());

vi.mock("@vercel/functions", () => ({
  waitUntil: mockWaitUntil,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mockCaptureException,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/ai", () => ({
  getClaudeClient: vi.fn(() => ({
    messages: {
      create: mockAnthropicCreate,
    },
  })),
  getClaudeClientWithKey: vi.fn(() => ({
    messages: {
      create: mockAnthropicCreate,
    },
  })),
  MODEL_PROVIDER_MAP: {},
}));

vi.mock("@/lib/rag", () => ({
  searchRelevantChunks: mockSearchRelevantChunks,
}));

vi.mock("@/lib/credits", () => ({
  checkCredits: mockCheckCredits,
  deductCredits: mockDeductCredits,
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn(),
}));

vi.mock("@/lib/webhooks", () => ({
  fireWebhookEvent: mockFireWebhookEvent,
}));

vi.mock("@/lib/email-notifications", () => ({
  sendNewLeadEmail: mockSendNewLeadEmail,
}));

vi.mock("@/lib/safe-eval", () => ({
  safeEval: vi.fn(),
}));

vi.mock("@/lib/url-validation", () => ({
  validateUrl: vi.fn(),
}));

import { POST } from "@/app/api/agents/[id]/chat/route";

async function readStream(response: Response) {
  const reader = response.body?.getReader();
  expect(reader).toBeTruthy();

  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const chunk = await reader!.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/agents/agent_123/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("POST /api/agents/[id]/chat", () => {
  beforeEach(() => {
    mockPrisma.agent.findUnique.mockResolvedValue({
      id: "agent_123",
      userId: "user_123",
      name: "Support Agent",
      systemPrompt: "You are helpful.",
      llmModel: "claude-sonnet-4-20250514",
      modelProvider: "ANTHROPIC",
      knowledgeBases: [],
      actions: [],
      customTools: [],
      channels: [],
      memoryEnabled: false,
      promptBranches: null,
    });
    mockPrisma.apiKey.findUnique.mockResolvedValue(null);
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.findUnique.mockResolvedValue({ leadScore: null });
    mockPrisma.conversation.create.mockResolvedValue({
      id: "conv_123",
      sessionId: "session_123",
    });
    mockPrisma.conversation.count.mockResolvedValue(1);
    mockPrisma.conversation.update.mockResolvedValue({});
    mockPrisma.agentOrchestration.findMany.mockResolvedValue([]);
    mockPrisma.webhookEndpoint.findMany.mockResolvedValue([]);
    mockPrisma.webhookDelivery.create.mockResolvedValue({});
    mockPrisma.message.create.mockResolvedValue({});
    mockCheckCredits.mockResolvedValue({
      allowed: true,
      byokActive: false,
      cost: 1,
      balance: 100,
      message: null,
    });
    mockDeductCredits.mockResolvedValue({ newBalance: 99 });
    mockFireWebhookEvent.mockResolvedValue(undefined);
    mockSendNewLeadEmail.mockResolvedValue(undefined);
    mockSearchRelevantChunks.mockResolvedValue([]);
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Hello back",
        },
      ],
    });
  });

  it("returns a streaming response when a message is provided", async () => {
    const response = await POST(makeRequest({
      messages: [{ role: "user", content: "Hi there" }],
    }), { params: { id: "agent_123" } });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    const body = await readStream(response);
    expect(body).toContain("Hello back");
    expect(body).toContain("[DONE]");
  });

  it("returns 400 when messages are missing", async () => {
    const response = await POST(makeRequest({}), { params: { id: "agent_123" } });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Messages are required.",
    });
  });
});
