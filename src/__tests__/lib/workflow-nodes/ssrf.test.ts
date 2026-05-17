import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockResolve4 = vi.hoisted(() => vi.fn());
const mockResolve6 = vi.hoisted(() => vi.fn());
const mockLogAudit = vi.hoisted(() => vi.fn());
const mockPickMockData = vi.hoisted(() => vi.fn(async () => null));

vi.mock("dns/promises", () => ({
  default: {
    resolve4: mockResolve4,
    resolve6: mockResolve6,
  },
}));

vi.mock("@/lib/audit/logger", () => ({
  logAudit: mockLogAudit,
}));

vi.mock("@/lib/workflows/mock-data", () => ({
  pickMockData: mockPickMockData,
}));

import {
  RedirectLimitExceededError,
  readResponseWithLimit,
  safeFetch,
  SSRFBlockedError,
} from "@/lib/url-validation";
import { executeHttpRequest } from "@/lib/workflow-nodes/action-nodes";
import { executeHttpAdvanced } from "@/lib/workflow-nodes/http-advanced-node";

const PUBLIC_IP = "93.184.216.34";
const TENANT_CONTEXT = {
  _orgId: "org_1",
  _userId: "user_1",
  _workflowId: "wf_1",
};

function mockPublicDns() {
  mockResolve4.mockResolvedValue([PUBLIC_IP]);
  mockResolve6.mockResolvedValue([]);
}

describe("workflow-node SSRF protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPickMockData.mockResolvedValue(null);
    mockPublicDns();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    "http://127.0.0.1",
    "http://localhost",
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://[::1]",
    "http://10.0.0.1",
    "http://192.168.1.1",
    "http://172.16.0.1",
    "http://[fe80::1]",
    "http://[fc00::1]",
  ])("blocks private or local URL %s before fetch", async (url) => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}"));

    await expect(safeFetch(url)).rejects.toBeInstanceOf(SSRFBlockedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks a public URL redirecting to a private target", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/admin" },
      }),
    );

    await expect(safeFetch("https://public.example/start")).rejects.toBeInstanceOf(SSRFBlockedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails redirect loops after the hop limit", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "/again" },
      }),
    );

    await expect(
      safeFetch("https://public.example/start", { maxRedirects: 2 }),
    ).rejects.toBeInstanceOf(RedirectLimitExceededError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("allows public-to-public redirects", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example/final" },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const response = await safeFetch("https://public.example/start");
    const text = await readResponseWithLimit(response);

    expect(JSON.parse(text)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://cdn.example/final");
  });

  it("blocks hostnames that resolve to private IPs", async () => {
    mockResolve4.mockResolvedValue(["10.0.0.5"]);
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}"));

    await expect(safeFetch("https://tenant-controlled.example")).rejects.toBeInstanceOf(
      SSRFBlockedError,
    );
  });

  it("blocks DNS rebinding across redirect hops", async () => {
    mockResolve4
      .mockResolvedValueOnce([PUBLIC_IP])
      .mockResolvedValueOnce(["10.0.0.9"]);
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://rebind.example/final" },
      }),
    );

    await expect(safeFetch("https://rebind.example/start")).rejects.toBeInstanceOf(
      SSRFBlockedError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows a public URL with a normal response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const response = await safeFetch("https://public.example/api");
    const text = await readResponseWithLimit(response);

    expect(JSON.parse(text)).toEqual({ ok: true });
  });

  it("returns a graceful workflow error and audit event for blocked basic HTTP nodes", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}"));

    const result = await executeHttpRequest(
      { url: "http://169.254.169.254/latest/meta-data/", method: "GET" },
      TENANT_CONTEXT,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("URL not allowed");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WORKFLOW_SSRF_BLOCKED",
        orgId: "org_1",
        resourceId: "wf_1",
        severity: "CRITICAL",
      }),
    );
  });

  it("returns a graceful workflow error for response size limit hits", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("too-large", {
        status: 200,
        headers: { "content-length": String(10 * 1024 * 1024 + 1) },
      }),
    );

    const result = await executeHttpRequest(
      { url: "https://public.example/big", method: "GET" },
      TENANT_CONTEXT,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Response too large");
  });

  it("blocks dangerous custom Authorization headers in advanced HTTP nodes", async () => {
    const result = await executeHttpAdvanced(
      {
        url: "https://public.example/api",
        headers: { Authorization: "Bearer from-user-header" },
      },
      TENANT_CONTEXT,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Header not allowed");
    expect(result.contextDelta.httpResponse).toMatchObject({
      error: "Header not allowed",
      blockedHeaders: ["Authorization"],
    });
  });

  it("still allows structured bearer auth in advanced HTTP nodes", async () => {
    let capturedInit: RequestInit | undefined;
    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      capturedInit = init as RequestInit;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const result = await executeHttpAdvanced(
      {
        url: "https://public.example/api",
        authType: "BEARER",
        authToken: "tok_safe",
      },
      TENANT_CONTEXT,
    );

    expect(result.success).toBe(true);
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe("Bearer tok_safe");
  });
});
