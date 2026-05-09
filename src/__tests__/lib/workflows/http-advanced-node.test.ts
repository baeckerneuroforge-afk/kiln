import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPickMockData = vi.hoisted(() => vi.fn<(args: { orgId: string; workflowId: string; nodeId: string; name?: string }) => Promise<unknown | null>>(async () => null));

vi.mock("@/lib/workflows/mock-data", () => ({
  pickMockData: mockPickMockData,
}));

import { executeHttpAdvanced } from "@/lib/workflow-nodes/http-advanced-node";

describe("HTTP-Request-Advanced node", () => {
  const ctx: Record<string, unknown> = { _userId: "user_a" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPickMockData.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns mocked payload when useMockData is set and mock exists", async () => {
    mockPickMockData.mockResolvedValueOnce({ stub: "data" });
    const result = await executeHttpAdvanced(
      {
        url: "https://api.example.com/x",
        useMockData: true,
        workflowId: "wf_1",
        nodeId: "node_a",
        orgId: "org_a",
        resultKey: "out",
      },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(result.contextDelta).toEqual({ out: { stub: "data" } });
    expect(result.meta?.mocked).toBe(true);
  });

  it("returns error when URL is empty", async () => {
    const result = await executeHttpAdvanced({ url: "" }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/URL/);
  });

  it("classifies 401 response as AUTH and does not retry", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("unauth", { status: 401, statusText: "Unauthorized" }),
    );
    const result = await executeHttpAdvanced(
      {
        url: "https://api.example.com",
        retryCount: 3,
        retryDelayMs: 0,
      },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/AUTH/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 then succeeds, attempts metadata reflects retries", async () => {
    let calls = 0;
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      calls += 1;
      if (calls < 2) {
        return new Response("err", { status: 503, statusText: "Service Unavailable" });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await executeHttpAdvanced(
      {
        url: "https://api.example.com",
        retryCount: 2,
        retryDelayMs: 0,
      },
      ctx,
    );
    expect(result.success).toBe(true);
    // attempts = number of failed retries before success
    expect(result.meta?.attempts).toBe(1);
  });

  it("applies BEARER auth header", async () => {
    const captured: { value: RequestInit | null } = { value: null };
    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      captured.value = init as RequestInit;
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    });
    await executeHttpAdvanced(
      {
        url: "https://api.example.com",
        authType: "BEARER",
        authToken: "tok_abc",
      },
      ctx,
    );
    const headers = captured.value?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok_abc");
  });

  it("applies API_KEY_QUERY auth as query param", async () => {
    let calledUrl = "";
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      calledUrl = String(url);
      return new Response("{}", { status: 200 });
    });
    await executeHttpAdvanced(
      {
        url: "https://api.example.com/items",
        authType: "API_KEY_QUERY",
        authKeyName: "key",
        authKeyValue: "abc",
      },
      ctx,
    );
    expect(calledUrl).toContain("key=abc");
  });

  it("appends multiple query params correctly", async () => {
    let calledUrl = "";
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      calledUrl = String(url);
      return new Response("{}", { status: 200 });
    });
    await executeHttpAdvanced(
      {
        url: "https://api.example.com/items?existing=1",
        query: { a: "1", b: "2" },
      },
      ctx,
    );
    expect(calledUrl).toContain("existing=1");
    expect(calledUrl).toContain("a=1");
    expect(calledUrl).toContain("b=2");
  });

  it("serializes object body as JSON automatically", async () => {
    const captured: { value: RequestInit | null } = { value: null };
    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      captured.value = init as RequestInit;
      return new Response("{}", { status: 200 });
    });
    await executeHttpAdvanced(
      {
        url: "https://api.example.com",
        method: "POST",
        body: { x: 1 },
      },
      ctx,
    );
    expect(captured.value?.body).toBe(JSON.stringify({ x: 1 }));
  });
});
