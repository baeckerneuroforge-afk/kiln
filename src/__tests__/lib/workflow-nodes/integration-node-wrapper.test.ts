import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
});

const mockPrisma = vi.hoisted(() => ({
  workflowMockData: { findMany: vi.fn() },
  workflowDeadLetter: { create: vi.fn() },
  integrationConnection: { findFirst: vi.fn() },
  agent: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

describe("integration-node wrapper: mock-data short-circuit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.workflowMockData.findMany.mockResolvedValue([]);
    mockPrisma.integrationConnection.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns mocked payload when useMockData is true and a mock exists", async () => {
    mockPrisma.workflowMockData.findMany.mockResolvedValueOnce([
      {
        id: "mock_1",
        orgId: "org_a",
        workflowId: "wf_1",
        nodeId: "node_a",
        name: "default",
        isDefault: true,
        data: { stub: "payload" },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const { executeIntegrationNode } = await import("@/lib/workflow-nodes/integration-nodes");
    const ctx = {
      _userId: "user_a",
      _orgId: "org_a",
      _workflowId: "wf_1",
      _currentNodeId: "node_a",
    } as Record<string, unknown>;
    const result = await executeIntegrationNode(
      "google_sheets_read",
      { useMockData: true, resultKey: "out" },
      ctx as never,
    );
    expect(result.success).toBe(true);
    expect(result.contextDelta).toEqual({ out: { stub: "payload" } });
    expect(result.meta?.mocked).toBe(true);
  });

  it("falls through to live executor when mock-data is missing", async () => {
    mockPrisma.workflowMockData.findMany.mockResolvedValueOnce([]);
    const { executeIntegrationNode } = await import("@/lib/workflow-nodes/integration-nodes");
    const ctx = {
      _userId: "user_a",
      _orgId: "org_a",
      _workflowId: "wf_1",
      _currentNodeId: "node_a",
    } as Record<string, unknown>;
    const result = await executeIntegrationNode(
      "google_sheets_read",
      { useMockData: true, spreadsheetId: "" },
      ctx as never,
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Spreadsheet/);
  });

  it("does not invoke pickMockData when useMockData is not set", async () => {
    const { executeIntegrationNode } = await import("@/lib/workflow-nodes/integration-nodes");
    const ctx = { _userId: "user_a", _orgId: "org_a" } as Record<string, unknown>;
    await executeIntegrationNode("google_sheets_read", { spreadsheetId: "" }, ctx as never);
    expect(mockPrisma.workflowMockData.findMany).not.toHaveBeenCalled();
  });
});

// The retry + dead-letter logic is verified directly against the wrapper's
// public effects via runWithRetry/recordDeadLetter, using their own
// per-module tests. Here we cover the integration of buildClassifiableError
// + meta-passthrough using a real provider whose error message contains
// the recognised patterns.
describe("integration-node wrapper: retry + dead-letter on classified errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.workflowMockData.findMany.mockResolvedValue([]);
    mockPrisma.integrationConnection.findFirst.mockResolvedValue(null);
    mockPrisma.workflowDeadLetter.create.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies 'Internal Server Error' messages as retryable and records dead-letter when retries are exhausted", async () => {
    // Airtable executor uses the dynamic apiToken path when no IntegrationConnection
    // exists, which avoids the encrypted-config dependency. The fetch returns
    // a JSON error whose `.error.message` text the wrapper recognises as 5xx.
    // mockImplementation (not mockResolvedValue) so each retry gets a fresh
    // Response with an unconsumed body.
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ error: { message: "Internal Server Error" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    const { executeIntegrationNode } = await import("@/lib/workflow-nodes/integration-nodes");
    const ctx = {
      _userId: "user_a",
      _orgId: "org_a",
      _teamId: "team_a",
      _executionId: "exec_a",
      _currentNodeId: "node_a",
    } as Record<string, unknown>;
    const result = await executeIntegrationNode(
      "airtable_create",
      {
        baseId: "appA",
        tableName: "Table1",
        fields: { Name: "x" },
        apiToken: "pat_test",
        retryCount: 1,
        retryDelayMs: 0,
      },
      ctx as never,
    );
    expect(result.success).toBe(false);
    expect(result.meta?.attempts).toBeGreaterThan(0);
    expect(mockPrisma.workflowDeadLetter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentTeamId: "team_a",
          teamExecutionId: "exec_a",
          nodeType: "airtable_create",
        }),
      }),
    );
  });

  it("does not record dead-letter when no team context is set", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ error: { message: "Internal Server Error" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    const { executeIntegrationNode } = await import("@/lib/workflow-nodes/integration-nodes");
    const ctx = { _userId: "user_a", _orgId: "org_a" } as Record<string, unknown>;
    await executeIntegrationNode(
      "airtable_create",
      {
        baseId: "appA",
        tableName: "Table1",
        fields: { Name: "y" },
        apiToken: "pat_test",
        retryCount: 0,
        retryDelayMs: 0,
      },
      ctx as never,
    );
    expect(mockPrisma.workflowDeadLetter.create).not.toHaveBeenCalled();
  });

  it("does not retry on non-classifiable error messages (e.g. validation)", async () => {
    let calls = 0;
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { message: "Field 'Name' is required" } }), {
        status: 422,
        headers: { "content-type": "application/json" },
      });
    });
    const { executeIntegrationNode } = await import("@/lib/workflow-nodes/integration-nodes");
    const ctx = {
      _userId: "user_a",
      _orgId: "org_a",
      _teamId: "team_a",
      _currentNodeId: "node_a",
    } as Record<string, unknown>;
    const result = await executeIntegrationNode(
      "airtable_create",
      {
        baseId: "appA",
        tableName: "Table1",
        fields: { Name: "z" },
        apiToken: "pat_test",
        retryCount: 3,
        retryDelayMs: 0,
      },
      ctx as never,
    );
    expect(result.success).toBe(false);
    expect(calls).toBe(1); // no retry attempted
  });
});
